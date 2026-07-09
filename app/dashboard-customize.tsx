import { usePokerTheme } from "@/hooks/use-poker-theme";
import {
  DashboardSection,
  getDashboardHiddenSections,
  setDashboardSectionVisible,
} from "@/db/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

const SECTIONS: {
  key: DashboardSection;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}[] = [
  { key: "quickActions",   label: "Quick Actions",   description: "Start Live / Add Result buttons", icon: "flash-outline",           iconColor: "#22C55E" },
  { key: "handReview",     label: "AI Hand Review",  description: "Get instant AI coaching on your hands", icon: "color-wand-outline", iconColor: "#0891B2" },
  { key: "todaysTournaments", label: "Today's Tournaments", description: "Tournaments running today, even ones you haven't added", icon: "flame-outline", iconColor: "#F97316" },
  { key: "nextUp",         label: "Upcoming Tournaments", description: "Upcoming tournaments you're tracking", icon: "trophy-outline", iconColor: "#8B5CF6" },
  { key: "stakes",         label: "Active Staking",  description: "Deals you're selling or backing", icon: "people-outline",         iconColor: "#0891B2" },
  { key: "goals",          label: "Goal",            description: "Weekly goal progress",             icon: "flag-outline",           iconColor: "#F59E0B" },
  { key: "recentSessions", label: "Recent Sessions", description: "Your latest logged results",       icon: "cash-outline",           iconColor: "#F97316" },
  { key: "handNotes",      label: "Hand Notes",      description: "Recently saved hand notes",        icon: "document-text-outline",  iconColor: "#6366F1" },
  { key: "promotions",     label: "Promotions",      description: "Series and partner banners",       icon: "megaphone-outline",      iconColor: "#EC4899" },
];

export default function DashboardCustomizeScreen() {
  const { colors, spacing, typography } = usePokerTheme();
  const [hidden, setHidden] = useState<Set<DashboardSection>>(() => new Set(getDashboardHiddenSections()));

  const toggle = (key: DashboardSection) => {
    const isVisible = !hidden.has(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDashboardSectionVisible(key, !isVisible);
    setHidden((prev) => {
      const next = new Set(prev);
      if (isVisible) next.add(key); else next.delete(key);
      return next;
    });
  };

  const card = {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden" as const,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
    >
      <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginBottom: spacing.lg, lineHeight: 20 }}>
        Choose which sections appear on your home screen. A section with nothing to show (e.g. no active stakes) stays hidden either way.
      </Text>

      <View style={card}>
        {SECTIONS.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.row,
              i < SECTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: s.iconColor + "18" }]}>
              <Ionicons name={s.icon} size={18} color={s.iconColor} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>{s.label}</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17 }}>{s.description}</Text>
            </View>
            <Switch
              value={!hidden.has(s.key)}
              onValueChange={() => toggle(s.key)}
              trackColor={{ false: colors.border.default, true: `${colors.bg.brand}88` }}
              thumbColor={!hidden.has(s.key) ? colors.bg.brand : colors.text.tertiary}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
