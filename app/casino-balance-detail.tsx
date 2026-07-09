import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { deleteCasinoFromCloud, deleteCasinoTransactionFromCloud } from "@/lib/sync";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Casino,
  CasinoTransaction,
  deleteCasino,
  deleteCasinoTransaction,
  getCasino,
  getCasinoBalance,
  getCasinoTransactions,
} from "../db/database";

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export default function CasinoBalanceDetailScreen() {
  const { id } = useLocalSearchParams();
  const casinoId = Number(id);
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { user } = useAuth();

  const [casino, setCasino] = useState<Casino | null>(null);
  const [transactions, setTransactions] = useState<CasinoTransaction[]>([]);
  const [balance, setBalance] = useState(0);

  const reload = useCallback(() => {
    if (!casinoId) return;
    setCasino(getCasino(casinoId));
    setTransactions(getCasinoTransactions(casinoId));
    setBalance(getCasinoBalance(casinoId));
  }, [casinoId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!casino) return null;

  const handleDeleteTransaction = (txn: CasinoTransaction) => {
    Alert.alert(
      "Delete Entry",
      `Remove this ${txn.type} of $${txn.amount.toFixed(0)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCasinoTransaction(txn.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            reload();
            if (user?.id) deleteCasinoTransactionFromCloud(user.id, txn.id).catch(console.error);
          },
        },
      ]
    );
  };

  const handleDeleteCasino = () => {
    Alert.alert(
      "Stop Tracking Casino",
      `This will delete ${casino.name} and its entire transaction history. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCasino(casino.id);
            if (user?.id) deleteCasinoFromCloud(user.id, casino.id).catch(console.error);
            router.back();
          },
        },
      ]
    );
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
              onPress={handleDeleteCasino}
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
        alignItems: "center",
      }}>
        <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "800" }}>{casino.name}</Text>
        {!!casino.state && <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginTop: 2 }}>{casino.state}</Text>}
        <Text style={{
          color: balance >= 0 ? colors.text.success : colors.text.danger,
          ...typography.heading1, fontWeight: "900", marginTop: spacing.md,
        }}>
          ${Math.abs(balance).toFixed(0)}
        </Text>
        <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 2 }}>Current balance</Text>
      </View>

      <Text style={sectionLabel}>History</Text>
      {transactions.length === 0 ? (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, borderStyle: "dashed", padding: spacing.lg, alignItems: "center" }}>
          <Text style={{ color: colors.text.disabled, ...typography.bodySm }}>No entries yet</Text>
        </View>
      ) : (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden" }}>
          {transactions.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              onLongPress={() => handleDeleteTransaction(t)}
              activeOpacity={0.7}
              style={[
                styles.row,
                { backgroundColor: colors.bg.primary },
                i < transactions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
              ]}
            >
              <View style={{
                width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
                backgroundColor: (t.type === "deposit" ? colors.text.success : colors.text.danger) + "18",
              }}>
                <Ionicons
                  name={t.type === "deposit" ? "arrow-down" : "arrow-up"}
                  size={14}
                  color={t.type === "deposit" ? colors.text.success : colors.text.danger}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600", textTransform: "capitalize" }}>
                  {t.type}
                </Text>
                <Text style={{ color: colors.text.tertiary, ...typography.caption }}>
                  {fmtDate(t.date)}{t.note ? ` · ${t.note}` : ""}
                </Text>
              </View>
              <Text style={{
                color: t.type === "deposit" ? colors.text.success : colors.text.danger,
                ...typography.bodySm, fontWeight: "800",
              }}>
                {t.type === "deposit" ? "+" : "-"}${t.amount.toFixed(0)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginTop: spacing.lg }}>
        Long-press an entry to delete it
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
