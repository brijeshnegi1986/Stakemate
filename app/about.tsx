import { StakemateLogo } from "@/components/StakemateLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Linking } from "react-native";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const MINT   = "#49E6BA";
const PURPLE = "#0891B2";

const version     = Constants.expoConfig?.version ?? "1.0.0";
const buildNum    = Constants.expoConfig?.ios?.buildNumber ?? "";
const APP_VERSION = buildNum ? `${version} (${buildNum})` : version;

function LinkRow({ icon, label, onPress, iconColor = BRAND, isLast }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string; onPress: () => void;
  iconColor?: string; isLast?: boolean;
}) {
  const { colors } = usePokerTheme();
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

// Plan breakdown
const PLANS = [
  {
    name: "Free",
    color: "#64748B",
    features: [
      "Unlimited session tracking",
      "Dark & Night mode",
      "Live session timer & rebuys",
      "Bankroll chart & analytics",
      "Hand notes & player notes",
      "Currency converter (8 currencies)",
      "Community feed & posting",
      "Cloud backup (sign-in required)",
    ],
  },
  {
    name: "Pro",
    color: BRAND,
    features: [
      "Everything in Free",
      "Tournament calendar & device sync",
      "Staking marketplace",
      "PDF & CSV export",
    ],
  },
  {
    name: "Elite",
    color: PURPLE,
    features: [
      "Everything in Pro",
      "AI Hand Review",
      "AI Note enhance & compress",
      "Publish tournaments to community",
    ],
  },
];

export default function AboutScreen() {
  const { colors, isDark } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: BRAND }]}>
        <StakemateLogo variant="light" size={36} />
        <Text style={styles.tagline}>Built for the modern poker player.</Text>
      </View>

      {/* Version pill */}
      <View style={styles.versionWrap}>
        <View style={[styles.versionPill, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.versionText, { color: colors.text.tertiary }]}>v{APP_VERSION}</Text>
        </View>
      </View>

      {/* Mission */}
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Our Mission</Text>
        <Text style={[styles.cardBody, { color: colors.text.secondary }]}>
          Stakemate gives poker players the tools they've always needed in one place — a proper session tracker, bankroll analytics, a community to connect with, and AI coaching to improve their game.{"\n\n"}Whether you're grinding live cash games, chasing tournament scores, or building a staking portfolio, Stakemate helps you make better decisions at and away from the table.
        </Text>
      </View>

      {/* Plans */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Plans</Text>
      <View style={{ marginHorizontal: 16, gap: 12, marginBottom: 20 }}>
        {PLANS.map((plan) => (
          <View key={plan.name} style={[styles.planCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, borderLeftColor: plan.color }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: plan.color + "18" }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: plan.color }}>{plan.name}</Text>
              </View>
            </View>
            {plan.features.map((f) => (
              <View key={f} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                <Ionicons name="checkmark-circle" size={15} color={plan.color} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.text.secondary, lineHeight: 18 }}>{f}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Links */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>More</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <LinkRow icon="lock-closed-outline" label="Privacy Policy"   iconColor={colors.text.secondary} onPress={() => router.push("/privacy-policy")} />
        <LinkRow icon="document-text-outline" label="Terms of Service" iconColor={colors.text.secondary} onPress={() => router.push("/terms")} />
        <LinkRow icon="help-circle-outline"   label="FAQ"              iconColor={BRAND}                 onPress={() => router.push("/faq")} />
        <LinkRow icon="chatbubble-outline"    label="Send Feedback"    iconColor={colors.text.secondary} onPress={() => Linking.openURL("mailto:support@stakemate.app?subject=Feedback")} />
        <LinkRow icon="star-outline"          label="Rate Stakemate"   iconColor="#f59e0b"               onPress={() => Linking.openURL("https://apps.apple.com/app/id6772975225")} isLast />
      </View>

      {/* Footer */}
      <Text style={[styles.footer, { color: colors.text.tertiary }]}>
        Made with ♠ for poker players worldwide.{"\n"}© {new Date().getFullYear()} Stakemate. All rights reserved.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero:        { alignItems: "center", paddingTop: 36, paddingBottom: 32, gap: 10 },
  tagline:     { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "500" },
  versionWrap: { alignItems: "center", marginTop: -14, marginBottom: 20 },
  versionPill: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  versionText: { fontSize: 12, fontWeight: "600" },
  sectionLabel:{ fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginLeft: 20 },
  card:        { marginHorizontal: 16, marginBottom: 20, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  cardTitle:   { fontSize: 15, fontWeight: "700", marginBottom: 8, padding: 16, paddingBottom: 0 },
  cardBody:    { fontSize: 14, lineHeight: 22, padding: 16, paddingTop: 6 },
  planCard:    { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, padding: 14 },
  linkRow:     { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  linkIcon:    { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  linkLabel:   { flex: 1, fontSize: 15, fontWeight: "500" },
  divider:     { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  footer:      { textAlign: "center", fontSize: 12, lineHeight: 18, paddingHorizontal: 32, marginTop: 4 },
});
