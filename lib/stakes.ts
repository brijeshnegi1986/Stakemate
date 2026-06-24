import { Share } from "react-native";
import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
// NOTE: Supabase migration required for new status/visibility values:
//   The status column must accept: 'draft', 'open', 'active', 'paused', 'filled', 'sold_out', 'closed', 'cancelled'
//   The visibility column must accept: 'draft', 'public', 'friends', 'followers'
//   If using postgres enums, run:
//     ALTER TYPE ... ADD VALUE 'draft'; ALTER TYPE ... ADD VALUE 'active'; etc.
//   If columns are TEXT (likely), no migration is needed.

export type StakeDealStatus =
  | "draft"
  | "open"      // legacy: treat as 'active' in display
  | "active"
  | "paused"
  | "filled"    // legacy: treat as 'sold_out' in display
  | "sold_out"
  | "closed"
  | "cancelled";

export type DealVisibility = "draft" | "public" | "friends" | "followers";

export function isPublishedStatus(status: StakeDealStatus): boolean {
  return status === "open" || status === "active" || status === "paused" || status === "filled" || status === "sold_out";
}

export function isEditableStatus(status: StakeDealStatus): boolean {
  return status === "draft" || status === "open" || status === "active";
}

export function dealStatusLabel(status: StakeDealStatus): string {
  switch (status) {
    case "draft":     return "Draft";
    case "open":
    case "active":    return "Active";
    case "paused":    return "Paused";
    case "filled":
    case "sold_out":  return "Sold Out";
    case "closed":    return "Closed";
    case "cancelled": return "Cancelled";
  }
}

export function dealStatusColor(status: StakeDealStatus): string {
  switch (status) {
    case "draft":     return "#6B7280";
    case "open":
    case "active":    return "#22C55E";
    case "paused":    return "#F97316";
    case "filled":
    case "sold_out":  return "#7C3AED";
    case "closed":    return "#6B7280";
    case "cancelled": return "#EF4444";
  }
}

export type StakeDeal = {
  id: string;
  user_id: string;
  tournament_name: string;
  venue: string | null;
  tournament_date: string | null;
  buy_in: number | null;
  total_action_selling: number;
  price_per_percent: number | null;
  markup: number;
  min_piece: number;
  action_claimed: number;
  notes: string | null;
  status: StakeDealStatus;
  visibility: DealVisibility;
  local_tournament_id: number | null;
  created_at: string;
  claims?: StakeClaim[];
  seller_profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type StakeClaim = {
  id: string;
  deal_id: string;
  buyer_id: string;
  percent_claimed: number;
  amount_paid: number | null;
  status: "pending" | "confirmed" | "rejected";
  message: string | null;
  created_at: string;
  buyer_profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export type CreateStakeDealInput = {
  user_id: string;
  tournament_name: string;
  venue?: string | null;
  tournament_date?: string | null;
  buy_in?: number | null;
  total_action_selling: number;
  price_per_percent?: number | null;
  markup?: number;
  min_piece?: number;
  notes?: string | null;
  visibility?: DealVisibility;
  local_tournament_id?: number | null;
};

// ─── Deal CRUD ────────────────────────────────────────────────────────────────

export async function createStakeDeal(input: CreateStakeDealInput): Promise<StakeDeal> {
  const { data, error } = await supabase
    .from("stake_deals")
    .insert({
      user_id:              input.user_id,
      tournament_name:      input.tournament_name,
      venue:                input.venue ?? null,
      tournament_date:      input.tournament_date ?? null,
      buy_in:               input.buy_in ?? null,
      total_action_selling: input.total_action_selling,
      price_per_percent:    input.price_per_percent ?? null,
      markup:               input.markup ?? 1.0,
      min_piece:            input.min_piece ?? 1,
      notes:                input.notes ?? null,
      visibility:           "draft",   // always start as draft
      local_tournament_id:  input.local_tournament_id ?? null,
      action_claimed:       0,
      status:               "draft",   // published explicitly via publishStakeDeal()
    })
    .select()
    .single();

  if (error) throw error;
  return data as StakeDeal;
}

export async function getStakeDeal(dealId: string): Promise<StakeDeal | null> {
  const { data, error } = await supabase
    .from("stake_deals")
    .select(`*, stake_claims(id, deal_id, buyer_id, percent_claimed, amount_paid, status, message, created_at)`)
    .eq("id", dealId)
    .maybeSingle();

  if (error || !data) return null;

  const deal = data as any;
  const rawClaims: any[] = deal.stake_claims ?? [];

  // Fetch buyer profiles in a separate query — avoids needing a FK to public.profiles
  let buyerProfileMap = new Map<string, any>();
  if (rawClaims.length > 0) {
    const buyerIds = [...new Set(rawClaims.map((c: any) => c.buyer_id as string))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", buyerIds);
    for (const p of profiles ?? []) buyerProfileMap.set(p.id, p);
  }

  const claims: StakeClaim[] = rawClaims.map((c: any) => ({
    ...c,
    buyer_profile: buyerProfileMap.get(c.buyer_id) ?? null,
  }));

  return { ...deal, claims, stake_claims: undefined };
}

// Fetches deal + seller profile (used by buyer view)
export async function getStakeDealWithSeller(dealId: string): Promise<StakeDeal | null> {
  const deal = await getStakeDeal(dealId);
  if (!deal) return null;

  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", deal.user_id)
    .single();

  return { ...deal, seller_profile: sellerProfile ?? null };
}

export type MyStakeClaim = StakeClaim & {
  deal: Pick<StakeDeal, "id" | "tournament_name" | "venue" | "tournament_date" | "total_action_selling" | "status">;
};

export async function getMyStakeClaims(buyerId: string): Promise<MyStakeClaim[]> {
  const { data, error } = await supabase
    .from("stake_claims")
    .select(`*, stake_deals(id, tournament_name, venue, tournament_date, total_action_selling, status)`)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    ...c,
    deal: c.stake_deals ?? null,
    stake_deals: undefined,
  }));
}

export async function getMyStakeDeals(userId: string): Promise<StakeDeal[]> {
  const { data, error } = await supabase
    .from("stake_deals")
    .select(`*, stake_claims(id, percent_claimed, status)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as StakeDeal[];
}

// Returns the current user's claim on a specific deal (if any)
export async function getMyClaimForDeal(dealId: string, buyerId: string): Promise<StakeClaim | null> {
  const { data, error } = await supabase
    .from("stake_claims")
    .select("*")
    .eq("deal_id", dealId)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as StakeClaim;
}

export async function updateStakeDeal(
  dealId: string,
  updates: Partial<Omit<StakeDeal, "id" | "user_id" | "created_at">>
): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update(updates)
    .eq("id", dealId);
  if (error) throw error;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function publishStakeDeal(
  dealId: string,
  visibility: "public" | "followers" | "friends"
): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update({ status: "active", visibility })
    .eq("id", dealId);
  if (error) throw error;
}

export async function unpublishStakeDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update({ status: "draft", visibility: "draft" })
    .eq("id", dealId);
  if (error) throw error;
}

export async function pauseStakeDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update({ status: "paused" })
    .eq("id", dealId);
  if (error) throw error;
}

export async function resumeStakeDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update({ status: "active" })
    .eq("id", dealId);
  if (error) throw error;
}

export async function closeStakeDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update({ status: "closed" })
    .eq("id", dealId);
  if (error) throw error;
}

export async function cancelStakeDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from("stake_deals")
    .update({ status: "cancelled" })
    .eq("id", dealId);
  if (error) throw error;
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchPublicStakeDeals(limit = 20, offset = 0): Promise<StakeDeal[]> {
  const { data, error } = await supabase
    .from("stake_deals")
    .select(`*, stake_claims(id, percent_claimed, status), profiles:user_id(id, username, display_name, avatar_url)`)
    .eq("visibility", "public")
    .in("status", ["open", "active"])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    ...d,
    seller_profile: d.profiles ?? null,
    profiles: undefined,
  })) as StakeDeal[];
}

export async function getUserStakeDeals(userId: string): Promise<StakeDeal[]> {
  const { data, error } = await supabase
    .from("stake_deals")
    .select(`*, stake_claims(id, percent_claimed, status)`)
    .eq("user_id", userId)
    .in("status", ["open", "active", "paused", "sold_out", "filled"])
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as StakeDeal[];
}

export async function getOpenDealByAuthorAndTournament(
  userId: string,
  tournamentName: string
): Promise<StakeDeal | null> {
  const { data, error } = await supabase
    .from("stake_deals")
    .select(`*, stake_claims(id, percent_claimed, status)`)
    .eq("user_id", userId)
    .not("status", "in", '("cancelled","closed")')
    .ilike("tournament_name", tournamentName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as StakeDeal | null;
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export async function claimStake(
  dealId: string,
  buyerId: string,
  percentClaimed: number,
  message?: string
): Promise<StakeClaim> {
  const [{ data: deal }, { data: activeClaims }] = await Promise.all([
    supabase
      .from("stake_deals")
      .select("price_per_percent, markup, total_action_selling")
      .eq("id", dealId)
      .single(),
    // Check pending + confirmed claims to prevent double-booking
    supabase
      .from("stake_claims")
      .select("percent_claimed")
      .eq("deal_id", dealId)
      .in("status", ["pending", "confirmed"]),
  ]);

  if (!deal) throw new Error("Deal not found");

  const alreadyClaimed = (activeClaims ?? []).reduce((s, c) => s + c.percent_claimed, 0);
  const remaining = deal.total_action_selling - alreadyClaimed;
  if (percentClaimed > remaining) throw new Error(`Only ${remaining.toFixed(0)}% remaining`);

  const amountPaid =
    deal.price_per_percent != null
      ? parseFloat((deal.price_per_percent * percentClaimed * (deal.markup ?? 1)).toFixed(2))
      : null;

  const { data, error } = await supabase
    .from("stake_claims")
    .insert({
      deal_id:         dealId,
      buyer_id:        buyerId,
      percent_claimed: percentClaimed,
      amount_paid:     amountPaid,
      message:         message ?? null,
      status:          "pending",
    })
    .select()
    .single();

  if (error) throw error;
  // action_claimed is updated by the seller when confirming (owner has UPDATE permission)
  return data as StakeClaim;
}

export async function updateClaimStatus(
  claimId: string,
  status: "confirmed" | "rejected"
): Promise<{ percentClaimed: number }> {
  // Fetch claim details first so we can update action_claimed on the deal
  const { data: claim } = await supabase
    .from("stake_claims")
    .select("deal_id, percent_claimed")
    .eq("id", claimId)
    .single();

  const { error } = await supabase
    .from("stake_claims")
    .update({ status })
    .eq("id", claimId);
  if (error) throw error;

  // On confirmation, increment the deal's action_claimed.
  // The seller owns the deal so this UPDATE is permitted by RLS.
  if (status === "confirmed" && claim) {
    const { data: deal } = await supabase
      .from("stake_deals")
      .select("action_claimed")
      .eq("id", claim.deal_id)
      .single();
    if (deal) {
      await supabase
        .from("stake_deals")
        .update({ action_claimed: deal.action_claimed + claim.percent_claimed })
        .eq("id", claim.deal_id);
    }
  }

  return { percentClaimed: claim?.percent_claimed ?? 0 };
}

export async function withdrawClaim(claimId: string, dealId: string, percent: number): Promise<void> {
  const { error } = await supabase
    .from("stake_claims")
    .delete()
    .eq("id", claimId);
  if (error) throw error;

  const { data: deal } = await supabase
    .from("stake_deals")
    .select("action_claimed")
    .eq("id", dealId)
    .single();

  if (deal) {
    await supabase
      .from("stake_deals")
      .update({ action_claimed: Math.max(0, deal.action_claimed - percent) })
      .eq("id", dealId);
  }
}

// ─── Native share ─────────────────────────────────────────────────────────────

export async function shareStakeDealExternal(deal: {
  tournament_name: string;
  venue?: string | null;
  tournament_date?: string | null;
  buy_in?: number | null;
  total_action_selling: number;
  price_per_percent?: number | null;
  markup?: number;
  notes?: string | null;
}) {
  const date = deal.tournament_date
    ? new Date(deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "long", day: "numeric", month: "long",
      })
    : null;

  const priceStr =
    deal.price_per_percent != null
      ? `$${deal.price_per_percent} per % ${deal.markup && deal.markup !== 1 ? `(${deal.markup}x markup)` : ""}`.trim()
      : null;

  const lines = [
    `🃏 Selling Stakes — ${deal.tournament_name}`,
    date ? `📅 ${date}` : null,
    deal.venue ? `📍 ${deal.venue}` : null,
    deal.buy_in ? `💰 Buy-in: $${deal.buy_in}` : null,
    `🎯 Selling ${deal.total_action_selling}% of my action`,
    priceStr ? `💵 ${priceStr}` : null,
    deal.notes ? `📝 ${deal.notes}` : null,
    "",
    "Reply to claim a piece! 🤝",
  ]
    .filter((l) => l !== null)
    .join("\n");

  await Share.share({ message: lines });
}
