import { HandReviewLauncher } from "@/components/HandReviewLauncher";
import { PaywallModal } from "@/components/PaywallModal";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
  const { colors, spacing } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [showPaywall, setShowPaywall]         = useState(false);
  const [showHandReview, setShowHandReview]   = useState(false);

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

      {/* ── Upgrade ── */}
      <TouchableOpacity
        onPress={() => setShowPaywall(true)}
        activeOpacity={0.88}
        style={[styles.upgradeBtn, { backgroundColor: "#D97706" }]}
      >
        <Ionicons name="star" size={20} color="#FEF3C7" />
        <Text style={styles.upgradeBtnText}>Upgrade to Pro / Elite</Text>
        <Ionicons name="chevron-forward" size={20} color="rgba(254,243,199,0.7)" />
      </TouchableOpacity>

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
          icon="color-wand-outline"
          label="AI Hand Review"
          iconColor="#0891B2"
          onPress={() => setShowHandReview(true)}
          isLast
        />
      </View>

      {/* ── General ── */}
      <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>General</Text>
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
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
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
