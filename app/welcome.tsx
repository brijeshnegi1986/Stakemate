import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const TEAL  = "#0CC8D4";
const DARK  = "#0f172b";
const MINT  = "#7CF3D0";

// ─── Falling suits ────────────────────────────────────────────────────────────

const SUITS = [
  { symbol: "♠︎", color: "rgba(255,255,255,0.7)" },
  { symbol: "♣︎", color: "rgba(255,255,255,0.7)" },
  { symbol: "♦︎", color: "rgba(255,59,92,0.8)" },
  { symbol: "♥︎", color: "rgba(255,107,157,0.8)" },
];

type Particle = {
  id: number;
  suit: { symbol: string; color: string };
  x: number;         // left % (0-100)
  size: number;      // font size
  duration: number;  // fall duration ms
  delay: number;     // initial delay ms
  rotate: number;    // start rotation degrees
  anim: Animated.Value;
};

function makeParticles(): Particle[] {
  return Array.from({ length: 18 }, (_, i) => ({
    id: i,
    suit:     SUITS[i % 4],
    x:        5 + (i * 23.7) % 90,
    size:     20 + (i * 9) % 16,       // 20–35px
    duration: 5000 + (i * 1337) % 5000, // 5–10s
    delay:    (i * 600) % 6000,         // spread starts
    rotate:   (i * 47) % 360,
    anim:     new Animated.Value(0),
  }));
}

function FallingSuits({ screenHeight }: { screenHeight: number }) {
  const particles = useRef<Particle[]>(makeParticles()).current;

  // Text zone sits roughly between 30%–65% of screen height
  const TEXT_TOP    = screenHeight * 0.30;
  const TEXT_BOTTOM = screenHeight * 0.65;

  useEffect(() => {
    const animations = particles.map((p) => {
      const loop = Animated.loop(
        Animated.sequence([
          // Initial stagger delay
          Animated.delay(p.delay),
          // Phase 1: fast fall from top to just above text zone (0 → 0.35)
          Animated.timing(p.anim, {
            toValue: 0.35,
            duration: p.duration * 0.25,
            useNativeDriver: true,
          }),
          // Phase 2: slow drift through text (0.35 → 0.65) — "resting on text"
          Animated.timing(p.anim, {
            toValue: 0.65,
            duration: p.duration * 0.55,
            useNativeDriver: true,
          }),
          // Phase 3: slow fall off text to bottom (0.65 → 1)
          Animated.timing(p.anim, {
            toValue: 1,
            duration: p.duration * 0.20,
            useNativeDriver: true,
          }),
          // Reset instantly
          Animated.timing(p.anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return loop;
    });
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => {
        const translateY = p.anim.interpolate({
          inputRange:  [0,    0.35,      0.65,      1],
          outputRange: [-30,  TEXT_TOP,  TEXT_BOTTOM, screenHeight + 30],
        });
        const opacity = p.anim.interpolate({
          inputRange:  [0, 0.08, 0.35, 0.55, 0.65, 0.9,  1],
          outputRange: [0, 0.9,  0.9,  0.6,  0.45, 0.2,  0],
        });
        // Slow gentle rotation — mostly still in text zone
        const rotate = p.anim.interpolate({
          inputRange:  [0,   0.35, 0.65, 1],
          outputRange: [
            `${p.rotate}deg`,
            `${p.rotate + 60}deg`,
            `${p.rotate + 75}deg`,  // barely rotates while on text
            `${p.rotate + 140}deg`,
          ],
        });
        // Slight horizontal drift while on text
        const translateX = p.anim.interpolate({
          inputRange:  [0, 0.35, 0.65, 1],
          outputRange: [0, 0,    (p.id % 2 === 0 ? 6 : -6), (p.id % 2 === 0 ? 12 : -12)],
        });
        return (
          <Animated.Text
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%` as any,
              top: 0,
              fontSize: p.size,
              color: p.suit.color,
              opacity,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          >
            {p.suit.symbol}
          </Animated.Text>
        );
      })}
    </View>
  );
}

export default function WelcomeScreen() {
  const { session, signInWithApple, signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();

  const [signingIn, setSigningIn] = useState<"apple" | "google" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Entrance animation — logo scales up from 0.75 and fades in (matches index exit)
  const logoOpacity   = useRef(new Animated.Value(0)).current;
  const logoScale     = useRef(new Animated.Value(0.75)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Logo appears first (matches where index left off)
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      ]),
      // Then content fades in below
      Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  useEffect(() => {
    if (session) {
      SecureStore.setItemAsync("onboarded", "1");
      router.replace("/(tabs)");
    }
  }, [session]);

  async function handleAppleSignIn() {
    setSigningIn("apple");
    await signInWithApple();
    setSigningIn(null);
  }

  async function handleGoogleSignIn() {
    setSigningIn("google");
    await signInWithGoogle();
    setSigningIn(null);
  }

  function handleSkip() {
    SecureStore.setItemAsync("onboarded", "1");
    router.replace("/(tabs)");
  }

  return (
    <View style={[styles.root, { backgroundColor: "#f8fafc" }]}>
      {/* ── Background image ── */}

      {/* ── Gradient background ── */}
      <LinearGradient
        colors={["#009FEE", "#155DFC"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Falling suits ── */}
      <FallingSuits screenHeight={SCREEN_HEIGHT} />

      {/* ── Content ── */}
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>

        {/* Logo — animates in from index screen scale */}
        <Animated.View style={[styles.logoRow, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Image source={require("@/assets/images/stakemate-logo_light.png")} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        {/* Hero + CTA — fade in after logo */}
        <Animated.View style={{ flex: 1, opacity: contentOpacity, justifyContent: "space-between" }}>

        {/* Hero — centered */}
        <View style={styles.hero}>
          <Text style={styles.headline} allowFontScaling={false}>
            TRACK.{"\n"}CONNECT.{"\n"}STAKE.
          </Text>

          <Text style={styles.tagline}>Built for the modern poker player.</Text>

          <View style={styles.bodyWrap}>
            <Text style={styles.body}>
              Track sessions, manage your bankroll, connect with players, and discover staking opportunities.
            </Text>
          </View>
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          <TouchableOpacity
            onPress={() => setShowSignInModal(true)}
            activeOpacity={0.88}
            style={styles.getStartedBtn}
          >
            <Text style={styles.getStartedText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkip} activeOpacity={0.75} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
        </Animated.View>
      </View>

      {/* ── Sign-in Modal ── */}
      <Modal
        visible={showSignInModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSignInModal(false)}
      >
        {/* Single root keeps the sheet rounded corners clipping against transparent, not grey */}
        <View style={styles.modalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSignInModal(false)}
          >
            <View style={styles.modalBackdrop} />
          </TouchableOpacity>

        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
          {/* Handle */}
          <View style={styles.modalHandle} />

          {/* Logo badge */}
          <View style={styles.modalIconBadge}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 60, height: 60, borderRadius: 14 }}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.modalTitle}>Create your account</Text>
          <Text style={styles.modalSub}>Free account — your sessions, notes and results are automatically backed up and synced across all your devices.</Text>

          {/* Apple — iOS only */}
          {Platform.OS === "ios" && (
            appleAvailable ? (
              <View style={styles.appleBtnWrap}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={{ flex: 1, height: 50 }}
                  onPress={handleAppleSignIn}
                />
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleAppleSignIn}
                disabled={signingIn !== null}
                activeOpacity={0.88}
                style={styles.appleBtn}
              >
                {signingIn === "apple" ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#fff" />
                    <Text style={styles.appleBtnText}>Continue with Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            )
          )}

          {/* Google */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={signingIn !== null}
            activeOpacity={0.88}
            style={styles.googleBtn}
          >
            {signingIn === "google" ? (
              <ActivityIndicator color={DARK} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#4285F4" />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowSignInModal(false)}
            activeOpacity={0.6}
            style={styles.modalSkipBtn}
          >
            <Text style={styles.modalSkipText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  cardsBg: {
    ...StyleSheet.absoluteFill,
    opacity: 0.9,
  },

  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },

  logoRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
  },
  logo: {
    width: 260,
    height: 260 * (247 / 902),
  },

  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },

  headline: {
    fontSize: 46,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 52,
    marginBottom: 16,
    color: "#fff",
  },
  headlineDark: { color: DARK },
  headlineTeal: { color: TEAL },

  tagline: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 0,
  },

  bodyWrap: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  body: {
    fontSize: 15,
    fontWeight: "400",
    color: "#fff",
    textAlign: "center",
    lineHeight: 23,
    opacity: 0.75,
  },

  cta: {
    width: "100%",
    gap: 16,
  },

  getStartedBtn: {
    width: "100%",
    height: 56,
    backgroundColor: MINT,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  getStartedText: {
    color: DARK,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.24,
  },

  skipBtn: {
    width: "100%",
    height: 56,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  skipText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  // Sign-in modal
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,43,0.45)",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignSelf: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  modalTitle: {
    color: DARK,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSub: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 28,
  },
  appleBtnWrap: {
    width: "100%",
    height: 50,
    marginBottom: 12,
  },
  appleBtn: {
    width: "100%",
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#000",
    borderRadius: 14,
    marginBottom: 12,
  },
  appleBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  googleBtn: {
    width: "100%",
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#fff",
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  googleBtnText: {
    color: DARK,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  modalSkipBtn: {
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 4,
  },
  modalSkipText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});
