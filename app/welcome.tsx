import { PokerRollLogo } from "@/components/PokerRollLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useRef, useState } from "react";
import {
  Animated, Dimensions, Platform, ScrollView,
  Text, TouchableOpacity, View,
} from "react-native";

const { width: W } = Dimensions.get("window");

const SLIDES = [
  {
    icon:     "chart-line" as const,
    accent:   "#9afe43",
    headline: "TRACK EVERY\nPOKER SESSION.",
    sub:      "Build Your Edge.",
    body:     "Your bankroll tells a story — start tracking it today.",
    bullets: [
      { icon: "timer-outline",    text: "Log sessions in under 10 seconds" },
      { icon: "lightning-bolt",   text: "Live session timer with pause & resume" },
      { icon: "chart-areaspline", text: "Know your true hourly rate & profit trends" },
    ],
  },
  {
    icon:     "notebook-outline" as const,
    accent:   "#0d9488",
    headline: "CAPTURE EVERY\nKEY HAND.",
    sub:      "Never forget a big spot.",
    body:     "Write notes your way — then let AI compress them into clean poker shorthand.",
    bullets: [
      { icon: "pencil-outline",   text: "Freeform hand notes linked to sessions" },
      { icon: "text-short",       text: "Compress to shorthand: Raise: $10, C-bet: $30" },
      { icon: "export-variant",   text: "Copy or export notes anytime" },
    ],
  },
  {
    icon:     "cards-playing-outline" as const,
    accent:   "#7c3aed",
    headline: "GET COACHED\nON EVERY HAND.",
    sub:      "Street-by-street AI analysis.",
    body:     "Replay a hand and get instant feedback from your personal poker coach.",
    bullets: [
      { icon: "school-outline",       text: "Preflop → Flop → Turn → River breakdown" },
      { icon: "trophy-outline",       text: "Graded decisions: A (Excellent) to D (Mistake)" },
      { icon: "lightbulb-outline",    text: "Specific suggestions on what to do instead" },
    ],
  },
  {
    icon:     "timer-sand" as const,
    accent:   "#d97706",
    headline: "FREE FOR\n7 DAYS — THEN\nKEEP THE BASICS.",
    sub:      "No credit card needed.",
    body:     "Try everything free. After your trial, core tracking stays free forever.",
    bullets: [
      { icon: "check-circle-outline", text: "Full AI access for your first 7 days" },
      { icon: "history",              text: "Keep up to 30 sessions free after trial" },
      { icon: "crown-outline",        text: "Upgrade anytime to unlock unlimited AI" },
    ],
  },
] as const;

export default function WelcomeScreen() {
  const { colors, radius, typography } = usePokerTheme();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dotAnims = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  const TOP_INSET = Platform.OS === "ios" ? 56 : 32;
  const isLast = index === SLIDES.length - 1;

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * W, animated: true });
    Animated.timing(dotAnims[index], { toValue: 0, duration: 200, useNativeDriver: false }).start();
    Animated.timing(dotAnims[next],  { toValue: 1, duration: 200, useNativeDriver: false }).start();
    setIndex(next);
  }

  const slide = SLIDES[index];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* ── Slide pager ── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={{ width: W, paddingHorizontal: 24, paddingTop: TOP_INSET + 20 }}>
            {/* Logo on first slide only */}
            {i === 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 32 }}>
                <PokerRollLogo size={52} style={{ marginRight: 10 }} />
                <View>
                  <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: "800", letterSpacing: 0.3 }}>
                    PokerRoll
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>by Stakemate</Text>
                </View>
              </View>
            )}

            {/* Icon badge */}
            {i > 0 && (
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: s.accent + "22",
                borderWidth: 1, borderColor: s.accent + "55",
                alignItems: "center", justifyContent: "center",
                marginBottom: 28,
              }}>
                <MaterialCommunityIcons name={s.icon} size={30} color={s.accent} />
              </View>
            )}

            {/* Headline */}
            <View style={{ marginTop: 50}}>
            <Text style={{ color: s.accent, fontSize: 36, fontWeight: "900", letterSpacing: 0.2, lineHeight: 34 }}>
              {s.headline}
            </Text>
            <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: "700", fontStyle: "italic", lineHeight: 26, marginTop: 6 }}>
              {s.sub}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 22, marginTop: 14, maxWidth: 320 }}>
              {s.body}
            </Text>
            </View>

            {/* Bullets */}
            <View style={{ marginTop: 32, gap: 16 }}>
              {s.bullets.map((b) => (
                <View key={b.text} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: s.accent + "18",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <MaterialCommunityIcons name={b.icon as any} size={18} color={s.accent} />
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "500", flex: 1, lineHeight: 20 }}>
                    {b.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── Bottom controls ── */}
      <View style={{ paddingHorizontal: 24, paddingBottom: Platform.OS === "ios" ? 44 : 28, paddingTop: 12 }}>
        {/* Dot indicators */}
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 24 }}>
          {SLIDES.map((s, i) => (
            <Animated.View
              key={i}
              style={{
                height: 6, borderRadius: 3,
                backgroundColor: i === index ? s.accent : colors.border.default,
                width: dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [6, 20] }),
              }}
            />
          ))}
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          onPress={() => {
            if (isLast) {
              SecureStore.setItemAsync("onboarded", "1");
              router.replace("/(tabs)");
            } else {
              goTo(index + 1);
            }
          }}
          activeOpacity={0.88}
          style={{
            backgroundColor: slide.accent,
            borderRadius: radius.full,
            paddingVertical: 16,
            alignItems: "center",
            shadowColor: slide.accent,
            shadowOpacity: 0.4,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 14,
            elevation: 6,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#000", ...typography.body, fontWeight: "700", letterSpacing: 0.3 }}>
            {isLast ? "Start Free — 7 Days Full Access" : "Next"}
          </Text>
        </TouchableOpacity>

        {/* Skip */}
        {!isLast && (
          <TouchableOpacity onPress={() => { SecureStore.setItemAsync("onboarded", "1"); router.replace("/(tabs)"); }} activeOpacity={0.6}>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, textAlign: "center" }}>
              Skip intro
            </Text>
          </TouchableOpacity>
        )}

        {!isLast && (
          <Text style={{ color: colors.text.tertiary, ...typography.caption, textAlign: "center", marginTop: 6 }}>
            No signup required · Data stays on your device
          </Text>
        )}
      </View>
    </View>
  );
}
