import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const SKY    = "#0EA5E9";
const GREEN  = "#22C55E";
const PURPLE = "#0891B2";
const ORANGE = "#F97316";
const PINK   = "#EC4899";

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "bar-chart-outline" as const,
    color: BRAND,
    title: "Session Tracking",
    desc: "Log every cash game and tournament with buy-in, cash-out, venue, stakes, and duration. Your full poker history in one place.",
  },
  {
    icon: "timer-outline" as const,
    color: GREEN,
    title: "Live Session Timer",
    desc: "Start a live session and track it in real time. Log rebuys, add notes, take breaks — then end the session and save everything automatically.",
  },
  {
    icon: "trending-up-outline" as const,
    color: SKY,
    title: "Analytics & Statistics",
    desc: "See your hourly rate, total profit, win rate, average session length, best/worst sessions, and running bankroll chart — all at a glance.",
  },
  {
    icon: "flame-outline" as const,
    color: ORANGE,
    title: "Streak Tracking",
    desc: "Track your current winning and losing streaks across sessions to spot patterns and manage your mental game.",
  },
  {
    icon: "calendar-outline" as const,
    color: PURPLE,
    title: "Tournament Calendar",
    desc: "Save upcoming tournaments to your personal calendar. Sync them to your device calendar and get reminders so you never miss a game.",
  },
  {
    icon: "globe-outline" as const,
    color: SKY,
    title: "Social Feed",
    desc: "Share hands, tournament results, and thoughts with the Stakemate community. Follow other players, like and comment on posts.",
  },
  {
    icon: "document-text-outline" as const,
    color: GREEN,
    title: "Session Notes",
    desc: "Write detailed notes for any session or hand. Keep a private poker journal that travels with your bankroll data.",
  },
  {
    icon: "hardware-chip-outline" as const,
    color: PURPLE,
    title: "AI Hand Analysis (Elite)",
    desc: "Describe a hand and get instant exploitative analysis from AI — covering bet sizing, range considerations, and how to play future streets.",
  },
  {
    icon: "sparkles-outline" as const,
    color: PINK,
    title: "AI Session Coaching (Elite)",
    desc: "After a session, get AI-generated coaching notes on your play patterns, leaks to address, and what to focus on in your next session.",
  },
  {
    icon: "cash-outline" as const,
    color: ORANGE,
    title: "Currency Conversion",
    desc: "Track your bankroll in AUD, USD, GBP, EUR, and more. All figures display in your chosen currency.",
  },
  {
    icon: "moon-outline" as const,
    color: "#64748B",
    title: "Dark Mode",
    desc: "Choose Light, Dark, or System theme. Stakemate looks great at 2am in a dimly lit card room.",
  },
];


// ─── Components ───────────────────────────────────────────────────────────────

function SectionHeading({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionHeading, { color: colors.text.tertiary }]}>{title.toUpperCase()}</Text>
  );
}

function FeatureCard({ icon, color, title, desc, colors }: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  desc: string;
  colors: any;
}) {
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={[styles.featureIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.featureTitle, { color: colors.text.primary }]}>{title}</Text>
        <Text style={[styles.featureDesc, { color: colors.text.secondary }]}>{desc}</Text>
      </View>
    </View>
  );
}


// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { colors, spacing } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero banner ── */}
      <View style={[styles.hero, { backgroundColor: BRAND }]}>
        <View style={styles.heroInner}>
          <Text style={styles.heroEmoji}>🃏</Text>
          <View>
            <Text style={styles.heroTitle}>Stakemate</Text>
            <Text style={styles.heroSub}>Your poker bankroll companion</Text>
          </View>
        </View>
        <Text style={styles.heroDesc}>
          Track every session, analyse your game, and connect with other players — all in one app built by poker players, for poker players.
        </Text>
        <View style={styles.heroPills}>
          {["Live Tracking", "Analytics", "AI Coaching", "Community"].map((p) => (
            <View key={p} style={styles.heroPill}>
              <Text style={styles.heroPillText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: 16 }}>

        {/* ── Features ── */}
        <SectionHeading title="Features" colors={colors} />
        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} colors={colors} />
          ))}
        </View>

        {/* ── Footer note ── */}
        <View style={[styles.footerCard, { backgroundColor: BRAND + "0D", borderColor: BRAND + "25" }]}>
          <Ionicons name="heart-outline" size={18} color={BRAND} />
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>
            Built for the Australian poker community. Questions or feedback?{" "}
            <Text style={{ color: BRAND, fontWeight: "600" }}>support@stakemate.app</Text>
          </Text>
        </View>

      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
    marginLeft: 2,
  },

  // Hero
  hero:       { padding: 20, paddingBottom: 24 },
  heroInner:  { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  heroEmoji:  { fontSize: 36 },
  heroTitle:  { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.4 },
  heroSub:    { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  heroDesc:   { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 21, marginBottom: 16 },
  heroPills:  { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  heroPill:   { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroPillText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Features
  featureList: { gap: 10, marginBottom: 28 },
  featureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  featureTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  featureDesc:  { fontSize: 13, lineHeight: 19 },

  // Footer
  footerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  footerText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
