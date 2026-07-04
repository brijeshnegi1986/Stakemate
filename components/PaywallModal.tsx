import {
  PRODUCT_ELITE_MONTHLY,
  PRODUCT_ELITE_YEARLY,
  PRODUCT_PRO_MONTHLY,
  PRODUCT_PRO_YEARLY,
} from "@/constants/subscription";
import { useSubscription } from "@/context/SubscriptionContext";
import { Ionicons } from "@expo/vector-icons";
import { presentCodeRedemptionSheetIOS } from "expo-iap";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Plan   = "pro" | "elite";
type Period = "yearly" | "monthly";

const BRAND = "#155DFC";

const PLAN_META: Record<Plan, { label: string; tagline: string; color: string; accent: string }> = {
  pro: {
    label:   "Pro",
    tagline: "Serious players, serious stats",
    color:   BRAND,
    accent:  "#4B82FF",
  },
  elite: {
    label:   "Elite",
    tagline: "Everything Pro + AI coaching",
    color:   "#0891B2",
    accent:  "#9B5DF5",
  },
};

const PRICING = {
  pro: {
    yearly:  { perMonth: "A$8.33", annual: "A$99.99", save: "Save 17%" },
    monthly: { perMonth: "A$9.99", billing: "A$9.99/month" },
  },
  elite: {
    yearly:  { perMonth: "A$16.67", annual: "A$199.99", save: "Save 17%" },
    monthly: { perMonth: "A$19.99", billing: "A$19.99/month" },
  },
} as const;

const PRODUCT_IDS: Record<Plan, Record<Period, string>> = {
  pro:   { yearly: PRODUCT_PRO_YEARLY,   monthly: PRODUCT_PRO_MONTHLY   },
  elite: { yearly: PRODUCT_ELITE_YEARLY, monthly: PRODUCT_ELITE_MONTHLY },
};

const PRO_FEATURES: { text: string; icon: string }[] = [
  { text: "Unlimited sessions & notes",       icon: "infinite-outline" },
  { text: "Full analytics & charts",          icon: "bar-chart-outline" },
  { text: "Hourly rate & win rate tracking",  icon: "trending-up-outline" },
  { text: "Win/loss streak tracking",         icon: "flame-outline" },
  { text: "Tournament calendar",              icon: "calendar-outline" },
  { text: "Device calendar sync",             icon: "sync-outline" },
  { text: "Staking marketplace",              icon: "storefront-outline" },
  { text: "Dark mode",                        icon: "moon-outline" },
  { text: "PDF export",                       icon: "document-text-outline" },
  { text: "Currency conversion",              icon: "cash-outline" },
  { text: "Location auto-detect",             icon: "location-outline" },
];

const ELITE_ONLY: { text: string; icon: string }[] = [
  { text: "AI hand exploit analysis",         icon: "hardware-chip-outline" },
  { text: "AI session coaching",              icon: "chatbubble-ellipses-outline" },
  { text: "AI note enhance & compress",       icon: "sparkles-outline" },
  { text: "Publish tournaments to community", icon: "megaphone-outline" },
];

export function PaywallModal({
  visible = false,
  onClose,
}: {
  visible?: boolean;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [plan, setPlan]     = useState<Plan>("pro");
  const [period, setPeriod] = useState<Period>("yearly");
  const { purchaseSubscription, restorePurchases, isLoading } = useSubscription();

  const pricing   = PRICING[plan];
  const meta      = PLAN_META[plan];
  const productId = PRODUCT_IDS[plan][period];

  async function handleSubscribe() {
    await purchaseSubscription(productId);
  }

  async function handlePromoCode() {
    if (Platform.OS !== "ios") return;
    try {
      await presentCodeRedemptionSheetIOS();
    } catch {
      Alert.alert("Not available", "Code redemption is not available right now.");
    }
  }

  function handleTerms() {
    onClose?.();
    router.push("/terms");
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.root}>

        {/* ── Hero ── */}
        <View style={[styles.hero, { backgroundColor: meta.color }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Ionicons name="close" size={32} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {/* Wordmark */}
          <View style={styles.heroMark}>
            <Image
              source={require("@/assets/images/stakemate-logo_light.png")}
              style={{ width: 82, height: 82 * (247 / 902) }}
              contentFit="contain"
            />
          </View>

          {/* Plan label */}
          <Text style={styles.heroPlanName}>{meta.label}</Text>
          <Text style={styles.heroTagline}>{meta.tagline}</Text>

          {/* Trial chip */}
          <View style={styles.trialChip}>
            <Ionicons name="gift-outline" size={13} color={meta.color} />
            <Text style={[styles.trialChipText, { color: meta.color }]}>7-day free trial included</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 20 }]}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Plan switcher (underline tabs) ── */}
          <View style={styles.planTabs}>
            {(["pro", "elite"] as Plan[]).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPlan(p)}
                style={[styles.planTab, plan === p && { borderBottomColor: PLAN_META[p].color, borderBottomWidth: 2 }]}
                activeOpacity={0.75}
              >
                <Text style={[styles.planTabText, plan === p && { color: PLAN_META[p].color, fontWeight: "700" }]}>
                  {PLAN_META[p].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Period selector (stacked rows) ── */}
          <View style={styles.periodSection}>
            {/* Yearly row */}
            <TouchableOpacity
              onPress={() => setPeriod("yearly")}
              style={[styles.periodRow, period === "yearly" && { borderColor: meta.color, backgroundColor: `${meta.color}08` }]}
              activeOpacity={0.8}
            >
              <View style={[styles.periodCheck, period === "yearly" && { backgroundColor: meta.color, borderColor: meta.color }]}>
                {period === "yearly" && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.periodRowTop}>
                  <Text style={[styles.periodLabel, period === "yearly" && { color: "#0f172b" }]}>Yearly</Text>
                  <View style={[styles.savePill, { backgroundColor: "#22C55E" }]}>
                    <Text style={styles.savePillText}>{pricing.yearly.save}</Text>
                  </View>
                </View>
                <Text style={styles.periodNote}>Billed {pricing.yearly.annual}/yr · after trial</Text>
              </View>
              <View style={styles.periodPrice}>
                <Text style={[styles.periodPriceAmount, period === "yearly" && { color: meta.color }]}>
                  {pricing.yearly.perMonth}
                </Text>
                <Text style={styles.periodPricePer}>/mo</Text>
              </View>
            </TouchableOpacity>

            {/* Monthly row */}
            <TouchableOpacity
              onPress={() => setPeriod("monthly")}
              style={[styles.periodRow, period === "monthly" && { borderColor: meta.color, backgroundColor: `${meta.color}08` }]}
              activeOpacity={0.8}
            >
              <View style={[styles.periodCheck, period === "monthly" && { backgroundColor: meta.color, borderColor: meta.color }]}>
                {period === "monthly" && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.periodLabel, period === "monthly" && { color: "#0f172b" }]}>Monthly</Text>
                <Text style={styles.periodNote}>Billed {pricing.monthly.billing}</Text>
              </View>
              <View style={styles.periodPrice}>
                <Text style={[styles.periodPriceAmount, period === "monthly" && { color: meta.color }]}>
                  {pricing.monthly.perMonth}
                </Text>
                <Text style={styles.periodPricePer}>/mo</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Features ── */}
          <View style={styles.featuresSection}>
            <Text style={styles.featuresHeading}>
              {plan === "pro" ? "What's included in Pro" : "Everything in Pro, plus"}
            </Text>

            {plan === "elite" && (
              <>
                {ELITE_ONLY.map((f) => (
                  <View key={f.text} style={styles.featureItem}>
                    <View style={[styles.featCheck, { backgroundColor: "#0891B2" }]}>
                      <Ionicons name={f.icon as any} size={12} color="#fff" />
                    </View>
                    <Text style={[styles.featureText, { fontWeight: "700", color: "#0891B2" }]}>{f.text}</Text>
                    <View style={styles.eliteTag}>
                      <Text style={styles.eliteTagText}>ELITE</Text>
                    </View>
                  </View>
                ))}
                <View style={[styles.divider, { marginVertical: 12 }]} />
                <Text style={[styles.featuresHeading, { marginBottom: 10 }]}>Plus all Pro features</Text>
              </>
            )}

            {PRO_FEATURES.map((f) => (
              <View key={f.text} style={styles.featureItem}>
                <View style={[styles.featCheck, { backgroundColor: `${meta.color}18` }]}>
                  <Ionicons name={f.icon as any} size={13} color={meta.color} />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* ── Sticky CTA ── */}
        <View style={[styles.stickyBottom, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: meta.color }, isLoading && { opacity: 0.7 }]}
            activeOpacity={0.88}
            onPress={handleSubscribe}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaInner}>
                <Text style={styles.ctaText}>Start 7-day free trial</Text>
                <View style={styles.ctaArrow}>
                  <Ionicons name="arrow-forward" size={16} color={meta.color} />
                </View>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.ctaSub}>Then {period === "yearly" ? pricing.yearly.annual + "/yr" : pricing.monthly.billing} · Cancel anytime</Text>

          <View style={styles.footer}>
            <TouchableOpacity activeOpacity={0.6} onPress={handlePromoCode}>
              <Text style={styles.footerLink}>Promo code</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity activeOpacity={0.6} onPress={() => restorePurchases()}>
              <Text style={styles.footerLink}>Restore</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity activeOpacity={0.6} onPress={handleTerms}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  // Hero
  hero: {
    paddingTop: 72,       // space for absolutely-positioned close btn + content gap
    paddingHorizontal: 24,
    paddingBottom: 28,
    position: "relative",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  heroAppName: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
  },
  heroPlanName: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroTagline: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 16,
  },
  trialChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  trialChipText: {
    fontSize: 12,
    fontWeight: "700",
  },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 0,
  },

  // Plan tabs (underline style)
  planTabs: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    marginBottom: 20,
  },
  planTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  planTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94A3B8",
  },

  // Period rows (vertical stacked)
  periodSection: {
    gap: 10,
    marginBottom: 28,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  periodCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  periodRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  periodLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  savePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  savePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  periodNote: {
    fontSize: 12,
    color: "#94A3B8",
  },
  periodPrice: {
    alignItems: "flex-end",
  },
  periodPriceAmount: {
    fontSize: 17,
    fontWeight: "800",
    color: "#64748B",
  },
  periodPricePer: {
    fontSize: 11,
    color: "#94A3B8",
  },

  // Features
  featuresSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  featuresHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  featCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  eliteTag: {
    backgroundColor: "#EDE9FE",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  eliteTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0891B2",
    letterSpacing: 0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
  },

  // Sticky bottom
  stickyBottom: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: "#F8FAFC",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: "center",
    marginBottom: 10,
  },
  ctaInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  ctaArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaSub: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  footerDot: {
    fontSize: 13,
    color: "#CBD5E1",
  },
  footerLink: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
});
