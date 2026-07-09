import { AdjustmentConfirmSheet } from "@/components/HomeGameSheets";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { computeImbalance, computeSettlement } from "@/lib/homeGameSettlement";
import { deleteHomeGameFromCloud, syncHomeGameToCloud } from "@/lib/sync";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  addHomeGameAdjustment,
  deleteHomeGame,
  getHomeGame,
  getHomeGameExpenses,
  getHomeGameExpensesTotal,
  getHomeGamePlayers,
  getHomeGameRakeTotal,
  getPlayerTotals,
  HomeGame,
  HomeGameExpense,
  HomeGamePlayer,
  HomeGamePlayerTotals,
  setPlayerSettled,
} from "../db/database";
import { router } from "expo-router";

export default function HomeGameDetailScreen() {
  const { id } = useLocalSearchParams();
  const gameId = Number(id);
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { user } = useAuth();

  const [game, setGame] = useState<HomeGame | null>(null);
  const [players, setPlayers] = useState<HomeGamePlayer[]>([]);
  const [totals, setTotals] = useState<HomeGamePlayerTotals[]>([]);
  const [expenses, setExpenses] = useState<HomeGameExpense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [rakeTotal, setRakeTotal] = useState(0);
  const [adjustPlayer, setAdjustPlayer] = useState<{ player: HomeGamePlayer; field: "buyIn" | "cashOut" } | null>(null);

  const reload = useCallback(() => {
    if (!gameId) return;
    setGame(getHomeGame(gameId));
    setPlayers(getHomeGamePlayers(gameId));
    setTotals(getPlayerTotals(gameId));
    setExpenses(getHomeGameExpenses(gameId));
    setExpensesTotal(getHomeGameExpensesTotal(gameId));
    setRakeTotal(getHomeGameRakeTotal(gameId));
  }, [gameId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const totalsByPlayer = useMemo(() => {
    const map = new Map<number, HomeGamePlayerTotals>();
    totals.forEach((t) => map.set(t.playerId, t));
    return map;
  }, [totals]);

  const settledByPlayer = useMemo(() => {
    const map = new Map<number, boolean>();
    players.forEach((p) => map.set(p.id, !!p.settled));
    return map;
  }, [players]);

  const handleToggleSettled = (playerId: number) => {
    setPlayerSettled(playerId, !settledByPlayer.get(playerId));
    reload();
    if (user?.id) syncHomeGameToCloud(user.id, gameId).catch(console.error);
  };

  const payments = useMemo(
    () => computeSettlement(totals.map((t) => ({ playerId: t.playerId, name: t.name, net: t.net }))),
    [totals]
  );
  const imbalance = useMemo(
    () => computeImbalance(totals.map((t) => ({ playerId: t.playerId, name: t.name, net: t.net }))),
    [totals]
  );

  if (!game) return null;

  const unit = game.unit;
  const symbol = unit === "chips" ? "🪙" : "$";
  const netCost = expensesTotal - rakeTotal;

  const handleAdjustmentConfirm = (delta: number, note: string) => {
    if (!adjustPlayer) return;
    const type = adjustPlayer.field === "buyIn" ? "buy_in" : "cash_out";
    addHomeGameAdjustment(game.id, adjustPlayer.player.id, type, delta, note, true);
    setAdjustPlayer(null);
    reload();
    if (user?.id) syncHomeGameToCloud(user.id, gameId).catch(console.error);
  };

  const handleDelete = () => {
    Alert.alert("Delete Home Game", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteHomeGame(game.id);
          if (user?.id) deleteHomeGameFromCloud(user.id, game.id).catch(console.error);
          router.back();
        },
      },
    ]);
  };

  const sectionLabel = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    marginBottom: spacing.sm,
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.secondary }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.75}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(239,68,68,0.1)", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="trash-outline" size={17} color={colors.text.danger} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={{
        backgroundColor: colors.bg.primary, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border.default, padding: spacing.lg, marginBottom: spacing["2xl"],
      }}>
        <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "800" }}>{game.name}</Text>
        <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginTop: 4 }}>
          {new Date(game.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
          {game.venue ? ` · ${game.venue}` : ""}
        </Text>
      </View>

      {imbalance !== 0 && Math.abs(imbalance) > 0.01 && (
        <View style={{
          flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
          backgroundColor: colors.bg.warning + "18", borderRadius: radius.lg,
          borderWidth: 1, borderColor: colors.border.warning, padding: spacing.lg, marginBottom: spacing["2xl"],
        }}>
          <Ionicons name="warning" size={18} color={colors.text.warning} />
          <Text style={{ flex: 1, color: colors.text.warning, ...typography.bodySm }}>
            Buy-ins and cash-outs don't balance by {symbol}{Math.abs(imbalance).toFixed(0)}.
          </Text>
        </View>
      )}

      <Text style={sectionLabel}>Player Ledger</Text>
      <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden", marginBottom: spacing["2xl"] }}>
        {players.map((p, i) => {
          const t = totalsByPlayer.get(p.id);
          const net = t?.net ?? 0;
          return (
            <View
              key={p.id}
              style={[
                styles.playerRow,
                { backgroundColor: colors.bg.primary },
                i < players.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "700" }}>{p.display_name}</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 2 }}>
                  <TouchableOpacity onPress={() => setAdjustPlayer({ player: p, field: "buyIn" })}>
                    <Text style={{ color: colors.text.tertiary, ...typography.caption, textDecorationLine: "underline" }}>
                      Buy-in {symbol}{(t?.buyIn ?? 0).toFixed(0)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAdjustPlayer({ player: p, field: "cashOut" })}>
                    <Text style={{ color: colors.text.tertiary, ...typography.caption, textDecorationLine: "underline" }}>
                      Cash-out {symbol}{(t?.cashOut ?? 0).toFixed(0)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ color: net >= 0 ? colors.text.success : colors.text.danger, ...typography.bodySm, fontWeight: "800" }}>
                {net >= 0 ? "+" : "-"}{symbol}{Math.abs(net).toFixed(0)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={sectionLabel}>Settle Up (with the host)</Text>
      {payments.length === 0 ? (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, borderStyle: "dashed", padding: spacing.lg, alignItems: "center", marginBottom: spacing["2xl"] }}>
          <Text style={{ color: colors.text.disabled, ...typography.bodySm }}>Everyone's even</Text>
        </View>
      ) : (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden", marginBottom: spacing["2xl"] }}>
          {payments.map((p, i) => {
            const isSettled = settledByPlayer.get(p.playerId) ?? false;
            return (
              <View
                key={i}
                style={[
                  styles.playerRow,
                  { backgroundColor: colors.bg.primary },
                  i < payments.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: isSettled ? colors.text.tertiary : colors.text.primary,
                    ...typography.bodySm, fontWeight: "600",
                    textDecorationLine: isSettled ? "line-through" : "none",
                  }}>
                    {p.direction === "player_owes_host" ? `${p.playerName} → Host` : `Host → ${p.playerName}`}
                  </Text>
                  <Text style={{ color: isSettled ? colors.text.tertiary : colors.text.brand, ...typography.bodySm, fontWeight: "800" }}>
                    {symbol}{p.amount.toFixed(0)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleToggleSettled(p.playerId)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <View style={{
                    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
                    borderColor: isSettled ? colors.text.success : colors.border.default,
                    backgroundColor: isSettled ? colors.text.success : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {isSettled && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={{ color: isSettled ? colors.text.success : colors.text.tertiary, ...typography.caption, fontWeight: "600" }}>
                    Paid
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {expenses.length > 0 && (
        <>
          <Text style={sectionLabel}>Expenses</Text>
          <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden", marginBottom: spacing["2xl"] }}>
            {expenses.map((e, i) => (
              <View
                key={e.id}
                style={[
                  styles.playerRow,
                  { backgroundColor: colors.bg.primary },
                  i < expenses.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                ]}
              >
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600", textTransform: "capitalize" }}>
                  {e.category}{e.payee_name ? ` · ${e.payee_name}` : ""}
                </Text>
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "700" }}>{symbol}{e.amount.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={sectionLabel}>Hosting Summary</Text>
      <View style={{ backgroundColor: colors.bg.primary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, padding: spacing.lg }}>
        <Row label="Rake collected" value={`${symbol}${rakeTotal.toFixed(0)}`} colors={colors} typography={typography} />
        <Row label="Expenses" value={`${symbol}${expensesTotal.toFixed(0)}`} colors={colors} typography={typography} />
        <Row
          label="Net cost to host"
          value={`${netCost >= 0 ? "" : "-"}${symbol}${Math.abs(netCost).toFixed(0)}`}
          colors={colors}
          typography={typography}
          accent={netCost > 0 ? colors.text.danger : colors.text.success}
          last
        />
      </View>

      <AdjustmentConfirmSheet
        visible={!!adjustPlayer}
        unit={unit}
        playerName={adjustPlayer?.player.display_name ?? ""}
        currentAmount={adjustPlayer ? (totalsByPlayer.get(adjustPlayer.player.id)?.[adjustPlayer.field] ?? 0) : 0}
        onClose={() => setAdjustPlayer(null)}
        onConfirm={handleAdjustmentConfirm}
      />
    </ScrollView>
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
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
