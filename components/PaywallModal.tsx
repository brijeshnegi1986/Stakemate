import { PRO_FEATURES, ProFeature } from "@/constants/subscription";
import { useSubscription } from "@/context/SubscriptionContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator, Modal, Platform, ScrollView, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEATURES_LIST: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
  { icon: "history",          label: "Unlimited session history" },
  { icon: "lightning-bolt",   label: "Live session tracker" },
  { icon: "auto-fix",         label: "AI note enhancement" },
  { icon: "notebook-outline", label: "Notes history, export & copy" },
];

type PlanKey = "lifetime" | "annual" | "monthly" | "weekly";

interface PlanConfig {
  key: PlanKey;
  label: string;
  period: string;
  badge?: string;
  sublabel: (price: string) => string;
  fallbackPrice: string;
}

const PLANS: PlanConfig[] = [
  {
    key: "lifetime",
    label: "Lifetime",
    period: "one-time",
    badge: "BEST DEAL",
    sublabel: () => "Pay once, own it forever",
    fallbackPrice: "$99.99",
  },
  {
    key: "annual",
    label: "Yearly",
    period: "per year",
    badge: "BEST VALUE",
    sublabel: (price) => `~$${(parseFloat(price.replace(/[^0-9.]/g, "")) / 12).toFixed(2)}/mo`,
    fallbackPrice: "$39.99",
  },
  {
    key: "monthly",
    label: "Monthly",
    period: "per month",
    sublabel: () => "Billed monthly, cancel anytime",
    fallbackPrice: "$7.99",
  },
  {
    key: "weekly",
    label: "Weekly",
    period: "per week",
    sublabel: () => "Great for a trial run",
    fallbackPrice: "$2.99",
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  feature?: ProFeature;
}

export function PaywallModal({ visible, onClose, feature }: Props) {
  const { colors, radius } = usePokerTheme();
  const { offerings, purchase, restore } = useSubscription();
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<PlanKey>("annual");
  const [loading, setLoading]   = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const lifetimePkg = offerings?.availablePackages.find(p => p.product.identifier === "lifetime");
  const weeklyPkg   = offerings?.availablePackages.find(p => p.product.identifier === "weekly");
  const monthlyPkg  = offerings?.availablePackages.find(p => p.product.identifier === "monthly");
  const annualPkg   = offerings?.availablePackages.find(p => p.product.identifier === "yearly");

  function getPkg(key: PlanKey) {
    if (key === "lifetime") return lifetimePkg;
    if (key === "weekly")   return weeklyPkg;
    if (key === "monthly")  return monthlyPkg;
    return annualPkg;
  }

  function getPrice(key: PlanKey, fallback: string) {
    return getPkg(key)?.product.priceString ?? fallback;
  }

  async function handlePurchase() {
    const pkg = getPkg(selected);
    if (!pkg) return;
    setLoading(true);
    setError(null);
    const ok = await purchase(pkg.product.identifier);
    setLoading(false);
    if (ok) onClose();
    else setError("Purchase was not completed. Please try again.");
  }

  async function handleRestore() {
    setRestoring(true);
    setError(null);
    const ok = await restore();
    setRestoring(false);
    if (ok) onClose();
    else setError("No active subscription found for this account.");
  }

  const featureLabel = feature ? PRO_FEATURES[feature] : null;
  const selectedPlan = PLANS.find(p => p.key === selected)!;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.bg.primary,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24,
          maxHeight: "92%",
        }}>
          {/* Close */}
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
            <MaterialCommunityIcons name="close" size={22} color={colors.text.tertiary} />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bg.brand + "22", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <MaterialCommunityIcons name="crown" size={26} color={colors.text.brand} />
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: "800", textAlign: "center" }}>
                Upgrade to Pro
              </Text>
              {featureLabel ? (
                <Text style={{ color: colors.text.secondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 }}>
                  <Text style={{ color: colors.text.brand, fontWeight: "700" }}>{featureLabel}</Text>
                  {" "}is a Pro feature.
                </Text>
              ) : (
                <Text style={{ color: colors.text.secondary, fontSize: 13, textAlign: "center", marginTop: 6 }}>
                  Unlock everything PokerRoll has to offer.
                </Text>
              )}
            </View>

            {/* Feature list */}
            <View style={{ gap: 10, marginBottom: 22 }}>
              {FEATURES_LIST.map(f => (
                <View key={f.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg.brand + "18", alignItems: "center", justifyContent: "center" }}>
                    <MaterialCommunityIcons name={f.icon} size={16} color={colors.text.brand} />
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "500", flex: 1 }}>{f.label}</Text>
                  <MaterialCommunityIcons name="check-circle" size={16} color={colors.text.brand} />
                </View>
              ))}
            </View>

            {/* Plan selector — Free + 3 paid */}
            <View style={{ gap: 10, marginBottom: 16 }}>

              {PLANS.map(plan => {
                const price = getPrice(plan.key, plan.fallbackPrice);
                const isSelected = selected === plan.key;
                return (
                  <TouchableOpacity
                    key={plan.key}
                    onPress={() => setSelected(plan.key)}
                    activeOpacity={0.8}
                    style={{
                      borderRadius: radius.md, borderWidth: 2,
                      borderColor: isSelected ? colors.border.brand : colors.border.default,
                      backgroundColor: isSelected ? colors.bg.brand + "12" : colors.bg.secondary,
                      paddingHorizontal: 16, paddingVertical: 14,
                      flexDirection: "row", alignItems: "center",
                    }}
                  >
                    {/* Radio dot */}
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: isSelected ? colors.bg.brand : colors.border.strong,
                      alignItems: "center", justifyContent: "center", marginRight: 12,
                    }}>
                      {isSelected && (
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.bg.brand }} />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "700" }}>
                          {plan.label}
                        </Text>
                        {plan.badge && (
                          <View style={{ backgroundColor: colors.bg.brand, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: colors.text.onBrand, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 }}>
                              {plan.badge}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: isSelected ? colors.text.brand : colors.text.tertiary, fontSize: 12, marginTop: 2 }}>
                        {plan.sublabel(price)}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: "800" }}>{price}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 1 }}>{plan.period}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Error */}
            {error && (
              <Text style={{ color: colors.text.danger, fontSize: 12, textAlign: "center", marginBottom: 10 }}>
                {error}
              </Text>
            )}

            {/* Subscribe button */}
            <TouchableOpacity onPress={handlePurchase} disabled={loading} activeOpacity={0.85}
              style={{ backgroundColor: colors.bg.brand, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginBottom: 10 }}>
              {loading
                ? <ActivityIndicator color={colors.text.onBrand} />
                : <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "800" }}>
                    {selected === "lifetime" ? "Get Lifetime Access" : `Start ${selectedPlan.label} Plan`}
                  </Text>
              }
            </TouchableOpacity>

            {/* Restore */}
            <TouchableOpacity onPress={handleRestore} disabled={restoring} style={{ alignItems: "center", paddingVertical: 8 }}>
              {restoring
                ? <ActivityIndicator color={colors.text.tertiary} size="small" />
                : <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Restore Purchases</Text>
              }
            </TouchableOpacity>

            {/* Legal */}
            <Text style={{ color: colors.text.tertiary, fontSize: 10, textAlign: "center", marginTop: 8, lineHeight: 15 }}>
              {Platform.OS === "ios"
                ? "Payment charged to your Apple ID. Subscription auto-renews unless cancelled 24hrs before renewal."
                : "Payment charged to your Google Play account. Cancel anytime in Google Play settings."
              }
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
