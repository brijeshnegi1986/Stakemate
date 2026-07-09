import { usePokerTheme } from "@/hooks/use-poker-theme";
import { getSetting, setSetting } from "@/db/database";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export default function GoalsScreen() {
  const { colors, spacing, typography } = usePokerTheme();

  const [goalHours,    setGoalHours]    = useState(getSetting("goal_weekly_hours")    ?? "");
  const [goalProfit,   setGoalProfit]   = useState(getSetting("goal_weekly_profit")   ?? "");
  const [goalSessions, setGoalSessions] = useState(getSetting("goal_weekly_sessions") ?? "");

  const card = {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden" as const,
    marginBottom: spacing["2xl"],
  };

  const divider = {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginHorizontal: spacing.lg,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginBottom: spacing.lg, lineHeight: 20 }}>
        Set weekly targets to track your progress from the home screen.
      </Text>

      <View style={card}>
        <View style={{ padding: spacing.lg, gap: 4 }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>Hours target</Text>
          <Text style={{ color: colors.text.tertiary, ...typography.caption }}>How many hours do you want to play this week?</Text>
          <TextInput
            style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700", marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}
            value={goalHours}
            onChangeText={(v) => { setGoalHours(v); setSetting("goal_weekly_hours", v); }}
            placeholder="e.g. 20"
            placeholderTextColor={colors.text.disabled}
            keyboardType="numeric"
          />
        </View>
        <View style={divider} />
        <View style={{ padding: spacing.lg, gap: 4 }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>Profit target</Text>
          <Text style={{ color: colors.text.tertiary, ...typography.caption }}>Weekly profit goal in your chosen currency.</Text>
          <TextInput
            style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700", marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}
            value={goalProfit}
            onChangeText={(v) => { setGoalProfit(v); setSetting("goal_weekly_profit", v); }}
            placeholder="e.g. 500"
            placeholderTextColor={colors.text.disabled}
            keyboardType="numeric"
          />
        </View>
        <View style={divider} />
        <View style={{ padding: spacing.lg, gap: 4 }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>Sessions target</Text>
          <Text style={{ color: colors.text.tertiary, ...typography.caption }}>How many sessions do you want to play this week?</Text>
          <TextInput
            style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700", marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}
            value={goalSessions}
            onChangeText={(v) => { setGoalSessions(v); setSetting("goal_weekly_sessions", v); }}
            placeholder="e.g. 3"
            placeholderTextColor={colors.text.disabled}
            keyboardType="numeric"
          />
        </View>
      </View>
    </ScrollView>
  );
}
