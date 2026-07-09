import { usePokerTheme } from "@/hooks/use-poker-theme";
import { StakemateLogo } from "@/components/StakemateLogo";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LAST_UPDATED = "22 May 2025";

type Section = { heading: string; body: string };

const SECTIONS: Section[] = [
  {
    heading: "1. Acceptance of Terms",
    body: `By downloading, installing or using Stakemate ("the App") you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App.

We may update these Terms from time to time. Continued use of the App after changes are posted constitutes your acceptance of the revised Terms.`,
  },
  {
    heading: "2. Eligibility",
    body: `You must be at least 18 years old to use Stakemate. By using the App you represent and warrant that you are at least 18 years of age.

Stakemate is a bankroll tracking and analytics tool. It does not facilitate, promote or enable real-money gambling. Compliance with local laws regarding poker and gambling is solely your responsibility.`,
  },
  {
    heading: "3. Account Registration",
    body: `You may use certain features of the App without an account. To access cloud sync and additional features you must create an account with a valid email address.

You are responsible for:
• Keeping your login credentials confidential.
• All activity that occurs under your account.
• Notifying us immediately at support@stakemate.com.au if you suspect unauthorised access.

We reserve the right to terminate accounts that violate these Terms.`,
  },
  {
    heading: "4. Subscriptions & Payments",
    body: `Stakemate offers a free tier and a "Stakemate Pro" subscription. Subscriptions are billed through the Apple App Store in accordance with Apple's payment terms.

Free trial: eligible new users receive a 7-day free trial of Pro features. The trial is non-transferable and limited to one trial per Apple ID.

Renewals: subscriptions renew automatically at the end of each billing period unless cancelled at least 24 hours before the renewal date via your App Store account settings.

Refunds: refund requests are handled by Apple. We have no control over and cannot issue refunds on Apple's behalf.`,
  },
  {
    heading: "5. Acceptable Use",
    body: `You agree not to:

• Use the App for any unlawful purpose or in violation of any regulations.
• Attempt to reverse-engineer, decompile or disassemble the App.
• Interfere with or disrupt the App's servers or networks.
• Scrape, copy or republish content from the App without permission.
• Impersonate any person or entity or misrepresent your affiliation.

We reserve the right to suspend or terminate access for any user who violates these Terms.`,
  },
  {
    heading: "6. User Data & Content",
    body: `You retain ownership of all session data and notes you enter into Stakemate. By storing data in the App you grant us a limited, non-exclusive licence to host and process that data for the purpose of providing the service.

We do not claim any ownership over your poker session records or notes.`,
  },
  {
    heading: "7. Intellectual Property",
    body: `The App, including its name "Stakemate", logo, design, code and content, is owned by us and protected by intellectual property laws. You are granted a limited, revocable, non-exclusive, non-transferable licence to use the App for personal, non-commercial purposes.

Nothing in these Terms transfers any intellectual property rights to you.`,
  },
  {
    heading: "8. Disclaimer of Warranties",
    body: `The App is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose or non-infringement.

We do not warrant that the App will be error-free, uninterrupted or free of viruses or other harmful components. Your use of the App is at your sole risk.`,
  },
  {
    heading: "9. Limitation of Liability",
    body: `To the fullest extent permitted by applicable law, we will not be liable for any indirect, incidental, special, consequential or punitive damages, including but not limited to loss of profits, data or goodwill, arising from your use of or inability to use the App.

Our total liability to you for any claim arising from these Terms or your use of the App will not exceed the amount you paid us in the 12 months preceding the claim.`,
  },
  {
    heading: "10. Governing Law",
    body: `These Terms are governed by the laws of New South Wales, Australia, without regard to conflict-of-law principles. Any dispute arising from these Terms will be subject to the exclusive jurisdiction of the courts of New South Wales.`,
  },
  {
    heading: "11. Contact",
    body: `Questions about these Terms?\n\nEmail: support@stakemate.com.au\nApp: Profile → Send Feedback`,
  },
];

export default function TermsScreen() {
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
        <Text style={[styles.title, { color: colors.text.primary }]}>Terms of Service</Text>
        <Text style={[styles.updated, { color: colors.text.tertiary }]}>
          Last updated: {LAST_UPDATED}
        </Text>
      </View>

      {/* Intro */}
      <View style={[styles.introCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <Text style={[styles.introText, { color: colors.text.secondary }]}>
          Please read these Terms of Service carefully before using Stakemate. These Terms govern your access to and use of the App and constitute a legally binding agreement between you and Stakemate.
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
