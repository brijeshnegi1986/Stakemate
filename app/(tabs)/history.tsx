import { SessionFAB } from "@/components/SessionFAB";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getRebuysTotal,
  getSessions,
  getSetting,
  Session,
  SessionType,
} from "../../db/database";

type Filter = "all" | SessionType;

const BRAND  = "#155DFC";
const GREEN  = "#22C55E";
const RED    = "#EF4444";
const ORANGE = "#F97316";
const PURPLE = "#0891B2";

const CURRENCY_META: Record<string, { flag: string; symbol: string }> = {
  AUD: { flag: "🇦🇺", symbol: "$" },
  USD: { flag: "🇺🇸", symbol: "$" },
  GBP: { flag: "🇬🇧", symbol: "£" },
  NZD: { flag: "🇳🇿", symbol: "$" },
};

const SCREEN_W = Dimensions.get("window").width;

// ── Chart ──────────────────────────────────────────────────────────────────────

function LineSegment({ x1, y1, x2, y2, color }: {
  x1: number; y1: number; x2: number; y2: number; color: string;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const baseStyle = {
    position: "absolute" as const,
    left: cx - length / 2,
    borderRadius: 3,
    transform: [{ rotate: `${angle}deg` }],
  };
  return (
    <>
      {/* Glow bloom layer */}
      <View style={{
        ...baseStyle,
        top: cy - 4,
        width: length,
        height: 8,
        backgroundColor: color + "30",
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
      }} />
      {/* Sharp stroke */}
      <View style={{
        ...baseStyle,
        top: cy - 1.5,
        width: length,
        height: 3,
        backgroundColor: color,
        shadowColor: color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.55,
        shadowRadius: 5,
      }} />
    </>
  );
}

function ProfitChart({ sessions, colors, symbol }: { sessions: Session[]; colors: any; symbol: string }) {
  const CHART_H = 140;
  const LABEL_W = 56;
  const chartW  = SCREEN_W - 64 - LABEL_W;

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [sessions]
  );

  const cumulative = useMemo(() => {
    let r = 0;
    return sorted.map((s) => { r += s.profit; return r; });
  }, [sorted]);

  const hasData = cumulative.length >= 2;
  const minVal  = hasData ? Math.min(...cumulative, 0) : 0;
  const maxVal  = hasData ? Math.max(...cumulative, 0) : 0;
  const range   = maxVal - minVal || 1;

  const points = cumulative.map((v, i) => ({
    x: (i / (cumulative.length - 1)) * chartW,
    y: CHART_H - ((v - minVal) / range) * CHART_H,
  }));

  const last      = cumulative[cumulative.length - 1] ?? 0;
  const lineColor = last >= 0 ? GREEN : RED;

  const fmtY = (v: number) => {
    const abs = Math.abs(v);
    const sign = v >= 0 ? "+" : "-";
    if (abs >= 10000) return `${sign}${symbol}${(abs / 1000).toFixed(0)}k`;
    if (abs >= 1000)  return `${sign}${symbol}${(abs / 1000).toFixed(1)}k`;
    return `${sign}${symbol}${abs.toFixed(0)}`;
  };

  const firstDate = sorted.length
    ? new Date(sorted[0].date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
    : "—";
  const lastDate = sorted.length
    ? new Date(sorted[sorted.length - 1].date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
    : "—";

  const zeroY = hasData && minVal < 0 && maxVal > 0
    ? CHART_H - ((0 - minVal) / range) * CHART_H
    : null;

  // Pre-compute area fill: vertical slices from line Y down to chart bottom
  const fillSlices = useMemo(() => {
    if (!hasData || points.length < 2) return [];
    const STEP = 3;
    const maxX = Math.ceil(points[points.length - 1].x);
    const slices: { x: number; y: number; h: number }[] = [];
    for (let x = 0; x <= maxX; x += STEP) {
      let lineY = CHART_H;
      for (let i = 0; i < points.length - 1; i++) {
        if (x >= points[i].x && x <= points[i + 1].x) {
          const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
          lineY = points[i].y + t * (points[i + 1].y - points[i].y);
          break;
        }
      }
      const h = CHART_H - lineY;
      if (h > 0) slices.push({ x, y: lineY, h });
    }
    return slices;
  }, [hasData, points, CHART_H]);

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, { color: colors.text.primary }]}>Bankroll Curve</Text>
        {hasData && (
          <Text style={[styles.chartCurrentVal, { color: lineColor }]}>{fmtY(last)}</Text>
        )}
      </View>

      <View style={{ flexDirection: "row" }}>
        {/* Y-axis */}
        {hasData && (
          <View style={{ width: LABEL_W, height: CHART_H }}>
            <Text style={[styles.chartAxisLabel, { color: colors.text.tertiary, position: "absolute", top: 0 }]}>
              {fmtY(maxVal)}
            </Text>
            {zeroY !== null && (
              <Text style={[styles.chartAxisLabel, { color: colors.text.tertiary, position: "absolute", top: zeroY - 8 }]}>
                {symbol}0
              </Text>
            )}
            <Text style={[styles.chartAxisLabel, { color: colors.text.tertiary, position: "absolute", bottom: 0 }]}>
              {fmtY(minVal)}
            </Text>
          </View>
        )}

        {/* Chart area */}
        <View style={{ flex: 1, height: CHART_H, position: "relative" }}>
          {/* Zero baseline */}
          {zeroY !== null && (
            <View style={{
              position: "absolute", left: 0, right: 0,
              top: zeroY, height: StyleSheet.hairlineWidth,
              backgroundColor: colors.border.subtle,
            }} />
          )}

          {hasData ? (
            <>
              {/* Area fill — gradient slices below the line */}
              {fillSlices.map((s, i) => (
                <LinearGradient
                  key={i}
                  colors={[lineColor + "45", lineColor + "00"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{
                    position: "absolute",
                    left: s.x,
                    top: s.y,
                    width: 3,
                    height: s.h,
                  }}
                />
              ))}
              {/* Line segments with glow */}
              {points.slice(0, -1).map((pt, i) => (
                <LineSegment key={i} x1={pt.x} y1={pt.y} x2={points[i + 1].x} y2={points[i + 1].y} color={lineColor} />
              ))}
              {/* End dot — outer glow ring */}
              <View style={{
                position: "absolute",
                left: points[points.length - 1].x - 9,
                top:  points[points.length - 1].y - 9,
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: lineColor + "28",
              }} />
              {/* End dot — solid */}
              <View style={{
                position: "absolute",
                left: points[points.length - 1].x - 5,
                top:  points[points.length - 1].y - 5,
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: lineColor,
                shadowColor: lineColor,
                shadowOpacity: 0.8,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              }} />
              {/* Start dot */}
              <View style={{
                position: "absolute",
                left: points[0].x - 4,
                top:  points[0].y - 4,
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: colors.bg.primary,
                borderWidth: 2,
                borderColor: lineColor,
              }} />
            </>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Ionicons name="trending-up-outline" size={32} color={colors.text.tertiary} />
              <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Log sessions to see your curve</Text>
            </View>
          )}
        </View>
      </View>

      {hasData && (
        <View style={styles.chartFooter}>
          <Text style={[styles.chartDate, { color: colors.text.tertiary }]}>{firstDate}</Text>
          <Text style={[styles.chartDate, { color: colors.text.tertiary }]}>{sessions.length} sessions</Text>
          <Text style={[styles.chartDate, { color: colors.text.tertiary }]}>{lastDate}</Text>
        </View>
      )}
    </View>
  );
}

// ── Stat card (2×2 grid) ──────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, iconColor, valueColor, colors }: {
  label: string; value: string; sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string; valueColor?: string; colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={[styles.statCardIcon, { backgroundColor: iconColor + "15" }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={[styles.statCardValue, { color: valueColor ?? colors.text.primary }]}>{value}</Text>
      <Text style={[styles.statCardLabel, { color: colors.text.tertiary }]}>{label}</Text>
      {sub ? <Text style={[styles.statCardSub, { color: colors.text.tertiary }]}>{sub}</Text> : null}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { colors } = usePokerTheme();
  const { isSyncing, user } = useAuth();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions]           = useState<Session[]>([]);
  const [filter, setFilter]               = useState<Filter>(() => {
    const saved = getSetting("dashboardView") ?? "all";
    return (saved === "cash" || saved === "tournament") ? saved : "all";
  });
  const [currency, setCurrency]           = useState("AUD");
  const [showAddSheet, setShowAddSheet]   = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setSessions(getSessions() || []);
      setCurrency(getSetting("currency") ?? "AUD");
      const saved = getSetting("dashboardView") ?? "all";
      setFilter((saved === "cash" || saved === "tournament") ? saved : "all");
    }, [])
  );

  // Reload from SQLite once cloud sync completes
  useEffect(() => {
    if (!isSyncing) {
      setSessions(getSessions() || []);
      setCurrency(getSetting("currency") ?? "AUD");
    }
  }, [isSyncing]);

  const meta = CURRENCY_META[currency] ?? CURRENCY_META.AUD;

  const filtered = useMemo(() => {
    if (filter === "all") return sessions;
    return sessions.filter((s) => (s.type ?? "cash") === filter);
  }, [sessions, filter]);

  const totalProfit   = useMemo(() => filtered.reduce((s, x) => s + (x.profit || 0), 0), [filtered]);
  const totalHours    = useMemo(() => filtered.reduce((s, x) => s + (x.duration || 0), 0), [filtered]);
  const totalExpenses = useMemo(
    () => filtered.reduce((s, x) => s + (x.buyIn || 0) + getRebuysTotal(x), 0),
    [filtered]
  );

  const avgPerHour    = totalHours > 0 ? totalProfit / totalHours : null;
  const avgPerSession = filtered.length > 0 ? totalProfit / filtered.length : null;
  const winRate       = filtered.length > 0
    ? Math.round((filtered.filter((s) => s.profit >= 0).length / filtered.length) * 100)
    : null;
  const roi = totalExpenses > 0 ? (totalProfit / totalExpenses) * 100 : null;

  const bestSession  = filtered.length > 0
    ? filtered.reduce((b, s) => s.profit > b.profit ? s : b)
    : null;
  const worstSession = filtered.length > 0
    ? filtered.reduce((w, s) => s.profit < w.profit ? s : w)
    : null;

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filtered]
  );

  const { streak, streakType } = useMemo(() => {
    if (sorted.length === 0) return { streak: 0, streakType: "none" as const };
    let count = 0;
    const isWin = sorted[0].profit >= 0;
    for (const s of sorted) {
      if ((s.profit >= 0) === isWin) count++;
      else break;
    }
    return { streak: count, streakType: isWin ? "win" as const : "loss" as const };
  }, [sorted]);

  const fmtHours = (h: number) => {
    const hrs = Math.floor(h);
    const min = Math.round((h - hrs) * 60);
    return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
  };

  const fmtMoney = (n: number, dec = 0) =>
    `${n >= 0 ? "+" : "-"}${meta.symbol}${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

  const profitIsPositive = totalProfit >= 0;

  const sessionLabel = (s: Session) =>
    s.type === "tournament" ? (s.tournamentName || "Tournament") : `${s.stakes} NLH`;

  const hasBanner = isSyncing || !user;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>

      {/* ── Banners — fixed above ScrollView, clear the status bar ── */}
      {isSyncing && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: "#EFF6FF" }}>
          <ActivityIndicator size="small" color={BRAND} />
          <Text style={{ color: BRAND, fontSize: 13, fontWeight: "500" }}>Syncing your data…</Text>
        </View>
      )}

      {!user && !isSyncing && (
        <TouchableOpacity
          onPress={() => router.push("/welcome")}
          activeOpacity={0.85}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#FEF3C7", borderBottomWidth: 1, borderBottomColor: "#FDE68A" }}
        >
          <Ionicons name="cloud-offline-outline" size={18} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#92400E" }}>Your data is not being backed up</Text>
            <Text style={{ fontSize: 12, color: "#B45309", marginTop: 1 }}>Sign in to save your sessions to the cloud</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#D97706" />
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── Blue header (inside ScrollView so negative-margin card can overlap it) ── */}
        <View style={[styles.topBar, { backgroundColor: BRAND, paddingTop: hasBanner ? 10 : insets.top + 10 }]}>
          <View style={styles.topBarRow}>
            <Text style={styles.topBarTitle}>Bankroll</Text>
            <View style={styles.filterChips}>
              {(["all", "cash", "tournament"] as Filter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.chip, filter === f ? styles.chipActive : styles.chipInactive]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.chipText, { color: filter === f ? BRAND : "rgba(255,255,255,0.75)" }]}>
                    {f === "all" ? "All" : f === "cash" ? "Cash" : "Tourney"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── P&L floating card ── */}
        <View style={styles.plCardWrap}>
          <View style={[styles.plCard, { backgroundColor: colors.bg.primary, shadowColor: colors.text.primary }]}>
            <View style={styles.plRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plLabel, { color: colors.text.tertiary }]}>
                  {filter === "all" ? "Total P&L" : filter === "cash" ? "Cash P&L" : "Tournament P&L"}
                </Text>
                {balanceHidden ? (
                  <Text style={[styles.plAmount, { color: colors.text.tertiary }]}>••••••</Text>
                ) : (
                  <Text style={[styles.plAmount, { color: profitIsPositive ? GREEN : RED }]}>
                    {profitIsPositive ? "+" : "-"}{meta.symbol}
                    {Math.abs(totalProfit).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                )}
                <View style={styles.plMeta}>
                  <Text style={{ fontSize: 14 }}>{meta.flag}</Text>
                  <Text style={[styles.plCurrency, { color: colors.text.tertiary }]}>{currency}</Text>
                  {streak >= 2 && (
                    <View style={[styles.streakPill, { backgroundColor: streakType === "win" ? GREEN + "20" : RED + "20" }]}>
                      <Ionicons
                        name={streakType === "win" ? "flame" : "skull-outline"}
                        size={10}
                        color={streakType === "win" ? GREEN : RED}
                      />
                      <Text style={{ fontSize: 10, fontWeight: "700", color: streakType === "win" ? GREEN : RED }}>
                        {streak} {streakType === "win" ? "win" : "loss"} streak
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.plActions}>
                <View style={[styles.trendBadge, { backgroundColor: profitIsPositive ? GREEN + "18" : RED + "18" }]}>
                  <Ionicons
                    name={profitIsPositive ? "trending-up" : "trending-down"}
                    size={16}
                    color={profitIsPositive ? GREEN : RED}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setBalanceHidden((h) => !h)}
                  style={[styles.hideBtn, { backgroundColor: colors.bg.secondary }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={balanceHidden ? "eye-outline" : "eye-off-outline"} size={15} color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Stat strip */}
            <View style={[styles.statStrip, { borderTopColor: colors.border.subtle }]}>
              {[
                { label: "Sessions", value: filtered.length.toString() },
                { label: "Hours",    value: totalHours > 0 ? fmtHours(totalHours) : "—" },
                { label: "Win Rate", value: winRate !== null ? `${winRate}%` : "—", color: winRate !== null ? (winRate >= 50 ? GREEN : RED) : undefined },
                {
                  label: "Avg/Hr",
                  value: avgPerHour !== null ? `${avgPerHour >= 0 ? "+" : "-"}${meta.symbol}${Math.abs(avgPerHour).toFixed(0)}` : "—",
                  color: avgPerHour !== null ? (avgPerHour >= 0 ? GREEN : RED) : undefined,
                },
              ].map((stat, i, arr) => (
                <View key={stat.label} style={[
                  styles.statCell,
                  i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border.subtle },
                ]}>
                  <Text style={[styles.statValue, { color: stat.color ?? colors.text.primary }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.body}>

          {/* ── Chart ── */}
          <View style={styles.section}>
            <View style={[styles.bankrollNudge, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
              <Ionicons name="bar-chart-outline" size={15} color={BRAND} />
              <Text style={[styles.bankrollNudgeText, { color: colors.text.tertiary }]}>
                {filtered.length === 0
                  ? "Log your first session to start tracking your bankroll curve and performance over time."
                  : "Every session logged is a data point. Consistent tracking reveals your true edge at the table."}
              </Text>
            </View>
            <ProfitChart sessions={filtered} colors={colors} symbol={meta.symbol} />
          </View>

          {/* ── Performance grid ── */}
          {filtered.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Performance</Text>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Avg / Session"
                  value={avgPerSession !== null ? fmtMoney(avgPerSession) : "—"}
                  icon="analytics-outline"
                  iconColor={BRAND}
                  valueColor={avgPerSession !== null ? (avgPerSession >= 0 ? GREEN : RED) : undefined}
                  colors={colors}
                />
                <StatCard
                  label="Avg / Hour"
                  value={avgPerHour !== null ? fmtMoney(avgPerHour) : "—"}
                  sub={totalHours > 0 ? `${fmtHours(totalHours)} played` : undefined}
                  icon="time-outline"
                  iconColor={ORANGE}
                  valueColor={avgPerHour !== null ? (avgPerHour >= 0 ? GREEN : RED) : undefined}
                  colors={colors}
                />
                <StatCard
                  label="Win Rate"
                  value={winRate !== null ? `${winRate}%` : "—"}
                  sub={winRate !== null ? `${filtered.filter(s => s.profit >= 0).length} of ${filtered.length} sessions` : undefined}
                  icon="checkmark-circle-outline"
                  iconColor={GREEN}
                  valueColor={winRate !== null ? (winRate >= 50 ? GREEN : RED) : undefined}
                  colors={colors}
                />
                <StatCard
                  label="ROI"
                  value={roi !== null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` : "—"}
                  sub={totalExpenses > 0 ? `${meta.symbol}${totalExpenses.toLocaleString("en-AU", { maximumFractionDigits: 0 })} invested` : undefined}
                  icon="wallet-outline"
                  iconColor={PURPLE}
                  valueColor={roi !== null ? (roi >= 0 ? GREEN : RED) : undefined}
                  colors={colors}
                />
              </View>
            </View>
          )}

          {/* ── Best / Worst highlights ── */}
          {bestSession && worstSession && bestSession.id !== worstSession.id && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Highlights</Text>
              <View style={styles.highlightRow}>
                <TouchableOpacity
                  style={[styles.highlightCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                  onPress={() => router.push({ pathname: "/session-detail", params: { session: JSON.stringify(bestSession) } })}
                  activeOpacity={0.75}
                >
                  <View style={[styles.highlightBadge, { backgroundColor: GREEN + "18" }]}>
                    <Ionicons name="arrow-up" size={14} color={GREEN} />
                  </View>
                  <Text style={[styles.highlightKicker, { color: colors.text.tertiary }]}>Best Session</Text>
                  <Text style={[styles.highlightValue, { color: GREEN }]}>
                    +{meta.symbol}{bestSession.profit.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={[styles.highlightSub, { color: colors.text.tertiary }]} numberOfLines={1}>
                    {sessionLabel(bestSession)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.highlightCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                  onPress={() => router.push({ pathname: "/session-detail", params: { session: JSON.stringify(worstSession) } })}
                  activeOpacity={0.75}
                >
                  <View style={[styles.highlightBadge, { backgroundColor: RED + "18" }]}>
                    <Ionicons name="arrow-down" size={14} color={RED} />
                  </View>
                  <Text style={[styles.highlightKicker, { color: colors.text.tertiary }]}>Worst Session</Text>
                  <Text style={[styles.highlightValue, { color: RED }]}>
                    {worstSession.profit < 0 ? `-${meta.symbol}${Math.abs(worstSession.profit).toLocaleString("en-AU", { maximumFractionDigits: 0 })}` : `${meta.symbol}${worstSession.profit.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`}
                  </Text>
                  <Text style={[styles.highlightSub, { color: colors.text.tertiary }]} numberOfLines={1}>
                    {sessionLabel(worstSession)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Session list ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>All Sessions</Text>
              {filtered.length > 0 && (
                <Text style={[styles.sectionCount, { color: colors.text.tertiary }]}>{filtered.length}</Text>
              )}
            </View>

            {sorted.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                <Ionicons name="bar-chart-outline" size={40} color={colors.text.tertiary} />
                <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No sessions yet</Text>
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
                  {filter !== "all"
                    ? `No ${filter} sessions recorded yet.`
                    : "Start tracking your poker sessions to see your statistics here."}
                </Text>
              </View>
            ) : (
              <View style={[styles.listCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                {sorted.map((item, i) => {
                  const isTournament = item.type === "tournament";
                  const isLast       = i === sorted.length - 1;
                  const bb           = !isTournament && item.stakes?.includes("/")
                    ? parseFloat(item.stakes.split("/")[1])
                    : null;
                  const bbVal = bb && !isNaN(bb) && item.profit != null
                    ? Math.round(item.profit / bb)
                    : null;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => router.push({ pathname: "/session-detail", params: { session: JSON.stringify(item) } })}
                      activeOpacity={0.7}
                      style={[
                        styles.sessionRow,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                      ]}
                    >
                      <View style={[styles.sessionIcon, { backgroundColor: isTournament ? PURPLE : ORANGE }]}>
                        <Ionicons name={isTournament ? "trophy-outline" : "cash-outline"} size={16} color="#fff" />
                      </View>

                      <View style={styles.sessionBody}>
                        <Text style={[styles.sessionTitle, { color: colors.text.primary }]} numberOfLines={1}>
                          {sessionLabel(item)}
                        </Text>
                        <View style={styles.sessionMetaRow}>
                          {item.venue ? (
                            <>
                              <Ionicons name="location-outline" size={11} color={colors.text.tertiary} />
                              <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
                                {item.venue}
                              </Text>
                              <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]}>·</Text>
                            </>
                          ) : null}
                          <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]}>
                            {new Date(item.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                          </Text>
                          {item.duration ? (
                            <>
                              <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]}>·</Text>
                              <Ionicons name="time-outline" size={10} color={colors.text.tertiary} />
                              <Text style={[styles.sessionMeta, { color: colors.text.tertiary }]}>{fmtHours(item.duration)}</Text>
                            </>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.sessionRight}>
                        <Text style={[styles.sessionProfit, { color: item.profit >= 0 ? GREEN : RED }]}>
                          {item.profit >= 0 ? "+" : "-"}{meta.symbol}
                          {Math.abs(item.profit).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
                        </Text>
                        {bbVal !== null ? (
                          <Text style={[styles.sessionBB, { color: colors.text.tertiary }]}>
                            {bbVal >= 0 ? "+" : ""}{bbVal} BB
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <SessionFAB onPress={() => setShowAddSheet(true)} />

      {/* ── Add Session Sheet ── */}
      <Modal visible={showAddSheet} transparent animationType="slide" onRequestClose={() => setShowAddSheet(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowAddSheet(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.bg.primary, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border.default }]} />
          <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>New Session</Text>
          <TouchableOpacity
            onPress={() => { setShowAddSheet(false); setTimeout(() => router.push("/live"), 150); }}
            activeOpacity={0.85}
            style={[styles.sheetBtn, { backgroundColor: GREEN }]}
          >
            <View style={styles.sheetBtnIcon}><Ionicons name="timer-outline" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetBtnTitle}>Start Live Session</Text>
              <Text style={styles.sheetBtnSub}>Track your session in real time</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setShowAddSheet(false); setTimeout(() => router.push("/add-session"), 150); }}
            activeOpacity={0.85}
            style={[styles.sheetBtn, { backgroundColor: BRAND }]}
          >
            <View style={styles.sheetBtnIcon}><Ionicons name="checkmark-done-outline" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetBtnTitle}>Add Completed Session</Text>
              <Text style={styles.sheetBtnSub}>Log a session you already played</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  filterChips: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  chipActive:   { backgroundColor: "#fff" },
  chipInactive: { backgroundColor: "rgba(255,255,255,0.18)" },
  chipText: { fontSize: 12, fontWeight: "600" },

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
  plAmount: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 6,
  },
  plMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  plCurrency: { fontSize: 12, fontWeight: "500" },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 2,
  },
  plActions: { gap: 8, marginLeft: 12, marginTop: 4 },
  trendBadge: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  hideBtn: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },

  // Stat strip
  statStrip: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14 },
  statValue: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  statLabel: { fontSize: 11, fontWeight: "500" },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 20 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 10 },
  sectionCount: { fontSize: 14, fontWeight: "500", marginTop: -10 },

  // Chart
  chartCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  chartTitle: { fontSize: 15, fontWeight: "700" },
  chartCurrentVal: { fontSize: 14, fontWeight: "700" },
  chartAxisLabel: { fontSize: 10, fontWeight: "500" },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  chartDate: { fontSize: 11 },

  // Stats grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: (SCREEN_W - 32 - 10) / 2,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  statCardIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  statCardValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5, marginBottom: 2 },
  statCardLabel: { fontSize: 12, fontWeight: "600" },
  statCardSub:   { fontSize: 11, marginTop: 3 },

  // Highlights
  highlightRow: { flexDirection: "row", gap: 10 },
  highlightCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  highlightBadge: {
    width: 28, height: 28, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  highlightKicker: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  highlightValue:  { fontSize: 18, fontWeight: "800", letterSpacing: -0.5, marginBottom: 2 },
  highlightSub:    { fontSize: 12 },

  // Session list
  listCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  emptyCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  emptyText:  { fontSize: 13, textAlign: "center", lineHeight: 19 },
  sessionRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
  },
  sessionIcon: {
    width: 38, height: 38, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  sessionBody: { flex: 1, gap: 3 },
  sessionTitle: { fontSize: 14, fontWeight: "600" },
  sessionMetaRow: {
    flexDirection: "row", alignItems: "center", gap: 3, flexWrap: "wrap",
  },
  sessionMeta: { fontSize: 12 },
  sessionRight: { alignItems: "flex-end", gap: 2 },
  sessionProfit: { fontSize: 14, fontWeight: "700" },
  sessionBB: { fontSize: 11 },

  // Sheet
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  sheetBtn: {
    flexDirection: "row", alignItems: "center",
    gap: 14, borderRadius: 16, padding: 16, marginBottom: 12,
  },
  sheetBtnIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  sheetBtnTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetBtnSub:   { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },

  bankrollNudge: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, marginBottom: 10,
  },
  bankrollNudgeText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
