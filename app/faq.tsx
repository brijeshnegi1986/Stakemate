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

const BRAND = "#155DFC";

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
    a: "An Elite feature. You describe a poker hand — position, stack sizes, action, board texture — and the AI provides exploitative analysis including bet sizing recommendations, range considerations, and how to approach future streets.",
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

function FaqItem({ q, a, colors, isLast }: { q: string; a: string; colors: any; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  return (
    <>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.row}>
        <Text style={[styles.question, { color: colors.text.primary, flex: 1 }]}>{q}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.text.tertiary}
          style={{ marginLeft: 10, flexShrink: 0 }}
        />
      </TouchableOpacity>
      {open && (
        <Text style={[styles.answer, { color: colors.text.secondary, borderTopColor: colors.border.subtle }]}>
          {a}
        </Text>
      )}
      {!isLast && <View style={[styles.divider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

export default function FAQScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        {FAQS.map((faq, i) => (
          <FaqItem
            key={faq.q}
            q={faq.q}
            a={faq.a}
            colors={colors}
            isLast={i === FAQS.length - 1}
          />
        ))}
      </View>

      <Text style={[styles.footer, { color: colors.text.tertiary }]}>
        Still have questions?{"  "}
        <Text style={{ color: BRAND, fontWeight: "600" }}>support@stakemate.app</Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  question: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  answer: {
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  footer: {
    textAlign: "center",
    fontSize: 13,
    marginTop: 4,
    paddingHorizontal: 24,
  },
});
