import { useAuth } from "@/context/AuthContext";
import {
  addComment,
  createTextPost,
  deleteComment,
  deletePost,
  fetchComments,
  fetchFollowingFeed,
  fetchPublicFeed,
  followPlayer,
  getFollowingIds,
  getSuggestedPlayers,
  searchPlayers,
  SocialComment,
  SocialPost,
  SocialProfile,
  timeAgo,
  toggleReaction,
  unfollowPlayer,
} from "@/lib/social";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const REACTION_EMOJIS = ["🔥", "💰", "🎉", "👏", "😅", "🤑"];

type Tab = "feed" | "players";

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size, name }: { uri?: string | null; size: number; name?: string | null }) {
  const { colors } = usePokerTheme();
  const initials = name
    ? name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: uri ? "transparent" : `${BRAND}22`, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
        : <Text style={{ color: BRAND, fontSize: size * 0.38, fontWeight: "800" }}>{initials}</Text>
      }
    </View>
  );
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({
  visible, onClose, onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  onPosted: (post: SocialPost) => void;
}) {
  const { colors } = usePokerTheme();
  const { user, profile } = useAuth();
  const [text,        setText]        = useState("");
  const [posting,     setPosting]     = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const displayName = profile?.display_name || profile?.username || "You";

  const handlePost = async () => {
    const trimmed = text.trim();
    const uid = user?.id ?? profile?.id;
    if (!trimmed) { Alert.alert("Empty post", "Write something first."); return; }
    if (!uid)     { Alert.alert("Not signed in", "Sign in to post."); return; }
    setPosting(true);
    try {
      const post = await createTextPost(uid, trimmed, friendsOnly ? "friends" : "public");
      onPosted(post);
      setText("");
      onClose();
    } catch (e: any) {
      console.error("createTextPost error:", e);
      Alert.alert("Could not post", e?.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.primary }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={[styles.composeHeader, { borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={onClose} style={styles.composeCancel}>
            <Text style={[styles.composeCancelText, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.composeTitle, { color: colors.text.primary }]}>New Post</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!text.trim() || posting}
            style={[styles.composePostBtn, { backgroundColor: BRAND, opacity: !text.trim() || posting ? 0.5 : 1 }]}
          >
            {posting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.composePostBtnText}>{friendsOnly ? "Post (Followers)" : "Post"}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Compose area */}
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.composeBody}>
            <Avatar uri={profile?.avatar_url} size={42} name={displayName} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.composeName, { color: colors.text.primary }]}>{displayName}</Text>
              <TextInput
                ref={inputRef}
                autoFocus
                multiline
                placeholder="What's on your mind?"
                placeholderTextColor={colors.text.disabled}
                value={text}
                onChangeText={setText}
                maxLength={500}
                style={[styles.composeInput, { color: colors.text.primary }]}
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.composeFooter, { borderTopColor: colors.border.default, paddingBottom: 16 }]}>
          {/* Followers-only toggle */}
          <View style={[styles.composeToggleRow, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}>
            <Ionicons name="people-outline" size={15} color={friendsOnly ? BRAND : colors.text.tertiary} />
            <Text style={[styles.composeToggleLabel, { color: friendsOnly ? BRAND : colors.text.secondary }]}>
              {friendsOnly ? "Followers only" : "Public"}
            </Text>
            <Switch
              value={friendsOnly}
              onValueChange={setFriendsOnly}
              trackColor={{ false: colors.border.default, true: `${BRAND}55` }}
              thumbColor={friendsOnly ? BRAND : colors.text.tertiary}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
          <Text style={[styles.composeCount, { color: text.length > 400 ? "#EF4444" : colors.text.tertiary }]}>
            {500 - text.length}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

function CommentsModal({
  post, currentUserId, profile, visible, onClose,
}: {
  post: SocialPost | null;
  currentUserId: string;
  profile: any;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && post) {
      setLoading(true);
      fetchComments(post.id)
        .then(setComments)
        .catch(() => setComments([]))
        .finally(() => setLoading(false));
    } else {
      setComments([]);
      setInput("");
    }
  }, [visible, post?.id]);

  const handleSend = async () => {
    if (!input.trim() || !post || !currentUserId) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      const comment = await addComment(post.id, currentUserId, text);
      setComments((prev) => [...prev, comment]);
    } catch {
      Alert.alert("Error", "Could not post comment.");
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert("Delete comment?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          deleteComment(commentId).catch(console.error);
        },
      },
    ]);
  };

  const displayName = profile?.display_name || profile?.username || "You";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Full-screen root — overlay colour lives here */}
      <View style={styles.commentsRoot}>
        {/* Tappable backdrop — sits behind the sheet */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        {/* KAV wraps only the sheet so the input lifts above the keyboard */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.commentsContainer, { backgroundColor: colors.bg.primary }]}>
            {/* Handle */}
            <View style={[styles.commentsHandle, { backgroundColor: colors.border.default }]} />

            {/* Header */}
            <View style={[styles.commentsHeader, { borderBottomColor: colors.border.default }]}>
              <Text style={[styles.commentsTitle, { color: colors.text.primary }]}>Comments</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={[styles.commentsCloseBtn, { backgroundColor: colors.bg.secondary }]}>
                  <Ionicons name="close" size={16} color={colors.text.secondary} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Comment list */}
            {loading ? (
              <View style={styles.commentsCenter}>
                <ActivityIndicator color={BRAND} />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.commentsCenter}>
                <Ionicons name="chatbubble-outline" size={36} color={colors.text.tertiary} />
                <Text style={{ color: colors.text.tertiary, fontSize: 14, marginTop: 8 }}>No comments yet. Be the first!</Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id}
                style={styles.commentsList}
                contentContainerStyle={{ padding: 16, gap: 16 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: c }) => {
                  const name = c.profile.display_name || c.profile.username || "Player";
                  const isOwn = c.user_id === currentUserId;
                  return (
                    <View style={styles.commentRow}>
                      <Avatar uri={c.profile.avatar_url} size={32} name={name} />
                      <View style={[styles.commentBubble, { backgroundColor: colors.bg.secondary }]}>
                        <View style={styles.commentBubbleTop}>
                          <Text style={[styles.commentName, { color: colors.text.primary }]}>{name}</Text>
                          <Text style={[styles.commentTime, { color: colors.text.tertiary }]}>{timeAgo(c.created_at)}</Text>
                          {isOwn && (
                            <TouchableOpacity onPress={() => handleDeleteComment(c.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                              <Ionicons name="trash-outline" size={13} color={colors.text.tertiary} />
                            </TouchableOpacity>
                          )}
                        </View>
                        <Text style={[styles.commentText, { color: colors.text.secondary }]}>{c.content}</Text>
                      </View>
                    </View>
                  );
                }}
              />
            )}

            {/* Input */}
            <View style={[styles.commentInputRow, { borderTopColor: colors.border.default, paddingBottom: insets.bottom + 8 }]}>
              <Avatar uri={profile?.avatar_url} size={32} name={displayName} />
              <View style={[styles.commentInputWrap, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Add a comment…"
                  placeholderTextColor={colors.text.disabled}
                  style={[styles.commentInput, { color: colors.text.primary }]}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!input.trim() || sending}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {sending
                    ? <ActivityIndicator size="small" color={BRAND} />
                    : <Ionicons name="send" size={18} color={input.trim() ? BRAND : colors.text.tertiary} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post, currentUserId, onReact, onDelete, onComment,
}: {
  post: SocialPost;
  currentUserId: string;
  onReact: (postId: string, emoji: string, reacted: boolean) => void;
  onDelete: (postId: string) => void;
  onComment: (post: SocialPost) => void;
}) {
  const { colors } = usePokerTheme();
  const isTournament = post.session_type === "tournament";
  const isOwn = post.user_id === currentUserId;
  const displayName = post.profile.display_name || post.profile.username || "Player";
  const handle = post.profile.username ? `@${post.profile.username}` : null;
  const profit = post.amount ?? 0;
  const profitColor = profit >= 0 ? "#22C55E" : "#EF4444";
  const profitStr = `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toLocaleString("en-AU")}`;
  const isSessionPost = post.session_name != null || post.amount != null;

  function options() {
    Alert.alert("Options", undefined, isOwn
      ? [{ text: "Delete Post", style: "destructive", onPress: () => onDelete(post.id) }, { text: "Cancel", style: "cancel" }]
      : [{ text: "Report", onPress: () => Alert.alert("Reported", "Thanks for your report.") }, { text: "Cancel", style: "cancel" }]
    );
  }

  return (
    <View style={[styles.postCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      {/* Author row */}
      <View style={styles.postAuthor}>
        <Avatar uri={post.profile.avatar_url} size={38} name={displayName} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.postAuthorName, { color: colors.text.primary }]}>{displayName}</Text>
          <Text style={[styles.postAuthorSub, { color: colors.text.tertiary }]}>
            {handle ? `${handle} · ` : ""}{timeAgo(post.created_at)}
          </Text>
        </View>
        <TouchableOpacity onPress={options} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Free-text content */}
      {post.content ? (
        <Text style={[styles.postContent, { color: colors.text.primary }]}>{post.content}</Text>
      ) : null}

      {/* Session block — only shown when it's a session share */}
      {isSessionPost ? (
        <View style={[styles.sessionBlock, { backgroundColor: colors.bg.secondary, borderColor: colors.border.subtle }]}>
          <View style={[styles.sessionIconWrap, { backgroundColor: isTournament ? "#8B5CF6" : "#F97316" }]}>
            <Ionicons name={isTournament ? "trophy-outline" : "cash-outline"} size={16} color="#fff" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.sessionName, { color: colors.text.primary }]} numberOfLines={1}>
              {post.is_live && <Text style={{ color: "#22C55E" }}>● </Text>}
              {post.session_name || (isTournament ? "Tournament" : "Cash Game")}
            </Text>
            {post.venue ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="location-outline" size={11} color={colors.text.tertiary} />
                <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]} numberOfLines={1}>{post.venue}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.profitText, { color: profitColor }]}>{profitStr}</Text>
            {post.amount_label ? (
              <Text style={[styles.profitLabel, { color: colors.text.tertiary }]}>{post.amount_label}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Caption */}
      {post.status ? (
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{post.status}</Text>
      ) : null}

      {/* Actions row */}
      <View style={[styles.actionsRow, { borderTopColor: colors.border.subtle }]}>
        {/* Reactions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {post.reactions.map((r) => (
            <TouchableOpacity
              key={r.emoji}
              onPress={() => onReact(post.id, r.emoji, r.reacted)}
              style={[styles.reactChip, {
                backgroundColor: r.reacted ? `${BRAND}14` : colors.bg.secondary,
                borderColor: r.reacted ? BRAND : colors.border.default,
              }]}
            >
              <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
              <Text style={[styles.reactCount, { color: r.reacted ? BRAND : colors.text.secondary }]}>{r.count}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.reactChip, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}
            onPress={() =>
              Alert.alert("React", "Pick a reaction", [
                ...REACTION_EMOJIS.map((emoji) => ({
                  text: emoji,
                  onPress: () => {
                    const ex = post.reactions.find((r) => r.emoji === emoji);
                    onReact(post.id, emoji, ex?.reacted ?? false);
                  },
                })),
                { text: "Cancel", style: "cancel" as const },
              ])
            }
          >
            <Ionicons name="add" size={13} color={colors.text.tertiary} />
          </TouchableOpacity>
        </ScrollView>

        {/* Comment button */}
        <TouchableOpacity
          onPress={() => onComment(post)}
          style={[styles.commentBtn, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}
        >
          <Ionicons name="chatbubble-outline" size={13} color={colors.text.tertiary} />
          <Text style={[styles.commentBtnText, { color: colors.text.tertiary }]}>Comment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Player card ──────────────────────────────────────────────────────────────

function PlayerCard({ player, following, onToggleFollow }: { player: SocialProfile; following: boolean; onToggleFollow: (id: string, currently: boolean) => void }) {
  const { colors } = usePokerTheme();
  const name = player.display_name || player.username || "Player";
  return (
    <View style={[styles.playerCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <Avatar uri={player.avatar_url} size={48} name={name} />
      <Text style={[styles.playerName, { color: colors.text.primary }]} numberOfLines={1}>{name}</Text>
      {player.username ? <Text style={[styles.playerHandle, { color: colors.text.tertiary }]} numberOfLines={1}>@{player.username}</Text> : null}
      <TouchableOpacity
        onPress={() => onToggleFollow(player.id, following)}
        style={[styles.followBtn, { backgroundColor: following ? colors.bg.secondary : BRAND, borderColor: following ? colors.border.default : BRAND }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.followBtnText, { color: following ? colors.text.secondary : "#fff" }]}>
          {following ? "Following" : "Follow"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function PlayerRow({ player, following, onToggleFollow }: { player: SocialProfile; following: boolean; onToggleFollow: (id: string, currently: boolean) => void }) {
  const { colors } = usePokerTheme();
  const name = player.display_name || player.username || "Player";
  return (
    <View style={[styles.playerRow, { borderBottomColor: colors.border.subtle }]}>
      <Avatar uri={player.avatar_url} size={44} name={name} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.playerName, { color: colors.text.primary }]}>{name}</Text>
        {player.username ? <Text style={[styles.playerHandle, { color: colors.text.tertiary }]}>@{player.username}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={() => onToggleFollow(player.id, following)}
        style={[styles.followBtn, { backgroundColor: following ? colors.bg.secondary : BRAND, borderColor: following ? colors.border.default : BRAND }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.followBtnText, { color: following ? colors.text.secondary : "#fff" }]}>
          {following ? "Following" : "Follow"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const { colors } = usePokerTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab]                     = useState<Tab>("feed");
  const [feedFilter, setFeedFilter]       = useState<"all" | "following">("all");
  const [posts, setPosts]                 = useState<SocialPost[]>([]);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [suggested, setSuggested]         = useState<SocialProfile[]>([]);
  const [allPlayers, setAllPlayers]       = useState<SocialProfile[]>([]);
  const [followingIds, setFollowingIds]   = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<SocialProfile[]>([]);
  const [searching, setSearching]         = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [commentsPost, setCommentsPost]   = useState<SocialPost | null>(null);
  const searchRef                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animated header ──────────────────────────────────────────────────────
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY      = useRef(0);
  const headerShown      = useRef(true);
  const headerHeightRef  = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  const handleScroll = useCallback((event: any) => {
    const y    = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;

    if (diff > 6 && y > 10 && headerShown.current) {
      headerShown.current = false;
      Animated.timing(headerTranslateY, {
        toValue: -headerHeightRef.current,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else if ((diff < -6 || y <= 0) && !headerShown.current) {
      headerShown.current = true;
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [headerTranslateY]);

  const userId = user?.id ?? "";

  const loadData = useCallback(async (silent = false) => {
    if (!userId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [feedData, ids, sugg] = await Promise.all([
        feedFilter === "all" ? fetchPublicFeed(userId) : fetchFollowingFeed(userId),
        getFollowingIds(userId),
        getSuggestedPlayers(userId, 20),
      ]);
      setPosts(feedData);
      setFollowingIds(new Set(ids));
      setSuggested(sugg);
      setAllPlayers(sugg);
    } catch (e) {
      console.error("Social load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, feedFilter]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchRef.current = setTimeout(async () => {
      try {
        const r = await searchPlayers(searchQuery.trim(), userId);
        setSearchResults(r);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [searchQuery, userId]);

  const handleToggleFollow = async (playerId: string, currently: boolean) => {
    if (!userId) return;
    const next = new Set(followingIds);
    if (currently) { next.delete(playerId); setFollowingIds(next); await unfollowPlayer(userId, playerId); }
    else           { next.add(playerId);    setFollowingIds(next); await followPlayer(userId, playerId); }
    getSuggestedPlayers(userId, 20).then((s) => { setSuggested(s); setAllPlayers(s); }).catch(() => {});
  };

  const handleReact = async (postId: string, emoji: string, reacted: boolean) => {
    if (!userId) return;
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const existing = p.reactions.find((r) => r.emoji === emoji);
      let reactions = p.reactions.filter((r) => r.emoji !== emoji);
      if (existing) {
        const count = reacted ? existing.count - 1 : existing.count + 1;
        if (count > 0) reactions = [...reactions, { emoji, count, reacted: !reacted }];
      } else {
        reactions = [...reactions, { emoji, count: 1, reacted: true }];
      }
      return { ...p, reactions };
    }));
    await toggleReaction(postId, userId, emoji, reacted).catch(console.error);
  };

  const handleDelete = async (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await deletePost(postId).catch(console.error);
  };

  const handleInvite = async () => {
    try {
      await Share.share({ message: "Join me on Stakemate — the best poker bankroll tracker! https://stakemate.app" });
    } catch { /* cancelled */ }
  };

  const activePlayers = searchQuery.trim() ? searchResults : allPlayers;

  // Filter pills rendered inside the feed FlatList header so they scroll with content
  const feedListHeader = (
    <View style={[styles.filterRow, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
      {(["all", "following"] as const).map((f) => (
        <TouchableOpacity
          key={f}
          onPress={() => setFeedFilter(f)}
          style={[styles.filterPill, feedFilter === f && { backgroundColor: BRAND }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterPillText, { color: feedFilter === f ? "#fff" : colors.text.secondary }]}>
            {f === "all" ? "All Posts" : "Following"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>

      {/* ── Animated floating header ── */}
      <Animated.View
        style={[styles.animHeader, { transform: [{ translateY: headerTranslateY }] }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          headerHeightRef.current = h;
          setHeaderHeight(h);
        }}
      >
        {/* Blue top bar */}
        <View style={[styles.header, { backgroundColor: BRAND, paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Community</Text>
              <Text style={styles.headerSub}>Stakemate players worldwide</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setComposeVisible(true)} style={styles.headerIconBtn} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleInvite} style={styles.inviteBtn} activeOpacity={0.8}>
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={styles.inviteBtnText}>Invite</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Underline tabs */}
          <View style={styles.tabBar}>
            {([["feed", "Flash", "Feed"], ["players", "people", "Players"]] as const).map(([key, icon, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setTab(key)}
                style={[styles.tabItem, tab === key && styles.tabItemActive]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab === key ? icon as any : `${icon}-outline` as any}
                  size={15}
                  color={tab === key ? "#fff" : "rgba(255,255,255,0.55)"}
                />
                <Text style={[styles.tabLabel, { color: tab === key ? "#fff" : "rgba(255,255,255,0.55)" }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
            {searching
              ? <ActivityIndicator size="small" color={colors.text.tertiary} style={{ width: 16 }} />
              : <Ionicons name="search-outline" size={15} color={colors.text.tertiary} />}
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={tab === "feed" ? "Search posts…" : "Search players…"}
              placeholderTextColor={colors.text.disabled}
              returnKeyType="search"
              style={{ flex: 1, color: colors.text.primary, fontSize: 14, paddingVertical: 0 }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={15} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      {/* ── Scrollable content — offset by header height ── */}
      <View style={{ flex: 1, marginTop: headerHeight }}>

        {/* Feed */}
        {tab === "feed" && (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                currentUserId={userId}
                onReact={handleReact}
                onDelete={handleDelete}
                onComment={setCommentsPost}
              />
            )}
            onRefresh={() => { setRefreshing(true); loadData(true); }}
            refreshing={refreshing}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
            ListHeaderComponent={feedListHeader}
            ListEmptyComponent={
              loading ? (
                <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>
              ) : feedFilter === "following" ? (
                <View style={[styles.emptyCard, { borderColor: colors.border.default }]}>
                  <Ionicons name="people-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No posts from your network</Text>
                  <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>Follow players to see their sessions here.</Text>
                  <TouchableOpacity onPress={() => setTab("players")} style={[styles.emptyAction, { backgroundColor: BRAND }]}>
                    <Text style={styles.emptyActionText}>Find Players</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.emptyCard, { borderColor: colors.border.default }]}>
                  <Ionicons name="newspaper-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Nothing here yet</Text>
                  <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>Be the first to post or share a session.</Text>
                  <TouchableOpacity onPress={() => setComposeVisible(true)} style={[styles.emptyAction, { backgroundColor: BRAND }]}>
                    <Ionicons name="create-outline" size={14} color="#fff" />
                    <Text style={styles.emptyActionText}>Create Post</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          />
        )}

        {/* Players */}
        {tab === "players" && (
          <FlatList
            data={activePlayers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PlayerRow player={item} following={followingIds.has(item.id)} onToggleFollow={handleToggleFollow} />
            )}
            onRefresh={() => { setRefreshing(true); loadData(true); }}
            refreshing={refreshing}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: 120 }}
            style={{ backgroundColor: colors.bg.primary }}
            ListHeaderComponent={
              suggested.length > 0 && !searchQuery.trim() ? (
                <View style={{ padding: 16, paddingBottom: 8 }}>
                  <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>SUGGESTED FOR YOU</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                    {suggested.slice(0, 8).map((p) => (
                      <PlayerCard key={p.id} player={p} following={followingIds.has(p.id)} onToggleFollow={handleToggleFollow} />
                    ))}
                  </ScrollView>
                  <View style={[styles.divider, { backgroundColor: colors.border.default, marginTop: 16, marginBottom: 8 }]} />
                  <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>ALL PLAYERS</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              loading ? (
                <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>
              ) : (
                <View style={[styles.emptyCard, { borderColor: colors.border.default, margin: 16 }]}>
                  <Ionicons name="people-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
                    {searchQuery.trim() ? `No results for "${searchQuery}"` : "No other players yet"}
                  </Text>
                  <TouchableOpacity onPress={handleInvite} style={[styles.emptyAction, { backgroundColor: BRAND }]}>
                    <Ionicons name="person-add-outline" size={14} color="#fff" />
                    <Text style={styles.emptyActionText}>Invite Players</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          />
        )}
      </View>

      {/* ── Modals ── */}
      <ComposeModal
        visible={composeVisible}
        onClose={() => setComposeVisible(false)}
        onPosted={(post) => setPosts((prev) => [post, ...prev])}
      />

      <CommentsModal
        post={commentsPost}
        visible={commentsPost != null}
        currentUserId={userId}
        profile={profile}
        onClose={() => setCommentsPost(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  animHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },

  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  headerSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", marginTop: 2 },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  inviteBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  inviteBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  tabBar: { flexDirection: "row" },
  tabItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 4, marginRight: 24, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabItemActive: { borderBottomColor: "#fff" },
  tabLabel: { fontSize: 14, fontWeight: "700" },

  searchBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterPillText: { fontSize: 13, fontWeight: "600" },

  // Post card
  postCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  postAuthor: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 10 },
  postAuthorName: { fontSize: 14, fontWeight: "700" },
  postAuthorSub: { fontSize: 12, marginTop: 1 },
  postContent: { fontSize: 15, lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 },
  sessionBlock: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 14, marginBottom: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  sessionIconWrap: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sessionName: { fontSize: 14, fontWeight: "600" },
  sessionMeta: { fontSize: 12 },
  profitText: { fontSize: 16, fontWeight: "800" },
  profitLabel: { fontSize: 11, marginTop: 1 },
  caption: { fontSize: 14, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 10 },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  reactChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  reactCount: { fontSize: 12, fontWeight: "600" },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginLeft: "auto" },
  commentBtnText: { fontSize: 12, fontWeight: "600" },

  // Compose modal
  composeHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  composeCancel: { width: 70 },
  composeCancelText: { fontSize: 15 },
  composeTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  composePostBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, minWidth: 70, alignItems: "center" },
  composePostBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  composeBody: { flexDirection: "row", gap: 12, padding: 16 },
  composeName: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  composeInput: { fontSize: 16, lineHeight: 24, minHeight: 120 },
  composeFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  composeCount: { fontSize: 13 },
  composeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  composeToggleLabel: { fontSize: 12, fontWeight: "600" },

  // Comments modal
  commentsRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  commentsContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    overflow: "hidden",
  },
  commentsHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  commentsHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentsTitle: { fontSize: 16, fontWeight: "700" },
  commentsCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },
  commentsCenter: {
    paddingVertical: 40, alignItems: "center",
  },
  commentsList: { flexShrink: 1 },
  commentRow: { flexDirection: "row", gap: 10 },
  commentBubble: { flex: 1, borderRadius: 14, padding: 12 },
  commentBubbleTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  commentName: { fontSize: 13, fontWeight: "700", flex: 1 },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentInputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    borderRadius: 22, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 8, gap: 8,
  },
  commentInput: { flex: 1, fontSize: 14, paddingVertical: 0 },

  // Players
  playerCard: { width: 130, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, alignItems: "center", gap: 6 },
  playerName: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  playerHandle: { fontSize: 11, textAlign: "center" },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 2 },
  followBtnText: { fontSize: 12, fontWeight: "700" },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },

  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 10 },
  divider: { height: StyleSheet.hairlineWidth },

  centered: { paddingTop: 80, alignItems: "center" },
  emptyCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 36, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 6, textAlign: "center" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  emptyActionText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
