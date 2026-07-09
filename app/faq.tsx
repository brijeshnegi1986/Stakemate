import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  LayoutAnimation, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, UIManager, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BRAND = "#155DFC";

const FAQS: { q: string; a: string }[] = [
  // ── Account & data
  {
    q: "Do I need to sign in to use Stakemate?",
    a: "No. Session tracking, live timer, analytics, hand notes, player notes, and the currency converter all work fully offline without an account.\n\nYou need to sign in to access the community feed, follow other players, use the staking marketplace, and back up your data to the cloud.",
  },
  {
    q: "What happens to my data if I don't sign in?",
    a: "Your sessions and notes are saved only on this device. If you lose or change your phone, that data is gone permanently.\n\nSign in with a free account and everything is automatically backed up to the cloud and synced across all your devices.",
  },
  {
    q: "Is my data stored locally or in the cloud?",
    a: "Both. All data is stored locally on your device using SQLite so everything works offline. When you're signed in, sessions, notes, player notes and settings sync to the cloud automatically — so you never lose your data and can access it from any device.",
  },
  {
    q: "Can I use Stakemate on multiple devices?",
    a: "Yes — sign in with the same account on any device and your data syncs automatically.",
  },
  // ── Plans
  {
    q: "What's the difference between Free, Pro and Elite?",
    a: "Free: Unlimited session tracking, bankroll chart, analytics, hand notes, player notes, currency converter, dark/night mode, community feed (with sign-in) and cloud backup.\n\nPro adds: Tournament calendar (add & device sync), staking marketplace, PDF export and CSV export.\n\nElite adds everything in Pro plus: AI Hand Review, AI note enhance & compress, and the ability to publish tournaments to the community.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — new users get a 7-day free trial of Pro or Elite when subscribing. The trial is one per Apple ID. You won't be charged until the trial ends.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Go to Settings → Apple ID → Subscriptions on your iPhone. Cancel at any time — you keep access until the end of your billing period.",
  },
  {
    q: "I had a subscription but it's not showing. How do I restore it?",
    a: "Go to More → Restore Purchases, or Profile → Restore Purchases. This contacts Apple and restores any active subscriptions to your account.",
  },
  // ── Features
  {
    q: "How does the Live Session timer work?",
    a: "Tap 'Start Live Session' from the home screen. Enter your buy-in, venue and stakes, then start the timer. You can log rebuys, add notes, take breaks (timer pauses) and end the session when done — everything saves automatically.",
  },
  {
    q: "How do I track a tournament?",
    a: "When adding a session (live or completed), select Tournament as the session type. Enter your buy-in, tournament name, number of entries, finishing position and payout. Profit is calculated automatically.",
  },
  {
    q: "What are Player Notes?",
    a: "Player Notes let you store reads on players you encounter at the table. Add their name, venue, playing style tags (TAG, LAG, Fish, Reg etc.) and your observations. Notes sync to the cloud when you're signed in.",
  },
  {
    q: "What is AI Hand Review?",
    a: "An Elite feature. Describe a poker hand — position, stack sizes, action, board texture — and the AI gives you instant exploitative analysis including bet sizing, range considerations and how to approach future streets.",
  },
  {
    q: "What does AI Note Enhance & Compress do?",
    a: "An Elite feature. The AI rewrites and condenses your raw hand notes into clear, structured reads that are easier to review later.",
  },
  {
    q: "How does the Currency Converter work?",
    a: "Go to More → Currency Converter. Enter any amount, select the source currency, and see live converted amounts across AUD, USD, GBP, NZD, ZAR, EUR, SGD and HKD. Rates update daily from the European Central Bank — free, no sign-in required.",
  },
  {
    q: "Can I export my sessions?",
    a: "Pro and Elite subscribers can export sessions as a PDF report (with summary stats and full session table) or as a CSV file for spreadsheets. Go to More → Export PDF or Export CSV.",
  },
  {
    q: "How does the staking marketplace work?",
    a: "Pro and Elite users can list tournament action for sale (e.g. 20% at 1.1× markup). Other signed-in users can browse listings and submit stake claims. Sellers confirm or reject claims and manage payouts after the tournament.",
  },
  {
    q: "How are hourly rate and win rate calculated?",
    a: "Hourly rate = total profit ÷ total hours played (only sessions with a recorded duration).\n\nWin rate = percentage of sessions where profit ≥ 0.",
  },
  {
    q: "Does Stakemate work for online poker?",
    a: "Yes. Venue and state fields are optional — leave them blank or type any name. All tracking, analytics and features work the same for online sessions.",
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
          size={16} color={colors.text.tertiary}
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
          <FaqItem key={faq.q} q={faq.q} a={faq.a} colors={colors} isLast={i === FAQS.length - 1} />
        ))}
      </View>

      <Text style={[styles.footer, { color: colors.text.tertiary }]}>
        Still have questions?{"  "}
        <Text style={{ color: BRAND, fontWeight: "600" }}>support@stakemate.com.au</Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card:     { margin: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row:      { flexDirection: "row", alignItems: "center", paddingVertical: 15, paddingHorizontal: 16 },
  question: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  answer:   { fontSize: 13, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  divider:  { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  footer:   { textAlign: "center", fontSize: 13, marginTop: 4, paddingHorizontal: 24 },
});
