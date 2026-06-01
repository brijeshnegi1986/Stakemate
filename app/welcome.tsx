import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");

const SLIDES = [
  {
    bg: require("../assets/images/Welcome-bg_1.png"),
    accent: "#9afe43",
    // dark bg — use white text + green accent
    headlineColor: "#9EEDFF",
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.65)",
    headline: "TRACK EVERY\nPOKER SESSION.",
    sub: "Build Your Edge.",
    body: "Your bankroll tells a story — start tracking it today.",
    bullets: [
      { icon: "timer-outline" as const,    text: "Log sessions in under 10 seconds" },
      { icon: "lightning-bolt" as const,   text: "Live session timer with pause & resume" },
      { icon: "chart-areaspline" as const, text: "Know your true hourly rate & profit trends" },
    ],
  },
  {
    bg: require("../assets/images/Welcome-bg_3.png"),
    accent: "#005f6b",
    // bright cyan bg — use dark text
    headlineColor: "#002A35",
    textColor: "#002830",
    mutedColor: "rgba(0,40,48,0.75)",
    headline: "CAPTURE EVERY\nKEY HAND.",
    sub: "Never forget a big spot.",
    body: "Write notes your way — then let AI compress them into clean poker shorthand.",
    bullets: [
      { icon: "pencil-outline" as const,  text: "Freeform hand notes linked to sessions" },
      { icon: "text-short" as const,      text: "Compress to shorthand: Raise: $10, C-bet: $30" },
      { icon: "export-variant" as const,  text: "Copy or export notes anytime" },
    ],
  },
  {
    bg: require("../assets/images/Welcome-bg_2.png"),
    accent: "#f472b6",
    // dark purple bg — use white text + pink accent
    headlineColor: "#E4A9FF",
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.65)",
    headline: "GET COACHED\nON EVERY HAND.",
    sub: "Street-by-street AI analysis.",
    body: "Replay a hand and get instant feedback from your personal poker coach.",
    bullets: [
      { icon: "school-outline" as const,    text: "Preflop → Flop → Turn → River breakdown" },
      { icon: "trophy-outline" as const,    text: "Graded decisions: A (Excellent) to D (Mistake)" },
      { icon: "lightbulb-outline" as const, text: "Specific suggestions on what to do instead" },
    ],
  },
  {
    bg: require("../assets/images/Welcome-bg_4.png"),
    accent: "#ffffff",
    // bright blue bg — use white text
    headlineColor: "#4FFF62",
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.72)",
    headline: "FREE FOR\n7 DAYS.",
    sub: "No credit card needed.",
    body: "Try everything free. After your trial, core tracking stays free forever.",
    bullets: [
      { icon: "check-circle-outline" as const, text: "Full AI access for your first 7 days" },
      { icon: "history" as const,              text: "Keep up to 30 sessions free after trial" },
      { icon: "crown-outline" as const,        text: "Upgrade anytime to unlock unlimited AI" },
    ],
  },
] as const;

const AUTO_SCROLL_MS = 4000;

export default function WelcomeScreen() {
  usePokerTheme();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dotAnims = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance slides
  function startAutoScroll() {
    if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    autoScrollRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % SLIDES.length;
        scrollRef.current?.scrollTo({ x: next * W, animated: true });
        Animated.timing(dotAnims[prev], { toValue: 0, duration: 250, useNativeDriver: false }).start();
        Animated.timing(dotAnims[next], { toValue: 1, duration: 250, useNativeDriver: false }).start();
        return next;
      });
    }, AUTO_SCROLL_MS);
  }

  useEffect(() => {
    startAutoScroll();
    return () => { if (autoScrollRef.current) clearInterval(autoScrollRef.current); };
  }, []);

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * W, animated: true });
    Animated.timing(dotAnims[index], { toValue: 0, duration: 250, useNativeDriver: false }).start();
    Animated.timing(dotAnims[next], { toValue: 1, duration: 250, useNativeDriver: false }).start();
    setIndex(next);
    startAutoScroll();
  }

  function handleMomentumScrollEnd(e: any) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / W);
    if (newIndex !== index) {
      Animated.timing(dotAnims[index], { toValue: 0, duration: 250, useNativeDriver: false }).start();
      Animated.timing(dotAnims[newIndex], { toValue: 1, duration: 250, useNativeDriver: false }).start();
      setIndex(newIndex);
      startAutoScroll();
    }
  }

  function handleGetStarted() {
    SecureStore.setItemAsync("onboarded", "1");
    router.replace("/(tabs)");
  }

  const currentSlide = SLIDES[index];
  const TOP = insets.top;
  const BOTTOM = insets.bottom;

  return (
    <View style={styles.root}>
      {/* ── Full-screen slides ── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.slider}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s, i) => (
          <ImageBackground
            key={i}
            source={s.bg}
            style={[styles.slide, { width: W, height: H }]}
            resizeMode="cover"
          >
            {/* Dark overlay for readability on bright slides */}
            <View style={[
              styles.overlay,
              { backgroundColor: i === 1 ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.18)" }
            ]} />

            <View style={[styles.slideContent, { paddingTop: TOP + 24 }]}>
              {/* Logo — all slides */}
              <Image
                source={require("../assets/images/pokerroll-logo-nomargin.svg")}
                style={styles.logo}
                contentFit="contain"
              />

              {/* Spacer pushes text to lower half */}
              <View style={{ flex: 1 }} />

              {/* Headline block */}
              <View style={styles.textBlock}>
                <Text style={[styles.headline, { color: s.headlineColor }]}>
                  {s.headline}
                </Text>
                <Text style={[styles.subheadline, { color: s.textColor }]}>
                  {s.sub}
                </Text>
                <Text style={[styles.body, { color: s.mutedColor }]}>
                  {s.body}
                </Text>
              </View>

              {/* Bullets */}
              <View style={styles.bullets}>
                {s.bullets.map((b) => (
                  <View key={b.text} style={styles.bulletRow}>
                    <View style={[styles.bulletIcon, { backgroundColor: s.headlineColor + "28" }]}>
                      <MaterialCommunityIcons name={b.icon} size={16} color={s.headlineColor} />
                    </View>
                    <Text style={[styles.bulletText, { color: s.textColor }]}>{b.text}</Text>
                  </View>
                ))}
              </View>

              {/* Bottom spacer before controls */}
              <View style={{ height: 200 + BOTTOM }} />
            </View>
          </ImageBackground>
        ))}
      </ScrollView>

      {/* ── Fixed bottom controls ── */}
      <View style={[styles.bottomSheet, { paddingBottom: BOTTOM + 12 }]}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => goTo(i)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Animated.View
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === index ? currentSlide.accent : "rgba(255,255,255,0.3)",
                    width: dotAnims[i].interpolate({ inputRange: [0, 1], outputRange: [6, 22] }),
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={handleGetStarted} activeOpacity={0.88} style={styles.getStartedBtn}>
          <Text style={styles.getStartedText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080d14" },
  slider: { flex: 1 },

  slide: {
    flex: 1,
    justifyContent: "flex-start",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  slideContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 24,
  },

  logo: {
    width: 148,
    height: 53,
  },

  textBlock: {
    marginBottom: 28,
  },
  headline: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0.3,
    lineHeight: 40,
    marginBottom: 10,
  },
  subheadline: {
    fontSize: 22,
    fontWeight: "700",
    fontStyle: "italic",
    lineHeight: 26,
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 340,
  },

  bullets: {
    gap: 14,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bulletIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    lineHeight: 20,
  },

  // Bottom sheet — sits over slides
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    // backgroundColor: "rgba(8,13,20,0.88)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginBottom: 20,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  getStartedBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 16,
    marginBottom: 8,
  },
  getStartedText: {
    color: "#080d14",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
