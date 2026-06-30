import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is my data stored locally or in the cloud?",
    a: "Session data, notes, and settings are stored locally on your device using SQLite — no account required for core tracking. Social features and profile data sync through Supabase when you're signed in.",
  },
  {
    q: "What's the difference between Pro and Elite?",
    a: "Pro unlocks unlimited sessions and notes, full analytics, tournament calendar, device calendar sync, social feed, dark mode, PDF export, and currency conversion.\n\nElite includes everything in Pro plus AI hand analysis, AI session coaching, AI note enhancement, and the ability to publish tournaments to the community feed.",
  },
  {
    q: "Can I use Stakemate without signing in?",
    a: "Yes. Session tracking, live timer, analytics, notes, and settings all work fully offline without an account. You only need to sign in to access social features like the community feed, following other players, and publishing posts.",
  },
  {
    q: "How does the Live Session timer work?",
    a: "Tap 'Start Live Session' from the home screen. Enter your buy-in, venue, and stakes, then start the timer. During the session you can log rebuys, add notes, take breaks (timer pauses), and end the session when you're done. Everything saves automatically.",
  },
  {
    q: "How do I track a tournament?",
    a: "When adding a session (live or completed), select 'Tournament' as the session type. Enter your buy-in, tournament name, number of entries, your finishing position, and payout. Profit is calculated automatically.",
  },
  {
    q: "What is AI hand analysis?",
    a: "An Elite feature. You describe a poker hand — position, stack sizes, action, board texture — and the AI provides exploitative analysis including bet sizing recommendations, range considerations, and how to approach future streets. It's like having a coach available after every session.",
  },
  {
    q: "Can I export my session data?",
    a: "Pro and Elite subscribers can export session history as a PDF report directly from the app. The report includes all session details, profit/loss charts, and summary statistics.",
  },
  {
    q: "How does the tournament calendar work?",
    a: "Add upcoming tournaments to your in-app calendar with name, date, venue, and buy-in. Pro/Elite users can also sync these to their device's native calendar and receive push notifications before each tournament.",
  },
  {
    q: "How are hourly rate and win rate calculated?",
    a: "Hourly rate = total profit ÷ total hours played (only sessions with a recorded duration are included).\n\nWin rate for cash games is shown in BB/hour if stakes are recorded. Tournament ROI is shown as a percentage of total buy-ins.",
  },
  {
    q: "Can I use Stakemate for both cash games and tournaments?",
    a: "Yes. Stakemate fully supports both. Cash games track buy-in, cash-out, and profit. Tournaments track buy-in, entries, position, and payout. Statistics and analytics are shown combined or can be filtered by type.",
  },
  {
    q: "Is there a free tier?",
    a: "Yes. The free tier lets you log up to 30 sessions and 10 notes, and includes the live timer, basic stats, and profile. Upgrade to Pro for unlimited tracking and all core features.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Subscriptions are managed through Apple's App Store. Go to Settings → Apple ID → Subscriptions on your iPhone to cancel at any time. You keep access until the end of your billing period.",
  },
  {
    q: "Does Stakemate work for online poker?",
    a: "Absolutely. While venue and state fields are optional (designed for live poker), you can leave them blank or type any venue name. All tracking, analytics, and features work the same for online sessions.",
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

function FaqItem({ q, a, colors }: { q: string; a: string; colors: any }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  return (
    <View style={[styles.faqItem, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.faqQuestion}>
        <Text style={[styles.faqQ, { color: colors.text.primary, flex: 1 }]}>{q}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.text.tertiary}
          style={{ marginLeft: 8 }}
        />
      </TouchableOpacity>
      {open && (
        <Text style={[styles.faqA, { color: colors.text.secondary, borderTopColor: colors.border.subtle }]}>
          {a}
        </Text>
      )}
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

        {/* ── FAQ ── */}
        <SectionHeading title="Frequently Asked Questions" colors={colors} />
        <View style={styles.faqList}>
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} colors={colors} />
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

  // FAQ
  faqList: { gap: 8, marginBottom: 28 },
  faqItem: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  faqQuestion: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  faqQ: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  faqA: {
    fontSize: 13,
    lineHeight: 20,
    padding: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

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
