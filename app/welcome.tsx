import { PokerRollLogo } from "@/components/PokerRollLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Platform, Text, TouchableOpacity, View } from "react-native";

const FEATURES = [
  "Track sessions in under 10 seconds",
  "Know your true hourly rate",
  "See your profit over time",
];

export default function WelcomeScreen() {
  const { colors, radius, typography } = usePokerTheme();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const TOP_INSET = Platform.OS === "ios" ? 56 : 32;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          paddingHorizontal: 16,
          paddingTop: TOP_INSET + 16,
          justifyContent: "space-between"
        }}
      >

        {/* ── Logo row ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
            marginBottom: 24,
            marginTop: 54,
          }}
        >
          <PokerRollLogo size={64} style={{ marginRight: 10 }} />
          <View>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: 28,
                fontWeight: "800",
                letterSpacing: 0.3,
                lineHeight: 32,
              }}
            >
              PokerRoll
            </Text>
            <Text
              style={{
                color: colors.text.tertiary,
                fontSize: 14,
                letterSpacing: 0.4,
                marginTop: 2,
              }}
            >
              by Stakemate
            </Text>
          </View>
        </View>

        {/* ── Hero text ── */}
        <View style={{ marginTop: 16, alignItems: "flex-start" }}>
          <Text
            style={{
              color: colors.text.brand,
              fontSize: 34,
              fontWeight: "800",
              letterSpacing: 0.2,
              lineHeight: 36,
              textAlign: "left",
            }}
          >
            TRACK EVERY{"\n"}POKER SESSION.
          </Text>
          <Text
            style={{
              color: colors.text.primary,
              fontSize: 26,
              fontWeight: "700",
              fontStyle: "italic",
              lineHeight: 32,
              // marginTop: 10,
              textAlign: "left",
            }}
          >
            BUILD YOUR EDGE.
          </Text>
          <Text
            style={{
              color: colors.text.secondary,
              fontSize: 15,
              lineHeight: 24,
              marginTop: 16,
              textAlign: "left",
              maxWidth: 340,
            }}
          >
            Your bankroll tells a story — start tracking it today.
          </Text>
        </View>

        {/* ── Feature list ── */}
        <View style={{ marginTop: 48 }}>
          {FEATURES.map((item) => (
            <View
              key={item}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <MaterialCommunityIcons
                name="check-circle"
                size={22}
                color={colors.text.brand}
                style={{ marginRight: 10 }}
              />
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: 14,
                  lineHeight: 20,
                  fontWeight: "500",
                }}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>

      </Animated.View>

      {/* ── CTA pinned to bottom ── */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          paddingHorizontal: 16,
          paddingBottom: Platform.OS === "ios" ? 40 : 24,
          paddingTop: 16,
        }}
      >
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          activeOpacity={0.88}
          style={{
            backgroundColor: colors.bg.brand,
            borderRadius: radius.full,
            paddingVertical: 16,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.bg.brand,
            shadowOpacity: 0.45,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 16,
            elevation: 6,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: colors.text.onBrand,
              ...typography.body,
              fontWeight: "600",
              letterSpacing: 0.3,
            }}
          >
            Start Tracking Free
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            color: colors.text.tertiary,
            ...typography.caption,
            textAlign: "center",
          }}
        >
          No signup required. Your data stays on your device.
        </Text>
      </Animated.View>
    </View>
  );
}
