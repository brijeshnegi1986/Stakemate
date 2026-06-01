import {
  createContext, useContext, ReactNode,
} from "react";
import { PurchasesOffering } from "react-native-purchases";

interface SubscriptionState {
  isPro: boolean;
  isLoading: boolean;
  offerings: PurchasesOffering | null;
  purchase: (packageId: string) => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  isPro: false,
  isLoading: true,
  offerings: null,
  purchase: async () => false,
  restore: async () => false,
});


export function SubscriptionProvider({ children }: { children: ReactNode }) {
  // All features unlocked — subscriptions disabled
  async function purchase(_packageIdentifier: string): Promise<boolean> { return true; }
  async function restore(): Promise<boolean> { return true; }

  return (
    <SubscriptionContext.Provider value={{ isPro: true, isLoading: false, offerings: null, purchase, restore }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
