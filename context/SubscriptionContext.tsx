import {
  PRODUCT_ELITE_MONTHLY,
  PRODUCT_ELITE_YEARLY,
  PRODUCT_PRO_MONTHLY,
  PRODUCT_PRO_YEARLY,
} from "@/constants/subscription";
import { supabase } from "@/lib/supabase";
import { ErrorCode, useIAP, type ProductSubscription } from "expo-iap";
import { useAuth } from "./AuthContext";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Alert } from "react-native";

export type SubscriptionTier = "free" | "pro" | "elite";

interface SubscriptionState {
  tier: SubscriptionTier;
  isPro: boolean;
  isElite: boolean;
  isLoading: boolean;
  subscriptions: ProductSubscription[];
  purchaseSubscription: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
}

const ALL_SKUS = [
  PRODUCT_PRO_MONTHLY,
  PRODUCT_PRO_YEARLY,
  PRODUCT_ELITE_MONTHLY,
  PRODUCT_ELITE_YEARLY,
];
const ELITE_SKUS = new Set([PRODUCT_ELITE_MONTHLY, PRODUCT_ELITE_YEARLY]);
const PRO_SKUS   = new Set([PRODUCT_PRO_MONTHLY,   PRODUCT_PRO_YEARLY]);

// The native iOS purchase sheet sometimes cancels via a Swift Task
// CancellationError instead of StoreKit's clean `.userCancelled` result
// (e.g. when dismissed via the "X" icon rather than the Cancel button).
// That gets wrapped as a generic error with code `purchase-error`, so we
// also treat cancellation-flavored messages as a silent cancel.
function isLikelyCancellation(error: any): boolean {
  if (error?.code === ErrorCode.UserCancelled) return true;
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("cancel");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

const SubscriptionContext = createContext<SubscriptionState>({
  tier: "free",
  isPro: false,
  isElite: false,
  isLoading: false,
  subscriptions: [],
  purchaseSubscription: async () => {},
  restorePurchases: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier]         = useState<SubscriptionTier>("free");
  const [isLoading, setIsLoading] = useState(false);

  const {
    connected,
    activeSubscriptions,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getActiveSubscriptions,
    restorePurchases: iapRestore,
  } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      await finishTransaction({ purchase, isConsumable: false });
      await getActiveSubscriptions(ALL_SKUS);
    },
    onPurchaseError: (error) => {
      if (!isLikelyCancellation(error)) {
        Alert.alert("Purchase failed", error.message ?? "Something went wrong. Please try again.");
      }
    },
  });

  // Derive tier from active subscriptions
  useEffect(() => {
    if (!activeSubscriptions.length) { setTier("free"); return; }
    const ids = activeSubscriptions.map((s) => s.productId);
    if (ids.some((id) => ELITE_SKUS.has(id)))     setTier("elite");
    else if (ids.some((id) => PRO_SKUS.has(id)))  setTier("pro");
    else                                            setTier("free");
  }, [activeSubscriptions]);

  // Publish tier to the shared profile so other users can see a Pro/Elite badge.
  // Cosmetic-only, client-authoritative (same trust model as last_seen_at) —
  // never used to gate any paid feature.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").update({ subscription_tier: tier }).eq("id", user.id).then(
      () => {},
      () => {}
    );
  }, [tier, user?.id]);

  // Once connected, load products and check existing subscription
  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: ALL_SKUS, type: "subs" });
    getActiveSubscriptions(ALL_SKUS);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const purchaseSubscription = useCallback(async (productId: string) => {
    setIsLoading(true);
    try {
      await withTimeout(
        requestPurchase({
          type: "subs",
          request: {
            apple: {
              sku: productId,
              andDangerouslyFinishTransactionAutomatically: false,
            },
          },
        }),
        20000,
        "requestPurchase"
      );
    } catch (error: any) {
      if (!isLikelyCancellation(error)) {
        Alert.alert("Purchase failed", error?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [requestPurchase]);

  const restorePurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      await withTimeout(iapRestore(), 20000, "restorePurchases");
      await getActiveSubscriptions(ALL_SKUS);
    } catch {
      Alert.alert("Restore failed", "Could not restore purchases. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [iapRestore, getActiveSubscriptions]);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        isPro: tier === "pro" || tier === "elite",
        isElite: tier === "elite",
        isLoading,
        subscriptions,
        purchaseSubscription,
        restorePurchases,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
