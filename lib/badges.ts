// ─── Badge definitions ────────────────────────────────────────────────────────

export type BadgeId = "new" | "veteran" | "active" | "staker" | "social" | "pro" | "elite";

export type Badge = {
  id: BadgeId;
  label: string;
  color: string;
  icon: string;
  priority: number; // lower = more prestigious (used for sorting / picking top badge)
};

export const BADGE_DEFS: Record<BadgeId, Badge> = {
  elite:   { id: "elite",   label: "Elite",   color: "#F59E0B", icon: "trophy",                priority: 1 },
  pro:     { id: "pro",     label: "Pro",      color: "#155DFC", icon: "ribbon-outline",        priority: 2 },
  veteran: { id: "veteran", label: "Veteran",  color: "#A78BFA", icon: "star-outline",          priority: 3 },
  staker:  { id: "staker",  label: "Staker",   color: "#0891B2", icon: "trending-up-outline",   priority: 4 },
  social:  { id: "social",  label: "Social",   color: "#1DA1F2", icon: "share-social-outline",  priority: 5 },
  active:  { id: "active",  label: "Active",   color: "#22C55E", icon: "radio-button-on",       priority: 6 },
  new:     { id: "new",     label: "New",      color: "#22C55E", icon: "sparkles-outline",      priority: 7 },
};

// ─── Compute helpers ──────────────────────────────────────────────────────────

const MS_24H     = 24  * 60 * 60 * 1000;
const MS_30_DAYS = 30  * 24 * 60 * 60 * 1000;
const MS_1_YEAR  = 365 * 24 * 60 * 60 * 1000;

export type BadgeInput = {
  createdAt?:       string | null;
  lastSeenAt?:      string | null;
  socialLinkCount?: number;
  stakeDealsCount?: number;
  isPro?:           boolean;
  isElite?:         boolean;
};

export function computeBadges(input: BadgeInput): Badge[] {
  const now    = Date.now();
  const result: Badge[] = [];

  // Subscription (reserved — wired in when Apple subscription goes live)
  if (input.isElite) result.push(BADGE_DEFS.elite);
  else if (input.isPro) result.push(BADGE_DEFS.pro);

  // Tenure
  if (input.createdAt) {
    const age = now - new Date(input.createdAt).getTime();
    if (age < MS_30_DAYS)  result.push(BADGE_DEFS.new);
    else if (age > MS_1_YEAR) result.push(BADGE_DEFS.veteran);
  }

  // Activity
  if (input.lastSeenAt) {
    const idle = now - new Date(input.lastSeenAt).getTime();
    if (idle < MS_24H) result.push(BADGE_DEFS.active);
  }

  // Stakes marketplace
  if ((input.stakeDealsCount ?? 0) > 0) result.push(BADGE_DEFS.staker);

  // Social presence
  if ((input.socialLinkCount ?? 0) >= 3) result.push(BADGE_DEFS.social);

  return result.sort((a, b) => a.priority - b.priority);
}

/** Returns the single most prestigious badge, or null. */
export function topBadge(input: BadgeInput): Badge | null {
  const all = computeBadges(input);
  return all.length > 0 ? all[0] : null;
}
