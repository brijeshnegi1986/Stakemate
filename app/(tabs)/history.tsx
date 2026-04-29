import { SegmentedControl } from "@/components/SegmentedControl";
import { StatsCard } from "@/components/StatsCard";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { deleteSession, getSessions, Session, SessionType } from "../../db/database";

type SortKey = "date" | "profit";
type Filter  = "all" | SessionType;

export default function SessionsScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort]           = useState<SortKey>("date");
  const [filter, setFilter]       = useState<Filter>("all");

  const headerAnim = useRef(new Animated.Value(0)).current;
  const emptyAnim  = useRef(new Animated.Value(0)).current;

  const loadSessions = useCallback((f: Filter) => {
    const data = getSessions(f === "all" ? undefined : f);
    setSessions(data || []);
  }, []);

  useFocusEffect(useCallback(() => {
    loadSessions(filter);
    Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 11 }).start();
  }, [filter]));

  useEffect(() => {
    if (sessions.length === 0) {
      emptyAnim.setValue(0);
      Animated.spring(emptyAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 9, delay: 150 }).start();
    }
  }, [sessions.length]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSessions(filter);
    setRefreshing(false);
  };

  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    loadSessions(f);
  };

  const sorted = useMemo(() => {
    return [...sessions].sort((a, b) =>
      sort === "profit"
        ? b.profit - a.profit
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [sessions, sort]);

  // ── Stats (adapt to filter) ──
  const totalProfit = useMemo(() => sessions.reduce((s, x) => s + (x.profit || 0), 0), [sessions]);
  const totalHours  = useMemo(() => sessions.reduce((s, x) => s + (x.duration || 0), 0), [sessions]);

  const cashSessions  = useMemo(() => sessions.filter((s) => (s.type ?? "cash") === "cash"), [sessions]);
  const tourSessions  = useMemo(() => sessions.filter((s) => s.type === "tournament"), [sessions]);

  const winRate = useMemo(() => {
    const base = filter === "tournament" ? tourSessions : cashSessions;
    if (!base.length) return null;
    return Math.round((base.filter((s) => s.profit >= 0).length / base.length) * 100);
  }, [filter, cashSessions, tourSessions]);

  const roi = useMemo(() => {
    if (!tourSessions.length) return null;
    const totalBuyIn = tourSessions.reduce((s, x) => s + x.buyIn, 0);
    const tourProfit = tourSessions.reduce((s, x) => s + x.profit, 0);
    return totalBuyIn > 0 ? (tourProfit / totalBuyIn) * 100 : 0;
  }, [tourSessions]);

  const itm = useMemo(() => {
    if (!tourSessions.length) return null;
    return Math.round((tourSessions.filter((s) => (s.payout ?? 0) > 0).length / tourSessions.length) * 100);
  }, [tourSessions]);

  const confirmDelete = (id: number) => {
    Alert.alert("Delete Session", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteSession(id); loadSessions(filter); } },
    ]);
  };

  const renderRightActions = (id: number) => (
    <TouchableOpacity
      onPress={() => confirmDelete(id)}
      style={{
        backgroundColor: colors.bg.danger,
        justifyContent: "center",
        alignItems: "center",
        width: 76,
        borderRadius: radius.lg,
        marginBottom: spacing.sm,
        marginLeft: spacing.sm,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", ...typography.caption, letterSpacing: 0.5 }}>Delete</Text>
    </TouchableOpacity>
  );

  if (!sessions.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: "center", alignItems: "center" }}>
        <Animated.View style={{
          alignItems: "center",
          gap: spacing.sm,
          opacity: emptyAnim,
          transform: [{ scale: emptyAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }}>
          <Text style={{ fontSize: 56, marginBottom: spacing.sm }}>
            {filter === "tournament" ? "🏆" : "🃏"}
          </Text>
          <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700" }}>
            No {filter === "all" ? "" : filter + " "}sessions yet
          </Text>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, textAlign: "center", maxWidth: 220, lineHeight: 20 }}>
            {filter === "tournament"
              ? "Tap the + tab to log a tournament"
              : "Tap the + tab to log your first session"}
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id.toString()}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.bg.brand} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 148 }}
        ListHeaderComponent={
          <Animated.View style={{
            opacity: headerAnim,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          }}>
            {/* ── Filter tabs ── */}
            <SegmentedControl
              options={[
                { value: "all", label: "All" },
                { value: "cash", label: "Cash" },
                { value: "tournament", label: "Tournament" },
              ]}
              selected={filter}
              onChange={handleFilterChange}
              style={{ marginBottom: spacing["2xl"] }}
            />

            {/* ── Stat cards ── */}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
              <StatsCard
                label="Total P&L"
                value={`${totalProfit >= 0 ? "+" : "-"}$${Math.abs(totalProfit).toFixed(0)}`}
              />
              <StatsCard label="Sessions" value={String(sessions.length)} />
              {filter === "tournament" ? (
                <StatsCard
                  label="ROI"
                  value={roi !== null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%` : "—"}
                />
              ) : (
                <StatsCard
                  label="Win rate"
                  value={winRate !== null ? `${winRate}%` : "—"}
                />
              )}
            </View>

            {/* ── ITM badge for tournaments ── */}
            {filter === "tournament" && itm !== null && (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.bg.tertiary,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border.default,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                marginBottom: spacing["2xl"],
              }}>
                <Text style={{ color: colors.text.secondary, ...typography.bodySm }}>ITM (in the money)</Text>
                <Text style={{
                  color: itm >= 20 ? colors.text.success : colors.text.secondary,
                  fontWeight: "700",
                  ...typography.body,
                }}>
                  {itm}%
                </Text>
              </View>
            )}

            {/* ── Sort + hours ── */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {(["date", "profit"] as SortKey[]).map((key) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setSort(key)}
                    style={{
                      paddingVertical: spacing.xs,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.full,
                      backgroundColor: sort === key ? colors.bg.brand : colors.bg.tertiary,
                      borderWidth: 1,
                      borderColor: sort === key ? colors.border.brand : colors.border.default,
                    }}
                  >
                    <Text style={{
                      color: sort === key ? colors.text.onBrand : colors.text.secondary,
                      ...typography.caption,
                      fontWeight: sort === key ? "700" : "500",
                    }}>
                      {key === "date" ? "Recent" : "Best"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {totalHours > 0 && (
                <Text style={{ color: colors.text.tertiary, ...typography.caption }}>
                  {totalHours.toFixed(0)}h total
                </Text>
              )}
            </View>
            <Text style={{ color: colors.text.disabled, ...typography.caption, marginBottom: spacing.sm }}>
              Swipe left on a session to delete
            </Text>
          </Animated.View>
        }
        renderItem={({ item }) => (
          <Swipeable friction={2} rightThreshold={40} renderRightActions={() => renderRightActions(item.id)}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: "/session-detail", params: { session: JSON.stringify(item) } })}
            >
              <View style={{
                backgroundColor: colors.bg.primary,
                borderRadius: 8,
                marginBottom: 4,
                borderWidth: 1,
                borderColor: colors.border.default,
                flexDirection: "row",
                overflow: "hidden",
              }}>
                {/* Profit colour bar */}
                <View style={{
                  width: 4,
                  backgroundColor: item.profit > 0 ? colors.bg.success
                    : item.profit < 0 ? colors.bg.danger
                    : colors.border.default,
                }} />

                <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 16 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, marginRight: spacing.md }}>

                      {item.type === "tournament" ? (
                        <>
                          {/* Tournament badge */}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs }}>
                            <View style={{
                              backgroundColor: colors.bg.tertiary,
                              borderRadius: radius.sm,
                              paddingHorizontal: spacing.sm,
                              paddingVertical: 2,
                              borderWidth: 1,
                              borderColor: colors.border.default,
                            }}>
                              <Text style={{ color: colors.text.tertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }}>
                                TOURNAMENT
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 20, fontWeight: "400" }} numberOfLines={1}>
                            {item.tournamentName || "Tournament"}
                          </Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: spacing.xs }}>
                            {item.position && item.entries
                              ? `${item.position} / ${item.entries} · `
                              : ""}
                            {item.venue || item.state || ""}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 20, fontWeight: "400" }} numberOfLines={1}>
                            {item.venue || "Unknown venue"}
                          </Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16, marginTop: spacing.xs }}>
                            {item.stakes}{item.state ? ` • ${item.state}` : ""}
                          </Text>
                        </>
                      )}

                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16 }}>
                          {item.date ? formatDate(item.date) : "—"}
                        </Text>
                        {item.duration > 0 && (
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16 }}>
                            · {item.duration}h
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{
                        color: item.profit > 0 ? colors.text.success
                          : item.profit < 0 ? colors.text.danger
                          : colors.text.secondary,
                        fontWeight: "700",
                        ...typography.heading3,
                      }}>
                        {item.profit > 0 ? "+" : item.profit < 0 ? "-" : ""}
                        ${Math.abs(item.profit).toFixed(0)}
                      </Text>
                      {item.type === "tournament" && item.entries && item.entries > 0 ? (
                        <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: spacing.xs }}>
                          {item.entries} entries
                        </Text>
                      ) : item.duration > 0 ? (
                        <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: spacing.xs }}>
                          {item.profit >= 0 ? "+" : "-"}${(Math.abs(item.profit) / item.duration).toFixed(0)}/hr
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </Swipeable>
        )}
      />
    </View>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

