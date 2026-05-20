// ─── RevenueCat API Keys ──────────────────────────────────────────────────────
// Paste your keys from app.revenuecat.com → Project → API Keys
export const RC_API_KEY_IOS     = "";   // e.g. "appl_xxxxxxxxxxxx"
export const RC_API_KEY_ANDROID = "";   // e.g. "goog_xxxxxxxxxxxx"

// ─── Product IDs (must match exactly in App Store Connect + Google Play) ──────
export const PRODUCT_WEEKLY    = "pokerroll_weekly";
export const PRODUCT_MONTHLY   = "pokerroll_monthly";
export const PRODUCT_ANNUAL    = "pokerroll_annual";
export const PRODUCT_LIFETIME  = "pokerroll_lifetime";

// ─── Entitlement ID (set in RevenueCat dashboard) ────────────────────────────
export const ENTITLEMENT_PRO = "pro";

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
