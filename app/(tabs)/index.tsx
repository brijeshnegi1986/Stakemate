import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { NoteEditorModal } from "@/app/(tabs)/notes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getActiveSession,
  getNoteHistory,
  getSessions,
  getSetting,
  NoteEntry,
  Session,
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

export default function HomeScreen() {
  const { colors } = usePokerTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions]           = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [notes, setNotes]                 = useState<NoteEntry[]>([]);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [currency, setCurrency]           = useState("AUD");
  const [showAddSheet, setShowAddSheet]   = useState(false);
  const [noteEditorVisible, setNoteEditorVisible] = useState(false);

  const meta = CURRENCY_META[currency] ?? CURRENCY_META.AUD;

  useFocusEffect(
    useCallback(() => {
      setSessions(getSessions() || []);
      setCurrency(getSetting("currency") ?? "AUD");
      setActiveSession(getActiveSession());
      setNotes(getNoteHistory());
    }, [])
  );

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
  const recentNotes    = notes.slice(0, 3);

  const profitIsPositive = totalProfit >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
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
              <Text style={styles.topBarGreet}>Good session,</Text>
              <Text style={styles.topBarName} numberOfLines={1}>
                {greetingName || "Player"}
              </Text>
            </View>
          </View>
          <View style={styles.topBarActions}>
            <TouchableOpacity onPress={() => router.push("/settings")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.navigate("/(tabs)/profile")} activeOpacity={0.8}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
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
            style={[styles.qaBtn, { backgroundColor: BRAND }]}
            activeOpacity={0.85}
          >
            <View style={styles.qaBtnIcon}>
              <Ionicons name="radio-button-on" size={14} color="#fff" />
            </View>
            <View>
              <Text style={styles.qaBtnTitle}>Start Session</Text>
              <Text style={styles.qaBtnSub}>Track live</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/add")}
            style={[styles.qaBtn, { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.default }]}
            activeOpacity={0.85}
          >
            <View style={[styles.qaBtnIcon, { backgroundColor: `${BRAND}18` }]}>
              <Ionicons name="add" size={14} color={BRAND} />
            </View>
            <View>
              <Text style={[styles.qaBtnTitle, { color: colors.text.primary }]}>Add Result</Text>
              <Text style={[styles.qaBtnSub, { color: colors.text.tertiary }]}>Log completed</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Live session banner ── */}
        {activeSession && (
          <TouchableOpacity
            onPress={() => router.push("/live/active")}
            style={styles.liveBanner}
            activeOpacity={0.85}
          >
            <View style={styles.liveDot} />
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
            <Ionicons name="chevron-forward" size={18} color="#fff" style={{ opacity: 0.7 }} />
          </TouchableOpacity>
        )}

        <View style={styles.body}>
          {/* ── Recent Sessions ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Recent Sessions</Text>
              {sessions.length > 5 && (
                <TouchableOpacity onPress={() => router.navigate("/(tabs)/history")}>
                  <Text style={[styles.seeAll, { color: BRAND }]}>See all</Text>
                </TouchableOpacity>
              )}
            </View>

            {recentSessions.length === 0 ? (
              <TouchableOpacity
                onPress={() => setShowAddSheet(true)}
                style={[styles.emptyCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={36} color={colors.text.tertiary} />
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>No sessions yet. Tap to add your first.</Text>
              </TouchableOpacity>
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

          {/* ── Hand Notes ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Hand Notes</Text>
              <TouchableOpacity onPress={() => setNoteEditorVisible(true)}>
                <Text style={[styles.seeAll, { color: BRAND }]}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {recentNotes.length === 0 ? (
              <TouchableOpacity
                onPress={() => setNoteEditorVisible(true)}
                style={[styles.emptyCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={36} color={colors.text.tertiary} />
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>Log hands to review your play and spot leaks.</Text>
                <View style={[styles.addNoteBtn, { backgroundColor: BRAND }]}>
                  <Text style={styles.addNoteBtnText}>Log a Hand</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.listCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
                {recentNotes.map((note, i) => {
                  const isEnhanced = !!note.enhanced_notes && note.enhanced_notes !== note.raw_notes;
                  const isReviewed = !!note.hand_analysis;
                  return (
                    <TouchableOpacity
                      key={note.id}
                      onPress={() => router.navigate("/(tabs)/notes")}
                      activeOpacity={0.7}
                      style={[styles.noteRow, i < recentNotes.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle }]}
                    >
                      <View style={[styles.noteIconWrap, { backgroundColor: isReviewed ? "#7c3aed14" : `${BRAND}14` }]}>
                        <Ionicons
                          name={isReviewed ? "card-outline" : "document-text-outline"}
                          size={16}
                          color={isReviewed ? "#7c3aed" : BRAND}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[styles.noteTitle, { color: colors.text.primary }]} numberOfLines={1}>
                          {note.title || note.raw_notes?.slice(0, 40) || "Hand note"}
                        </Text>
                        {(isEnhanced || isReviewed) && (
                          <View style={{ flexDirection: "row", gap: 5 }}>
                            {isReviewed && (
                              <View style={styles.noteBadge}>
                                <Ionicons name="sparkles" size={9} color="#7c3aed" />
                                <Text style={[styles.noteBadgeText, { color: "#7c3aed" }]}>AI Reviewed</Text>
                              </View>
                            )}
                            {isEnhanced && !isReviewed && (
                              <View style={[styles.noteBadge, { backgroundColor: "#155DFC14" }]}>
                                <Ionicons name="color-wand-outline" size={9} color={BRAND} />
                                <Text style={[styles.noteBadgeText, { color: BRAND }]}>AI Enhanced</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={15} color={colors.text.tertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Note Editor ── */}
      <NoteEditorModal
        key={noteEditorVisible ? "open" : "closed"}
        visible={noteEditorVisible}
        initial={null}
        sessions={sessions}
        onClose={() => setNoteEditorVisible(false)}
        onSaved={() => setNotes(getNoteHistory())}
        colors={colors}
      />

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
    backgroundColor: "#16A34A",
    borderRadius: 14,
    padding: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
    opacity: 0.9,
  },
  liveBannerTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  liveBannerSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    marginTop: 2,
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
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
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

  // Note rows
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  noteIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  noteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#7c3aed14",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  noteBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  addNoteBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    marginTop: 4,
  },
  addNoteBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // Bottom sheet
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
