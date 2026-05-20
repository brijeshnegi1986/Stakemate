// ─── RevenueCat API Keys ──────────────────────────────────────────────────────
// Paste your keys from app.revenuecat.com → Project → API Keys
export const RC_API_KEY_IOS     = "test_DUdlpssbkNVofURDZsmjPnGQBdC";
export const RC_API_KEY_ANDROID = "test_DUdlpssbkNVofURDZsmjPnGQBdC";

// ─── Product IDs (must match exactly in App Store Connect + Google Play) ──────
export const PRODUCT_WEEKLY    = "weekly";
export const PRODUCT_MONTHLY   = "monthly";
export const PRODUCT_ANNUAL    = "yearly";
export const PRODUCT_LIFETIME  = "lifetime";

// ─── Entitlement ID (set in RevenueCat dashboard) ────────────────────────────
export const ENTITLEMENT_PRO = "PokerRoll Pro";

// ─── Feature gates ───────────────────────────────────────────────────────────
// Anything NOT listed here is free for everyone.
export const PRO_FEATURES = {
  unlimitedHistory: "Full session history (free = last 10)",
  liveSession:      "Live session tracker",
  aiNotes:          "AI note enhancement",
  notesTab:         "Notes history, export & copy",
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;

export const FREE_CASH_LIMIT = 20;
export const FREE_TOURNAMENT_LIMIT = 5;
export const FREE_NOTES_LIMIT = 10;
