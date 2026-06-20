// ─── RevenueCat API Keys ──────────────────────────────────────────────────────
export const RC_API_KEY_IOS     = "appl_AnDJSmnTRVZjSFmitBpiFnZvWRm";
export const RC_API_KEY_ANDROID = "test_DUdlpssbkNVofURDZsmjPnGQBdC";

// ─── Product IDs (must match exactly in App Store Connect) ───────────────────
export const PRODUCT_PRO_MONTHLY   = "com.stakemate.pokerroll.pro.monthly";
export const PRODUCT_PRO_YEARLY    = "com.stakemate.pokerroll.pro.yearly";
export const PRODUCT_ELITE_MONTHLY = "com.stakemate.pokerroll.elite.monthly";
export const PRODUCT_ELITE_YEARLY  = "com.stakemate.pokerroll.elite.yearly";

// ─── Pricing display ──────────────────────────────────────────────────────────
export const PRICING = {
  pro: {
    monthly: { price: "$19.00",  period: "month", billing: "Billed monthly" },
    yearly:  { price: "$149.99", period: "year",  monthlyEquiv: "$12.39/mo", billing: "Billed annually" },
  },
  elite: {
    monthly: { price: "$39.99",  period: "month", billing: "Billed monthly" },
    yearly:  { price: "$299.99", period: "year",  monthlyEquiv: "$24.91/mo", billing: "Billed annually" },
  },
} as const;

// ─── Entitlement IDs (must match RevenueCat dashboard) ───────────────────────
export const ENTITLEMENT_PRO   = "pro";
export const ENTITLEMENT_ELITE = "elite";

// ─── Feature gates ───────────────────────────────────────────────────────────
export const PRO_FEATURES = {
  unlimitedSessions: "Unlimited session records (free = 30)",
  unlimitedNotes:    "Unlimited notes (free = 10)",
  aiHandReview:      "AI hand review",
  aiEnhancement:     "AI note enhance & compress",
} as const;

export const ELITE_FEATURES = {
  ...PRO_FEATURES,
  // Add Elite-exclusive features here
} as const;

export type ProFeature   = keyof typeof PRO_FEATURES;
export type EliteFeature = keyof typeof ELITE_FEATURES;

// ─── Free tier limits ─────────────────────────────────────────────────────────
export const FREE_SESSION_LIMIT = 30;
export const FREE_NOTES_LIMIT   = 10;

// ─── Trial ────────────────────────────────────────────────────────────────────
export const TRIAL_DAYS = 7;
