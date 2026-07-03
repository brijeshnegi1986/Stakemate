import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { computeBadges, topBadge } from "@/lib/badges";
import { ProfileBadge } from "@/components/ProfileBadge";
import {
  FullProfile,
  followPlayer,
  getProfileWithCounts,
  getUserPosts,
  SocialPost,
  timeAgo,
  unfollowPlayer,
} from "@/lib/social";
import {
  dealStatusColor,
  dealStatusLabel,
  getUserStakeDeals,
  StakeDeal,
} from "@/lib/stakes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const PURPLE = "#0891B2";

type ProfileTab = "posts" | "stakes";

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size, name }: { uri?: string | null; size: number; name?: string | null }) {
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

// ─── Post row ─────────────────────────────────────────────────────────────────

function PostRow({ post, colors }: { post: SocialPost; colors: any }) {
  const name = post.profile.display_name || post.profile.username || "Player";
  const profit = post.amount ?? 0;
  const profitColor = profit >= 0 ? "#22C55E" : "#EF4444";
  const isSessionPost = post.session_name != null || post.amount != null;

  return (
    <View style={[pStyles.postCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={pStyles.postAuthorRow}>
        <Avatar uri={post.profile.avatar_url} size={34} name={name} />
        <View style={{ flex: 1 }}>
          <Text style={[pStyles.postName, { color: colors.text.primary }]}>{name}</Text>
          <Text style={[pStyles.postTime, { color: colors.text.tertiary }]}>{timeAgo(post.created_at)}</Text>
        </View>
      </View>

      {isSessionPost ? (
        <View style={[pStyles.sessionBlock, { backgroundColor: colors.bg.secondary, borderColor: colors.border.subtle }]}>
          <View style={[pStyles.sessionIcon, { backgroundColor: post.session_type === "tournament" ? "#8B5CF6" : "#F97316" }]}>
            <Ionicons name={post.session_type === "tournament" ? "trophy-outline" : "cash-outline"} size={14} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[pStyles.sessionName, { color: colors.text.primary }]} numberOfLines={1}>
              {post.session_name || (post.session_type === "tournament" ? "Tournament" : "Cash Game")}
            </Text>
            {post.venue ? (
              <Text style={[pStyles.sessionVenue, { color: colors.text.tertiary }]} numberOfLines={1}>{post.venue}</Text>
            ) : null}
          </View>
          {post.amount != null ? (
            <Text style={[pStyles.profitText, { color: profitColor }]}>
              {`${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toLocaleString("en-AU")}`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {post.content ? (
        <Text style={[pStyles.postContent, { color: colors.text.primary }]}>{post.content}</Text>
      ) : null}

      {post.reactions.length > 0 || post.comment_count > 0 ? (
        <View style={[pStyles.reactRow, { borderTopColor: colors.border.subtle }]}>
          {post.reactions.map((r) => (
            <View key={r.emoji} style={[pStyles.reactChip, { backgroundColor: colors.bg.secondary }]}>
              <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
              <Text style={[pStyles.reactCount, { color: colors.text.secondary }]}>{r.count}</Text>
            </View>
          ))}
          {post.comment_count > 0 ? (
            <Text style={[pStyles.commentCount, { color: colors.text.tertiary, marginLeft: "auto" }]}>
              {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ─── Stake row ────────────────────────────────────────────────────────────────

function StakeRow({ deal, colors }: { deal: StakeDeal; colors: any }) {
  const available   = deal.total_action_selling - deal.action_claimed;
  const pctSold     = deal.total_action_selling > 0 ? deal.action_claimed / deal.total_action_selling : 0;
  const statusColor = dealStatusColor(deal.status);

  return (
    <View style={[pStyles.stakeCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={pStyles.stakeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[pStyles.stakeName, { color: colors.text.primary }]} numberOfLines={1}>
            {deal.tournament_name}
          </Text>
          <Text style={[pStyles.stakeMeta, { color: colors.text.tertiary }]}>
            {[
              deal.venue,
              deal.tournament_date
                ? new Date(deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                : null,
            ].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={[pStyles.statusPill, { backgroundColor: statusColor + "18" }]}>
          <Text style={[pStyles.statusText, { color: statusColor }]}>{dealStatusLabel(deal.status)}</Text>
        </View>
      </View>

      <View style={[pStyles.stakeStats, { borderColor: colors.border.subtle }]}>
        {[
          { label: "Selling",  value: `${deal.total_action_selling}%` },
          { label: "Price/1%", value: deal.price_per_percent ? `$${deal.price_per_percent}` : "—" },
          { label: "Markup",   value: deal.markup !== 1 ? `${deal.markup}×` : "Face" },
        ].map((s, i, arr) => (
          <View
            key={s.label}
            style={[
              pStyles.stakeStatCell,
              i < arr.length - 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border.subtle },
            ]}
          >
            <Text style={[pStyles.stakeStatValue, { color: colors.text.primary }]}>{s.value}</Text>
            <Text style={[pStyles.stakeStatLabel, { color: colors.text.tertiary }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={pStyles.progressSection}>
        <View style={[pStyles.progressTrack, { backgroundColor: colors.border.subtle }]}>
          <View style={[pStyles.progressFill, { width: `${Math.round(pctSold * 100)}%`, backgroundColor: PURPLE }]} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={[pStyles.progressLabel, { color: colors.text.tertiary }]}>{Math.round(pctSold * 100)}% sold</Text>
          <Text style={[pStyles.progressLabel, { color: colors.text.tertiary }]}>{available.toFixed(1)}% left</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Social links row ────────────────────────────────────────────────────────

type SocialLink = { icon: keyof typeof Ionicons.glyphMap; color: string; url: string; label: string };

function buildSocialLinks(profile: FullProfile): SocialLink[] {
  const links: SocialLink[] = [];

  if (profile.twitter_handle) {
    const handle = profile.twitter_handle.replace(/^@/, "");
    links.push({ icon: "logo-twitter", color: "#1DA1F2", label: "X / Twitter", url: `https://x.com/${handle}` });
  }
  if (profile.instagram_handle) {
    const handle = profile.instagram_handle.replace(/^@/, "");
    links.push({ icon: "logo-instagram", color: "#E1306C", label: "Instagram", url: `https://instagram.com/${handle}` });
  }
  if (profile.youtube_handle) {
    const handle = profile.youtube_handle.replace(/^@/, "");
    links.push({ icon: "logo-youtube", color: "#FF0000", label: "YouTube", url: `https://youtube.com/@${handle}` });
  }
  if (profile.twitch_handle) {
    const handle = profile.twitch_handle.replace(/^@/, "");
    links.push({ icon: "game-controller-outline", color: "#9146FF", label: "Twitch", url: `https://twitch.tv/${handle}` });
  }
  if (profile.hendon_mob_url) {
    const url = profile.hendon_mob_url.startsWith("http") ? profile.hendon_mob_url : `https://${profile.hendon_mob_url}`;
    links.push({ icon: "trophy-outline", color: "#F59E0B", label: "Hendon Mob", url });
  }
  if (profile.poker_index_url) {
    const url = profile.poker_index_url.startsWith("http") ? profile.poker_index_url : `https://${profile.poker_index_url}`;
    links.push({ icon: "stats-chart-outline", color: "#0891B2", label: "Poker Index", url });
  }
  return links;
}

function LiveStatsCard({ profile, colors }: { profile: FullProfile; colors: any }) {
  const hasStats = profile.live_earnings != null || profile.live_cashes != null
    || profile.live_wins != null || profile.top_10_results != null;
  if (!hasStats) return null;

  const stats = [
    {
      icon: "cash-outline" as const,
      color: "#22C55E",
      label: "Live Earnings",
      value: profile.live_earnings != null
        ? `$${Number(profile.live_earnings).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`
        : null,
    },
    {
      icon: "trophy-outline" as const,
      color: "#F59E0B",
      label: "Cashes",
      value: profile.live_cashes != null ? String(profile.live_cashes) : null,
    },
    {
      icon: "medal-outline" as const,
      color: "#EF4444",
      label: "Wins",
      value: profile.live_wins != null ? String(profile.live_wins) : null,
    },
    {
      icon: "podium-outline" as const,
      color: "#8B5CF6",
      label: "Top 10",
      value: profile.top_10_results != null ? String(profile.top_10_results) : null,
    },
  ].filter((s) => s.value !== null);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        Live Tournament Stats
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {stats.map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: colors.bg.primary,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border.default,
              padding: 10,
              alignItems: "center",
              gap: 4,
            }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: s.color + "18", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={s.icon} size={14} color={s.color} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text.primary }}>{s.value}</Text>
            <Text style={{ fontSize: 10, color: colors.text.tertiary, fontWeight: "500" }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SocialLinksRow({ profile, colors }: { profile: FullProfile; colors: any }) {
  const links = buildSocialLinks(profile);
  if (links.length === 0) return null;

  function open(link: SocialLink) {
    Linking.openURL(link.url).catch(() =>
      Alert.alert("Could not open link", `Try visiting ${link.url} in your browser.`)
    );
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
      {links.map((link) => (
        <TouchableOpacity
          key={link.label}
          onPress={() => open(link)}
          activeOpacity={0.75}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: link.color + "14",
            borderWidth: 1,
            borderColor: link.color + "35",
          }}
        >
          <Ionicons name={link.icon} size={14} color={link.color} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: link.color }}>{link.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const { userId: paramUserId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();

  const currentUserId = user?.id ?? "";
  const targetUserId  = paramUserId ?? "";
  const isOwnProfile  = targetUserId === currentUserId;

  const [profileData,    setProfileData]    = useState<FullProfile | null>(null);
  const [isFollowing,    setIsFollowing]    = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [tab,            setTab]            = useState<ProfileTab>("posts");
  const [posts,          setPosts]          = useState<SocialPost[]>([]);
  const [stakes,         setStakes]         = useState<StakeDeal[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!targetUserId) return;
    try {
      const result = await getProfileWithCounts(targetUserId, currentUserId);
      if (result) {
        setProfileData(result.profile);
        setIsFollowing(result.isFollowing);
      }
    } catch (e) {
      console.error("UserProfile load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId, currentUserId]);

  const loadPosts = useCallback(async () => {
    if (!targetUserId) return;
    setLoadingContent(true);
    try {
      setPosts(await getUserPosts(targetUserId, currentUserId));
    } catch { /* ignore */ } finally {
      setLoadingContent(false);
    }
  }, [targetUserId, currentUserId]);

  const loadStakes = useCallback(async () => {
    if (!targetUserId) return;
    setLoadingContent(true);
    try {
      setStakes(await getUserStakeDeals(targetUserId));
    } catch { /* ignore */ } finally {
      setLoadingContent(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    loadProfile();
    loadPosts();
  }, [loadProfile, loadPosts]);

  useEffect(() => {
    if (tab === "stakes") loadStakes();
    else loadPosts();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleFollow = async () => {
    if (!currentUserId) {
      Alert.alert("Sign in required", "Sign in to follow players.");
      return;
    }
    const next = !isFollowing;
    setIsFollowing(next);
    setProfileData((prev) =>
      prev ? { ...prev, follower_count: prev.follower_count + (next ? 1 : -1) } : prev
    );
    try {
      if (next) await followPlayer(currentUserId, targetUserId);
      else await unfollowPlayer(currentUserId, targetUserId);
    } catch {
      setIsFollowing(!next);
      setProfileData((prev) =>
        prev ? { ...prev, follower_count: prev.follower_count + (next ? -1 : 1) } : prev
      );
    }
  };

  const handleShare = async () => {
    const name = profileData?.display_name || profileData?.username || "this player";
    try {
      await Share.share({ message: `Check out ${name} on Stakemate!` });
    } catch { /* cancelled */ }
  };

  const handleMessage = () => {
    Alert.alert("Coming soon", "Direct messaging is coming soon.");
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadProfile();
    if (tab === "stakes") loadStakes();
    else loadPosts();
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[pStyles.fill, { backgroundColor: colors.bg.primary, paddingTop: insets.top + 56, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (!profileData) {
    return (
      <View style={[pStyles.fill, { backgroundColor: colors.bg.primary }]}>
        <View style={[pStyles.navBar, { paddingTop: insets.top + 10, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Ionicons name="person-outline" size={52} color={colors.text.tertiary} />
          <Text style={{ color: colors.text.tertiary, fontSize: 15 }}>Profile not found</Text>
        </View>
      </View>
    );
  }

  const displayName = profileData.display_name || profileData.username || "Player";
  const handle      = profileData.username ? `@${profileData.username}` : null;

  const socialLinkCount = [
    profileData.twitter_handle, profileData.instagram_handle,
    profileData.youtube_handle, profileData.twitch_handle,
    profileData.hendon_mob_url, profileData.poker_index_url,
  ].filter(Boolean).length;

  const profileBadges = computeBadges({
    createdAt:       profileData.created_at,
    lastSeenAt:      profileData.last_seen_at,
    socialLinkCount,
    stakeDealsCount: profileData.stake_deals_count,
  });

  // ── Header (stable JSX — not an inline component function) ───────────────

  const listHeader = (
    <View>
      {/* Profile block */}
      <View style={[pStyles.profileBlock, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
        <View style={pStyles.avatarRow}>
          <Avatar uri={profileData.avatar_url} size={88} name={displayName} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[pStyles.displayName, { color: colors.text.primary }]}>{displayName}</Text>
            {handle ? <Text style={[pStyles.handle, { color: colors.text.secondary }]}>{handle}</Text> : null}
            {profileBadges.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                {profileBadges.map((b) => <ProfileBadge key={b.id} badge={b} size="full" />)}
              </View>
            )}
            {profileData.location ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Ionicons name="location-outline" size={12} color={colors.text.tertiary} />
                <Text style={[pStyles.location, { color: colors.text.tertiary }]}>{profileData.location}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {profileData.bio ? (
          <Text style={[pStyles.bio, { color: colors.text.secondary }]}>{profileData.bio}</Text>
        ) : null}

        <View style={[pStyles.statsStrip, { borderColor: colors.border.subtle }]}>
          {[
            { value: profileData.follower_count,  label: "Followers" },
            { value: profileData.following_count, label: "Following" },
          ].map((s, i) => (
            <View
              key={s.label}
              style={[
                pStyles.statCell,
                i === 0 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border.subtle },
              ]}
            >
              <Text style={[pStyles.statValue, { color: colors.text.primary }]}>
                {s.value.toLocaleString()}
              </Text>
              <Text style={[pStyles.statLabel, { color: colors.text.tertiary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <SocialLinksRow profile={profileData} colors={colors} />
        <LiveStatsCard profile={profileData} colors={colors} />

        {!isOwnProfile && (
          <View style={pStyles.actions}>
            <TouchableOpacity
              onPress={handleFollow}
              style={[
                pStyles.actionBtn,
                isFollowing
                  ? { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default }
                  : { backgroundColor: BRAND },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isFollowing ? "checkmark" : "person-add-outline"}
                size={14}
                color={isFollowing ? colors.text.secondary : "#fff"}
              />
              <Text style={[pStyles.actionBtnText, { color: isFollowing ? colors.text.secondary : "#fff" }]}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMessage}
              style={[pStyles.actionBtn, { borderWidth: 1, borderColor: colors.border.default, backgroundColor: "transparent" }]}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={14} color={colors.text.primary} />
              <Text style={[pStyles.actionBtnText, { color: colors.text.primary }]}>Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShare}
              style={[pStyles.actionBtnIcon, { backgroundColor: colors.bg.secondary }]}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={17} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={[pStyles.tabRow, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
        {(["posts", "stakes"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[pStyles.tabItem, tab === t && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={t === "posts"
                ? (tab === t ? "newspaper" : "newspaper-outline")
                : (tab === t ? "trending-up" : "trending-up-outline")}
              size={15}
              color={tab === t ? BRAND : colors.text.tertiary}
            />
            <Text style={[pStyles.tabLabel, { color: tab === t ? BRAND : colors.text.tertiary }]}>
              {t === "posts" ? "Posts" : "Stakes"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const listData: (SocialPost | StakeDeal)[] = tab === "posts" ? posts : stakes;

  const emptyComponent = loadingContent ? (
    <View style={pStyles.emptyState}><ActivityIndicator color={BRAND} /></View>
  ) : tab === "posts" ? (
    <View style={pStyles.emptyState}>
      <Ionicons name="newspaper-outline" size={40} color={colors.text.tertiary} />
      <Text style={[pStyles.emptyText, { color: colors.text.tertiary }]}>No posts yet</Text>
    </View>
  ) : (
    <View style={pStyles.emptyState}>
      <Ionicons name="trending-up-outline" size={40} color={colors.text.tertiary} />
      <Text style={[pStyles.emptyText, { color: colors.text.tertiary }]}>No active stakes</Text>
    </View>
  );

  return (
    <View style={[pStyles.fill, { backgroundColor: colors.bg.secondary }]}>
      {/* Nav bar — stable, rendered once */}
      <View style={[pStyles.navBar, { paddingTop: insets.top + 10, backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ paddingRight: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[pStyles.navTitle, { color: colors.text.primary }]} numberOfLines={1}>
          {displayName}
        </Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="share-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Single FlatList — key changes on tab switch to scroll back to top */}
      <FlatList
        key={tab}
        data={listData}
        keyExtractor={(item) => (item as any).id}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
        contentContainerStyle={pStyles.listContent}
        renderItem={({ item }) =>
          tab === "posts"
            ? <PostRow post={item as SocialPost} colors={colors} />
            : <StakeRow deal={item as StakeDeal} colors={colors} />
        }
        ListEmptyComponent={emptyComponent}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pStyles = StyleSheet.create({
  fill: { flex: 1 },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center", marginHorizontal: 8 },

  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 10, paddingBottom: 48 },

  // Profile block
  profileBlock: { marginHorizontal: -16, marginTop: -12, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  avatarRow:    { flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 20, paddingBottom: 12 },
  displayName:  { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  handle:       { fontSize: 14, fontWeight: "500" },
  location:     { fontSize: 13 },
  bio:          { fontSize: 14, lineHeight: 20, paddingHorizontal: 20, paddingBottom: 14 },

  statsStrip: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  statCell:  { flex: 1, paddingVertical: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600" },

  actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 40, borderRadius: 10,
  },
  actionBtnText:  { fontSize: 14, fontWeight: "700" },
  actionBtnIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },

  // Tab bar
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
    marginBottom: 0,
  },
  tabItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontWeight: "700" },

  // Post card
  postCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
    paddingHorizontal: 14, paddingVertical: 14,
  },
  postAuthorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  postName:      { fontSize: 13, fontWeight: "700" },
  postTime:      { fontSize: 12, marginTop: 1 },
  postContent:   { fontSize: 15, lineHeight: 22, marginBottom: 8 },

  sessionBlock: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    padding: 10, marginBottom: 8,
  },
  sessionIcon:  { width: 30, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  sessionName:  { fontSize: 13, fontWeight: "600" },
  sessionVenue: { fontSize: 12, marginTop: 1 },
  profitText:   { fontSize: 15, fontWeight: "800" },

  reactRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  reactChip:    { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  reactCount:   { fontSize: 11, fontWeight: "600" },
  commentCount: { fontSize: 12 },

  // Stake card
  stakeCard:      { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  stakeHeader:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 10 },
  stakeName:      { fontSize: 14, fontWeight: "700" },
  stakeMeta:      { fontSize: 12, marginTop: 1 },
  statusPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:     { fontSize: 11, fontWeight: "700" },
  stakeStats:     { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  stakeStatCell:  { flex: 1, paddingVertical: 9, alignItems: "center", gap: 1 },
  stakeStatValue: { fontSize: 13, fontWeight: "700" },
  stakeStatLabel: { fontSize: 10 },
  progressSection: { paddingHorizontal: 14, paddingVertical: 10 },
  progressTrack:   { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill:    { height: "100%", borderRadius: 3 },
  progressLabel:   { fontSize: 11 },

  // Empty states
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 10 },
  emptyText:  { fontSize: 15, fontWeight: "500" },
});
