import { ProfileBadge } from "@/components/ProfileBadge";
import { SellStakesModal } from "@/components/SellStakesModal";
import { SignInSheet } from "@/components/SignInSheet";
import { topBadge } from "@/lib/badges";
import { useAuth } from "@/context/AuthContext";
import {
  addComment,
  ActiveMember,
  createTextPost,
  deleteComment,
  deletePost,
  updatePostVisibility,
  fetchActiveMembers,
  fetchComments,
  fetchFollowingFeed,
  fetchPublicFeed,
  fetchStakedPlayerFeed,
  followPlayer,
  getFollowingIds,
  SocialComment,
  SocialPost,
  SocialProfile,
  timeAgo,
  toggleReaction,
  unfollowPlayer,
} from "@/lib/social";
import {
  dealStatusColor,
  dealStatusLabel,
  claimStake,
  fetchPublicStakeDeals,
  getMyClaimForDeal,
  getMyStakeDeals,
  getStakeDealWithSeller,
  isPublishedStatus,
  StakeClaim,
  StakeDeal,
} from "@/lib/stakes";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const PURPLE = "#0891B2";
const GREEN  = "#22C55E";
const REACTION_EMOJIS = ["🔥", "💰", "🎉", "👏", "😅", "🤑"];

type Tab = "public" | "following" | "stakes";

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
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [text,       setText]       = useState("");
  const [image,      setImage]      = useState<string | null>(null);
  const [posting,    setPosting]    = useState(false);
  const [visibility, setVisibility] = useState<"public" | "friends">("public");
  const inputRef = useRef<TextInput>(null);
  const displayName = profile?.display_name || profile?.username || "You";
  const canPost = text.trim().length > 0;

  function resetAndClose() {
    setText("");
    setImage(null);
    setVisibility("public");
    onClose();
  }

  const handlePost = async () => {
    const trimmed = text.trim();
    const uid = user?.id ?? profile?.id;
    if (!trimmed) return;
    if (!uid) { Alert.alert("Not signed in", "Sign in to post."); return; }
    setPosting(true);
    try {
      const post = await createTextPost(uid, trimmed, visibility);
      onPosted(post);
      resetAndClose();
    } catch (e: any) {
      Alert.alert("Could not post", e?.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setImage(result.assets[0].uri);
  }

  async function handleTakePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") { Alert.alert("Camera access needed", "Allow camera access in Settings."); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setImage(result.assets[0].uri);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >

        {/* ── Nav header ── */}
        <View style={[styles.composeNav, { paddingTop: 16, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={resetAndClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.composeCancelText, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.composeTitle, { color: colors.text.primary }]}>New Post</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost || posting}
            style={[styles.composePostBtn, { backgroundColor: BRAND, opacity: canPost && !posting ? 1 : 0.45 }]}
          >
            {posting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.composePostBtnText}>Post</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Author row + text area ── */}
          <View style={styles.composeBody}>
            <Avatar uri={profile?.avatar_url} size={44} name={displayName} />
            <View style={{ flex: 1, gap: 4 }}>
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
                scrollEnabled={false}
              />
            </View>
          </View>

          {/* ── Image preview ── */}
          {image && (
            <View style={styles.composeImageWrap}>
              <Image source={{ uri: image }} style={styles.composeImage} contentFit="cover" />
              <TouchableOpacity
                onPress={() => setImage(null)}
                style={styles.composeImageRemove}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Visibility picker ── */}
          <View style={[styles.composeHint, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default, padding: 4 }]}>
            <TouchableOpacity
              onPress={() => setVisibility("public")}
              activeOpacity={0.8}
              style={[
                styles.visibilityOption,
                visibility === "public" && { backgroundColor: colors.bg.primary, borderColor: `${BRAND}50` },
              ]}
            >
              <Ionicons name="globe-outline" size={15} color={visibility === "public" ? BRAND : colors.text.tertiary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: visibility === "public" ? colors.text.primary : colors.text.tertiary }}>Public</Text>
                <Text style={{ fontSize: 11, color: colors.text.disabled }} numberOfLines={1}>Visible to everyone</Text>
              </View>
              {visibility === "public" && <Ionicons name="checkmark-circle" size={16} color={BRAND} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setVisibility("friends")}
              activeOpacity={0.8}
              style={[
                styles.visibilityOption,
                visibility === "friends" && { backgroundColor: colors.bg.primary, borderColor: "#8B5CF650" },
              ]}
            >
              <Ionicons name="people-outline" size={15} color={visibility === "friends" ? "#8B5CF6" : colors.text.tertiary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: visibility === "friends" ? colors.text.primary : colors.text.tertiary }}>Followers Only</Text>
                <Text style={{ fontSize: 11, color: colors.text.disabled }} numberOfLines={1}>Only people who follow you</Text>
              </View>
              {visibility === "friends" && <Ionicons name="checkmark-circle" size={16} color="#8B5CF6" />}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* ── Footer toolbar ── */}
        <View style={[styles.composeToolbar, { borderTopColor: colors.border.default, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity onPress={handlePickImage} style={[styles.composeToolBtn, { backgroundColor: colors.bg.secondary }]} activeOpacity={0.7}>
              <Ionicons name="image-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleTakePhoto} style={[styles.composeToolBtn, { backgroundColor: colors.bg.secondary }]} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.composeCount, { color: text.length > 450 ? "#EF4444" : colors.text.tertiary }]}>
            {500 - text.length}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Comments Modal ───────────────────────────────────────────────────────────

function CommentsModal({
  post, currentUserId, profile, visible, onClose, onCommentAdded,
}: {
  post: SocialPost | null;
  currentUserId: string;
  profile: any;
  visible: boolean;
  onClose: () => void;
  onCommentAdded?: (postId: string) => void;
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
      onCommentAdded?.(post.id);
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

  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!visible) { setKbHeight(0); return; }
    const show = Keyboard.addListener("keyboardWillShow", (e) => setKbHeight(e.endCoordinates.height));
    const hide  = Keyboard.addListener("keyboardWillHide", () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  const displayName = profile?.display_name || profile?.username || "You";
  const postAuthorName = post?.profile.display_name || post?.profile.username || "Player";
  const postHandle = post?.profile.username ? `@${post.profile.username}` : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View
        style={[styles.commentsPage, { backgroundColor: colors.bg.primary, paddingBottom: kbHeight }]}
      >

        {/* ── Navigation header ── */}
        <View style={[styles.commentsNavHeader, { paddingTop: 16, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.commentsBackBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.commentsNavTitle, { color: colors.text.primary }]}>Post</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* ── Post preview ── */}
        {post && (
          <View style={[styles.commentsPostCard, { backgroundColor: colors.bg.secondary, borderBottomColor: colors.border.default }]}>
            <View style={styles.commentsPostAuthor}>
              <Avatar uri={post.profile.avatar_url} size={40} name={postAuthorName} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.commentsPostName, { color: colors.text.primary }]}>{postAuthorName}</Text>
                <Text style={[styles.commentsPostSub, { color: colors.text.tertiary }]}>
                  {postHandle ? `${postHandle} · ` : ""}{timeAgo(post.created_at)}
                </Text>
              </View>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.tertiary} />
            </View>
            {post.content ? (
              <Text style={[styles.commentsPostContent, { color: colors.text.primary }]}>{post.content}</Text>
            ) : null}
            <View style={[styles.commentsPostActions, { borderTopColor: colors.border.subtle }]}>
              <TouchableOpacity style={[styles.commentsReactBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}>
                <Ionicons name="add" size={13} color={colors.text.tertiary} />
                <Text style={{ fontSize: 14 }}>😊</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.commentsShareBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}>
                <Ionicons name="share-outline" size={16} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Comments list ── */}
        {loading ? (
          <View style={styles.commentsCenter}>
            <ActivityIndicator color={BRAND} />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.commentsCenter}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.text.tertiary} />
            <Text style={[styles.commentsEmptyText, { color: colors.text.tertiary }]}>No comments yet</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            style={{ flex: 1 }}
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

        {/* ── Comment input bar ── */}
        <View style={[styles.commentsInputBar, { borderTopColor: colors.border.default, paddingBottom: kbHeight > 0 ? 8 : Math.max(insets.bottom, 8), backgroundColor: colors.bg.primary }]}>
          <Avatar uri={profile?.avatar_url} size={36} name={displayName} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder="Write a comment"
            placeholderTextColor={colors.text.disabled}
            style={[styles.commentsTextInput, { color: colors.text.primary, backgroundColor: colors.bg.secondary }]}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || sending}
            style={[styles.commentsSendBtn, { opacity: !input.trim() || sending ? 0.55 : 1 }]}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.commentsSendBtnText}>Comment</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post, currentUserId, isFollowing, onReact, onDelete, onComment, onFollow, onPressProfile, onBuyStake, onChangeVisibility,
}: {
  post: SocialPost;
  currentUserId: string;
  isFollowing: boolean;
  onReact: (postId: string, emoji: string, reacted: boolean) => void;
  onDelete: (postId: string) => void;
  onComment: (post: SocialPost) => void;
  onFollow: (userId: string, currently: boolean) => void;
  onPressProfile: (userId: string) => void;
  onBuyStake?: (dealId: string) => void;
  onChangeVisibility?: (postId: string, current: "public" | "friends") => void;
}) {
  const { colors } = usePokerTheme();
  const isTournament = post.session_type === "tournament";
  const isOwn = post.user_id === currentUserId;
  const displayName = post.profile.display_name || post.profile.username || "Player";
  const handle = post.profile.username ? `@${post.profile.username}` : null;
  const authorBadge = topBadge({ createdAt: post.profile.created_at, lastSeenAt: post.profile.last_seen_at });
  const profit = post.amount ?? 0;
  const profitColor = profit >= 0 ? "#22C55E" : "#EF4444";
  const profitStr = `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toLocaleString("en-AU")}`;
  const isSessionPost = post.session_name != null || post.amount != null;

  const [dealSnap, setDealSnap] = useState<StakeDeal | null>(null);
  useEffect(() => {
    if (post.stake_deal_id) {
      getStakeDealWithSeller(post.stake_deal_id).then((d) => setDealSnap(d)).catch(() => {});
    }
  }, [post.stake_deal_id]);

  function options() {
    if (isOwn) {
      const currentVis = post.visibility ?? "public";
      const toggleLabel = currentVis === "public" ? "Restrict to Followers Only" : "Make Public";
      Alert.alert("Post Options", undefined, [
        {
          text: toggleLabel,
          onPress: () => onChangeVisibility?.(post.id, currentVis),
        },
        { text: "Delete Post", style: "destructive", onPress: () => onDelete(post.id) },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      Alert.alert("Options", undefined, [
        { text: "View Profile", onPress: () => onPressProfile(post.user_id) },
        { text: "Report", onPress: () => Alert.alert("Reported", "Thanks for your report.") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  return (
    <View style={[styles.postCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      {/* Author row — avatar + name are tappable */}
      <View style={styles.postAuthor}>
        <TouchableOpacity onPress={() => onPressProfile(post.user_id)} activeOpacity={0.7}>
          <Avatar uri={post.profile.avatar_url} size={38} name={displayName} />
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => onPressProfile(post.user_id)} activeOpacity={0.7}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={[styles.postAuthorName, { color: colors.text.primary }]}>{displayName}</Text>
            {authorBadge && <ProfileBadge badge={authorBadge} size="full" />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={[styles.postAuthorSub, { color: colors.text.tertiary }]}>
              {handle ? `${handle} · ` : ""}{timeAgo(post.created_at)}
            </Text>
            {isOwn && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: (post.visibility ?? "public") === "friends" ? "#8B5CF614" : `${BRAND}14`, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
                <Ionicons
                  name={(post.visibility ?? "public") === "friends" ? "people-outline" : "globe-outline"}
                  size={10}
                  color={(post.visibility ?? "public") === "friends" ? "#8B5CF6" : BRAND}
                />
                <Text style={{ fontSize: 10, fontWeight: "600", color: (post.visibility ?? "public") === "friends" ? "#8B5CF6" : BRAND }}>
                  {(post.visibility ?? "public") === "friends" ? "Followers" : "Public"}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {/* Inline follow pill — only shown if not own post */}
        {!isOwn && (
          <TouchableOpacity
            onPress={() => onFollow(post.user_id, isFollowing)}
            style={[
              styles.inlineFollowBtn,
              isFollowing
                ? { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }
                : { backgroundColor: BRAND, borderColor: BRAND },
            ]}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[styles.inlineFollowText, { color: isFollowing ? colors.text.secondary : "#fff" }]}>
              {isFollowing ? "Following" : "+ Follow"}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={options} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Free-text content */}
      {post.content ? (
        <Text style={[styles.postContent, { color: colors.text.primary }]}>{post.content}</Text>
      ) : null}

      {/* Stake deal card — shown when this post advertises stakes */}
      {post.stake_deal_id && dealSnap ? (() => {
        const dealClosed = dealSnap.status === "closed" || dealSnap.status === "cancelled";
        const dealColor  = dealClosed ? "#6B7280" : "#0891B2";
        return (
        <TouchableOpacity
          activeOpacity={dealClosed ? 1 : 0.75}
          onPress={() => { if (!dealClosed && onBuyStake) onBuyStake(post.stake_deal_id!); }}
          style={{
            marginTop: 8, borderRadius: 12, overflow: "hidden",
            borderWidth: 1, borderColor: dealColor + "40",
            backgroundColor: colors.bg.secondary,
            opacity: dealClosed ? 0.75 : 1,
          }}
        >
          {/* Header row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingBottom: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: dealColor + "18", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={dealClosed ? "checkmark-circle-outline" : "trophy-outline"} size={18} color={dealColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>{dealSnap.tournament_name}</Text>
              {(dealSnap.venue || dealSnap.tournament_date) ? (
                <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }} numberOfLines={1}>
                  {[dealSnap.venue, dealSnap.tournament_date ? new Date(dealSnap.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : null].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
            <View style={{ backgroundColor: dealClosed ? "#6B7280" + "20" : isOwn ? "#0891B230" : "#0891B2", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: dealClosed ? "#6B7280" : isOwn ? "#0891B2" : "#fff" }}>
                {dealClosed ? "Sold Out" : isOwn ? "Manage Deal" : "BUY"}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          {(() => {
            const minPiece = dealSnap.min_piece ?? 1;
            const priceForMin = dealSnap.price_per_percent != null
              ? `$${(dealSnap.price_per_percent * minPiece * (dealSnap.markup ?? 1)).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`
              : "—";
            const stats = [
              { label: "Buy-in", value: dealSnap.buy_in ? `$${dealSnap.buy_in.toLocaleString("en-AU")}` : "—", sub: (dealSnap.num_entries ?? 1) > 1 ? `× ${dealSnap.num_entries} entries` : null, highlight: false },
              { label: "Selling", value: `${dealSnap.total_action_selling}%`, sub: `Min ${minPiece}%`, highlight: false },
              { label: dealClosed ? "Claimed" : "Available", value: dealClosed ? `${dealSnap.action_claimed}%` : `${Math.max(0, dealSnap.total_action_selling - dealSnap.action_claimed)}%`, highlight: true },
              { label: `Price/${minPiece}%`, value: priceForMin, highlight: false },
            ];
            return (
              <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: dealColor + "20" }}>
                {stats.map((stat, i, arr) => (
                  <View
                    key={stat.label}
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 10,
                      borderRightWidth: i < arr.length - 1 ? 1 : 0,
                      borderRightColor: "#0891B220",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: stat.highlight ? "#0891B2" : colors.text.primary }}>{stat.value}</Text>
                    <Text style={{ fontSize: 10, color: colors.text.tertiary, marginTop: 2 }}>{stat.label}</Text>
                    {"sub" in stat && stat.sub ? <Text style={{ fontSize: 9, color: "#0891B2", marginTop: 1 }}>{stat.sub}</Text> : null}
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Min piece + markup row */}
          {(dealSnap.min_piece > 1 || dealSnap.markup !== 1) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6 }}>
              {dealSnap.min_piece > 1 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="layers-outline" size={12} color={colors.text.tertiary} />
                  <Text style={{ fontSize: 11, color: colors.text.tertiary }}>Min {dealSnap.min_piece}%</Text>
                </View>
              ) : null}
              {dealSnap.markup !== 1 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="pricetag-outline" size={12} color={colors.text.tertiary} />
                  <Text style={{ fontSize: 11, color: colors.text.tertiary }}>{dealSnap.markup}× markup</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
        );
      })() : isSessionPost ? (
        /* Regular session block (no stake deal) */
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sessionBlock, { backgroundColor: colors.bg.secondary, borderColor: colors.border.subtle }]}
        >
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
          {post.amount != null ? (
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={[styles.profitText, { color: profitColor }]}>{profitStr}</Text>
              {post.amount_label ? (
                <Text style={[styles.profitLabel, { color: colors.text.tertiary }]}>{post.amount_label}</Text>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
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
          <Text style={[styles.commentBtnText, { color: colors.text.tertiary }]}>
            {post.comment_count > 0 ? post.comment_count : "Comment"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Stake deal card ──────────────────────────────────────────────────────────

function StakeDealCard({
  deal,
  currentUserId,
  followingIds,
  claimRefreshKey,
  onBuy,
  onFollow,
  onPressProfile,
}: {
  deal: StakeDeal;
  currentUserId: string;
  followingIds: Set<string>;
  claimRefreshKey?: number;
  onBuy: (deal: StakeDeal) => void;
  onFollow: (userId: string, currently: boolean) => void;
  onPressProfile: (userId: string) => void;
}) {
  const { colors } = usePokerTheme();
  const pctSold      = deal.total_action_selling > 0 ? deal.action_claimed / deal.total_action_selling : 0;
  const statusColor  = dealStatusColor(deal.status);
  const isOwner      = deal.user_id === currentUserId;
  const seller       = deal.seller_profile;
  const sellerName   = seller?.display_name || seller?.username || "Player";
  const isFollowingSeller = followingIds.has(deal.user_id);

  const [myClaim,    setMyClaim]    = useState<StakeClaim | null>(null);
  const [buyPct,     setBuyPct]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOwner || !currentUserId) return;
    getMyClaimForDeal(deal.id, currentUserId)
      .then(setMyClaim)
      .catch(() => {});
  }, [deal.id, currentUserId, isOwner, claimRefreshKey]);

  const canBuy   = !isOwner && (deal.status === "open" || deal.status === "active");
  const available = deal.total_action_selling - deal.action_claimed;
  const minPiece  = deal.min_piece ?? 1;
  const pctNum    = parseFloat(buyPct);
  const costNum   = deal.price_per_percent != null && !isNaN(pctNum)
    ? pctNum * deal.price_per_percent * (deal.markup ?? 1)
    : null;

  async function handleBuy() {
    if (!currentUserId) { Alert.alert("Sign in required", "Sign in to buy a stake."); return; }
    if (isNaN(pctNum) || pctNum < minPiece) {
      Alert.alert("Invalid amount", `Minimum is ${minPiece}%.`); return;
    }
    if (pctNum > available) {
      Alert.alert("Too much", `Only ${available.toFixed(1)}% available.`); return;
    }
    setSubmitting(true);
    try {
      const claim = await claimStake(deal.id, currentUserId, pctNum, undefined);
      setMyClaim(claim);
      setBuyPct("");
      Alert.alert("Request sent!", "The seller will confirm your request shortly.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  const daysUntil = deal.tournament_date
    ? Math.ceil((new Date(deal.tournament_date + "T00:00:00").getTime() - Date.now()) / 86400000)
    : null;

  const pendingCount = isOwner ? (deal.claims?.filter((c: any) => c.status === "pending").length ?? 0) : 0;

  return (
    <View style={[sDealStyles.card, { backgroundColor: colors.bg.primary, borderColor: pendingCount > 0 ? "#F97316" : colors.border.default }]}>

      {/* Pending requests banner — seller only */}
      {pendingCount > 0 && (
        <TouchableOpacity
          onPress={() => onBuy(deal)}
          activeOpacity={0.85}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#F9731615", borderBottomWidth: 1, borderBottomColor: "#F9731630" }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F97316" }} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: "#F97316" }}>
            {pendingCount === 1 ? "1 pending request — tap to review" : `${pendingCount} pending requests — tap to review`}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#F97316" />
        </TouchableOpacity>
      )}

      {/* Seller strip */}
      {seller && (
        <View style={[sDealStyles.sellerStrip, { borderBottomColor: colors.border.subtle, backgroundColor: colors.bg.secondary }]}>
          <TouchableOpacity
            style={sDealStyles.sellerLeft}
            onPress={() => onPressProfile(deal.user_id)}
            activeOpacity={0.7}
          >
            <Avatar uri={seller.avatar_url} size={30} name={sellerName} />
            <View>
              <Text style={[sDealStyles.sellerName, { color: colors.text.primary }]}>{sellerName}</Text>
              {seller.username ? (
                <Text style={[sDealStyles.sellerHandle, { color: colors.text.tertiary }]}>@{seller.username}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
          {!isOwner && (
            <TouchableOpacity
              onPress={() => onFollow(deal.user_id, isFollowingSeller)}
              style={[
                sDealStyles.sellerFollowBtn,
                isFollowingSeller
                  ? { backgroundColor: colors.bg.primary, borderColor: colors.border.default }
                  : { backgroundColor: BRAND, borderColor: BRAND },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[sDealStyles.sellerFollowText, { color: isFollowingSeller ? colors.text.secondary : "#fff" }]}>
                {isFollowingSeller ? "Following" : "+ Follow"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tappable card body — opens buy/manage modal */}
      <TouchableOpacity onPress={() => onBuy(deal)} activeOpacity={0.75}>

      {/* Header row */}
      <View style={sDealStyles.header}>
        <View style={[sDealStyles.iconWrap, { backgroundColor: PURPLE + "15" }]}>
          <Ionicons name="trophy-outline" size={18} color={PURPLE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sDealStyles.tourneyName, { color: colors.text.primary }]} numberOfLines={1}>
            {deal.tournament_name}
          </Text>
          <Text style={[sDealStyles.meta, { color: colors.text.tertiary }]} numberOfLines={1}>
            {[
              deal.venue || null,
              deal.tournament_date ? new Date(deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : null,
            ].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={[sDealStyles.statusPill, { backgroundColor: statusColor + "18" }]}>
          <Text style={[sDealStyles.statusText, { color: statusColor }]}>{dealStatusLabel(deal.status)}</Text>
        </View>
      </View>

      {/* Stats strip */}
      {(() => {
        const minPiece = deal.min_piece ?? 1;
        const priceForMin = deal.price_per_percent != null
          ? `$${(deal.price_per_percent * minPiece * (deal.markup ?? 1)).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`
          : "—";
        const stats = [
          {
            label: "Buy-in",
            value: deal.buy_in ? `$${deal.buy_in.toLocaleString("en-AU")}` : "—",
            sub: (deal.num_entries ?? 1) > 1 ? `× ${deal.num_entries} entries` : null,
          },
          {
            label: "Selling",
            value: `${deal.total_action_selling}%`,
            sub: `Min ${minPiece}%`,
          },
          {
            label: `Price / ${minPiece}%`,
            value: priceForMin,
            sub: deal.markup !== 1 ? `${deal.markup}× markup` : "Face value",
          },
          {
            label: "Available",
            value: `${Math.max(0, deal.total_action_selling - deal.action_claimed).toFixed(1)}%`,
            sub: null,
          },
        ];
        return (
          <View style={[sDealStyles.statsRow, { borderColor: colors.border.subtle }]}>
            {stats.map((s, i) => (
              <View key={s.label} style={[sDealStyles.statCell, i < stats.length - 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border.subtle }]}>
                <Text style={[sDealStyles.statValue, { color: colors.text.primary }]}>{s.value}</Text>
                <Text style={[sDealStyles.statLabel, { color: colors.text.tertiary }]}>{s.label}</Text>
                {s.sub ? <Text style={[sDealStyles.statLabel, { color: PURPLE, fontSize: 9, marginTop: 1 }]}>{s.sub}</Text> : null}
              </View>
            ))}
          </View>
        );
      })()}

      {/* Progress bar */}
      <View style={sDealStyles.progressSection}>
        <View style={sDealStyles.progressTrack}>
          <View style={[sDealStyles.progressFill, { width: `${Math.round(pctSold * 100)}%`, backgroundColor: PURPLE }]} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={[sDealStyles.progressLabel, { color: colors.text.tertiary }]}>{Math.round(pctSold * 100)}% sold</Text>
          <Text style={[sDealStyles.progressLabel, { color: colors.text.tertiary }]}>{available.toFixed(1)}% left</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={[sDealStyles.footer, { borderTopColor: colors.border.subtle }]}>
        {daysUntil !== null && (
          <Text style={[sDealStyles.urgency, { color: daysUntil <= 2 ? "#EF4444" : colors.text.tertiary }]}>
            {daysUntil <= 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d away`}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        {isOwner ? (
          <TouchableOpacity
            onPress={() => onBuy(deal)}
            style={[sDealStyles.ctaBtn, { backgroundColor: PURPLE }]}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={14} color="#fff" />
            <Text style={sDealStyles.ctaBtnText}>Manage</Text>
          </TouchableOpacity>
        ) : myClaim ? (
          <View style={[sDealStyles.ctaBtn, {
            backgroundColor: myClaim.status === "confirmed" ? "#22C55E" : myClaim.status === "rejected" ? "#EF4444" : "#F97316",
          }]}>
            <Ionicons name={myClaim.status === "confirmed" ? "checkmark-circle-outline" : myClaim.status === "rejected" ? "close-circle-outline" : "time-outline"} size={14} color="#fff" />
            <Text style={sDealStyles.ctaBtnText}>
              {myClaim.status === "confirmed" ? "Confirmed" : myClaim.status === "rejected" ? "Declined" : "Pending..."}
            </Text>
          </View>
        ) : canBuy ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border.default, borderRadius: 10, backgroundColor: colors.bg.secondary, paddingHorizontal: 10, paddingVertical: 6, gap: 4 }}>
              <TextInput
                value={buyPct}
                onChangeText={(v) => setBuyPct(v.replace(/[^0-9.]/g, ""))}
                keyboardType="numeric"
                placeholder={`${minPiece}`}
                placeholderTextColor={colors.text.disabled}
                style={{ fontSize: 15, fontWeight: "700", color: colors.text.primary, minWidth: 32, textAlign: "center", padding: 0 }}
              />
              <Text style={{ fontSize: 13, color: colors.text.tertiary, fontWeight: "600" }}>%</Text>
            </View>
            {costNum != null && (
              <Text style={{ fontSize: 12, color: PURPLE, fontWeight: "600" }}>${costNum.toFixed(0)}</Text>
            )}
            <TouchableOpacity
              onPress={handleBuy}
              disabled={submitting}
              style={[sDealStyles.ctaBtn, { backgroundColor: GREEN, opacity: submitting ? 0.6 : 1 }]}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={sDealStyles.ctaBtnText}>BUY</Text>
              }
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      </TouchableOpacity>{/* end card body */}
    </View>
  );
}

const sDealStyles = StyleSheet.create({
  card:         { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },

  sellerStrip:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  sellerLeft:      { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  sellerName:      { fontSize: 13, fontWeight: "700" },
  sellerHandle:    { fontSize: 11, marginTop: 1 },
  sellerFollowBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  sellerFollowText:{ fontSize: 12, fontWeight: "700" },

  header:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 10 },
  iconWrap:     { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tourneyName:  { fontSize: 14, fontWeight: "700" },
  meta:         { fontSize: 12, marginTop: 1 },
  statusPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: "700" },
  statsRow:     { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  statCell:     { flex: 1, paddingVertical: 10, alignItems: "center", gap: 1 },
  statValue:    { fontSize: 13, fontWeight: "700" },
  statLabel:    { fontSize: 10 },
  progressSection: { paddingHorizontal: 14, paddingVertical: 10 },
  progressTrack:   { height: 6, borderRadius: 3, backgroundColor: "#E5E7EB", overflow: "hidden" },
  progressFill:    { height: "100%", borderRadius: 3 },
  progressLabel:   { fontSize: 11 },
  footer:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  urgency:      { fontSize: 12, fontWeight: "600" },
  ctaBtn:       { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  ctaBtnText:   { color: "#fff", fontSize: 13, fontWeight: "700" },
});

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

// ─── Online members strip ─────────────────────────────────────────────────────

const AVATAR_SIZE          = 62;
const ONLINE_THRESHOLD_MS  = 5  * 60 * 1000;        // 5 min  → green dot
const RECENT_THRESHOLD_MS  = 2  * 60 * 60 * 1000;   // 2 hrs → normal opacity

function OnlineMembersStrip({
  members, colors, currentUserId, followingIds, onFollow, onPressProfile,
}: {
  members: ActiveMember[];
  colors: any;
  currentUserId?: string;
  followingIds: Set<string>;
  onFollow: (userId: string, currently: boolean) => void;
  onPressProfile: (userId: string) => void;
}) {
  const visible = members.filter((m) => m.id !== currentUserId);
  if (visible.length === 0) return null;

  return (
    <View style={{ marginBottom: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingRight: 4 }}>
        {visible.map((m) => {
          const lastSeen  = m.last_seen_at ? Date.now() - new Date(m.last_seen_at).getTime() : Infinity;
          const isOnline  = lastSeen < ONLINE_THRESHOLD_MS;
          const isRecent  = lastSeen < RECENT_THRESHOLD_MS;
          const opacity   = isRecent ? 1 : 0.22;
          const name      = m.display_name || m.username || "?";
          const initials  = name[0].toUpperCase();
          const isFollowing = followingIds.has(m.id);

          const ringColor = isOnline ? GREEN : isRecent ? colors.border.default : "transparent";
          const ringWidth = isOnline ? 2.5 : isRecent ? 1.5 : 0;

          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => onPressProfile(m.id)}
              activeOpacity={0.8}
              style={{ alignItems: "center", gap: 5, opacity }}
            >
              {/* Avatar with status ring */}
              <View style={{ position: "relative" }}>
                <View style={{
                  width: AVATAR_SIZE + 6,
                  height: AVATAR_SIZE + 6,
                  borderRadius: (AVATAR_SIZE + 6) / 2,
                  borderWidth: ringWidth,
                  borderColor: ringColor,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <View style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: AVATAR_SIZE / 2,
                    overflow: "hidden",
                    backgroundColor: `${BRAND}22`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    {m.avatar_url ? (
                      <Image source={{ uri: m.avatar_url }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} contentFit="cover" />
                    ) : (
                      <Text style={{ color: BRAND, fontSize: AVATAR_SIZE * 0.38, fontWeight: "800" }}>{initials}</Text>
                    )}
                  </View>
                </View>

                {/* Follow "+" badge for non-followed members */}
                {!isFollowing && currentUserId && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); onFollow(m.id, false); }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: BRAND,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1.5,
                      borderColor: colors.bg.secondary,
                    }}
                  >
                    <Ionicons name="add" size={11} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Name */}
              <Text
                style={{ fontSize: 11, fontWeight: isRecent ? "600" : "400", color: isRecent ? colors.text.secondary : colors.text.disabled, maxWidth: AVATAR_SIZE + 12, textAlign: "center" }}
                numberOfLines={1}
              >
                {name.split(" ")[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const { colors } = usePokerTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { openDealId, openTab } = useLocalSearchParams<{ openDealId?: string; openTab?: Tab }>();

  const [tab, setTab]                     = useState<Tab>("public");
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [signInSheet, setSignInSheet]     = useState<{ title: string; description: string; icon?: any } | null>(null);
  const [posts, setPosts]                 = useState<SocialPost[]>([]);
  const [loading, setLoading]             = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [followingIds, setFollowingIds]   = useState<Set<string>>(new Set());
  const [composeVisible, setComposeVisible] = useState(false);
  const [commentsPost, setCommentsPost]   = useState<SocialPost | null>(null);

  // ── Stakes tab ───────────────────────────────────────────────────────────
  const [stakeDeals,        setStakeDeals]        = useState<StakeDeal[]>([]);
  const [myListings,        setMyListings]        = useState<StakeDeal[]>([]);
  const [loadingStakes,     setLoadingStakes]     = useState(false);
  const [refreshingStakes,  setRefreshingStakes]  = useState(false);
  const [buyModalDeal,      setBuyModalDeal]      = useState<StakeDeal | null>(null);
  const [claimRefreshKey,   setClaimRefreshKey]   = useState(0);
  // deal ID opened from a community post (no full StakeDeal object needed)
  const [buyDealIdFromPost, setBuyDealIdFromPost] = useState<string | null>(null);

  // ── Backed tab ───────────────────────────────────────────────────────────
  const [backedPosts,       setBackedPosts]       = useState<SocialPost[]>([]);

  // ── Animated header ──────────────────────────────────────────────────────
  // spacerHeightAnim = the height below the status bar that the title occupies.
  // When it shrinks to 0, the tab bar slides up to just below the status bar.
  // Tab bar is in normal document flow (not absolute) so content follows it automatically.
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const spacerHeightAnim = useRef(new Animated.Value(0)).current;
  const lastScrollY      = useRef(0);
  const headerShown      = useRef(true);
  const titleHeightRef   = useRef(0);
  const insetsTopRef     = useRef(insets.top);
  const [titleHeight, setTitleHeight] = useState(0);

  useEffect(() => { insetsTopRef.current = insets.top; }, [insets.top]);

  // Once title height is measured, set the spacer to the correct initial height
  useEffect(() => {
    if (titleHeight > 0 && headerShown.current) {
      // Spacer = title height minus the safe-area portion (tab bar handles safe-area via paddingTop)
      spacerHeightAnim.setValue(titleHeight - insetsTopRef.current);
    }
  }, [titleHeight]);

  const handleScroll = useCallback((event: any) => {
    const y    = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;

    if (diff > 6 && y > 10 && headerShown.current) {
      headerShown.current = false;
      Animated.parallel([
        Animated.timing(headerTranslateY, {
          toValue: -titleHeightRef.current,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(spacerHeightAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: false,
        }),
      ]).start();
    } else if ((diff < -6 || y <= 0) && !headerShown.current) {
      headerShown.current = true;
      Animated.parallel([
        Animated.timing(headerTranslateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(spacerHeightAnim, {
          toValue: titleHeightRef.current - insetsTopRef.current,
          duration: 220,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [headerTranslateY, spacerHeightAnim]);

  const userId = user?.id ?? "";

  // Auto-open deal modal when navigated from a notification with a dealId
  useEffect(() => {
    if (openDealId) {
      setTab("stakes");
      setBuyDealIdFromPost(openDealId);
    }
  }, [openDealId]);

  // Auto-switch tab when navigated from More page
  useEffect(() => {
    if (openTab) setTab(openTab);
  }, [openTab]);

  const loadData = useCallback(async (silent = false) => {
    if (!userId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [feedData, ids] = await Promise.all([
        tab === "following" ? fetchFollowingFeed(userId) : fetchPublicFeed(userId),
        getFollowingIds(userId),
      ]);
      setPosts(feedData);
      setFollowingIds(new Set(ids));
    } catch (e) {
      console.error("Social load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, tab]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useFocusEffect(useCallback(() => {
    if (tab === "public") {
      fetchActiveMembers(20).then(setActiveMembers).catch(() => {});
    }
  }, [tab]));

  const loadStakes = useCallback(async (silent = false) => {
    if (!silent) setLoadingStakes(true);
    try {
      const [publicDeals, owned, backed] = await Promise.all([
        fetchPublicStakeDeals(30),
        userId ? getMyStakeDeals(userId) : Promise.resolve([]),
        userId ? fetchStakedPlayerFeed(userId) : Promise.resolve([]),
      ]);
      const ownedIds = new Set(owned.map((d) => d.id));
      setStakeDeals(publicDeals.filter((d) => !ownedIds.has(d.id)));
      const activeStatuses = ["draft", "open", "active", "paused", "filled", "sold_out"];
      setMyListings(owned.filter((d) => activeStatuses.includes(d.status)));
      setBackedPosts(backed);
    } catch { /* ignore */ } finally {
      setLoadingStakes(false);
      setRefreshingStakes(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (tab === "stakes") loadStakes();
  }, [tab, loadStakes]));


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

  const handleChangeVisibility = async (postId: string, current: "public" | "friends") => {
    const next: "public" | "friends" = current === "public" ? "friends" : "public";
    const label = next === "public" ? "Public" : "Followers Only";
    // Optimistic update
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, visibility: next } : p));
    try {
      await updatePostVisibility(postId, next);
    } catch {
      // Rollback on failure
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, visibility: current } : p));
      Alert.alert("Could not update", "Please try again.");
      return;
    }
    Alert.alert("Visibility updated", `This post is now visible to ${label === "Public" ? "everyone" : "your followers only"}.`);
  };

  const handleCompose = () => {
    if (!user) {
      setSignInSheet({ icon: "create-outline", title: "Create a Post", description: "Sign in to share your sessions, results and big wins with the community." });
      return;
    }
    setComposeVisible(true);
  };

  const handleInvite = async () => {
    try {
      await Share.share({ message: "Join me on Stakemate — the best poker bankroll tracker! https://stakemate.app" });
    } catch { /* cancelled */ }
  };

  const handlePressProfile = (profileUserId: string) => {
    router.push({ pathname: "/user-profile", params: { userId: profileUserId } });
  };

  const handleFollow = async (targetId: string, currently: boolean) => {
    if (!userId) return;
    // Optimistic update
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (currently) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
    try {
      if (currently) await unfollowPlayer(userId, targetId);
      else await followPlayer(userId, targetId);
    } catch {
      // rollback
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (currently) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
    }
  };


  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>

      {/* ── Collapsible title section — absolute, slides up on scroll ── */}
      <Animated.View
        style={[styles.animHeader, { transform: [{ translateY: headerTranslateY }] }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          titleHeightRef.current = h;
          setTitleHeight(h);
        }}
      >
        <View style={[styles.header, { backgroundColor: BRAND, paddingTop: insets.top + 12, paddingBottom: 12 }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Community</Text>
              <Text style={styles.headerSub}>Stakemate players worldwide</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={handleCompose} style={styles.headerIconBtn} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleInvite} style={styles.inviteBtn} activeOpacity={0.8}>
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={styles.inviteBtnText}>Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Spacer that shrinks when title hides, pushing tab bar up ── */}
      <Animated.View style={{ height: spacerHeightAnim }} />

      {/* ── Sticky tab bar — in normal flow, always below safe area ── */}
      <View style={[styles.stickyTabBar, { backgroundColor: BRAND, paddingTop: insets.top }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={{ paddingRight: 8 }}
          bounces={false}
        >
          {([
            ["public",    "globe",        "Public"],
            ["following", "people",       "Following"],
            ["stakes",    "storefront",   "Marketplace"],
          ] as const).map(([key, icon, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => {
                if (!user && key !== "public") {
                  const meta: Record<string, { title: string; description: string; icon: any }> = {
                    following: { icon: "people-outline", title: "Follow Players", description: "Sign in to follow players and see their sessions, results and big wins." },
                    stakes:    { icon: "storefront-outline", title: "Staking Marketplace", description: "Sign in to buy and sell poker action, track your investments and manage your listings." },
                  };
                  setSignInSheet(meta[key]);
                  return;
                }
                setTab(key as Tab);
              }}
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
        </ScrollView>
      </View>

      {/* ── Scrollable content — fills remaining space below the sticky tab bar ── */}
      <View style={{ flex: 1 }}>

        {tab === "stakes" ? (
          /* ── Marketplace — adapts to buyer / seller / both ── */
          <ScrollView
            key="stakes"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshingStakes}
                onRefresh={() => { setRefreshingStakes(true); loadStakes(true); }}
                tintColor={BRAND}
              />
            }
          >
            {loadingStakes ? (
              <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>
            ) : (
              <>
                {/* ── Seller: My Listings ── */}
                {myListings.length > 0 && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                      My Listings
                    </Text>
                    {myListings.map((deal) => (
                      <View key={deal.id} style={{ marginBottom: 12 }}>
                        <StakeDealCard
                          deal={deal}
                          currentUserId={userId}
                          followingIds={followingIds}
                          claimRefreshKey={claimRefreshKey}
                          onBuy={setBuyModalDeal}
                          onFollow={handleFollow}
                          onPressProfile={handlePressProfile}
                        />
                      </View>
                    ))}
                  </>
                )}

                {/* ── Buyer: My Investments ── */}
                {backedPosts.length > 0 && (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, marginTop: myListings.length > 0 ? 4 : 0 }}>
                      My Investments
                    </Text>
                    {backedPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        currentUserId={userId}
                        isFollowing={followingIds.has(post.user_id)}
                        onReact={handleReact}
                        onDelete={handleDelete}
                        onComment={setCommentsPost}
                        onFollow={handleFollow}
                        onPressProfile={handlePressProfile}
                        onBuyStake={setBuyDealIdFromPost}
                        onChangeVisibility={handleChangeVisibility}
                      />
                    ))}
                  </>
                )}

                {/* ── Browse: all public deals ── */}
                {(myListings.length > 0 || backedPosts.length > 0) && stakeDeals.length > 0 && (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, marginTop: 4 }}>
                    Browse
                  </Text>
                )}
                {stakeDeals.length > 0 ? (
                  stakeDeals.map((deal) => (
                    <View key={deal.id} style={{ marginBottom: 12 }}>
                      <StakeDealCard
                        deal={deal}
                        currentUserId={userId}
                        followingIds={followingIds}
                        claimRefreshKey={claimRefreshKey}
                        onBuy={setBuyModalDeal}
                        onFollow={handleFollow}
                        onPressProfile={handlePressProfile}
                      />
                    </View>
                  ))
                ) : myListings.length === 0 && backedPosts.length === 0 ? (
                  <View style={[styles.emptyCard, { borderColor: colors.border.default }]}>
                    <Ionicons name="storefront-outline" size={44} color={colors.text.tertiary} />
                    <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No active Marketplace deals</Text>
                    <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>
                      Players selling action will appear here. Add a tournament to your schedule to list on Marketplace.
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        ) : (
          /* ── Public / Following post feed ── */
          <FlatList
            key={tab}
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                currentUserId={userId}
                isFollowing={followingIds.has(item.user_id)}
                onReact={handleReact}
                onDelete={handleDelete}
                onComment={setCommentsPost}
                onFollow={handleFollow}
                onPressProfile={handlePressProfile}
                onBuyStake={setBuyDealIdFromPost}
                onChangeVisibility={handleChangeVisibility}
              />
            )}
            onRefresh={() => { setRefreshing(true); loadData(true); }}
            refreshing={refreshing}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
            ListHeaderComponent={
              tab === "public" ? (
                <>
                  <OnlineMembersStrip
                    members={activeMembers}
                    colors={colors}
                    currentUserId={user?.id}
                    followingIds={followingIds}
                    onFollow={handleFollow}
                    onPressProfile={handlePressProfile}
                  />
                  <View style={[styles.welcomeCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                  <View style={styles.welcomeTop}>
                    <View style={styles.welcomeIconWrap}>
                      <Text style={{ fontSize: 22 }}>🃏</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.welcomeHeading, { color: colors.text.primary }]}>Welcome to the Community</Text>
                      <Text style={[styles.welcomeSub, { color: colors.text.tertiary }]}>
                        May your reads be sharp and your variance kind. This is where poker players connect, share the felt, and back each other at the table.
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.welcomeDivider, { backgroundColor: colors.border.default }]} />
                  <View style={styles.welcomeFeatures}>
                    {[
                      { icon: "create-outline", label: "Post Sessions", desc: "Share results, big pots & bluffs" },
                      { icon: "people-outline", label: "Follow Players", desc: "Track the players you back or admire" },
                      { icon: "storefront-outline", label: "Buy & Sell on Marketplace", desc: "Find or offer action on tournaments" },
                    ].map((f) => (
                      <View key={f.label} style={styles.welcomeFeatureRow}>
                        <View style={[styles.welcomeFeatureIcon, { backgroundColor: `${BRAND}12` }]}>
                          <Ionicons name={f.icon as any} size={14} color={BRAND} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.welcomeFeatureLabel, { color: colors.text.primary }]}>{f.label}</Text>
                          <Text style={[styles.welcomeFeatureDesc, { color: colors.text.tertiary }]}>{f.desc}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
                </>
              ) : null
            }
            ListEmptyComponent={
              loading ? (
                <View style={styles.centered}><ActivityIndicator size="large" color={BRAND} /></View>
              ) : tab === "following" ? (
                <View style={[styles.emptyCard, { borderColor: colors.border.default }]}>
                  <Ionicons name="people-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No posts from people you follow</Text>
                  <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>Follow players to see their sessions here.</Text>
                  <TouchableOpacity onPress={() => setTab("public")} style={[styles.emptyAction, { backgroundColor: BRAND }]}>
                    <Text style={styles.emptyActionText}>Explore Public Posts</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.emptyCard, { borderColor: colors.border.default }]}>
                  <Ionicons name="newspaper-outline" size={44} color={colors.text.tertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Nothing here yet</Text>
                  <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>Be the first to post or share a session.</Text>
                  <TouchableOpacity onPress={handleCompose} style={[styles.emptyAction, { backgroundColor: BRAND }]}>
                    <Ionicons name="create-outline" size={14} color="#fff" />
                    <Text style={styles.emptyActionText}>Create Post</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          />
        )}
      </View>

      {/* ── Buyer modal (from stakes tab) ── */}
      {buyModalDeal && (
        <SellStakesModal
          visible={!!buyModalDeal}
          dealId={buyModalDeal.id}
          userId={userId}
          onClose={() => { setBuyModalDeal(null); setClaimRefreshKey((k) => k + 1); loadStakes(true); }}
          onDealCreated={(id) => {
            setBuyModalDeal(null);
            setClaimRefreshKey((k) => k + 1);
            // id is "" when a deal is deleted — remove it immediately then reload
            if (id === "" && buyModalDeal) {
              setStakeDeals((prev) => prev.filter((d) => d.id !== buyModalDeal.id));
            }
            loadStakes(true);
          }}
        />
      )}

      {/* ── Buyer modal (opened from a community post tile) ── */}
      {buyDealIdFromPost && (
        <SellStakesModal
          visible={!!buyDealIdFromPost}
          dealId={buyDealIdFromPost}
          userId={userId}
          onClose={() => setBuyDealIdFromPost(null)}
          onDealCreated={() => { setBuyDealIdFromPost(null); loadStakes(true); }}
        />
      )}

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
        onCommentAdded={(postId) =>
          setPosts((prev) => prev.map((p) =>
            p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
          ))
        }
      />

      <SignInSheet
        visible={!!signInSheet}
        onClose={() => setSignInSheet(null)}
        title={signInSheet?.title}
        description={signInSheet?.description}
        icon={signInSheet?.icon}
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

  stickyTabBar: {
    zIndex: 9,
  },

  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  tabItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabItemActive: { borderBottomColor: "#fff" },
  tabLabel: { fontSize: 14, fontWeight: "700" },

  searchBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterPillText: { fontSize: 13, fontWeight: "600" },

  // Post card
  postCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  postAuthor: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 10 },
  inlineFollowBtn:  { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  inlineFollowText: { fontSize: 12, fontWeight: "700" },
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
  composeNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composeCancelText: { fontSize: 15 },
  composeTitle: { fontSize: 16, fontWeight: "700" },
  composePostBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, alignItems: "center" },
  composePostBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  composeBody: { flexDirection: "row", gap: 12, padding: 16, paddingBottom: 8 },
  composeName: { fontSize: 14, fontWeight: "700" },
  composeInput: { fontSize: 16, lineHeight: 24, minHeight: 100, marginTop: 4 },
  composeImageWrap: { position: "relative", marginHorizontal: 16, marginBottom: 12, borderRadius: 14, overflow: "hidden" },
  composeImage: { width: "100%", height: 200, borderRadius: 14 },
  composeImageRemove: { position: "absolute", top: 8, right: 8 },
  composeHint: {
    flexDirection: "column",
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  composeHintText: { flex: 1, fontSize: 13, lineHeight: 18 },
  visibilityOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  composeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composeToolBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  composeCount: { fontSize: 13 },

  // Comments modal — full-screen page layout
  commentsPage: { flex: 1 },
  commentsNavHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentsBackBtn: { width: 38, alignItems: "flex-start" },
  commentsNavTitle: { fontSize: 17, fontWeight: "700" },
  commentsPostCard: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentsPostAuthor: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  commentsPostName: { fontSize: 14, fontWeight: "700" },
  commentsPostSub: { fontSize: 12, marginTop: 1 },
  commentsPostContent: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  commentsPostActions: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentsReactBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
  },
  commentsShareBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  commentsCenter: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 10,
  },
  commentsEmptyText: { fontSize: 15, fontWeight: "500" },
  commentRow: { flexDirection: "row", gap: 10 },
  commentBubble: { flex: 1, borderRadius: 14, padding: 12 },
  commentBubbleTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  commentName: { fontSize: 13, fontWeight: "700", flex: 1 },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentsInputBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentsTextInput: {
    flex: 1, fontSize: 14, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  commentsSendBtn: {
    backgroundColor: "#0891B2",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22,
  },
  commentsSendBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

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

  // Welcome card
  welcomeCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12, marginBottom: 4 },
  welcomeTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  welcomeIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: `${BRAND}12`, alignItems: "center", justifyContent: "center" },
  welcomeHeading: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  welcomeSub: { fontSize: 13, lineHeight: 19 },
  welcomeDivider: { height: StyleSheet.hairlineWidth },
  welcomeFeatures: { gap: 10 },
  welcomeFeatureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  welcomeFeatureIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  welcomeFeatureLabel: { fontSize: 13, fontWeight: "600" },
  welcomeFeatureDesc: { fontSize: 12, marginTop: 1 },
});
