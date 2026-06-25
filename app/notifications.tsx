import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { AppNotification, fetchAppNotifications, markAllRead } from "@/lib/appNotifications";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

type NotifGroup = { label: string; items: AppNotification[] };

function groupNotifications(notifications: AppNotification[]): NotifGroup[] {
  const newItems     = notifications.filter((n) => !n.read);
  const todayItems   = notifications.filter((n) => n.read && isToday(n.created_at));
  const earlierItems = notifications.filter((n) => n.read && !isToday(n.created_at));
  const groups: NotifGroup[] = [];
  if (newItems.length)     groups.push({ label: "New",     items: newItems });
  if (todayItems.length)   groups.push({ label: "Today",   items: todayItems });
  if (earlierItems.length) groups.push({ label: "Earlier", items: earlierItems });
  return groups;
}

function notifIcon(type: AppNotification["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "stake_claim_pending":   return "hand-left-outline";
    case "stake_claim_confirmed": return "checkmark-circle-outline";
    case "stake_claim_rejected":  return "close-circle-outline";
    case "post_comment":          return "chatbubble-outline";
    case "new_follower":          return "person-add-outline";
    case "tournament_post":       return "trophy-outline";
  }
}

function notifIconColor(type: AppNotification["type"]): string {
  switch (type) {
    case "stake_claim_pending":   return "#F59E0B";
    case "stake_claim_confirmed": return "#22C55E";
    case "stake_claim_rejected":  return "#EF4444";
    case "post_comment":          return BRAND;
    case "new_follower":          return "#7C3AED";
    case "tournament_post":       return "#F97316";
  }
}

function notifIconBg(type: AppNotification["type"]): string {
  switch (type) {
    case "stake_claim_pending":   return "#F59E0B18";
    case "stake_claim_confirmed": return "#22C55E18";
    case "stake_claim_rejected":  return "#EF444418";
    case "post_comment":          return `${BRAND}18`;
    case "new_follower":          return "#7C3AED18";
    case "tournament_post":       return "#F9731618";
  }
}

export default function NotificationsScreen() {
  const { colors } = usePokerTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    fetchAppNotifications(profile.id)
      .then((data) => {
        setNotifications(data);
        markAllRead();
        setNotifications(data.map((n) => ({ ...n, read: true })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.id]);

  function handlePress(n: AppNotification) {
    if (
      n.type === "stake_claim_pending" ||
      n.type === "stake_claim_confirmed" ||
      n.type === "stake_claim_rejected"
    ) {
      router.back();
      setTimeout(() => {
        if (n.data.dealId) {
          router.push({ pathname: "/(tabs)/social", params: { openDealId: n.data.dealId } } as any);
        } else {
          router.push("/(tabs)/social" as any);
        }
      }, 300);
    } else if (n.type === "post_comment" || n.type === "tournament_post") {
      router.back();
      setTimeout(() => router.push("/(tabs)/social" as any), 300);
    } else if (n.type === "new_follower" && n.data.followerId) {
      router.push({ pathname: "/user-profile", params: { userId: n.data.followerId } });
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bg.primary, paddingTop: insets.top + 12, borderBottomColor: colors.border.default }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Notifications</Text>
          {unread > 0 && (
            <Text style={[styles.headerSub, { color: colors.text.tertiary }]}>{unread} unread</Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconWrap, { backgroundColor: `${BRAND}12` }]}>
            <Ionicons name="notifications-off-outline" size={40} color={BRAND} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>You're all caught up</Text>
          <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>
            Stake requests, comments and replies will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {groupNotifications(notifications).map((group) => (
            <View key={group.label}>
              {/* Section header */}
              <View style={[styles.sectionHeader, { borderBottomColor: colors.border.subtle }]}>
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>{group.label}</Text>
                {group.label === "New" && (
                  <View style={[styles.newBadge, { backgroundColor: BRAND }]}>
                    <Text style={styles.newBadgeText}>{group.items.length}</Text>
                  </View>
                )}
              </View>

              {group.items.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => handlePress(n)}
                  activeOpacity={0.7}
                  style={[
                    styles.row,
                    {
                      backgroundColor: !n.read ? `${BRAND}0A` : colors.bg.primary,
                      borderBottomColor: colors.border.subtle,
                      borderLeftWidth: !n.read ? 3 : 0,
                      borderLeftColor: BRAND,
                    },
                  ]}
                >
                  {/* Icon / avatar */}
                  <View style={[styles.iconWrap, { backgroundColor: notifIconBg(n.type) }]}>
                    {n.actor?.avatar_url ? (
                      <Image
                        source={{ uri: n.actor.avatar_url }}
                        style={{ width: 44, height: 44, borderRadius: 22 }}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name={notifIcon(n.type)} size={20} color={notifIconColor(n.type)} />
                    )}
                  </View>

                  {/* Content */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.rowTitle, { color: colors.text.primary, fontWeight: !n.read ? "700" : "600" }]}>{n.title}</Text>
                      {!n.read && <View style={[styles.unreadDot, { backgroundColor: BRAND }]} />}
                    </View>
                    <Text style={[styles.rowBody, { color: colors.text.secondary }]} numberOfLines={2}>{n.body}</Text>
                    <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>{timeAgo(n.created_at)}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 14,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  newBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 11,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
