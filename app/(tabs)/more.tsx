import { PaywallModal } from "@/components/PaywallModal";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function MenuRow({
  icon, label, onPress, iconColor, isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  iconColor?: string;
  isLast?: boolean;
}) {
  const { colors } = usePokerTheme();
  return (
    <>
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.rowTouch}>
        <View style={[styles.rowIconWrap, { backgroundColor: (iconColor ?? colors.text.secondary) + "18" }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? colors.text.secondary} />
        </View>
        <Text style={[styles.rowLabel, { color: colors.text.primary }]}>{label}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
      </TouchableOpacity>
      {!isLast && <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

export default function MoreScreen() {
  const { colors, spacing } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [showPaywall, setShowPaywall] = useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: 49 + insets.bottom + 32,
      }}
      showsVerticalScrollIndicator={false}
    >
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />

      {/* ── Upgrade ── */}
      <TouchableOpacity
        onPress={() => setShowPaywall(true)}
        activeOpacity={0.88}
        style={[styles.upgradeBtn, { backgroundColor: colors.bg.brand }]}
      >
        <Ionicons name="trophy-outline" size={20} color="#fff" />
        <Text style={styles.upgradeBtnText}>Upgrade to Pro / Elite</Text>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* ── General ── */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>General</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <MenuRow
          icon="chatbubble-outline"
          label="Send Feedback"
          iconColor={colors.text.secondary}
          onPress={() => Linking.openURL("mailto:support@stakemate.app?subject=Feedback")}
        />
        <MenuRow
          icon="lock-closed-outline"
          label="Privacy Policy"
          iconColor={colors.text.secondary}
          onPress={() => router.push("/privacy-policy")}
        />
        <MenuRow
          icon="document-text-outline"
          label="Terms of Service"
          iconColor={colors.text.secondary}
          onPress={() => router.push("/terms")}
        />
        <MenuRow
          icon="star-outline"
          label="Rate App"
          iconColor="#f59e0b"
          onPress={() => Linking.openURL("https://apps.apple.com/app/id6772975225")}
          isLast
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 16,
  },
  rowTouch: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  upgradeBtnText: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
