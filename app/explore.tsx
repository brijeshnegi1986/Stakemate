import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const MINT   = "#49E6BA";
const GREEN  = "#22C55E";
const PURPLE = "#0891B2";
const ORANGE = "#F97316";
const PINK   = "#EC4899";
const AMBER  = "#F59E0B";
const SLATE  = "#64748B";

// ─── Plan tiers ───────────────────────────────────────────────────────────────

const FREE_FEATURES = [
  { icon: "bar-chart-outline"       as const, color: BRAND,   title: "Session Tracking", desc: "Log every cash game and tournament — buy-in, cash-out, venue, stakes, duration. Unlimited sessions." },
  { icon: "timer-outline"           as const, color: GREEN,   title: "Live Session Timer", desc: "Start a live session and track it in real time. Log rebuys, take breaks — saves everything automatically." },
  { icon: "trending-up-outline"     as const, color: PURPLE,  title: "Bankroll Chart & Analytics", desc: "Running bankroll curve, hourly rate, win rate, avg session, best/worst sessions — all fully free." },
  { icon: "flame-outline"           as const, color: ORANGE,  title: "Streak Tracking", desc: "Track winning and losing streaks to spot patterns and manage your mental game." },
  { icon: "document-text-outline"   as const, color: MINT,    title: "Hand Notes", desc: "Write detailed hand notes for any session. AI can review (Pro) or compress and enhance them (Elite)." },
  { icon: "people-outline"          as const, color: PURPLE,  title: "Player Notes", desc: "Store reads on players you've encountered — name, venue, playing style tags and observations." },
  { icon: "swap-horizontal-outline" as const, color: MINT,    title: "Currency Converter", desc: "Live exchange rates across AUD, USD, GBP, NZD, ZAR, EUR, SGD and HKD. Updated daily." },
  { icon: "globe-outline"           as const, color: BRAND,   title: "Community Feed", desc: "Share sessions, hands and results with the Stakemate community. Follow players, like and comment — free with a sign-in." },
  { icon: "moon-outline"            as const, color: SLATE,   title: "Dark & Night Mode", desc: "Choose Light, Dark, or Night theme — easy on the eyes at 2am in a dimly lit card room." },
  { icon: "calculator-outline"      as const, color: AMBER,   title: "ICM Calculator", desc: "Calculate each player's real money equity from chip stacks and prize structure. Essential for bubble decisions and chop negotiations." },
  { icon: "stats-chart-outline"     as const, color: PINK,    title: "Hand vs Equity", desc: "Enter hole cards and a board to calculate win/tie/loss equity across up to 6 players. Powered by 20,000 Monte Carlo simulations." },
  { icon: "cloud-outline"           as const, color: GREEN,   title: "Cloud Backup", desc: "Sign in with a free account and every session, note and result is automatically backed up and synced across all your devices." },
];

const PRO_FEATURES = [
  { icon: "color-wand-outline"     as const, color: PINK,   title: "AI Hand Review", desc: "Describe a hand and get instant exploitative analysis — bet sizing, range considerations, street-by-street coaching." },
  { icon: "calendar-outline"       as const, color: PURPLE, title: "Tournament Calendar", desc: "Add and manage your tournament schedule. Sync to your device calendar and receive reminders before each event." },
  { icon: "storefront-outline"     as const, color: PURPLE, title: "Staking Marketplace", desc: "Buy and sell tournament action with verified players. List your stake, set your terms, manage claims." },
  { icon: "document-text-outline"  as const, color: GREEN,  title: "PDF Export", desc: "Export your full session history as a formatted PDF report — P&L summary, win rate, hourly rate and session table." },
  { icon: "download-outline"       as const, color: GREEN,  title: "CSV Export", desc: "Export sessions as a CSV file for spreadsheet analysis, tax records, or importing to other tools." },
];

const ELITE_FEATURES = [
  { icon: "sparkles-outline"            as const, color: PINK,  title: "AI Note Enhance & Compress", desc: "AI rewrites and compresses your raw hand notes into structured, actionable reads." },
  { icon: "megaphone-outline"           as const, color: AMBER, title: "Publish Tournaments", desc: "Publish your own tournaments to the community feed so other players can discover and star them." },
];

// ─── Components ───────────────────────────────────────────────────────────────

function SectionHeading({ title, colors }: { title: string; colors: any }) {
  return <Text style={[styles.sectionHeading, { color: colors.text.tertiary }]}>{title.toUpperCase()}</Text>;
}

function PlanBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "18" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function FeatureCard({ icon, color, title, desc, badge, colors }: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string; title: string; desc: string;
  badge?: { label: string; color: string };
  colors: any;
}) {
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={[styles.featureIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Text style={[styles.featureTitle, { color: colors.text.primary }]}>{title}</Text>
          {badge && <PlanBadge label={badge.label} color={badge.color} />}
        </View>
        <Text style={[styles.featureDesc, { color: colors.text.secondary }]}>{desc}</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: BRAND }]}>
        <View style={styles.heroInner}>
          <Text style={styles.heroEmoji}>🃏</Text>
          <View>
            <Text style={styles.heroTitle}>Stakemate</Text>
            <Text style={styles.heroSub}>Built for the modern poker player</Text>
          </View>
        </View>
        <Text style={styles.heroDesc}>
          Track every session, analyse your game, connect with other players, and back each other at the table — all in one app.
        </Text>
        <View style={styles.heroPills}>
          {["Free", "Pro", "Elite"].map((p) => (
            <View key={p} style={styles.heroPill}>
              <Text style={styles.heroPillText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: 16 }}>

        {/* Free */}
        <SectionHeading title="Free — always" colors={colors} />
        <View style={styles.featureList}>
          {FREE_FEATURES.map((f) => <FeatureCard key={f.title} {...f} colors={colors} />)}
        </View>

        {/* Pro */}
        <SectionHeading title="Pro" colors={colors} />
        <View style={styles.featureList}>
          {PRO_FEATURES.map((f) => <FeatureCard key={f.title} {...f} badge={{ label: "Pro", color: BRAND }} colors={colors} />)}
        </View>

        {/* Elite */}
        <SectionHeading title="Elite — everything in Pro +" colors={colors} />
        <View style={styles.featureList}>
          {ELITE_FEATURES.map((f) => <FeatureCard key={f.title} {...f} badge={{ label: "Elite", color: PURPLE }} colors={colors} />)}
        </View>

        {/* Footer */}
        <View style={[styles.footerCard, { backgroundColor: BRAND + "0D", borderColor: BRAND + "25" }]}>
          <Ionicons name="heart-outline" size={18} color={BRAND} />
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>
            Built for poker players worldwide. Questions or feedback?{" "}
            <Text style={{ color: BRAND, fontWeight: "600" }}>support@stakemate.com.au</Text>
          </Text>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10, marginTop: 4, marginLeft: 2 },
  hero:           { padding: 20, paddingBottom: 24 },
  heroInner:      { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  heroEmoji:      { fontSize: 36 },
  heroTitle:      { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.4 },
  heroSub:        { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  heroDesc:       { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 21, marginBottom: 16 },
  heroPills:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  heroPill:       { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroPillText:   { color: "#fff", fontSize: 12, fontWeight: "600" },
  featureList:    { gap: 10, marginBottom: 28 },
  featureCard:    { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  featureIconWrap:{ width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  featureTitle:   { fontSize: 14, fontWeight: "700" },
  featureDesc:    { fontSize: 13, lineHeight: 19 },
  badge:          { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:      { fontSize: 10, fontWeight: "700" },
  footerCard:     { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  footerText:     { flex: 1, fontSize: 13, lineHeight: 19 },
});
