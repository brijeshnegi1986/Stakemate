import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const TEAL  = "#0CC8D4";
const DARK  = "#0f172b";
const MINT  = "#7CF3D0";

export default function WelcomeScreen() {
  const { session, signInWithApple, signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();

  const [signingIn, setSigningIn] = useState<"apple" | "google" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);

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
        colors={["#2E6BFF", "#155DFC", "#0D3796"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Content ── */}
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <Image source={require("@/assets/images/Stakemate-logo-white.png")} style={styles.logo} resizeMode="contain" />
        </View>

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

          {/* SM icon badge */}
          <View style={styles.modalIconBadge}>
            <Image
              source={require("@/assets/images/stakemate-monogram.png")}
              style={{ width: 17, height: 28 }}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.modalTitle}>Create your account</Text>
          <Text style={styles.modalSub}>Sign in to save your progress and sync across devices.</Text>

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
  },
  logo: {
    width: 220,
    height: 174,
  },

  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },

  headline: {
    fontSize: 48,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 54,
    marginBottom: 14,
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
    paddingVertical: 14,
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
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
