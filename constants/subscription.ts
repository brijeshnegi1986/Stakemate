// ─── RevenueCat API Keys ──────────────────────────────────────────────────────
export const RC_API_KEY_IOS     = "appl_AnDJSmnTRVZjSFmitBpiFnZvWRm";
export const RC_API_KEY_ANDROID = "test_DUdlpssbkNVofURDZsmjPnGQBdC";

// ─── Product IDs (must match exactly in App Store Connect + Google Play) ──────
export const PRODUCT_WEEKLY    = "weekly";
export const PRODUCT_MONTHLY   = "monthly";
export const PRODUCT_ANNUAL    = "yearly";
export const PRODUCT_LIFETIME  = "lifetime";

// ─── Entitlement ID (set in RevenueCat dashboard) ────────────────────────────
export const ENTITLEMENT_PRO = "PokerRoll Pro";

// ─── Feature gates ───────────────────────────────────────────────────────────
export const PRO_FEATURES = {
  unlimitedSessions: "Unlimited session records (free = 30)",
  unlimitedNotes:    "Unlimited notes (free = 10)",
  aiHandReview:      "AI hand review",
  aiEnhancement:     "AI note enhance & compress",
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;

// ─── Free tier limits ─────────────────────────────────────────────────────────
// Sessions: combined cash + tournament total
export const FREE_SESSION_LIMIT = 30;
// Standalone notes
export const FREE_NOTES_LIMIT   = 10;

// ─── Trial ────────────────────────────────────────────────────────────────────
// All features (including AI) available for this many days from first open
export const TRIAL_DAYS = 7;
