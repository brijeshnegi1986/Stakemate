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

const VISIBLE_TABS = ["index", "history", "hand-review", "settings"] as const;
type VisibleTab = (typeof VISIBLE_TABS)[number];

const TAB_CONFIG: Record<VisibleTab, { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = {
  index:         { icon: "home-variant",       label: "Home"    },
  history:       { icon: "history",            label: "Sessions" },
  "hand-review": { icon: "cards-playing",      label: "Review"  },
  settings:      { icon: "cog-outline",        label: "Settings" },
};

const FAB_SIZE = 68;
// Horizontal gap between indicator edge and tab boundary — matches Figma's 10px inset
const INDICATOR_H_INSET = 5;
// Vertical gap between indicator edge and pill boundary
const INDICATOR_V_INSET = 5;

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, spacing } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [pillWidth, setPillWidth] = useState(0);

  const activeRouteName = state.routes[state.index]?.name ?? "";
  const showBar = VISIBLE_TABS.includes(activeRouteName as VisibleTab);

  const visibleRoutes = state.routes.filter((r) =>
    VISIBLE_TABS.includes(r.name as VisibleTab)
  );
  const activeVisibleIndex = visibleRoutes.findIndex(
    (r) => r.key === state.routes[state.index]?.key
  );
  const clampedIndex = Math.max(0, activeVisibleIndex);

  const indicatorAnim = useRef(new Animated.Value(clampedIndex)).current;
  const fabPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(indicatorAnim, {
      toValue: clampedIndex,
      useNativeDriver: true,
      tension: 120,
      friction: 14,
    }).start();
  }, [clampedIndex]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, {
          toValue: 1.05,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(fabPulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fabPulse]);

  const tabWidth = pillWidth > 0 ? pillWidth / VISIBLE_TABS.length : 0;

  // Indicator slides to the left edge of each tab, inset adds the spacing inside
  const indicatorX = indicatorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [0, tabWidth, tabWidth * 2, tabWidth * 3],
  });

  const openLive = () => { setActionSheetVisible(false); router.push("/live"); };
  const openAdd  = () => { setActionSheetVisible(false); router.push("/add"); };

  if (!showBar) return null;

  const bottomOffset = insets.bottom > 0 ? insets.bottom : 16;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          bottom: bottomOffset,
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* ── Glass pill (shadow sits on outer wrapper so it isn't clipped) ── */}
        <View
          style={{
            flex: 1,
            borderRadius: 999,
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 20,
            elevation: 14,
          }}
        >
          {/* Clip region — overflow:hidden is on the inner view so blur renders correctly */}
          <View style={{ borderRadius: 999, overflow: "hidden" }}>
            <BlurView
              intensity={90}
              tint={Platform.OS === "ios" ? "systemThinMaterialDark" : "dark"}
              style={{ flexDirection: "row" }}
            >
              {/* ── Dark base — gives the "tinted glass" depth ── */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: "rgba(2, 6, 24, 0.52)" },
                ]}
              />

              {/* ── Glossy border ring ── */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.28)",
                  },
                ]}
              />

              {/* ── Sliding active indicator ── */}
              {pillWidth > 0 && activeVisibleIndex >= 0 && (
                <Animated.View
                  style={{
                    position: "absolute",
                    top: INDICATOR_V_INSET,
                    bottom: INDICATOR_V_INSET,
                    left: INDICATOR_H_INSET,
                    width: tabWidth - INDICATOR_H_INSET * 2,
                    borderRadius: 999,
                    // Glassy white indicator that stands out from the dark base
                    backgroundColor: "rgba(255,255,255,0.18)",
                    // Subtle inner highlight on the indicator itself
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "rgba(255,255,255,0.30)",
                    transform: [{ translateX: indicatorX }],
                  }}
                />
              )}

              {/* ── Tab items ── */}
              <View
                style={{ flex: 1, flexDirection: "row" }}
                onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
              >
                {visibleRoutes.map((route, index) => {
                  const isActive = index === clampedIndex && activeVisibleIndex >= 0;
                  const cfg = TAB_CONFIG[route.name as VisibleTab];
                  const iconColor = isActive ? colors.bg.brand : "rgba(255,255,255,0.55)";

                  return (
                    <TouchableOpacity
                      key={route.key}
                      onPress={() => {
                        const evt = navigation.emit({
                          type: "tabPress",
                          target: route.key,
                          canPreventDefault: true,
                        });
                        if (!evt.defaultPrevented) {
                          navigation.navigate(route.name as never);
                        }
                      }}
                      activeOpacity={0.7}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 13,
                        gap: 3,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={cfg.icon}
                        size={22}
                        color={iconColor}
                      />
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: iconColor,
                          lineHeight: 14,
                        }}
                      >
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </BlurView>
          </View>
        </View>

        {/* ── FAB ── */}
        <Animated.View
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            shadowColor: colors.bg.brand,
            shadowOpacity: 0.6,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 14,
            elevation: 12,
            transform: [{ scale: fabPulse }],
          }}
        >
          <TouchableOpacity
            onPress={() => setActionSheetVisible(true)}
            activeOpacity={0.82}
            style={{
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              // backgroundColor: "rgba(154,230,0,0.85)",
              backgroundColor: colors.bg.brand,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {/* FAB glossy border ring */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: FAB_SIZE / 2,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.30)",
                },
              ]}
            />
            <Text
              style={{
                color: colors.text.onBrand,
                fontSize: 11,
                fontWeight: "700",
                lineHeight: 15,
                textAlign: "center",
                letterSpacing: 0.1,
              }}
            >
              {"Start\nSession"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Action sheet modal ── */}
      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setActionSheetVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setActionSheetVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
        >
          <View
            style={{
              backgroundColor: colors.bg.secondary,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: spacing.lg,
              paddingBottom: insets.bottom > 0 ? insets.bottom + spacing.md : spacing["2xl"],
            }}
          >
            {/* Drag handle */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border.strong,
                alignSelf: "center",
                marginBottom: spacing.lg,
              }}
            />
            <Text
              style={{
                color: colors.text.primary,
                fontSize: 20,
                fontWeight: "700",
                marginBottom: spacing.sm,
              }}
            >
              New Session
            </Text>
            <Text
              style={{
                color: colors.text.secondary,
                fontSize: 14,
                marginBottom: spacing.lg,
              }}
            >
              Choose an action below
            </Text>
            <TouchableOpacity
              onPress={openLive}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.bg.brand,
                borderRadius: 14,
                paddingVertical: spacing.lg,
                alignItems: "center",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "700" }}>
                Start Live Session
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openAdd}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.bg.tertiary,
                borderRadius: 14,
                paddingVertical: spacing.lg,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>
                Log Past Session
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActionSheetVisible(false)}
              style={{ marginTop: spacing.lg, alignItems: "center" }}
            >
              <Text style={{ color: colors.text.brand, fontSize: 16, fontWeight: "700" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
