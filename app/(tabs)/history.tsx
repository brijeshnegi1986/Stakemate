import { SessionFAB } from "@/components/SessionFAB";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
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

const BRAND = "#155DFC";

const CURRENCY_META: Record<string, { flag: string; symbol: string }> = {
  AUD: { flag: "🇦🇺", symbol: "$" },
  USD: { flag: "🇺🇸", symbol: "$" },
  GBP: { flag: "🇬🇧", symbol: "£" },
  NZD: { flag: "🇳🇿", symbol: "$" },
};

const SCREEN_W = Dimensions.get("window").width;

// ── Inline line chart ──────────────────────────────────────────────────────────
function LineSegment({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  return (
    <View
      style={{
        position: "absolute",
        left: cx - length / 2,
        top: cy - 1,
        width: length,
        height: 2.5,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function ProfitChart({ sessions, colors, symbol }: { sessions: Session[]; colors: any; symbol: string }) {
  const CHART_H = 110;
  const chartW  = SCREEN_W - 80;

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
  const lineColor = last >= 0 ? "#22C55E" : "#EF4444";

  const firstDate = sorted.length
    ? new Date(sorted[0].date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
    : "—";
  const lastDate = sorted.length
    ? new Date(sorted[sorted.length - 1].date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
    : "—";

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, { color: colors.text.primary }]}>Profit Over Time</Text>
        <Text style={[styles.chartSub, { color: colors.text.tertiary }]}>
          {hasData ? `${sessions.length} sessions` : "No data yet"}
        </Text>
      </View>

      <View style={{ height: CHART_H, position: "relative" }}>
        {hasData && minVal < 0 && maxVal > 0 && (
          <View style={[styles.zeroLine, {
            top: CHART_H - ((0 - minVal) / range) * CHART_H,
            borderColor: colors.border.subtle,
          }]} />
        )}
        {hasData ? (
          points.slice(0, -1).map((pt, i) => (
            <LineSegment key={i} x1={pt.x} y1={pt.y} x2={points[i + 1].x} y2={points[i + 1].y} color={lineColor} />
          ))
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Log sessions to see your chart</Text>
          </View>
        )}
      </View>

      <View style={styles.chartFooter}>
        <Text style={[styles.chartDate, { color: colors.text.tertiary }]}>{firstDate}</Text>
        <Text style={[styles.chartDate, { color: colors.text.tertiary }]}>stakemate.app</Text>
        <Text style={[styles.chartDate, { color: colors.text.tertiary }]}>{lastDate}</Text>
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions]         = useState<Session[]>([]);
  const [filter, setFilter]             = useState<Filter>("all");
  const [currency, setCurrency]         = useState("AUD");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setSessions(getSessions() || []);
      setCurrency(getSetting("currency") ?? "AUD");
    }, [])
  );

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

  const fmtHours = (h: number) => {
    const hrs = Math.floor(h);
    const min = Math.round((h - hrs) * 60);
    return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
  };

  const fmtMoney = (n: number, decimals = 0) =>
    `${n >= 0 ? "+" : "-"}${meta.symbol}${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

  const profitIsPositive = totalProfit >= 0;
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filtered]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.secondary }]}>
      {/* ── Sticky top bar ── */}
      <View style={[styles.topBar, { backgroundColor: colors.bg.primary, paddingTop: insets.top + 10, borderBottomColor: colors.border.default }]}>
        <View style={styles.topBarLeft}>
          <Image source={require("@/assets/images/SM.svg")} style={styles.smIcon} contentFit="contain" />
          <Text style={[styles.topBarTitle, { color: colors.text.primary }]}>Stats</Text>
        </View>

        {/* Filter chips */}
        <View style={styles.filterChips}>
          {(["all", "cash", "tournament"] as Filter[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.chip, filter === f && { backgroundColor: BRAND }]}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, { color: filter === f ? "#fff" : colors.text.tertiary }]}>
                {f === "all" ? "All" : f === "cash" ? "Cash" : "Tourney"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── P&L hero ── */}
        <View style={[styles.plHero, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <View style={styles.plRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.plLabel, { color: colors.text.tertiary }]}>
                {filter === "all" ? "Total P&L" : filter === "cash" ? "Cash P&L" : "Tournament P&L"}
              </Text>
              {balanceHidden ? (
                <Text style={[styles.plAmount, { color: colors.text.tertiary }]}>••••••</Text>
              ) : (
                <Text style={[styles.plAmount, { color: profitIsPositive ? "#22C55E" : "#EF4444" }]}>
                  {profitIsPositive ? "+" : "-"}{meta.symbol}
                  {Math.abs(totalProfit).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              )}
              <View style={styles.plCurrencyRow}>
                <Text style={{ fontSize: 14 }}>{meta.flag}</Text>
                <Text style={[styles.plCurrency, { color: colors.text.tertiary }]}>{currency}</Text>
              </View>
            </View>
            <View style={styles.plRight}>
              <View style={[styles.trendBadge, { backgroundColor: profitIsPositive ? "#22C55E18" : "#EF444418" }]}>
                <Ionicons
                  name={profitIsPositive ? "trending-up" : "trending-down"}
                  size={16}
                  color={profitIsPositive ? "#22C55E" : "#EF4444"}
                />
              </View>
              <TouchableOpacity
                onPress={() => setBalanceHidden((h) => !h)}
                style={[styles.hideBtn, { backgroundColor: colors.bg.secondary }]}
              >
                <Ionicons name={balanceHidden ? "eye-outline" : "eye-off-outline"} size={15} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 4-stat strip ── */}
          <View style={[styles.statStrip, { borderTopColor: colors.border.subtle }]}>
            {[
              { label: "Sessions", value: filtered.length.toString() },
              { label: "Hours",    value: totalHours > 0 ? fmtHours(totalHours) : "—" },
              { label: "Win Rate", value: winRate !== null ? `${winRate}%` : "—" },
              {
                label: "Avg/Hr",
                value: avgPerHour !== null ? `${avgPerHour >= 0 ? "+" : "-"}${meta.symbol}${Math.abs(avgPerHour).toFixed(0)}` : "—",
                color: avgPerHour !== null ? (avgPerHour >= 0 ? "#22C55E" : "#EF4444") : undefined,
              },
            ].map((stat, i, arr) => (
              <View
                key={stat.label}
                style={[
                  styles.statCell,
                  i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border.subtle },
                ]}
              >
                <Text style={[styles.statValue, { color: stat.color ?? colors.text.primary }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.body}>
          {/* ── Chart ── */}
          <View style={styles.section}>
            <ProfitChart sessions={filtered} colors={colors} symbol={meta.symbol} />
          </View>

          {/* ── Secondary stats ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Breakdown</Text>
            <View style={[styles.breakdownCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
              {[
                {
                  label: "Avg. Profit / Session",
                  icon: "analytics-outline" as const,
                  iconColor: BRAND,
                  value: avgPerSession !== null ? fmtMoney(avgPerSession, 2) : "—",
                  valueColor: avgPerSession !== null ? (avgPerSession >= 0 ? "#22C55E" : "#EF4444") : undefined,
                },
                {
                  label: "Profitable Sessions",
                  icon: "checkmark-circle-outline" as const,
                  iconColor: "#22C55E",
                  value: winRate !== null ? `${winRate}%` : "—",
                  valueColor: winRate !== null ? "#22C55E" : undefined,
                },
                {
                  label: "Total Playing Hours",
                  icon: "time-outline" as const,
                  iconColor: "#F97316",
                  value: totalHours > 0 ? fmtHours(totalHours) : "—",
                },
                {
                  label: "Total Expenses (Buy-ins)",
                  icon: "wallet-outline" as const,
                  iconColor: "#EF4444",
                  value: `${meta.symbol}${Math.abs(totalExpenses).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
                  valueColor: "#EF4444",
                },
              ].map((row, i, arr) => (
                <View
                  key={row.label}
                  style={[
                    styles.breakdownRow,
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                  ]}
                >
                  <View style={[styles.breakdownIcon, { backgroundColor: `${row.iconColor}18` }]}>
                    <Ionicons name={row.icon} size={16} color={row.iconColor} />
                  </View>
                  <Text style={[styles.breakdownLabel, { color: colors.text.secondary }]} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={[styles.breakdownValue, { color: row.valueColor ?? colors.text.primary }]}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Session list ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Sessions</Text>
              <Text style={[styles.sectionCount, { color: colors.text.tertiary }]}>{filtered.length}</Text>
            </View>

            {sorted.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                <Ionicons name="time-outline" size={36} color={colors.text.tertiary} />
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
                  No sessions yet. Tap + to add one.
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
                  const bbVal        = bb && !isNaN(bb) && item.profit != null
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
                      <View style={[styles.sessionIcon, { backgroundColor: isTournament ? "#8B5CF6" : "#F97316" }]}>
                        <Ionicons name={isTournament ? "trophy-outline" : "cash-outline"} size={16} color="#fff" />
                      </View>

                      <View style={styles.sessionBody}>
                        <Text style={[styles.sessionTitle, { color: colors.text.primary }]} numberOfLines={1}>
                          {isTournament ? (item.tournamentName || "Tournament") : `${item.stakes} NLH`}
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
                        </View>
                      </View>

                      <View style={styles.sessionRight}>
                        <Text style={[styles.sessionProfit, { color: item.profit >= 0 ? "#22C55E" : "#EF4444" }]}>
                          {item.profit >= 0 ? "+" : ""}{meta.symbol}
                          {Math.abs(item.profit).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
                        </Text>
                        {bbVal !== null ? (
                          <Text style={[styles.sessionBB, { color: colors.text.tertiary }]}>
                            {bbVal >= 0 ? "+" : ""}{bbVal} BB
                          </Text>
                        ) : item.duration ? (
                          <Text style={[styles.sessionBB, { color: colors.text.tertiary }]}>
                            {fmtHours(item.duration)}
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
            style={[styles.sheetBtn, { backgroundColor: "#22C55E" }]}
          >
            <View style={styles.sheetBtnIcon}><Ionicons name="timer-outline" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetBtnTitle}>Start Live Session</Text>
              <Text style={styles.sheetBtnSub}>Track your session in real time</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setShowAddSheet(false); setTimeout(() => router.push("/add"), 150); }}
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

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smIcon: {
    width: 52,
    height: 34,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  // Filter chips
  filterChips: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // P&L hero
  plHero: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  plRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
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
  plCurrencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  plCurrency: {
    fontSize: 12,
    fontWeight: "500",
  },
  plRight: {
    gap: 8,
    marginLeft: 12,
    marginTop: 4,
  },
  trendBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  hideBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
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
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: -10,
  },

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
  chartTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  chartSub: {
    fontSize: 12,
  },
  zeroLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  chartDate: {
    fontSize: 11,
  },

  // Breakdown card
  breakdownCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  breakdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 14,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: "700",
  },

  // Session list
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
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
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
  sessionBody: {
    flex: 1,
    gap: 3,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  sessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexWrap: "wrap",
  },
  sessionMeta: {
    fontSize: 12,
  },
  sessionRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  sessionProfit: {
    fontSize: 14,
    fontWeight: "700",
  },
  sessionBB: {
    fontSize: 11,
  },

  // Sheet
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  sheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sheetBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBtnTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetBtnSub:   { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
});
