import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SocialProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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
  created_at: string;
  profile: SocialProfile;
  reactions: ReactionGroup[];
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
  is_live?: boolean;
  visibility?: "public" | "friends";
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

// Posts query — no profiles join (FK points to auth.users, not public.profiles)
const POST_QUERY = `
  id, user_id, session_type, session_name, venue, status,
  amount, amount_label, is_live, content, created_at,
  social_reactions (emoji, user_id)
` as const;

async function fetchProfiles(userIds: string[]): Promise<Map<string, SocialProfile>> {
  if (!userIds.length) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
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
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reacted: false };
      grouped[r.emoji].count++;
      if (r.user_id === currentUserId) grouped[r.emoji].reacted = true;
    }

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
      created_at: row.created_at,
      profile: profilesMap.get(row.user_id) ?? { id: row.user_id, username: null, display_name: null, avatar_url: null },
      reactions: Object.entries(grouped).map(([emoji, v]) => ({ emoji, ...v })),
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

  let query = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .neq("id", currentUserId)
    .not("username", "is", null)
    .limit(limit);

  if (followingIds.length) {
    query = query.not("id", "in", `(${followingIds.join(",")})`);
  }

  const { data } = await query;
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
