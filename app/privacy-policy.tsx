import { usePokerTheme } from "@/hooks/use-poker-theme";
import { StakemateLogo } from "@/components/StakemateLogo";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LAST_UPDATED = "22 May 2025";

type Section = { heading: string; body: string };

const SECTIONS: Section[] = [
  {
    heading: "1. Information We Collect",
    body: `We collect information you provide directly:

• Account information: email address and display name when you create an account.
• Session data: poker session records you log including date, venue, stakes, buy-in, cash-out, duration and notes.
• Preferences: app settings you configure such as default stakes, venue and dashboard view.
• Subscription status: whether you hold a free, trial or Pro plan.

We also collect limited technical data automatically:
• Device type and operating system version for crash diagnostics.
• Anonymous usage events (e.g. screens visited) to improve the app.

We do not collect payment card details — purchases are handled entirely by the App Store.`,
  },
  {
    heading: "2. How We Use Your Information",
    body: `We use the information we collect to:

• Provide, maintain and improve Stakemate.
• Sync your session history across devices when you are signed in.
• Send transactional emails (e.g. password resets) and, if you opt in, challenge and prize notifications.
• Respond to your support requests and feedback.
• Detect and fix bugs and crashes.

We do not sell your personal information to third parties.`,
  },
  {
    heading: "3. Data Storage & Security",
    body: `Your data is stored on servers provided by Supabase, Inc. (United States). We use industry-standard encryption in transit (TLS) and at rest.

Session data you record while not signed in is stored locally on your device using SQLite and is never transmitted to our servers unless you create an account and sync is enabled.

We retain your account data for as long as your account is active. You may request deletion at any time (see Section 6).`,
  },
  {
    heading: "4. Sharing Your Information",
    body: `We share your data only in these limited circumstances:

• Service providers: Supabase (database hosting) and Apple (in-app purchases and crash reporting). These providers are bound by data-processing agreements and may not use your data for other purposes.
• Legal compliance: if required by law, court order or to protect the rights and safety of Stakemate and its users.
• Business transfers: in the event of a merger, acquisition or asset sale, your data may be transferred. We will notify you before your data becomes subject to a different privacy policy.`,
  },
  {
    heading: "5. Cookies & Analytics",
    body: `The app itself does not use browser cookies. We use privacy-preserving, aggregated analytics to understand feature usage. These events contain no personally identifiable information.`,
  },
  {
    heading: "6. Your Rights",
    body: `You have the right to:

• Access the personal data we hold about you.
• Correct inaccurate data via the Profile screen at any time.
• Delete your account and all associated cloud data — tap Profile → Delete Account or email us.
• Opt out of marketing emails via the notification toggle on the Profile screen.
• Withdraw consent at any time without affecting the lawfulness of prior processing.

Requests are processed within 30 days. To exercise any right, email privacy@stakemate.app.`,
  },
  {
    heading: "7. Children's Privacy",
    body: `Stakemate is intended for users aged 18 and over. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us with data, please contact us immediately.`,
  },
  {
    heading: "8. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. When we make material changes we will update the "Last Updated" date at the top of this page and, where required by law, notify you by email or an in-app notice.`,
  },
  {
    heading: "9. Contact Us",
    body: `For privacy-related questions or requests:\n\nEmail: privacy@stakemate.app\nApp: Profile → Send Feedback`,
  },
];

export default function PrivacyPolicyScreen() {
  const { colors, spacing, isDark } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <StakemateLogo size={32} variant={isDark ? "light" : "dark"} />
        <Text style={[styles.title, { color: colors.text.primary }]}>Privacy Policy</Text>
        <Text style={[styles.updated, { color: colors.text.tertiary }]}>
          Last updated: {LAST_UPDATED}
        </Text>
      </View>

      {/* Intro */}
      <View style={[styles.introCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <Text style={[styles.introText, { color: colors.text.secondary }]}>
          Stakemate ("we", "our", "us") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights regarding your data.
        </Text>
      </View>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <View key={section.heading} style={[styles.sectionCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.sectionHeading, { color: colors.text.primary }]}>
            {section.heading}
          </Text>
          <Text style={[styles.sectionBody, { color: colors.text.secondary }]}>
            {section.body}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  updated: {
    fontSize: 12,
  },
  introCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
  },
  introText: {
    fontSize: 14,
    lineHeight: 21,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
  },
});
