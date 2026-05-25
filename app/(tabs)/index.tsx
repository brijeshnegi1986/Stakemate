import { FeatureBanner } from "@/components/FeatureBanner";
import { PaywallModal } from "@/components/PaywallModal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SessionCard } from "@/components/SessionCard";
import { StatsCard } from "@/components/StatsCard";
import { useSubscription } from "@/context/SubscriptionContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Text, TouchableOpacity, View } from "react-native";
import {
  getActiveSession,
  getSessions,
  getSetting,
  Session,
  SessionType,
  setSetting,
} from "../../db/database";

function MiniSparkline({ profits, colors }: { profits: number[]; colors: any }) {
  const data = profits.slice(-8);
  const maxAbs = Math.max(...data.map((v) => Math.abs(v)), 1);
  const CHART_H = 48;
  const BAR_W = 6;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: CHART_H, gap: 3 }}>
      {data.map((profit, i) => (
        <View
          key={i}
          style={{
            width: BAR_W,
            height: Math.max(4, (Math.abs(profit) / maxAbs) * (CHART_H - 4)),
            backgroundColor: profit >= 0 ? colors.bg.brand : colors.bg.danger,
            borderRadius: 2,
            opacity: 0.88,
          }}
        />
      ))}
    </View>
  );
}

function formatLastPlayed(date: Date): string {
  const now = new Date();
  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((todayDay.getTime() - sessionDay.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

type DashboardFilter = "all" | SessionType;

export default function HomeScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { isPro } = useSubscription();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("all");
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Live dot pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Staggered entrance animations
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;
  const anim4 = useRef(new Animated.Value(0)).current;

  // Profit count-up
  const profitCountAnim = useRef(new Animated.Value(0)).current;
  const [displayProfit, setDisplayProfit] = useState(0);
  const listenerRef = useRef<string | null>(null);

  useEffect(() => {
    Animated.stagger(80, [
      Animated.spring(anim1, { toValue: 1, useNativeDriver: true, tension: 70, friction: 11 }),
      Animated.spring(anim2, { toValue: 1, useNativeDriver: true, tension: 70, friction: 11 }),
      Animated.spring(anim3, { toValue: 1, useNativeDriver: true, tension: 70, friction: 11 }),
      Animated.spring(anim4, { toValue: 1, useNativeDriver: true, tension: 70, friction: 11 }),
    ]).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSessions(getSessions() || []);
      const savedFilter = (getSetting("dashboardView") ?? "all") as DashboardFilter;
      const validFilter = ["all", "cash", "tournament"].includes(savedFilter)
        ? savedFilter
        : "all";
      setDashboardFilter(validFilter);
      const live = getActiveSession();
      setActiveSession(live);

      if (live) {
        pulseRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 0.2, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
          ])
        );
        pulseRef.current.start();
      }

      return () => {
        pulseRef.current?.stop();
        pulseAnim.setValue(1);
      };
    }, [])
  );

  const openLive = () => router.push("/live");
  const openAdd  = () => router.push("/add");

  const handleFilterChange = (f: DashboardFilter) => {
    setDashboardFilter(f);
    setSetting("dashboardView", f);
  };

  // Sessions filtered to selected type
  const enabledSessions = useMemo(() => sessions, [sessions]);

  // Sessions matching current filter tab
  const filteredSessions = useMemo(() => {
    if (dashboardFilter === "all") return enabledSessions;
    return enabledSessions.filter((s) => (s.type ?? "cash") === dashboardFilter);
  }, [enabledSessions, dashboardFilter]);

  // Core stats (from filtered set)
  const totalProfit = useMemo(
    () => filteredSessions.reduce((s, x) => s + (x.profit || 0), 0),
    [filteredSessions]
  );
  const totalHours = useMemo(
    () => filteredSessions.reduce((s, x) => s + (x.duration || 0), 0),
    [filteredSessions]
  );
  const hourly = totalHours ? totalProfit / totalHours : 0;

  // Cash win rate (hidden on tournament-only tab)
  const cashWinRate = useMemo(() => {
    if (dashboardFilter === "tournament") return null;
    const cashRows = filteredSessions.filter((s) => (s.type ?? "cash") === "cash");
    if (!cashRows.length) return null;
    return Math.round((cashRows.filter((s) => s.profit >= 0).length / cashRows.length) * 100);
  }, [filteredSessions, dashboardFilter]);

  const performanceLabel =
    dashboardFilter === "all"
      ? "Overall Performance"
      : dashboardFilter === "cash"
      ? "Cash Performance"
      : "Tournament Performance";

  const lastSessionDate = useMemo(() => {
    if (!sessions.length) return null;
    const sorted = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return new Date(sorted[0].date);
  }, [sessions]);

  // Count-up animation re-fires whenever totalProfit changes (including on filter switch)
  useEffect(() => {
    if (listenerRef.current) profitCountAnim.removeListener(listenerRef.current);
    profitCountAnim.setValue(0);
    const id = profitCountAnim.addListener(({ value }) => setDisplayProfit(Math.round(value)));
    listenerRef.current = id;
    Animated.timing(profitCountAnim, {
      toValue: totalProfit,
      duration: 700,
      useNativeDriver: false,
    }).start();
    return () => { profitCountAnim.removeListener(id); };
  }, [totalProfit]);

  const slide = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      <FlatList
        data={filteredSessions.slice(0, 5)}
        keyExtractor={(i) => i.id.toString()}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 148 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={{
                color: colors.text.primary,
                ...typography.body,
                fontWeight: "700",
                fontSize: 20,
                textAlign: "left",
              }}>
                Welcome back
              </Text>
            </View>

            {/* ── Filter tabs ── */}
            <SegmentedControl
              options={[
                { value: "all", label: "All" },
                { value: "cash", label: "Cash" },
                { value: "tournament", label: "Tournament" },
              ]}
              selected={dashboardFilter}
              onChange={handleFilterChange}
              style={{ marginBottom: spacing.lg }}
            />

            {/* ── Active session banner ── */}
            {activeSession && (
              <Animated.View style={slide(anim1)}>
                <TouchableOpacity
                  onPress={() => router.push("/live/active")}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: colors.bg.secondary,
                    borderRadius: radius.lg,
                    padding: spacing.lg,
                    marginBottom: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border.success,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Animated.View style={{
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: colors.bg.success,
                      opacity: pulseAnim,
                    }} />
                    <View>
                      <Text style={{ color: colors.text.success, ...typography.bodySm, fontWeight: "700" }}>
                        Session in progress
                      </Text>
                      <Text style={{ color: colors.text.secondary, ...typography.caption, marginTop: 2 }}>
                        {activeSession.type === "tournament"
                          ? `${activeSession.tournamentName || "Tournament"} · $${activeSession.buyIn} buy-in`
                          : `${activeSession.stakes}${activeSession.venue ? ` • ${activeSession.venue}` : ""} · $${activeSession.buyIn} buy-in`}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.text.brand, ...typography.bodySm, fontWeight: "600" }}>
                    Resume →
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {filteredSessions.length > 0 && (
              <>
                <Text style={{
                  color: colors.text.secondary,
                  ...typography.caption,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  marginBottom: spacing.sm,
                }}>
                  {performanceLabel}
                </Text>

                {/* ── Total profit card ── */}
                <Animated.View style={[slide(anim2), {
                  backgroundColor: colors.bg.secondary,
                  borderRadius: 20,
                  padding: spacing.lg,
                  marginBottom: spacing.lg,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  flexDirection: "row",
                  alignItems: "center",
                }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: colors.text.primary,
                      fontSize: 12,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      fontWeight: "400",
                      lineHeight: 16,
                    }}>
                      {dashboardFilter === "all"
                        ? "TOTAL PROFIT"
                        : dashboardFilter === "cash"
                        ? "CASH PROFIT"
                        : "TOURNAMENT PROFIT"}
                    </Text>
                    <Text style={{
                      fontSize: 32,
                      fontWeight: "900",
                      color: totalProfit >= 0 ? colors.text.brand : colors.text.danger,
                      marginTop: 4,
                      lineHeight: 40,
                      letterSpacing: -0.5,
                    }}>
                      {displayProfit >= 0 ? "+" : "-"}${Math.abs(displayProfit).toFixed(0)}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 16, marginTop: 4 }}>
                      {totalProfit >= 0 ? "↑ Strong performance" : "↓ Needs improvement"}
                    </Text>
                  </View>
                  {filteredSessions.length >= 2 && (
                    <View style={{ paddingLeft: spacing.md }}>
                      <MiniSparkline
                        profits={[...filteredSessions]
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map((s) => s.profit)}
                        colors={colors}
                      />
                    </View>
                  )}
                </Animated.View>

<Animated.View style={[slide(anim3), {
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: spacing.sm,
                  marginBottom: spacing.lg,
                }]}> 
                  <StatsCard label="Hours Played" value={`${totalHours.toFixed(0)}h`} />
                  <StatsCard label="Sessions" value={String(filteredSessions.length)} />
                  <StatsCard label="+$/hr" value={hourly !== 0 ? `${hourly >= 0 ? "+" : "-"}$${Math.abs(hourly).toFixed(0)}` : "—"} />
                  <StatsCard label="Win rate" value={cashWinRate !== null ? `${cashWinRate}%` : "—"} />
                </Animated.View>

                {/* ── Feature banner (free / logged-out users) ── */}
                {!isPro && (
                  <Animated.View style={slide(anim4)}>
                    <FeatureBanner onUpgradePress={() => setPaywallVisible(true)} />
                  </Animated.View>
                )}

                {/* ── Last played card ── */}
                <Animated.View style={[slide(anim4), {
                  backgroundColor: colors.bg.secondary,
                  borderRadius: 8,
                  padding: spacing.lg,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  marginBottom: spacing["2xl"],
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }]}>
                  <View>
                    <Text style={{
                      color: colors.text.tertiary,
                      ...typography.caption,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      fontWeight: "600",
                    }}>
                      Last game played
                    </Text>
                    <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginTop: spacing.xs }}>
                      {lastSessionDate ? formatLastPlayed(lastSessionDate) : "No games yet"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 32 }}>🃏</Text>
                </Animated.View>

                {/* ── Recent sessions header ── */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
                  <Text style={{
                    color: colors.text.secondary,
                    fontSize: 12,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    fontWeight: "600",
                  }}>
                    RECENT SESSIONS
                  </Text>
                  {filteredSessions.length > 5 && (
                    <TouchableOpacity
                      onPress={() => router.navigate("/(tabs)/history")}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                    >
                      <Text style={{ color: colors.text.brand, fontSize: 14, fontWeight: "600" }}>
                        SEE ALL
                      </Text>
                      <Text style={{ color: colors.text.brand, fontSize: 14, fontWeight: "600" }}>
                        →
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: spacing["3xl"] }}>
            {sessions.length === 0 ? (
              <>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🃏</Text>
                <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "600", marginBottom: spacing.xs }}>
                  No sessions yet
                </Text>
                <Text style={{ color: colors.text.secondary, ...typography.bodySm, textAlign: "center" }}>
                  Start a live session or add one manually
                </Text>
                {!isPro && (
                  <View style={{ width: "100%", marginTop: spacing.lg }}>
                    <FeatureBanner onUpgradePress={() => setPaywallVisible(true)} />
                  </View>
                )}

                <View style={{ width: "100%", marginTop: spacing.sm, gap: spacing.md }}>
                  <TouchableOpacity
                    onPress={openLive}
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: colors.bg.brand,
                      borderRadius: 12,
                      paddingVertical: spacing.lg,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.text.onBrand, ...typography.body, fontWeight: "600" }}>
                      New Game
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openAdd}
                    activeOpacity={0.85}
                    style={{
                      borderColor: colors.border.default,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingVertical: spacing.lg,
                      alignItems: "center",
                      backgroundColor: colors.bg.secondary,
                    }}
                  >
                    <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "600" }}>
                      Log Past Session
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>
                  {dashboardFilter === "tournament" ? "🏆" : "🃏"}
                </Text>
                <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "600", marginBottom: spacing.xs }}>
                  No {dashboardFilter} sessions yet
                </Text>
                <Text style={{ color: colors.text.secondary, ...typography.bodySm }}>
                  Switch to All or add a {dashboardFilter} session
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <SessionCard
            venue={item.type === "tournament" ? (item.tournamentName || "Tournament") : (item.venue || "Unknown venue")}
            stakes={item.type === "tournament" ? "Tournament" : item.stakes}
            date={new Date(item.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            profit={item.profit}
            onPress={() => router.push({ pathname: "/session-detail", params: { session: JSON.stringify(item) } })}
          />
        )}
      />

    </View>
  );
}

