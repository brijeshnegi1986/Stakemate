import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SocialProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  last_seen_at?: string | null;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export type SocialPost = {
  id: string;
  user_id: string;
  session_type: "cash" | "tournament";
  session_name: string | null;
  venue: string | null;
  status: string | null;
  amount: number | null;
  amount_label: string | null;
  is_live: boolean;
  content: string | null;
  image_url: string | null;
  stake_deal_id: string | null;
  created_at: string;
  profile: SocialProfile;
  reactions: ReactionGroup[];
  comment_count: number;
  save_count: number;
  saved_by_me: boolean;
  visibility: "public" | "friends";
};

export type CreatePostInput = {
  user_id: string;
  session_type?: "cash" | "tournament";
  session_name?: string | null;
  venue?: string | null;
  status?: string | null;
  amount?: number | null;
  amount_label?: string | null;
  content?: string | null;
  image_url?: string | null;
  is_live?: boolean;
  stake_deal_id?: string | null;
  visibility: "public" | "friends";
};

export type SocialComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile: SocialProfile;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SAVE_EMOJI = "⭐";

// Posts query — no profiles join (FK points to auth.users, not public.profiles)
const POST_QUERY = `
  id, user_id, session_type, session_name, venue, status,
  amount, amount_label, is_live, content, image_url, stake_deal_id, visibility, created_at,
  social_reactions (emoji, user_id),
  social_comments (id)
` as const;

async function fetchProfiles(userIds: string[]): Promise<Map<string, SocialProfile>> {
  if (!userIds.length) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, created_at, last_seen_at")
    .in("id", userIds);
  const map = new Map<string, SocialProfile>();
  for (const p of data ?? []) map.set(p.id, p);
  return map;
}

function normalizePosts(rows: any[], currentUserId: string, profilesMap: Map<string, SocialProfile>): SocialPost[] {
  return (rows ?? []).map((row) => {
    const rawReactions: { emoji: string; user_id: string }[] = row.social_reactions ?? [];
    const grouped: Record<string, { count: number; reacted: boolean }> = {};

    for (const r of rawReactions) {
      if (r.emoji === SAVE_EMOJI) continue; // saves tracked separately
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reacted: false };
      grouped[r.emoji].count++;
      if (r.user_id === currentUserId) grouped[r.emoji].reacted = true;
    }

    const saveReactions = rawReactions.filter((r) => r.emoji === SAVE_EMOJI);

    return {
      id: row.id,
      user_id: row.user_id,
      session_type: row.session_type,
      session_name: row.session_name,
      venue: row.venue,
      status: row.status,
      amount: row.amount,
      amount_label: row.amount_label,
      is_live: row.is_live,
      content: row.content,
      image_url: row.image_url ?? null,
      stake_deal_id: row.stake_deal_id ?? null,
      created_at: row.created_at,
      profile: profilesMap.get(row.user_id) ?? { id: row.user_id, username: null, display_name: null, avatar_url: null },
      reactions: Object.entries(grouped).map(([emoji, v]) => ({ emoji, ...v })),
      comment_count: (row.social_comments ?? []).length,
      save_count: saveReactions.length,
      saved_by_me: saveReactions.some((r) => r.user_id === currentUserId),
      visibility: (row.visibility ?? "public") as "public" | "friends",
    };
  });
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function fetchPublicFeed(currentUserId: string, limit = 20, offset = 0): Promise<SocialPost[]> {
  const { data, error } = await supabase
    .from("social_posts")
    .select(POST_QUERY)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const profilesMap = await fetchProfiles([...new Set((data ?? []).map((r: any) => r.user_id))]);
  return normalizePosts(data, currentUserId, profilesMap);
}

export async function fetchFollowingFeed(currentUserId: string, limit = 20, offset = 0): Promise<SocialPost[]> {
  const { data: follows } = await supabase
    .from("social_follows")
    .select("following_id")
    .eq("follower_id", currentUserId);

  const ids = follows?.map((f) => f.following_id) ?? [];
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("social_posts")
    .select(POST_QUERY)
    .in("user_id", ids)
    .in("visibility", ["public", "friends"])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const profilesMap = await fetchProfiles([...new Set((data ?? []).map((r: any) => r.user_id))]);
  return normalizePosts(data, currentUserId, profilesMap);
}

export async function fetchTournamentFeed(currentUserId: string, limit = 30): Promise<SocialPost[]> {
  const { data, error } = await supabase
    .from("social_posts")
    .select(POST_QUERY)
    .eq("visibility", "public")
    .eq("session_type", "tournament")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const profilesMap = await fetchProfiles([...new Set((data ?? []).map((r: any) => r.user_id))]);
  return normalizePosts(data, currentUserId, profilesMap);
}

// ─── Players / Search ─────────────────────────────────────────────────────────

export async function searchPlayers(query: string, currentUserId: string): Promise<SocialProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq("id", currentUserId)
    .limit(20);
  return data ?? [];
}

export async function getSuggestedPlayers(currentUserId: string, limit = 10): Promise<SocialProfile[]> {
  const { data: follows } = await supabase
    .from("social_follows")
    .select("following_id")
    .eq("follower_id", currentUserId);

  const followingIds = follows?.map((f: any) => f.following_id) ?? [];

  const excludeClause = followingIds.length ? `(${followingIds.join(",")})` : null;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .neq("id", currentUserId)
    .not("username", "is", null)
    .not("id", "in", excludeClause ?? `('00000000-0000-0000-0000-000000000000')`)
    .limit(limit);

  return data ?? [];
}

// ─── Online presence ──────────────────────────────────────────────────────────

export type ActiveMember = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
};

export async function updateLastSeen(userId: string): Promise<void> {
  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);
}

export async function fetchActiveMembers(limit = 20): Promise<ActiveMember[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, last_seen_at")
    .not("avatar_url", "is", null)
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ─── Follows ──────────────────────────────────────────────────────────────────

export async function getFollowingIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("social_follows")
    .select("following_id")
    .eq("follower_id", userId);
  return data?.map((r: any) => r.following_id) ?? [];
}

export async function followPlayer(followerId: string, followingId: string): Promise<void> {
  await supabase.from("social_follows").insert({ follower_id: followerId, following_id: followingId });
}

export async function unfollowPlayer(followerId: string, followingId: string): Promise<void> {
  await supabase
    .from("social_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export async function toggleReaction(
  postId: string,
  userId: string,
  emoji: string,
  currentlyReacted: boolean
): Promise<void> {
  if (currentlyReacted) {
    await supabase
      .from("social_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("emoji", emoji);
  } else {
    await supabase.from("social_reactions").insert({ post_id: postId, user_id: userId, emoji });
  }
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function createPost(input: CreatePostInput): Promise<SocialPost> {
  const { visibility = "public", ...rest } = input;
  const { data, error } = await supabase
    .from("social_posts")
    .insert({ ...rest, visibility })
    .select(POST_QUERY)
    .single();

  if (error) throw error;
  const profilesMap = await fetchProfiles([input.user_id]);
  return normalizePosts([data], input.user_id, profilesMap)[0];
}

export async function deletePost(postId: string): Promise<void> {
  await supabase.from("social_posts").delete().eq("id", postId);
}

export async function updatePostVisibility(postId: string, visibility: "public" | "friends"): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .update({ visibility })
    .eq("id", postId);
  if (error) throw error;
}

export async function createTextPost(userId: string, content: string, visibility: "public" | "friends" = "public"): Promise<SocialPost> {
  const { data, error } = await supabase
    .from("social_posts")
    .insert({ user_id: userId, session_type: "cash", content, visibility })
    .select("id, user_id, session_type, session_name, venue, status, amount, amount_label, is_live, content, created_at")
    .single();

  if (error) throw error;
  const profilesMap = await fetchProfiles([userId]);
  return normalizePosts([{ ...data, social_reactions: [] }], userId, profilesMap)[0];
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function fetchComments(postId: string): Promise<SocialComment[]> {
  const { data, error } = await supabase
    .from("social_comments")
    .select("id, post_id, user_id, content, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  const rows = data ?? [];
  const profilesMap = await fetchProfiles([...new Set(rows.map((r: any) => r.user_id))]);
  return rows.map((row: any) => ({
    id: row.id,
    post_id: row.post_id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    profile: profilesMap.get(row.user_id) ?? { id: row.user_id, username: null, display_name: null, avatar_url: null },
  }));
}

export async function addComment(postId: string, userId: string, content: string): Promise<SocialComment> {
  const { data, error } = await supabase
    .from("social_comments")
    .insert({ post_id: postId, user_id: userId, content })
    .select("id, post_id, user_id, content, created_at")
    .single();

  if (error) throw error;
  const profilesMap = await fetchProfiles([userId]);
  return {
    id: data.id,
    post_id: data.post_id,
    user_id: data.user_id,
    content: data.content,
    created_at: data.created_at,
    profile: profilesMap.get(userId) ?? { id: userId, username: null, display_name: null, avatar_url: null },
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  await supabase.from("social_comments").delete().eq("id", commentId);
}

// ─── Tournament saves (⭐) ─────────────────────────────────────────────────────

export async function saveTournamentPost(postId: string, userId: string): Promise<void> {
  await supabase.from("social_reactions").insert({ post_id: postId, user_id: userId, emoji: SAVE_EMOJI });
}

export async function unsaveTournamentPost(postId: string, userId: string): Promise<void> {
  await supabase.from("social_reactions").delete()
    .eq("post_id", postId).eq("user_id", userId).eq("emoji", SAVE_EMOJI);
}

export async function fetchSavedTournamentPosts(currentUserId: string): Promise<SocialPost[]> {
  const { data: saves } = await supabase
    .from("social_reactions")
    .select("post_id")
    .eq("user_id", currentUserId)
    .eq("emoji", SAVE_EMOJI);

  const postIds = (saves ?? []).map((s: any) => s.post_id);
  if (!postIds.length) return [];

  const { data, error } = await supabase
    .from("social_posts")
    .select(POST_QUERY)
    .in("id", postIds)
    .eq("session_type", "tournament")
    .order("status", { ascending: true });

  if (error) throw error;
  const profilesMap = await fetchProfiles([...new Set((data ?? []).map((r: any) => r.user_id))]);
  return normalizePosts(data, currentUserId, profilesMap);
}

// ─── Elite: publish tournament to community ────────────────────────────────────

export type PublishTournamentInput = {
  userId: string;
  name: string;
  venue?: string | null;
  buyIn?: string | null;
  date: string;          // YYYY-MM-DD stored in status field
  description?: string | null;
  series?: string | null;
  imageUri?: string | null; // local file URI from image picker
};

export async function publishTournament(input: PublishTournamentInput): Promise<SocialPost> {
  let imageUrl: string | null = null;

  if (input.imageUri) {
    try {
      const ext  = input.imageUri.split(".").pop()?.split("?")[0] ?? "jpg";
      const path = `${input.userId}/${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append("file", { uri: input.imageUri, name: `image.${ext}`, type: `image/${ext}` } as any);
      const { error: uploadErr } = await supabase.storage
        .from("tournament-images")
        .upload(path, formData, { contentType: `image/${ext}`, upsert: true });
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage
          .from("tournament-images")
          .getPublicUrl(path);
        imageUrl = publicUrl;
      }
    } catch { /* image upload failed — publish without image */ }
  }

  const contentParts = [
    input.series ? `Series: ${input.series}` : null,
    input.description ?? null,
  ].filter(Boolean) as string[];

  return createPost({
    user_id:      input.userId,
    session_type: "tournament",
    session_name: input.name,
    venue:        input.venue ?? null,
    amount_label: input.buyIn ?? null,
    status:       input.date,
    image_url:    imageUrl,
    content:      contentParts.length > 0 ? contentParts.join("\n") : input.name,
    visibility:   "public",
  });
}

// ─── Full profile with counts ─────────────────────────────────────────────────

export type FullProfile = SocialProfile & {
  bio: string | null;
  location: string | null;
  follower_count: number;
  following_count: number;
  stake_deals_count: number;
  hendon_mob_url: string | null;
  poker_index_url: string | null;
  twitter_handle: string | null;
  instagram_handle: string | null;
  youtube_handle: string | null;
  twitch_handle: string | null;
  live_earnings: number | null;
  live_cashes: number | null;
  live_wins: number | null;
  top_10_results: number | null;
};

export async function getProfileWithCounts(
  profileId: string,
  currentUserId: string
): Promise<{ profile: FullProfile; isFollowing: boolean } | null> {
  const [profileRes, followerRes, followingRes, isFollowingRes, dealsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, location, created_at, last_seen_at, hendon_mob_url, poker_index_url, twitter_handle, instagram_handle, youtube_handle, twitch_handle, live_earnings, live_cashes, live_wins, top_10_results")
      .eq("id", profileId)
      .single(),
    supabase
      .from("social_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", profileId),
    supabase
      .from("social_follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", profileId),
    supabase
      .from("social_follows")
      .select("follower_id")
      .eq("follower_id", currentUserId)
      .eq("following_id", profileId)
      .maybeSingle(),
    supabase
      .from("stake_deals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profileId)
      .neq("status", "cancelled"),
  ]);

  if (!profileRes.data) return null;

  return {
    profile: {
      ...profileRes.data,
      follower_count:    followerRes.count ?? 0,
      following_count:   followingRes.count ?? 0,
      stake_deals_count: dealsRes.count ?? 0,
    },
    isFollowing: !!isFollowingRes.data,
  };
}

export async function getUserPosts(
  profileId: string,
  currentUserId: string,
  limit = 30
): Promise<SocialPost[]> {
  const { data, error } = await supabase
    .from("social_posts")
    .select(POST_QUERY)
    .eq("user_id", profileId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  const profilesMap = await fetchProfiles([profileId]);
  return normalizePosts(data, currentUserId, profilesMap);
}

// ─── Staked player feed ───────────────────────────────────────────────────────

export async function fetchStakedPlayerFeed(currentUserId: string, limit = 30): Promise<SocialPost[]> {
  // Get deal IDs where current user has a confirmed claim
  const { data: claims } = await supabase
    .from("stake_claims")
    .select("deal_id")
    .eq("buyer_id", currentUserId)
    .eq("status", "confirmed");

  if (!claims || claims.length === 0) return [];

  const dealIds = claims.map((c: any) => c.deal_id as string);

  // Get seller user IDs from those deals
  const { data: deals } = await supabase
    .from("stake_deals")
    .select("user_id")
    .in("id", dealIds);

  if (!deals || deals.length === 0) return [];

  const sellerIds = [...new Set(deals.map((d: any) => d.user_id as string))];

  // Fetch recent posts from those sellers
  const { data, error } = await supabase
    .from("social_posts")
    .select(POST_QUERY)
    .in("user_id", sellerIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const profilesMap = await fetchProfiles(sellerIds);
  return normalizePosts(data, currentUserId, profilesMap);
}

// ─── Time formatting ──────────────────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7)   return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
