import { HandReviewLauncher } from "@/components/HandReviewLauncher";
import { PaywallModal } from "@/components/PaywallModal";
import { exportSessionsCSV } from "@/lib/exportCSV";
import { exportSessionsPDF } from "@/lib/exportPDF";
import { useSubscription } from "@/context/SubscriptionContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function MenuRow({
  icon, label, onPress, iconColor, isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  iconColor?: string;
  isLast?: boolean;
}) {
  const { colors } = usePokerTheme();
  return (
    <>
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.rowTouch}>
        <View style={[styles.rowIconWrap, { backgroundColor: (iconColor ?? colors.text.secondary) + "18" }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? colors.text.secondary} />
        </View>
        <Text style={[styles.rowLabel, { color: colors.text.primary }]}>{label}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
      </TouchableOpacity>
      {!isLast && <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

const BRAND = "#155DFC";

export default function MoreScreen() {
  const { colors, spacing, isDark } = usePokerTheme();
  const { isPro, isElite, restorePurchases, isLoading: subLoading } = useSubscription();
  const insets = useSafeAreaInsets();
  const [showPaywall, setShowPaywall]         = useState(false);
  const [showHandReview, setShowHandReview]   = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  async function handleShare() {
    try {
      await Share.share({
        message:
          "🃏 Check out Stakemate — the best poker bankroll tracker!\n\n" +
          "Track sessions, analyse your game, join the community and find staking opportunities.\n\n" +
          "Download free: https://apps.apple.com/app/id6772975225",
        url: "https://apps.apple.com/app/id6772975225",
        title: "Stakemate — Poker Bankroll Tracker",
      });
    } catch { /* user cancelled */ }
  }

  async function handleExportCSV() {
    if (!isPro && !isElite) { setShowPaywall(true); return; }
    setExporting(true);
    try {
      await exportSessionsCSV();
    } catch (e: any) {
      Alert.alert("Export failed", e?.message ?? "Could not export sessions. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPDF() {
    if (!isPro && !isElite) { setShowPaywall(true); return; }
    setExportingPDF(true);
    try {
      await exportSessionsPDF();
    } catch (e: any) {
      Alert.alert("Export failed", e?.message ?? "Could not generate PDF. Please try again.");
    } finally {
      setExportingPDF(false);
    }
  }

  const headerTranslateY    = useRef(new Animated.Value(0)).current;
  const headerContentMargin = useRef(new Animated.Value(0)).current;
  const headerShown         = useRef(true);
  const lastScrollY         = useRef(0);
  const headerHeightRef     = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (headerHeight > 0 && headerShown.current) {
      headerContentMargin.setValue(headerHeight);
    }
  }, [headerHeight]);

  const handleScroll = useCallback((event: any) => {
    const y    = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    if (diff > 6 && y > 10 && headerShown.current) {
      headerShown.current = false;
      Animated.parallel([
        Animated.timing(headerTranslateY, { toValue: -headerHeightRef.current, duration: 220, useNativeDriver: true }),
        Animated.timing(headerContentMargin, { toValue: 0, duration: 220, useNativeDriver: false }),
      ]).start();
    } else if ((diff < -6 || y <= 0) && !headerShown.current) {
      headerShown.current = true;
      Animated.parallel([
        Animated.timing(headerTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(headerContentMargin, { toValue: headerHeightRef.current, duration: 220, useNativeDriver: false }),
      ]).start();
    }
  }, [headerTranslateY, headerContentMargin]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
      <HandReviewLauncher visible={showHandReview} onClose={() => setShowHandReview(false)} />

      {/* ── Blue top bar (absolute, animated) ── */}
      <Animated.View
        onLayout={(e) => { const h = e.nativeEvent.layout.height; headerHeightRef.current = h; setHeaderHeight(h); }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: BRAND, paddingTop: insets.top + 10, paddingBottom: 16, paddingHorizontal: 20, transform: [{ translateY: headerTranslateY }] }}
      >
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>More</Text>
      </Animated.View>

      <Animated.View style={{ flex: 1, marginTop: headerContentMargin }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: 49 + insets.bottom + 32,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >

      {/* ── Upgrade — hidden only for Elite (nothing higher to upgrade to) ── */}
      {!isElite && (
        <TouchableOpacity
          onPress={() => setShowPaywall(true)}
          activeOpacity={0.88}
          style={[styles.upgradeBtn, { backgroundColor: "#7CF3D0", borderWidth: isDark ? 0 : 1.5, borderColor: "#0D9488" }]}
        >
          <Ionicons name="star" size={20} color="#002196" />
          <Text style={styles.upgradeBtnText}>{isPro ? "Upgrade to Elite" : "Upgrade to Pro / Elite"}</Text>
          <Ionicons name="chevron-forward" size={20} color="#002196" />
        </TouchableOpacity>
      )}

      {/* ── Tools ── */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>Tools</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <MenuRow
          icon="compass-outline"
          label="Explore Stakemate"
          iconColor="#0EA5E9"
          onPress={() => router.push("/explore")}
        />
        <MenuRow
          icon="swap-horizontal-outline"
          label="Currency Converter"
          iconColor="#49E6BA"
          onPress={() => router.push("/currency-converter")}
        />
        <MenuRow
          icon="color-wand-outline"
          label="AI Hand Review"
          iconColor="#0891B2"
          onPress={() => setShowHandReview(true)}
        />
        <MenuRow
          icon="calculator-outline"
          label="ICM Calculator"
          iconColor="#F59E0B"
          onPress={() => router.push("/icm-calculator")}
        />
        <MenuRow
          icon="stats-chart-outline"
          label="Hand Equity"
          iconColor="#EC4899"
          onPress={() => router.push("/hand-equity")}
        />
        <MenuRow
          icon="document-text-outline"
          label="Hand Notes"
          iconColor="#6366F1"
          onPress={() => router.push("/(tabs)/notes")}
        />
        <MenuRow
          icon="people-outline"
          label="Player Notes"
          iconColor="#0891B2"
          onPress={() => router.push("/player-notes")}
        />
        <MenuRow
          icon="storefront-outline"
          label="Marketplace"
          iconColor="#0891B2"
          onPress={() => router.push({ pathname: "/(tabs)/social", params: { openTab: "stakes" } } as any)}
        />
        <MenuRow
          icon="document-text-outline"
          label={exportingPDF ? "Generating PDF…" : `Export PDF${!isPro && !isElite ? " 🔒" : ""}`}
          iconColor="#EF4444"
          onPress={exportingPDF ? () => {} : handleExportPDF}
        />
        <MenuRow
          icon="download-outline"
          label={exporting ? "Exporting…" : `Export CSV${!isPro && !isElite ? " 🔒" : ""}`}
          iconColor="#22C55E"
          onPress={exporting ? () => {} : handleExportCSV}
          isLast
        />
      </View>

      {/* ── General ── */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>General</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <MenuRow
          icon="share-social-outline"
          label="Share with Friends"
          iconColor="#EC4899"
          onPress={handleShare}
        />
        <MenuRow
          icon="information-circle-outline"
          label="About Stakemate"
          iconColor={BRAND}
          onPress={() => router.push("/about")}
        />
        <MenuRow
          icon="help-circle-outline"
          label="FAQ"
          iconColor={BRAND}
          onPress={() => router.push("/faq")}
        />
        <MenuRow
          icon="refresh-outline"
          label={subLoading ? "Restoring…" : "Restore Purchases"}
          iconColor={BRAND}
          onPress={() => { if (!subLoading) restorePurchases(); }}
        />
        <MenuRow
          icon="chatbubble-outline"
          label="Send Feedback"
          iconColor={colors.text.secondary}
          onPress={() => Linking.openURL("mailto:support@stakemate.app?subject=Feedback")}
        />
        <MenuRow
          icon="lock-closed-outline"
          label="Privacy Policy"
          iconColor={colors.text.secondary}
          onPress={() => router.push("/privacy-policy")}
        />
        <MenuRow
          icon="document-text-outline"
          label="Terms of Service"
          iconColor={colors.text.secondary}
          onPress={() => router.push("/terms")}
        />
        <MenuRow
          icon="star-outline"
          label="Rate App"
          iconColor="#f59e0b"
          onPress={() => Linking.openURL("https://apps.apple.com/app/id6772975225")}
          isLast
        />
      </View>
      </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 16,
  },
  rowTouch: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  upgradeBtnText: {
    flex: 1,
    color: "#002196",
    fontSize: 16,
    fontWeight: "700",
  },
});
