import { PaywallModal } from "@/components/PaywallModal";
import { useSubscription } from "@/context/SubscriptionContext";
import { getTrialStatus, markTrialStarted } from "@/hooks/use-trial";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const VISIBLE_TABS = ["index", "history", "notes", "profile"] as const;
type VisibleTab = (typeof VISIBLE_TABS)[number];

const LEFT_TABS:  VisibleTab[] = ["index", "history"];
const RIGHT_TABS: VisibleTab[] = ["notes", "profile"];

const TAB_CONFIG: Record<VisibleTab, { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = {
  index:   { icon: "home-variant-outline",   label: "Home"    },
  history: { icon: "history",                 label: "History" },
  notes:   { icon: "clipboard-text-outline", label: "Notes"   },
  profile: { icon: "account-circle-outline", label: "Profile" },
};

const COLOR_INACTIVE = "rgba(255,255,255,0.50)";

// FAB dimensions
const FAB_SIZE     = 52;
const FAB_SPACE    = FAB_SIZE + 16; // pill gap reserved for the FAB
const FAB_PROTRUDE = 14;            // px FAB rises above the pill top (matches Figma top:-14px)
const PILL_HEIGHT  = 68;

// Indicator insets
const IND_V_INSET = 5;
const IND_H_INSET = 4;

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, spacing } = usePokerTheme();
  const { isPro } = useSubscription();
  const insets = useSafeAreaInsets();
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [paywallVisible,     setPaywallVisible]     = useState(false);

  // Pill width drives all indicator math — avoids onLayout ordering races
  const [pillWidth, setPillWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(-200)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const fabPulse   = useRef(new Animated.Value(1)).current;

  const activeRouteName = state.routes[state.index]?.name ?? "";
  const showBar = VISIBLE_TABS.includes(activeRouteName as VisibleTab);

  // Calculate indicator position from pill width — pure math, no layout races
  const moveIndicator = (routeName: string, width: number) => {
    if (width <= 0) return;
    const groupW = (width - FAB_SPACE) / 2; // width of each tab group
    const tabW   = groupW / 2;              // width of each individual tab

    let tabX = 0;
    switch (routeName) {
      case "index":   tabX = 0;                          break;
      case "history": tabX = tabW;                       break;
      case "notes":   tabX = groupW + FAB_SPACE;         break;
      case "profile": tabX = groupW + FAB_SPACE + tabW;  break;
    }

    Animated.spring(indicatorX, {
      toValue: tabX + IND_H_INSET,
      useNativeDriver: false,
      tension: 140,
      friction: 14,
    }).start();
    Animated.spring(indicatorW, {
      toValue: tabW - IND_H_INSET * 2,
      useNativeDriver: false,
      tension: 140,
      friction: 14,
    }).start();
  };

  useEffect(() => {
    moveIndicator(activeRouteName, pillWidth);
  }, [activeRouteName, pillWidth]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const openLive = () => {
    setActionSheetVisible(false);
    const trial = getTrialStatus();
    if (!isPro && !trial.allowed) { setPaywallVisible(true); return; }
    markTrialStarted();
    router.push("/live");
  };
  const openAdd = () => { setActionSheetVisible(false); router.push("/add"); };

  if (!showBar) return null;

  const bottomOffset = insets.bottom > 0 ? insets.bottom : 16;

  const renderTab = (routeName: string) => {
    const isActive  = routeName === activeRouteName;
    const cfg       = TAB_CONFIG[routeName as VisibleTab];
    const iconColor = isActive ? colors.bg.brand : COLOR_INACTIVE;

    return (
      <TouchableOpacity
        key={routeName}
        onPress={() => {
          const evt = navigation.emit({
            type: "tabPress",
            target: state.routes.find((r) => r.name === routeName)?.key ?? "",
            canPreventDefault: true,
          });
          if (!evt.defaultPrevented) navigation.navigate(routeName as never);
        }}
        activeOpacity={0.7}
        style={styles.tabItem}
      >
        <MaterialCommunityIcons name={cfg.icon} size={22} color={iconColor} />
        <Text style={[styles.tabLabel, { color: iconColor, fontWeight: isActive ? "700" : "500" }]}>
          {cfg.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.outerContainer, { bottom: bottomOffset }]}
      >
        {/* ── FAB — centered, protrudes above the pill ── */}
        <View style={styles.fabWrapper} pointerEvents="box-none">
          <Animated.View style={[styles.fabShadow, { transform: [{ scale: fabPulse }] }]}>
            <TouchableOpacity
              onPress={() => setActionSheetVisible(true)}
              activeOpacity={0.82}
              style={[styles.fabButton, { backgroundColor: colors.bg.brand }]}
            >
              <View style={[StyleSheet.absoluteFill, styles.fabRing]} />
              <MaterialCommunityIcons name="plus" size={28} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* "Start Session" label — no dot, sits just inside the pill top */}
          <Text style={styles.fabLabel}>Start Session</Text>
        </View>

        {/* ── Glass pill ── */}
        <View style={styles.pillShadow}>
          <View style={styles.pillClip}>
            <BlurView
              intensity={90}
              tint={Platform.OS === "ios" ? "systemThinMaterialDark" : "dark"}
              style={styles.pillBlur}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w !== pillWidth) setPillWidth(w);
              }}
            >
              {/* Dark tinted base */}
              <View style={[StyleSheet.absoluteFill, styles.pillBase]} />

              {/* Glossy border ring */}
              <View style={[StyleSheet.absoluteFill, styles.pillBorder]} />

              {/* Sliding active indicator — positioned via math, not onLayout race */}
              {pillWidth > 0 && (
                <Animated.View
                  style={[
                    styles.indicator,
                    { left: indicatorX, width: indicatorW },
                  ]}
                >
                  {/* Inner gloss highlight */}
                  <View style={styles.indicatorGloss} />
                </Animated.View>
              )}

              {/* Left tabs */}
              <View style={styles.tabGroup}>
                {LEFT_TABS.map(renderTab)}
              </View>

              {/* Center gap for FAB */}
              <View style={{ width: FAB_SPACE }} />

              {/* Right tabs */}
              <View style={styles.tabGroup}>
                {RIGHT_TABS.map(renderTab)}
              </View>
            </BlurView>
          </View>
        </View>
      </View>

      <PaywallModal
        visible={paywallVisible}
        feature="liveSession"
        onClose={() => setPaywallVisible(false)}
      />

      {/* ── Action sheet ── */}
      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setActionSheetVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setActionSheetVisible(false)}
          style={styles.modalBackdrop}
        >
          <View
            style={[
              styles.actionSheet,
              {
                backgroundColor: colors.bg.secondary,
                paddingBottom: insets.bottom > 0 ? insets.bottom + spacing.md : spacing["2xl"],
              },
            ]}
          >
            <View style={[styles.dragHandle, { backgroundColor: colors.border.strong }]} />
            <Text style={[styles.actionTitle, { color: colors.text.primary }]}>New Game</Text>
            <Text style={[styles.actionSubtitle, { color: colors.text.secondary }]}>
              Choose an action below
            </Text>

            <TouchableOpacity
              onPress={openLive}
              activeOpacity={0.85}
              style={[styles.actionBtn, { backgroundColor: colors.bg.brand }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.text.onBrand }]}>
                Start Live Session
              </Text>
              {(() => {
                if (isPro) return null;
                const trial = getTrialStatus();
                if (!trial.allowed) return (
                  <MaterialCommunityIcons name="crown" size={16} color={colors.text.onBrand} style={{ opacity: 0.85 }} />
                );
                if (!trial.trialStarted) return (
                  <View style={styles.trialBadge}>
                    <Text style={[styles.trialBadgeText, { color: colors.text.onBrand }]}>7-day free</Text>
                  </View>
                );
                return (
                  <View style={styles.trialBadge}>
                    <Text style={[styles.trialBadgeText, { color: colors.text.onBrand }]}>{trial.daysLeft}d left</Text>
                  </View>
                );
              })()}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openAdd}
              activeOpacity={0.85}
              style={[styles.actionBtn, { backgroundColor: colors.bg.tertiary }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.text.primary }]}>Log Past Session</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setActionSheetVisible(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.text.brand }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },

  // ── FAB ──────────────────────────────────────────────────────────────
  fabWrapper: {
    position: "absolute",
    top: -FAB_PROTRUDE,
    zIndex: 20,
    alignItems: "center",
    gap: 2,
  },
  fabShadow: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    shadowColor: "#7ccf00",
    shadowOpacity: 0.55,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 12,
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fabRing: {
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  fabLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.70)",
    letterSpacing: 0.2,
  },

  // ── Pill ─────────────────────────────────────────────────────────────
  pillShadow: {
    width: "100%",
    height: PILL_HEIGHT,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    elevation: 14,
  },
  pillClip: {
    borderRadius: 999,
    overflow: "hidden",
    height: PILL_HEIGHT,
  },
  pillBlur: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: PILL_HEIGHT,
  },
  pillBase: {
    backgroundColor: "rgba(2, 6, 24, 0.55)",
  },
  pillBorder: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  // ── Sliding active indicator ─────────────────────────────────────────
  indicator: {
    position: "absolute",
    top: IND_V_INSET,
    bottom: IND_V_INSET,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    overflow: "hidden",
  },
  // Top highlight stripe — the "glossy" sheen
  indicatorGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  // ── Tab groups & items ───────────────────────────────────────────────
  tabGroup: {
    flex: 1,
    flexDirection: "row",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
  },

  // ── Action sheet ─────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  actionSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  actionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: "700",
  },
  trialBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  trialBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
