import {
  PRODUCT_ELITE_MONTHLY,
  PRODUCT_ELITE_YEARLY,
  PRODUCT_PRO_MONTHLY,
  PRODUCT_PRO_YEARLY,
} from "@/constants/subscription";
import { ErrorCode, useIAP } from "expo-iap";
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

const SubscriptionContext = createContext<SubscriptionState>({
  tier: "elite",
  isPro: true,
  isElite: true,
  isLoading: false,
  purchaseSubscription: async () => {},
  restorePurchases: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [tier, setTier]         = useState<SubscriptionTier>("free");
  const [isLoading, setIsLoading] = useState(false);

  const {
    connected,
    activeSubscriptions,
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
      if (error.code !== ErrorCode.UserCancelled) {
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

  // Once connected, load products and check existing subscription
  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: ALL_SKUS, type: "subs" });
    getActiveSubscriptions(ALL_SKUS);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const purchaseSubscription = useCallback(async (productId: string) => {
    setIsLoading(true);
    try {
      await requestPurchase({
        type: "subs",
        request: { apple: { sku: productId } },
      });
    } catch {
      // handled by onPurchaseError
    } finally {
      setIsLoading(false);
    }
  }, [requestPurchase]);

  const restorePurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      await iapRestore();
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
        isPro: true,
        isElite: true,
        isLoading,
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
