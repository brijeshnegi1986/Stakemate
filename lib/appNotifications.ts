import { getSetting, setSetting } from "../db/database";
import { supabase } from "./supabase";

const LAST_READ_KEY = "notifications_last_read_at";

export type AppNotificationType =
  | "stake_claim_pending"
  | "stake_claim_confirmed"
  | "stake_claim_rejected"
  | "post_comment"
  | "new_follower"
  | "tournament_post";

export type AppNotification = {
  id: string;
  type: AppNotificationType;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  actor: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  data: {
    dealId?: string;
    claimId?: string;
    postId?: string;
    followerId?: string;
    tournamentPostId?: string;
  };
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

async function fetchProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  const map = new Map<string, ProfileRow>();
  for (const row of data ?? []) map.set(row.id, row);
  return map;
}

export async function fetchAppNotifications(userId: string): Promise<AppNotification[]> {
  const lastReadAt = getSetting(LAST_READ_KEY) ?? "1970-01-01T00:00:00Z";

  const { data: followingData } = await supabase
    .from("social_follows")
    .select("following_id")
    .eq("follower_id", userId);
  const followingIds = (followingData ?? []).map((f: any) => f.following_id);

  const [dealsRes, postsRes, followsRes, tournamentPostsRes] = await Promise.allSettled([
    supabase
      .from("stake_deals")
      .select("id, tournament_name, stake_claims(id, buyer_id, percent_claimed, status, created_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("social_posts")
      .select("id, session_name, social_comments(id, user_id, content, created_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("social_follows")
      .select("follower_id, created_at")
      .eq("following_id", userId)
      .neq("follower_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),

    followingIds.length > 0
      ? supabase
          .from("social_posts")
          .select("id, user_id, session_name, venue, created_at")
          .in("user_id", followingIds)
          .eq("session_type", "tournament")
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const actorIds = new Set<string>();

  if (dealsRes.status === "fulfilled" && dealsRes.value.data) {
    for (const deal of dealsRes.value.data as any[]) {
      for (const claim of deal.stake_claims ?? []) {
        if (claim.buyer_id && claim.buyer_id !== userId) actorIds.add(claim.buyer_id);
      }
    }
  }
  if (postsRes.status === "fulfilled" && postsRes.value.data) {
    for (const post of postsRes.value.data as any[]) {
      for (const comment of post.social_comments ?? []) {
        if (comment.user_id && comment.user_id !== userId) actorIds.add(comment.user_id);
      }
    }
  }
  if (followsRes.status === "fulfilled" && followsRes.value.data) {
    for (const row of followsRes.value.data as any[]) {
      if (row.follower_id) actorIds.add(row.follower_id);
    }
  }
  if (tournamentPostsRes.status === "fulfilled" && tournamentPostsRes.value.data) {
    for (const row of tournamentPostsRes.value.data as any[]) {
      if (row.user_id) actorIds.add(row.user_id);
    }
  }

  const profileMap = await fetchProfiles([...actorIds]);
  const notifications: AppNotification[] = [];

  // ── Stake claims ──────────────────────────────────────────────────────────
  if (dealsRes.status === "fulfilled" && dealsRes.value.data) {
    for (const deal of dealsRes.value.data as any[]) {
      for (const claim of deal.stake_claims ?? []) {
        if (claim.buyer_id === userId) continue;
        const actor = profileMap.get(claim.buyer_id) ?? null;
        const actorName = actor?.display_name ?? actor?.username ?? "Someone";

        let type: AppNotificationType;
        let title: string;
        let body: string;

        if (claim.status === "confirmed") {
          type = "stake_claim_confirmed";
          title = "Stake Confirmed";
          body = `${actorName} confirmed ${claim.percent_claimed}% in ${deal.tournament_name}`;
        } else if (claim.status === "rejected") {
          type = "stake_claim_rejected";
          title = "Stake Rejected";
          body = `${actorName}'s claim on ${deal.tournament_name} was rejected`;
        } else {
          type = "stake_claim_pending";
          title = "New Stake Request";
          body = `${actorName} wants ${claim.percent_claimed}% of your action in ${deal.tournament_name}`;
        }

        notifications.push({
          id: `claim_${claim.id}`,
          type,
          title,
          body,
          created_at: claim.created_at,
          read: claim.created_at <= lastReadAt,
          actor,
          data: { dealId: deal.id, claimId: claim.id },
        });
      }
    }
  }

  // ── Post comments ─────────────────────────────────────────────────────────
  if (postsRes.status === "fulfilled" && postsRes.value.data) {
    for (const post of postsRes.value.data as any[]) {
      for (const comment of post.social_comments ?? []) {
        if (comment.user_id === userId) continue;
        const actor = profileMap.get(comment.user_id) ?? null;
        const actorName = actor?.display_name ?? actor?.username ?? "Someone";
        const preview = comment.content?.length > 60
          ? `${comment.content.slice(0, 60)}…`
          : comment.content;

        notifications.push({
          id: `comment_${comment.id}`,
          type: "post_comment",
          title: "New Comment",
          body: `${actorName} commented: "${preview}"`,
          created_at: comment.created_at,
          read: comment.created_at <= lastReadAt,
          actor,
          data: { postId: post.id },
        });
      }
    }
  }

  // ── New followers ─────────────────────────────────────────────────────────
  if (followsRes.status === "fulfilled" && followsRes.value.data) {
    for (const row of followsRes.value.data as any[]) {
      const actor = profileMap.get(row.follower_id) ?? null;
      const actorName = actor?.display_name ?? actor?.username ?? "Someone";

      notifications.push({
        id: `follow_${row.follower_id}`,
        type: "new_follower",
        title: "New Follower",
        body: `${actorName} started following you`,
        created_at: row.created_at,
        read: row.created_at <= lastReadAt,
        actor,
        data: { followerId: row.follower_id },
      });
    }
  }

  // ── Tournament posts from followed players ────────────────────────────────
  if (tournamentPostsRes.status === "fulfilled" && tournamentPostsRes.value.data) {
    for (const row of tournamentPostsRes.value.data as any[]) {
      const actor = profileMap.get(row.user_id) ?? null;
      const actorName = actor?.display_name ?? actor?.username ?? "Someone";
      const tournamentName = row.session_name ?? "a tournament";
      const venue = row.venue ? ` at ${row.venue}` : "";

      notifications.push({
        id: `tourney_post_${row.id}`,
        type: "tournament_post",
        title: "Tournament Posted",
        body: `${actorName} posted ${tournamentName}${venue}`,
        created_at: row.created_at,
        read: row.created_at <= lastReadAt,
        actor,
        data: { tournamentPostId: row.id },
      });
    }
  }

  return notifications.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function markAllRead(userId: string): Promise<void> {
  setSetting(LAST_READ_KEY, new Date().toISOString());
  // Keep the server-side notifications table (used for push badge counts) in sync,
  // otherwise rows read in-app stay read=false forever and inflate the next push's badge.
  await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const lastReadAt = getSetting(LAST_READ_KEY) ?? "1970-01-01T00:00:00Z";

  const { data: followingData } = await supabase
    .from("social_follows")
    .select("following_id")
    .eq("follower_id", userId);
  const followingIds = (followingData ?? []).map((f: any) => f.following_id);

  const [dealsRes, postsRes, followsRes, tourneyPostsRes] = await Promise.allSettled([
    supabase
      .from("stake_deals")
      .select("id, stake_claims(id, buyer_id, created_at)")
      .eq("user_id", userId),

    supabase
      .from("social_posts")
      .select("id, social_comments(id, user_id, created_at)")
      .eq("user_id", userId),

    supabase
      .from("social_follows")
      .select("follower_id, created_at")
      .eq("following_id", userId)
      .neq("follower_id", userId)
      .gt("created_at", lastReadAt),

    followingIds.length > 0
      ? supabase
          .from("social_posts")
          .select("id", { count: "exact", head: true })
          .in("user_id", followingIds)
          .eq("session_type", "tournament")
          .gt("created_at", lastReadAt)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  let count = 0;

  if (dealsRes.status === "fulfilled" && dealsRes.value.data) {
    for (const deal of dealsRes.value.data as any[]) {
      for (const claim of deal.stake_claims ?? []) {
        if (claim.buyer_id !== userId && claim.created_at > lastReadAt) count++;
      }
    }
  }

  if (postsRes.status === "fulfilled" && postsRes.value.data) {
    for (const post of postsRes.value.data as any[]) {
      for (const comment of post.social_comments ?? []) {
        if (comment.user_id !== userId && comment.created_at > lastReadAt) count++;
      }
    }
  }

  if (followsRes.status === "fulfilled" && followsRes.value.data) {
    count += followsRes.value.data.length;
  }

  if (tourneyPostsRes.status === "fulfilled") {
    count += (tourneyPostsRes.value as any)?.count ?? 0;
  }

  return count;
}
