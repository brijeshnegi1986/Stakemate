import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { computeImbalance, computeSettlement } from "@/lib/homeGameSettlement";
import { syncHomeGameToCloud } from "@/lib/sync";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  endHomeGame,
  getActiveHomeGame,
  getHomeGameExpensesTotal,
  getHomeGamePlayers,
  getHomeGameRakeTotal,
  getPlayerTotals,
  HomeGame,
  HomeGamePlayer,
  HomeGamePlayerTotals,
  setPlayerSettled,
} from "../../db/database";

export default function SettleUpScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { user } = useAuth();
  const [game, setGame] = useState<HomeGame | null>(null);
  const [players, setPlayers] = useState<HomeGamePlayer[]>([]);
  const [totals, setTotals] = useState<HomeGamePlayerTotals[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [rakeTotal, setRakeTotal] = useState(0);

  const reload = useCallback((gameId: number) => {
    setPlayers(getHomeGamePlayers(gameId));
    setTotals(getPlayerTotals(gameId));
    setExpensesTotal(getHomeGameExpensesTotal(gameId));
    setRakeTotal(getHomeGameRakeTotal(gameId));
  }, []);

  useFocusEffect(
    useCallback(() => {
      const g = getActiveHomeGame();
      if (!g) { router.replace("/(tabs)/more"); return; }
      setGame(g);
      reload(g.id);
    }, [reload])
  );

  const settledByPlayer = useMemo(() => {
    const map = new Map<number, boolean>();
    players.forEach((p) => map.set(p.id, !!p.settled));
    return map;
  }, [players]);

  const handleToggleSettled = (playerId: number) => {
    if (!game) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerSettled(playerId, !settledByPlayer.get(playerId));
    reload(game.id);
    if (user?.id) syncHomeGameToCloud(user.id, game.id).catch(console.error);
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

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    endHomeGame(game.id);
    if (user?.id) syncHomeGameToCloud(user.id, game.id).catch(console.error);
    router.replace("/(tabs)/more");
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
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}>
        {Math.abs(imbalance) > 0.01 && (
          <View style={{
            flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
            backgroundColor: colors.bg.warning + "18", borderRadius: radius.lg,
            borderWidth: 1, borderColor: colors.border.warning, padding: spacing.lg, marginBottom: spacing["2xl"],
          }}>
            <Ionicons name="warning" size={18} color={colors.text.warning} />
            <Text style={{ flex: 1, color: colors.text.warning, ...typography.bodySm }}>
              Buy-ins and cash-outs don't balance by {symbol}{Math.abs(imbalance).toFixed(0)} — double check before finalizing.
            </Text>
          </View>
        )}

        <Text style={sectionLabel}>Settle Up (with you, the host)</Text>
        {payments.length === 0 ? (
          <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, borderStyle: "dashed", padding: spacing["2xl"], alignItems: "center", marginBottom: spacing["2xl"] }}>
            <Text style={{ color: colors.text.disabled, ...typography.bodySm }}>Everyone's already even</Text>
          </View>
        ) : (
          <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden", marginBottom: spacing["2xl"] }}>
            {payments.map((p, i) => {
              const isSettled = settledByPlayer.get(p.playerId) ?? false;
              return (
                <View
                  key={i}
                  style={[
                    styles.paymentRow,
                    { backgroundColor: colors.bg.primary },
                    i < payments.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: isSettled ? colors.text.tertiary : colors.text.primary,
                      ...typography.body, fontWeight: "600",
                      textDecorationLine: isSettled ? "line-through" : "none",
                    }}>
                      {p.direction === "player_owes_host" ? `${p.playerName} → You` : `You → ${p.playerName}`}
                    </Text>
                    <Text style={{ color: isSettled ? colors.text.tertiary : colors.text.brand, ...typography.body, fontWeight: "800" }}>
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

        <Text style={sectionLabel}>Hosting Summary (not billed to players)</Text>
        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, padding: spacing.lg }}>
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
      </ScrollView>

      <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border.default, backgroundColor: colors.bg.primary }}>
        <TouchableOpacity
          onPress={handleFinish}
          activeOpacity={0.85}
          style={{ paddingVertical: spacing.lg + 2, borderRadius: radius.lg, alignItems: "center", backgroundColor: colors.bg.brand }}
        >
          <Text style={{ color: colors.text.onBrand, fontWeight: "700", ...typography.body }}>Finish Game</Text>
        </TouchableOpacity>
      </View>
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
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
