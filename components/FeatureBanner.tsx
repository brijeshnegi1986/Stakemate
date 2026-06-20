import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  description: string;
  cta: string;
  onPress: () => void;
};

const INTERVAL_MS = 3800;
const FADE_MS     = 280;

export function FeatureBanner({ onUpgradePress }: { onUpgradePress?: () => void }) {
  const { colors } = usePokerTheme();

  const SLIDES: Slide[] = [
    {
      icon: "hardware-chip-outline",
      accent: "#7c3aed",
      title: "AI Hand Review",
      description: "Upload your hands and get instant, AI-powered coaching to plug leaks fast.",
      cta: "Try Pro Free",
      onPress: () => onUpgradePress?.(),
    },
    {
      icon: "cloud-upload-outline",
      accent: "#0ea5e9",
      title: "Cloud Sync",
      description: "Your sessions backed up automatically — access them from any device, anytime.",
      cta: "Sign In Free",
      onPress: () => router.push("/sign-in"),
    },
    {
      icon: "trending-up-outline",
      accent: colors.bg.brand,
      title: "Advanced Analytics",
      description: "Hourly rate trends, win-streak tracking, and deep performance breakdowns.",
      cta: "Unlock Insights",
      onPress: () => onUpgradePress?.(),
    },
    {
      icon: "trophy-outline",
      accent: "#f59e0b",
      title: "Bankroll Challenges",
      description: "Compete with the community, hit milestones, and win real prizes.",
      cta: "Join a Challenge",
      onPress: () => onUpgradePress?.(),
    },
  ];

  const [index, setIndex]   = useState(0);
  const fadeAnim            = useRef(new Animated.Value(1)).current;
  const currentSlide        = SLIDES[index];

  useEffect(() => {
    const timer = setInterval(() => {
      // Fade out → swap → fade in
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % SLIDES.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start();
      });
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const goTo = (i: number) => {
    if (i === index) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
      setIndex(i);
      Animated.timing(fadeAnim, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
    });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      {/* Accent stripe */}
      <View style={[styles.accentStripe, { backgroundColor: currentSlide.accent + "22" }]} />

      <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
        {/* Icon badge */}
        <View style={[styles.iconBadge, { backgroundColor: currentSlide.accent + "20" }]}>
          <Ionicons
            name={currentSlide.icon}
            size={26}
            color={currentSlide.accent}
          />
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
            {currentSlide.title}
          </Text>
          <Text style={[styles.description, { color: colors.text.secondary }]} numberOfLines={2}>
            {currentSlide.description}
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={currentSlide.onPress}
          activeOpacity={0.85}
          style={[styles.ctaBtn, { backgroundColor: currentSlide.accent }]}
        >
          <Text style={styles.ctaText}>{currentSlide.cta}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? currentSlide.accent : colors.border.strong,
                  width: i === index ? 16 : 6,
                },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 16,
  },
  accentStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
  ctaBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  ctaText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingBottom: 12,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
