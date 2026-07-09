import {
  AddPlayerSheet,
  AdjustmentConfirmSheet,
  AmountEntrySheet,
  LeavingTimerSheet,
} from "@/components/HomeGameSheets";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { cancelLeavingReminder, scheduleLeavingReminder } from "@/lib/homeGameNotifications";
import { deleteHomeGamePlayerFromCloud, syncHomeGameToCloud } from "@/lib/sync";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  addHomeGameAdjustment,
  addHomeGameExpense,
  addHomeGamePlayer,
  addHomeGameRake,
  addHomeGameTransaction,
  clearPlayerLeavingTimer,
  deleteHomeGamePlayer,
  getActiveHomeGame,
  getHomeGameExpenses,
  getHomeGameExpensesTotal,
  getHomeGamePlayers,
  getHomeGameRakeTotal,
  getPlayerTotals,
  HomeGame,
  HomeGameExpense,
  HomeGameExpenseCategory,
  HomeGamePlayer,
  HomeGamePlayerTotals,
  setPlayerLeavingTimer,
} from "../../db/database";

type Tab = "players" | "expenses";
type AmountModal =
  | { kind: "buy_in" | "rebuy" | "cash_out"; player: HomeGamePlayer }
  | { kind: "expense"; category: HomeGameExpenseCategory }
  | { kind: "rake" }
  | null;

const EXPENSE_CATEGORIES: { key: HomeGameExpenseCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "food",      label: "Food",      icon: "fast-food-outline" },
  { key: "drinks",    label: "Drinks",    icon: "beer-outline" },
  { key: "transport", label: "Transport", icon: "car-outline" },
  { key: "dealer",    label: "Dealer",    icon: "person-outline" },
  { key: "other",     label: "Other",     icon: "ellipsis-horizontal-circle-outline" },
];

export default function ActiveHomeGameScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { user } = useAuth();

  const [game, setGame] = useState<HomeGame | null>(null);
  const [players, setPlayers] = useState<HomeGamePlayer[]>([]);
  const [totals, setTotals] = useState<HomeGamePlayerTotals[]>([]);
  const [expenses, setExpenses] = useState<HomeGameExpense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [rakeTotal, setRakeTotal] = useState(0);

  const [tab, setTab] = useState<Tab>("players");
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [amountModal, setAmountModal] = useState<AmountModal>(null);
  const [timerPlayer, setTimerPlayer] = useState<HomeGamePlayer | null>(null);
  const [adjustPlayer, setAdjustPlayer] = useState<{ player: HomeGamePlayer; field: "buyIn" | "cashOut" } | null>(null);

  const reload = useCallback((gameId: number) => {
    setPlayers(getHomeGamePlayers(gameId));
    setTotals(getPlayerTotals(gameId));
    setExpenses(getHomeGameExpenses(gameId));
    setExpensesTotal(getHomeGameExpensesTotal(gameId));
    setRakeTotal(getHomeGameRakeTotal(gameId));
  }, []);

  const syncGame = useCallback((gameId: number) => {
    if (user?.id) syncHomeGameToCloud(user.id, gameId).catch(console.error);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      const g = getActiveHomeGame();
      if (!g) { router.replace("/(tabs)/more"); return; }
      setGame(g);
      reload(g.id);
    }, [reload])
  );

  const totalsByPlayer = useMemo(() => {
    const map = new Map<number, HomeGamePlayerTotals>();
    totals.forEach((t) => map.set(t.playerId, t));
    return map;
  }, [totals]);

  const netCost = expensesTotal - rakeTotal;
  const unit = game?.unit ?? "currency";
  const symbol = unit === "chips" ? "🪙" : "$";

  const tableTotalBuyIn = totals.reduce((s, t) => s + t.buyIn, 0);
  const tableTotalCashOut = totals.reduce((s, t) => s + t.cashOut, 0);
  const tableInPlay = tableTotalBuyIn - tableTotalCashOut;

  if (!game) return null;

  const handleAddPlayer = (name: string) => {
    addHomeGamePlayer(game.id, name);
    reload(game.id);
    syncGame(game.id);
  };

  const handleLeavingSelect = async (minutes: number) => {
    if (!timerPlayer) return;
    const notifId = await scheduleLeavingReminder(timerPlayer.display_name, minutes);
    setPlayerLeavingTimer(timerPlayer.id, Date.now() + minutes * 60000, notifId ?? "");
    setTimerPlayer(null);
    reload(game.id);
    syncGame(game.id);
  };

  const handleClearTimer = async (player: HomeGamePlayer) => {
    await cancelLeavingReminder(player.notification_id);
    clearPlayerLeavingTimer(player.id);
    reload(game.id);
    syncGame(game.id);
  };

  const handleRemovePlayer = (player: HomeGamePlayer) => {
    const t = totalsByPlayer.get(player.id);
    const hasActivity = !!t && (t.buyIn !== 0 || t.cashOut !== 0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Remove Player",
      hasActivity
        ? `${player.display_name} has buy-ins or cash-outs recorded. Removing them will also delete that history.`
        : `Remove ${player.display_name} from this game?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await cancelLeavingReminder(player.notification_id);
            deleteHomeGamePlayer(player.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            reload(game.id);
            if (user?.id) deleteHomeGamePlayerFromCloud(user.id, player.id).catch(console.error);
          },
        },
      ]
    );
  };

  const handleAmountConfirm = (amount: number, note: string, payee: string) => {
    if (!amountModal) return;
    if (amountModal.kind === "expense") {
      addHomeGameExpense(game.id, amountModal.category, amount, payee, note);
    } else if (amountModal.kind === "rake") {
      addHomeGameRake(game.id, amount, note);
    } else {
      addHomeGameTransaction(game.id, amountModal.player.id, amountModal.kind, amount, note);
      if (amountModal.kind === "cash_out") handleClearTimer(amountModal.player);
    }
    setAmountModal(null);
    reload(game.id);
    syncGame(game.id);
  };

  const handleAdjustmentConfirm = (delta: number, note: string) => {
    if (!adjustPlayer) return;
    const type = adjustPlayer.field === "buyIn" ? "buy_in" : "cash_out";
    addHomeGameAdjustment(game.id, adjustPlayer.player.id, type, delta, note, true);
    setAdjustPlayer(null);
    reload(game.id);
    syncGame(game.id);
  };

  const handleEndGame = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/home-games/settle");
  };

  const sectionLabel = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Top bar */}
      <View style={{
        height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border.default, marginTop: 8,
      }}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/more")}
          hitSlop={{ top: 12, bottom: 12, left: 4, right: 16 }}
          style={{ width: 68, alignItems: "flex-start" }}
        >
          <Ionicons name="chevron-down" size={26} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "700" }} numberOfLines={1}>
          {game.name}
        </Text>
        <View style={{ width: 68 }} />
      </View>

      <SegmentedControl
        options={[
          { value: "players",  label: "Players",  icon: "people-outline" },
          { value: "expenses", label: "Expenses", icon: "receipt-outline" },
        ]}
        selected={tab}
        onChange={setTab}
        style={{ margin: spacing.lg, marginBottom: spacing.md }}
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120 }}>
        {tab === "players" ? (
          <>
            {players.length > 0 && (
              <View style={{
                flexDirection: "row", backgroundColor: colors.bg.secondary, borderRadius: radius.lg,
                borderWidth: 1, borderColor: colors.border.default, marginBottom: spacing.lg, overflow: "hidden",
              }}>
                <TableStat label="Total Buy-ins" value={`${symbol}${tableTotalBuyIn.toFixed(0)}`} colors={colors} typography={typography} spacing={spacing} />
                <TableStat label="Total Cash-outs" value={`${symbol}${tableTotalCashOut.toFixed(0)}`} colors={colors} typography={typography} spacing={spacing} />
                <TableStat label="Still In Play" value={`${symbol}${tableInPlay.toFixed(0)}`} colors={colors} typography={typography} spacing={spacing} last />
              </View>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
              <Text style={sectionLabel}>Players</Text>
              <TouchableOpacity onPress={() => setAddPlayerOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="add-circle" size={18} color={colors.text.brand} />
                <Text style={{ color: colors.text.brand, ...typography.bodySm, fontWeight: "600" }}>Add</Text>
              </TouchableOpacity>
            </View>

            {players.map((p) => {
              const t = totalsByPlayer.get(p.id);
              const net = t?.net ?? 0;
              const isLeaving = !!p.leaving_at;
              return (
                <View
                  key={p.id}
                  style={{
                    backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
                    borderColor: colors.border.default, padding: spacing.lg, marginBottom: spacing.md,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
                    <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "700", marginRight: spacing.sm }}>
                      {p.display_name}
                    </Text>
                    <Text style={{
                      flex: 1,
                      color: net >= 0 ? colors.text.success : colors.text.danger,
                      ...typography.body, fontWeight: "800",
                    }}>
                      {net >= 0 ? "+" : "-"}{symbol}{Math.abs(net).toFixed(0)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => (isLeaving ? handleClearTimer(p) : setTimerPlayer(p))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginRight: spacing.md }}
                    >
                      <Ionicons name={isLeaving ? "alarm" : "alarm-outline"} size={18} color={isLeaving ? colors.text.warning : colors.text.tertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRemovePlayer(p)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.text.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                    <Text style={{ color: colors.text.tertiary, ...typography.caption }}>
                      Buy-in {symbol}{(t?.buyIn ?? 0).toFixed(0)}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, ...typography.caption }}>·</Text>
                    <Text style={{ color: colors.text.tertiary, ...typography.caption }}>
                      Cash-out {symbol}{(t?.cashOut ?? 0).toFixed(0)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <TouchableOpacity
                      onPress={() => setAmountModal({ kind: "buy_in", player: p })}
                      style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.default }}
                    >
                      <Text style={{ color: colors.text.secondary, ...typography.caption, fontWeight: "700" }}>Buy-in</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAmountModal({ kind: "rebuy", player: p })}
                      style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.default }}
                    >
                      <Text style={{ color: colors.text.secondary, ...typography.caption, fontWeight: "700" }}>Rebuy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAmountModal({ kind: "cash_out", player: p })}
                      style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.bg.brand }}
                    >
                      <Text style={{ color: colors.text.onBrand, ...typography.caption, fontWeight: "700" }}>Cash-out</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {players.length === 0 && (
              <Text style={{ color: colors.text.disabled, ...typography.bodySm, textAlign: "center", marginTop: spacing["2xl"] }}>
                No players yet — tap Add to seat someone
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[sectionLabel, { marginBottom: spacing.sm }]}>Add Expense</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
              {EXPENSE_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setAmountModal({ kind: "expense", category: c.key })}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full,
                    backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.default,
                  }}
                >
                  <Ionicons name={c.icon} size={14} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {expenses.length > 0 && (
              <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden", marginBottom: spacing["2xl"] }}>
                {expenses.map((e, i) => (
                  <View
                    key={e.id}
                    style={[
                      styles.expenseRow,
                      { backgroundColor: colors.bg.primary },
                      i < expenses.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600", textTransform: "capitalize" }}>
                        {e.category}{e.payee_name ? ` · ${e.payee_name}` : ""}
                      </Text>
                      {!!e.note && <Text style={{ color: colors.text.tertiary, ...typography.caption }}>{e.note}</Text>}
                    </View>
                    <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "700" }}>{symbol}{e.amount.toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[sectionLabel, { marginBottom: spacing.sm }]}>Rake</Text>
            <TouchableOpacity
              onPress={() => setAmountModal({ kind: "rake" })}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default,
                padding: spacing.lg, marginBottom: spacing["2xl"],
              }}
            >
              <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>Add to rake total</Text>
              <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "700" }}>{symbol}{rakeTotal.toFixed(0)}</Text>
            </TouchableOpacity>

            <View style={{
              backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, padding: spacing.lg,
            }}>
              <Row label="Rake collected" value={`${symbol}${rakeTotal.toFixed(0)}`} colors={colors} typography={typography} />
              <Row label="Expenses" value={`${symbol}${expensesTotal.toFixed(0)}`} colors={colors} typography={typography} />
              <Row
                label="Net cost to you"
                value={`${netCost >= 0 ? "" : "-"}${symbol}${Math.abs(netCost).toFixed(0)}`}
                colors={colors}
                typography={typography}
                accent={netCost > 0 ? colors.text.danger : colors.text.success}
                last
              />
            </View>
          </>
        )}
      </ScrollView>

      <View style={{
        padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border.default, backgroundColor: colors.bg.primary,
      }}>
        <TouchableOpacity
          onPress={handleEndGame}
          activeOpacity={0.85}
          style={{ paddingVertical: spacing.lg + 2, borderRadius: radius.lg, alignItems: "center", backgroundColor: colors.bg.brand }}
        >
          <Text style={{ color: colors.text.onBrand, fontWeight: "700", ...typography.body }}>End Game & Settle Up</Text>
        </TouchableOpacity>
      </View>

      <AddPlayerSheet visible={addPlayerOpen} unit={unit} onClose={() => setAddPlayerOpen(false)} onAdd={handleAddPlayer} />

      <LeavingTimerSheet
        visible={!!timerPlayer}
        playerName={timerPlayer?.display_name ?? ""}
        onClose={() => setTimerPlayer(null)}
        onSelect={handleLeavingSelect}
      />

      <AmountEntrySheet
        visible={!!amountModal}
        unit={unit}
        title={
          amountModal?.kind === "expense" ? `Add ${amountModal.category} expense`
          : amountModal?.kind === "rake" ? "Add Rake"
          : amountModal?.kind === "buy_in" ? `Buy-in — ${amountModal.player.display_name}`
          : amountModal?.kind === "rebuy" ? `Rebuy — ${amountModal.player.display_name}`
          : amountModal?.kind === "cash_out" ? `Cash-out — ${amountModal.player.display_name}`
          : ""
        }
        showPayee={amountModal?.kind === "expense" && amountModal.category === "dealer"}
        payeeLabel="Dealer name"
        confirmLabel="Confirm"
        onClose={() => setAmountModal(null)}
        onConfirm={handleAmountConfirm}
      />

      <AdjustmentConfirmSheet
        visible={!!adjustPlayer}
        unit={unit}
        playerName={adjustPlayer?.player.display_name ?? ""}
        currentAmount={adjustPlayer ? (totalsByPlayer.get(adjustPlayer.player.id)?.[adjustPlayer.field] ?? 0) : 0}
        onClose={() => setAdjustPlayer(null)}
        onConfirm={handleAdjustmentConfirm}
      />
    </View>
  );
}

function TableStat({ label, value, colors, typography, spacing, last }: any) {
  return (
    <View style={{
      flex: 1, alignItems: "center", paddingVertical: spacing.md,
      borderRightWidth: last ? 0 : StyleSheet.hairlineWidth, borderRightColor: colors.border.subtle,
    }}>
      <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 2, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

function Row({ label, value, colors, typography, accent, last }: any) {
  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between", paddingVertical: 8,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle,
    }}>
      <Text style={{ color: colors.text.tertiary, ...typography.bodySm }}>{label}</Text>
      <Text style={{ color: accent ?? colors.text.primary, ...typography.bodySm, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
