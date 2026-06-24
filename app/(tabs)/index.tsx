import { HandReviewLauncher } from "@/components/HandReviewLauncher";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { fetchAppNotifications, getUnreadCount } from "@/lib/appNotifications";
import { getMyStakeClaims, getMyStakeDeals, MyStakeClaim, StakeDeal } from "@/lib/stakes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getActiveSession,
  getSessions,
  getSetting,
  getTournamentEvents,
  Session,
  TournamentEvent,
} from "../../db/database";

const BRAND = "#155DFC";

const CURRENCY_META: Record<string, { flag: string; symbol: string }> = {
  AUD: { flag: "🇦🇺", symbol: "$" },
  USD: { flag: "🇺🇸", symbol: "$" },
  GBP: { flag: "🇬🇧", symbol: "£" },
  NZD: { flag: "🇳🇿", symbol: "$" },
};

function getBigBlind(stakes: string): number | null {
  const parts = stakes?.split("/");
  if (parts?.length === 2) {
    const bb = parseFloat(parts[1]);
    return isNaN(bb) ? null : bb;
  }
  return null;
}

function fmtDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h${m > 0 ? `${m}m` : ""}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}

function fmtTourneyDateLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const d = new Date(dateStr + "T00:00:00");
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

type NextUpGroup = { imageUrl: string | null; events: TournamentEvent[] };

function groupByBanner(events: TournamentEvent[]): NextUpGroup[] {
  const map = new Map<string, TournamentEvent[]>();
  const solo: TournamentEvent[] = [];
  for (const e of events) {
    const img = e.image_url?.trim() ?? "";
    if (img) {
      const arr = map.get(img) ?? [];
      arr.push(e);
      map.set(img, arr);
    } else {
      solo.push(e);
    }
  }
  const groups: NextUpGroup[] = [];
  for (const [img, evts] of map) groups.push({ imageUrl: img, events: evts });
  for (const e of solo) groups.push({ imageUrl: null, events: [e] });
  groups.sort((a, b) => a.events[0].date.localeCompare(b.events[0].date));
  return groups;
}

export default function HomeScreen() {
  const { colors } = usePokerTheme();
  const { profile, refreshProfile, isSyncing } = useAuth();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions]           = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [currency, setCurrency]           = useState("AUD");
  const [myDeals,  setMyDeals]            = useState<StakeDeal[]>([]);
  const [myClaims, setMyClaims]           = useState<MyStakeClaim[]>([]);
  const [upcomingTourneys, setUpcomingTourneys] = useState<TournamentEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showHandReview, setShowHandReview] = useState(false);

  const meta = CURRENCY_META[currency] ?? CURRENCY_META.AUD;

  useFocusEffect(
    useCallback(() => {
      setSessions(getSessions() || []);
      setCurrency(getSetting("currency") ?? "AUD");
      setActiveSession(getActiveSession());
      refreshProfile();
      const todayYMD = new Date().toISOString().split("T")[0];
      const allEvents = getTournamentEvents();
      setUpcomingTourneys(allEvents.filter((e) => e.date >= todayYMD).slice(0, 10));
      const uid = profile?.id;
      if (uid) {
        const localEventIds = new Set(getTournamentEvents().map((e) => e.id));
        getMyStakeDeals(uid).then((deals) => {
          // filter out deals whose local tournament was deleted
          setMyDeals(deals.filter((d) => !d.local_tournament_id || localEventIds.has(d.local_tournament_id)));
        }).catch(() => {});
        getMyStakeClaims(uid).then(setMyClaims).catch(() => {});
      }
    }, [profile?.id])
  );

  useFocusEffect(
    useCallback(() => {
      if (!profile?.id) return;
      getUnreadCount(profile.id).then(setUnreadCount).catch(() => {});
    }, [profile?.id])
  );

  // Reload from SQLite once cloud sync completes
  useEffect(() => {
    if (!isSyncing) {
      setSessions(getSessions() || []);
      setActiveSession(getActiveSession());
      const todayYMD = new Date().toISOString().split("T")[0];
      setUpcomingTourneys(getTournamentEvents().filter((e) => e.date >= todayYMD).slice(0, 10));
    }
  }, [isSyncing]);

  const totalProfit = useMemo(
    () => sessions.reduce((s, x) => s + (x.profit || 0), 0),
    [sessions]
  );
  const totalHours  = useMemo(
    () => sessions.reduce((s, x) => s + (x.duration || 0), 0),
    [sessions]
  );
  const winRate = sessions.length > 0
    ? Math.round((sessions.filter((s) => s.profit >= 0).length / sessions.length) * 100)
    : null;
  const avgSession = sessions.length > 0
    ? totalProfit / sessions.length
    : null;

  const greetingName = profile?.display_name || profile?.username || profile?.email?.split("@")[0] || null;
  const recentSessions = sessions.slice(0, 5);

  const activeDeals  = myDeals.filter((d) => ["open", "active", "paused", "filled", "sold_out", "draft"].includes(d.status));
  const activeClaims = myClaims.filter((c) => c.status !== "rejected" && c.deal?.status !== "cancelled");
  const hasStakes    = activeDeals.length > 0 || activeClaims.length > 0;

  // Blinking dot for live banner
  const dotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const profitIsPositive = totalProfit >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Sync banner ── */}
        {isSyncing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#EFF6FF" }}>
            <ActivityIndicator size="small" color={BRAND} />
            <Text style={{ color: BRAND, fontSize: 13, fontWeight: "500" }}>Syncing your data…</Text>
          </View>
        )}
        {/* ── Blue header ── */}
        <View style={[styles.topBar, { backgroundColor: BRAND, paddingTop: insets.top + 10 }]}>
          <View style={styles.topBarLeft}>
            <Image
              source={require("@/assets/images/SM.svg")}
              style={styles.smIcon}
              contentFit="contain"
              tintColor="rgba(255,255,255,0.9)"
            />
            <View>
              <Text style={styles.topBarGreet}>{getGreeting()}</Text>
              <Text style={styles.topBarName} numberOfLines={1}>
                {greetingName || "Player"}
              </Text>
            </View>
          </View>
          <View style={styles.topBarActions}>
            <TouchableOpacity onPress={() => router.push("/notifications" as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ position: "relative" }}>
              <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.85)" />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/settings")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.navigate("/(tabs)/profile")} activeOpacity={0.8}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" cachePolicy="none" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={18} color="#9CA3AF" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── P&L card ── */}
        <View style={styles.plCardWrap}>
          <View style={[styles.plCard, { backgroundColor: colors.bg.primary, shadowColor: colors.text.primary }]}>
            <View style={styles.plRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plLabel, { color: colors.text.tertiary }]}>Total P&L</Text>
                <View style={styles.plAmountRow}>
                  {balanceHidden ? (
                    <Text style={[styles.plAmount, { color: colors.text.tertiary }]}>••••••</Text>
                  ) : (
                    <Text style={[styles.plAmount, { color: profitIsPositive ? "#22C55E" : "#EF4444" }]}>
                      {profitIsPositive ? "+" : "-"}{meta.symbol}{Math.abs(totalProfit).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  )}
                  <View style={[styles.plTrend, { backgroundColor: profitIsPositive ? "#22C55E18" : "#EF444418" }]}>
                    <Ionicons
                      name={profitIsPositive ? "trending-up" : "trending-down"}
                      size={14}
                      color={profitIsPositive ? "#22C55E" : "#EF4444"}
                    />
                  </View>
                </View>
                <View style={styles.plCurrencyRow}>
                  <Text style={{ fontSize: 14 }}>{meta.flag}</Text>
                  <Text style={[styles.plCurrency, { color: colors.text.tertiary }]}>{currency} · Main Bankroll</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setBalanceHidden((h) => !h)}
                style={[styles.hideBtn, { backgroundColor: colors.bg.secondary }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={balanceHidden ? "eye-outline" : "eye-off-outline"} size={16} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {/* ── 4-stat strip ── */}
            <View style={[styles.statStrip, { borderTopColor: colors.border.subtle }]}>
              {[
                { label: "Sessions", value: sessions.length.toString() },
                { label: "Hours", value: totalHours > 0 ? fmtDuration(totalHours) : "—" },
                { label: "Win Rate", value: winRate !== null ? `${winRate}%` : "—" },
                { label: "Avg/Session", value: avgSession !== null ? `${avgSession >= 0 ? "+" : "-"}${meta.symbol}${Math.abs(avgSession).toFixed(0)}` : "—" },
              ].map((stat, i, arr) => (
                <View key={stat.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border.subtle }]}>
                  <Text style={[styles.statValue, { color: colors.text.primary }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Quick actions ── */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            onPress={() => router.push("/live")}
            style={[styles.qaBtn, { backgroundColor: "#22C55E" }]}
            activeOpacity={0.85}
          >
            <View style={styles.qaBtnIcon}>
              <Ionicons name="radio-button-on" size={14} color="#fff" />
            </View>
            <View>
              <Text style={styles.qaBtnTitle}>Start Live</Text>
              <Text style={styles.qaBtnSub}>Track real time</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/add-session")}
            style={[styles.qaBtn, { backgroundColor: BRAND }]}
            activeOpacity={0.85}
          >
            <View style={styles.qaBtnIcon}>
              <Ionicons name="add" size={14} color="#fff" />
            </View>
            <View>
              <Text style={styles.qaBtnTitle}>Add Result</Text>
              <Text style={styles.qaBtnSub}>Log completed</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── AI Hand Review card ── */}
        <TouchableOpacity
          onPress={() => setShowHandReview(true)}
          activeOpacity={0.82}
          style={[styles.handReviewCard, { backgroundColor: "#7C3AED12", borderColor: "#7C3AED30" }]}
        >
          <View style={[styles.handReviewIcon, { backgroundColor: "#7C3AED18" }]}>
            <Ionicons name="color-wand-outline" size={18} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.handReviewTitle, { color: "#7C3AED" }]}>AI Hand Review</Text>
            <Text style={[styles.handReviewSub, { color: "#7C3AED99" }]}>Describe a hand — get instant coaching</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#7C3AED80" />
        </TouchableOpacity>

        {/* ── Live session banner ── */}
        {activeSession && (
          <TouchableOpacity
            onPress={() => router.push("/live/active")}
            style={styles.liveBanner}
            activeOpacity={0.85}
          >
            <Animated.View style={[styles.liveDot, { opacity: dotOpacity }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.liveBannerTitle}>
                {activeSession.type === "tournament"
                  ? activeSession.tournamentName || "Tournament"
                  : `${activeSession.stakes} Cash Game`}
              </Text>
              <Text style={styles.liveBannerSub}>
                {meta.symbol}{activeSession.buyIn} buy-in · Tap to resume
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#22C55E" style={{ opacity: 0.8 }} />
          </TouchableOpacity>
        )}

        <View style={styles.body}>

          {/* ── Next Up tournaments ── */}
          {upcomingTourneys.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "#8B5CF615", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="trophy-outline" size={13} color="#8B5CF6" />
                  </View>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Next Up</Text>
                </View>
                <TouchableOpacity onPress={() => router.navigate("/(tabs)/calendar")}>
                  <Text style={[styles.seeAll, { color: BRAND }]}>Schedule</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 8 }}>
                {groupByBanner(upcomingTourneys).map((g, gi) => {
                  const isSeries = g.events.length > 1;
                  if (isSeries) {
                    return (
                      <TouchableOpacity
                        key={gi}
                        onPress={() => router.navigate("/(tabs)/calendar")}
                        activeOpacity={0.75}
                        style={[styles.stakeCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, padding: 0, overflow: "hidden" }]}
                      >
                        {g.imageUrl ? (
                          <Image source={{ uri: g.imageUrl }} style={{ width: "100%", height: 120 }} contentFit="cover" />
                        ) : null}
                        {g.events.map((t, i) => {
                          const label = fmtTourneyDateLabel(t.date);
                          const isToday = label === "Today";
                          const labelColor = isToday ? "#22C55E" : colors.text.tertiary;
                          const labelBg = isToday ? "#22C55E15" : colors.bg.secondary;
                          return (
                            <View key={t.id}>
                              {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginHorizontal: 12 }} />}
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
                                <View style={{ flex: 1, gap: 2 }}>
                                  <Text style={[styles.stakeCardName, { color: colors.text.primary }]} numberOfLines={1}>{t.name}</Text>
                                  {(t.venue || t.buyin) ? (
                                    <Text style={[styles.stakeCardMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
                                      {[t.venue, t.buyin].filter(Boolean).join(" · ")}
                                    </Text>
                                  ) : null}
                                </View>
                                <View style={[styles.stakeStatusPill, { backgroundColor: labelBg }]}>
                                  <Text style={[styles.stakeStatusText, { color: labelColor }]}>{label}</Text>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </TouchableOpacity>
                    );
                  }
                  const t = g.events[0];
                  const label = fmtTourneyDateLabel(t.date);
                  const isToday = label === "Today";
                  const labelColor = isToday ? "#22C55E" : colors.text.tertiary;
                  const labelBg = isToday ? "#22C55E15" : colors.bg.secondary;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => router.navigate("/(tabs)/calendar")}
                      activeOpacity={0.75}
                      style={[styles.stakeCard, { backgroundColor: colors.bg.primary, borderColor: isToday ? "#22C55E30" : colors.border.default, padding: 0, overflow: "hidden" }]}
                    >
                      {t.image_url ? (
                        <Image source={{ uri: t.image_url }} style={{ width: "100%", height: 120 }} contentFit="cover" />
                      ) : null}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.stakeCardName, { color: colors.text.primary }]} numberOfLines={1}>{t.name}</Text>
                          {t.venue ? (
                            <Text style={[styles.stakeCardMeta, { color: colors.text.tertiary }]} numberOfLines={1}>{t.venue}</Text>
                          ) : null}
                          {t.buyin ? (
                            <Text style={[styles.stakeCardMeta, { color: colors.text.tertiary }]}>{t.buyin}</Text>
                          ) : null}
                        </View>
                        <View style={[styles.stakeStatusPill, { backgroundColor: labelBg }]}>
                          <Text style={[styles.stakeStatusText, { color: labelColor }]}>{label}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Stakes section ── */}
          {hasStakes && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "#7C3AED15", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="people-outline" size={13} color="#7C3AED" />
                  </View>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Active Staking</Text>
                </View>
                <TouchableOpacity onPress={() => router.navigate("/(tabs)/calendar")}>
                  <Text style={[styles.seeAll, { color: BRAND }]}>Schedule</Text>
                </TouchableOpacity>
              </View>

              {/* Selling */}
              {activeDeals.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.stakesSubLabel, { color: colors.text.tertiary }]}>SELLING</Text>
                  {activeDeals.map((deal) => {
                    const claimedPct  = deal.action_claimed ?? 0;
                    const totalPct    = deal.total_action_selling;
                    const progress    = totalPct > 0 ? claimedPct / totalPct : 0;
                    const isFilled    = deal.status === "filled" || deal.status === "sold_out";
                    const isDraft     = deal.status === "draft";
                    const chipColor   = isDraft ? "#6B7280" : isFilled ? "#22C55E" : deal.status === "paused" ? "#F97316" : "#7C3AED";
                    const chipLabel   = isDraft ? "Draft" : isFilled ? "Filled" : deal.status === "paused" ? "Paused" : deal.status === "closed" ? "Closed" : "Active";
                    return (
                      <TouchableOpacity
                        key={deal.id}
                        onPress={() => router.navigate("/(tabs)/calendar")}
                        activeOpacity={0.75}
                        style={[styles.stakeCard, { backgroundColor: colors.bg.primary, borderColor: "#7C3AED30" }]}
                      >
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                          <View style={[styles.stakeCardIcon, { backgroundColor: "#7C3AED15" }]}>
                            <Ionicons name="trending-up-outline" size={15} color="#7C3AED" />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={[styles.stakeCardName, { color: colors.text.primary }]} numberOfLines={1}>
                              {deal.tournament_name}
                            </Text>
                            <Text style={[styles.stakeCardMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
                              Selling {totalPct}%
                              {deal.price_per_percent ? ` · $${deal.price_per_percent}/% ` : ""}
                              {deal.tournament_date ? ` · ${new Date(deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
                            </Text>
                            {/* Progress bar */}
                            <View style={[styles.progressTrack, { backgroundColor: colors.border.subtle }]}>
                              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: chipColor }]} />
                            </View>
                            <Text style={[styles.stakeCardProgress, { color: chipColor }]}>
                              {claimedPct.toFixed(0)}% of {totalPct}% claimed
                            </Text>
                          </View>
                          <View style={[styles.stakeStatusPill, { backgroundColor: chipColor + "18" }]}>
                            <Text style={[styles.stakeStatusText, { color: chipColor }]}>{chipLabel}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Buying */}
              {activeClaims.length > 0 && (
                <View style={{ gap: 8, marginTop: activeDeals.length > 0 ? 12 : 0 }}>
                  <Text style={[styles.stakesSubLabel, { color: colors.text.tertiary }]}>BUYING</Text>
                  {activeClaims.map((claim) => {
                    const statusColor =
                      claim.status === "confirmed" ? "#22C55E" :
                      claim.status === "pending"   ? "#F97316" : "#8B9AB1";
                    return (
                      <TouchableOpacity
                        key={claim.id}
                        onPress={() => router.navigate("/(tabs)/social")}
                        activeOpacity={0.75}
                        style={[styles.stakeCard, { backgroundColor: colors.bg.primary, borderColor: `${statusColor}30` }]}
                      >
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                          <View style={[styles.stakeCardIcon, { backgroundColor: `${statusColor}15` }]}>
                            <Ionicons name="hand-left-outline" size={15} color={statusColor} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={[styles.stakeCardName, { color: colors.text.primary }]} numberOfLines={1}>
                              {claim.deal?.tournament_name ?? "Tournament"}
                            </Text>
                            <Text style={[styles.stakeCardMeta, { color: colors.text.tertiary }]}>
                              {claim.percent_claimed}% piece
                              {claim.amount_paid != null ? ` · $${claim.amount_paid.toFixed(2)} paid` : ""}
                              {claim.deal?.tournament_date ? ` · ${new Date(claim.deal.tournament_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
                            </Text>
                          </View>
                          <View style={[styles.stakeStatusPill, { backgroundColor: `${statusColor}15` }]}>
                            <Text style={[styles.stakeStatusText, { color: statusColor }]}>
                              {claim.status === "confirmed" ? "Confirmed" : "Pending"}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ── Recent Sessions ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Recent Sessions</Text>
              <TouchableOpacity onPress={() => router.navigate("/(tabs)/history")}>
                <Text style={[styles.seeAll, { color: BRAND }]}>See all</Text>
              </TouchableOpacity>
            </View>

            {recentSessions.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                <Ionicons name="bar-chart-outline" size={36} color={colors.text.tertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No sessions yet</Text>
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>Use the buttons above to start or log a session.</Text>
              </View>
            ) : (
              <View style={[styles.listCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                {recentSessions.map((item, i) => {
                  const isTournament = item.type === "tournament";
                  const bb    = !isTournament ? getBigBlind(item.stakes) : null;
                  const bbVal = bb && item.profit ? Math.round(item.profit / bb) : null;
                  const isLast = i === recentSessions.length - 1;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => router.push({ pathname: "/session-detail", params: { session: JSON.stringify(item) } })}
                      activeOpacity={0.7}
                      style={[styles.sessionRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle }]}
                    >
                      <View style={[styles.sessionIcon, { backgroundColor: isTournament ? "#8B5CF6" : "#F97316" }]}>
                        <Ionicons name={isTournament ? "trophy-outline" : "cash-outline"} size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.sessionTitle, { color: colors.text.primary }]} numberOfLines={1}>
                          {isTournament ? (item.tournamentName || "Tournament") : `${item.stakes} NLH`}
                        </Text>
                        <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
                          {fmtDate(item.date)}{item.venue ? ` · ${item.venue}` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text style={[styles.sessionProfit, { color: item.profit >= 0 ? "#22C55E" : "#EF4444" }]}>
                          {item.profit >= 0 ? "+" : ""}{meta.symbol}{Math.abs(item.profit).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
                        </Text>
                        {bbVal !== null && (
                          <Text style={[styles.sessionBB, { color: colors.text.tertiary }]}>
                            {bbVal >= 0 ? "+" : ""}{bbVal} BB
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <HandReviewLauncher visible={showHandReview} onClose={() => setShowHandReview(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  smIcon: {
    width: 52,
    height: 34,
  },
  topBarGreet: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.7)",
  },
  topBarName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  // P&L card
  plCardWrap: {
    paddingHorizontal: 16,
    marginTop: -18,
    marginBottom: 4,
  },
  plCard: {
    borderRadius: 18,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  plRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 20,
    paddingBottom: 16,
  },
  plLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  plAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  plAmount: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },
  plTrend: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  plCurrencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  plCurrency: {
    fontSize: 12,
    fontWeight: "500",
  },
  hideBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  // Stat strip
  statStrip: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },

  // Quick actions
  quickActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  qaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
  },
  qaBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  qaBtnTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  qaBtnSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 1,
  },

  // Live banner
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#22C55E",
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  liveBannerTitle: {
    color: "#15803D",
    fontSize: 14,
    fontWeight: "700",
  },
  liveBannerSub: {
    color: "#16A34A",
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
  },

  // Body
  body: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Cards
  listCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 4,
  },
  emptyActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    width: "100%",
  },
  emptyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // Session rows
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  sessionIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  sessionMeta: {
    fontSize: 12,
  },
  sessionProfit: {
    fontSize: 14,
    fontWeight: "700",
  },
  sessionBB: {
    fontSize: 11,
  },

  // Stakes section
  stakesSubLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  stakeCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  stakeCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stakeCardName: {
    fontSize: 14,
    fontWeight: "700",
  },
  stakeCardMeta: {
    fontSize: 12,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  stakeCardProgress: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
  stakeStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 2,
    flexShrink: 0,
  },
  stakeStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Notification badge on bell icon
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },

  handReviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  handReviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  handReviewTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  handReviewSub: {
    fontSize: 12,
    marginTop: 1,
  },
});
