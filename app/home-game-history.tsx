import { usePokerTheme } from "@/hooks/use-poker-theme";
import { computeSettlement } from "@/lib/homeGameSettlement";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getHomeGamePlayers, getHomeGames, getPlayerTotals, HomeGame } from "../db/database";

type Row = HomeGame & { playerCount: number; unpaidCount: number };

export default function HomeGameHistoryScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const [games, setGames] = useState<Row[]>([]);

  useFocusEffect(
    useCallback(() => {
      const gs = getHomeGames();
      setGames(gs.map((g) => {
        const players = getHomeGamePlayers(g.id);
        const totals = getPlayerTotals(g.id);
        const payments = computeSettlement(totals.map((t) => ({ playerId: t.playerId, name: t.name, net: t.net })));
        const settledById = new Map(players.map((p) => [p.id, !!p.settled]));
        const unpaidCount = payments.filter((p) => !settledById.get(p.playerId)).length;
        return { ...g, playerCount: players.length, unpaidCount };
      }));
    }, [])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {games.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <Ionicons name="cash-outline" size={32} color={colors.text.disabled} />
          <Text style={{ color: colors.text.disabled, ...typography.bodySm, marginTop: spacing.md }}>
            No home games yet
          </Text>
        </View>
      ) : (
        games.map((g) => (
          <TouchableOpacity
            key={g.id}
            onPress={() => router.push({ pathname: "/home-game-detail", params: { id: String(g.id) } })}
            activeOpacity={0.7}
            style={{
              flexDirection: "row", alignItems: "center", gap: spacing.md,
              backgroundColor: colors.bg.primary, borderRadius: radius.lg,
              borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default,
              padding: spacing.lg, marginBottom: spacing.md,
            }}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
              backgroundColor: g.status === "active" ? colors.bg.brand : "#F97316",
            }}>
              <Ionicons name={g.status === "active" ? "play" : "cash-outline"} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "700" }} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 2 }}>
                {new Date(g.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                {g.venue ? ` · ${g.venue}` : ""} · {g.playerCount} player{g.playerCount === 1 ? "" : "s"}
              </Text>
            </View>
            {g.status === "active" && (
              <View style={{ backgroundColor: colors.bg.brand + "18", borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                <Text style={{ color: colors.text.brand, ...typography.caption, fontWeight: "700" }}>LIVE</Text>
              </View>
            )}
            {g.unpaidCount > 0 && (
              <View style={{ backgroundColor: colors.bg.warning + "18", borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
                <Text style={{ color: colors.text.warning, ...typography.caption, fontWeight: "700" }}>
                  {g.unpaidCount} unpaid
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
