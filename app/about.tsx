import { StakemateLogo } from "@/components/StakemateLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Linking } from "react-native";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const ACCENT = "#49E6BA";

const version  = Constants.expoConfig?.version ?? "1.0.0";
const buildNum = Constants.expoConfig?.ios?.buildNumber ?? "";
const APP_VERSION = buildNum ? `${version} (${buildNum})` : version;

type LinkRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  iconColor?: string;
  isLast?: boolean;
};

function LinkRow({ icon, label, onPress, iconColor = BRAND, isLast }: LinkRowProps) {
  const { colors, typography, spacing } = usePokerTheme();
  return (
    <>
      <TouchableOpacity onPress={onPress} activeOpacity={0.65} style={styles.linkRow}>
        <View style={[styles.linkIcon, { backgroundColor: iconColor + "18" }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[styles.linkLabel, { color: colors.text.primary }]}>{label}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
      </TouchableOpacity>
      {!isLast && <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

const FEATURES = [
  { icon: "stats-chart-outline" as const,     text: "Session & bankroll tracking" },
  { icon: "bar-chart-outline" as const,       text: "Analytics & win rate insights" },
  { icon: "people-outline" as const,          text: "Community & social feed" },
  { icon: "storefront-outline" as const,      text: "Staking marketplace" },
  { icon: "hardware-chip-outline" as const,   text: "AI hand review & coaching" },
  { icon: "calendar-outline" as const,        text: "Tournament calendar" },
  { icon: "trophy-outline" as const,          text: "Series & event listings" },
];

export default function AboutScreen() {
  const { colors, spacing } = usePokerTheme();
  const { isDark } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ── */}
      <View style={[styles.hero, { backgroundColor: BRAND }]}>
        <StakemateLogo variant="light" size={36} />
        <Text style={styles.tagline}>Built for the modern poker player.</Text>
      </View>

      {/* ── Version pill ── */}
      <View style={styles.versionWrap}>
        <View style={[styles.versionPill, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.versionText, { color: colors.text.tertiary }]}>v{APP_VERSION}</Text>
        </View>
      </View>

      {/* ── Mission ── */}
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Our Mission</Text>
        <Text style={[styles.cardBody, { color: colors.text.secondary }]}>
          Stakemate is the all-in-one tool for poker players who take their game seriously.
          Whether you're grinding live cash games, chasing tournament scores, or building a
          staking portfolio — Stakemate gives you the data, the community, and the edge to
          make better decisions at and away from the table.
        </Text>
      </View>

      {/* ── Features ── */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>What's inside</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        {FEATURES.map((f, i) => (
          <View key={f.text} style={[styles.featureRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }]}>
            <View style={[styles.featureIcon, { backgroundColor: ACCENT + "22" }]}>
              <Ionicons name={f.icon} size={16} color={ACCENT} />
            </View>
            <Text style={[styles.featureText, { color: colors.text.primary }]}>{f.text}</Text>
          </View>
        ))}
      </View>

      {/* ── Links ── */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>More</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <LinkRow
          icon="lock-closed-outline"
          label="Privacy Policy"
          iconColor={colors.text.secondary}
          onPress={() => router.push("/privacy-policy")}
        />
        <LinkRow
          icon="document-text-outline"
          label="Terms of Service"
          iconColor={colors.text.secondary}
          onPress={() => router.push("/terms")}
        />
        <LinkRow
          icon="chatbubble-outline"
          label="Send Feedback"
          iconColor={colors.text.secondary}
          onPress={() => Linking.openURL("mailto:support@stakemate.app?subject=Feedback")}
        />
        <LinkRow
          icon="star-outline"
          label="Rate Stakemate"
          iconColor="#f59e0b"
          onPress={() => Linking.openURL("https://apps.apple.com/app/id6772975225")}
          isLast
        />
      </View>

      {/* ── Footer ── */}
      <Text style={[styles.footer, { color: colors.text.tertiary }]}>
        Made with ♠ for poker players worldwide.{"\n"}© {new Date().getFullYear()} Stakemate. All rights reserved.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    gap: 10,
  },
  tagline: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
  versionWrap: {
    alignItems: "center",
    marginTop: -14,
    marginBottom: 20,
  },
  versionPill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  versionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 20,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
    padding: 16,
    paddingBottom: 0,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    padding: 16,
    paddingTop: 6,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  linkLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 32,
    marginTop: 4,
  },
});
