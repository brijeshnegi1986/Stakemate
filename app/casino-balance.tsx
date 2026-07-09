import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CasinoWithBalance, getCasinos } from "../db/database";

export default function CasinoBalanceScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const [casinos, setCasinos] = useState<CasinoWithBalance[]>([]);

  useFocusEffect(
    useCallback(() => {
      setCasinos(getCasinos());
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/casino-balance-entry")}
              activeOpacity={0.75}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.brand + "18", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="add" size={20} color={colors.text.brand} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {casinos.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Ionicons name="business-outline" size={32} color={colors.text.disabled} />
            <Text style={{ color: colors.text.disabled, ...typography.bodySm, marginTop: spacing.md, textAlign: "center" }}>
              No casino balances tracked yet
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/casino-balance-entry")}
              activeOpacity={0.85}
              style={{ marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.bg.brand }}
            >
              <Text style={{ color: colors.text.onBrand, fontWeight: "700", ...typography.bodySm }}>Add Entry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          casinos.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => router.push({ pathname: "/casino-balance-detail", params: { id: String(c.id) } })}
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
                backgroundColor: "#8B5CF6",
              }}>
                <Ionicons name="business-outline" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "700" }} numberOfLines={1}>
                  {c.name}
                </Text>
                {!!c.state && (
                  <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 2 }}>{c.state}</Text>
                )}
              </View>
              <Text style={{
                color: c.balance >= 0 ? colors.text.success : colors.text.danger,
                ...typography.body, fontWeight: "800",
              }}>
                ${Math.abs(c.balance).toFixed(0)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
