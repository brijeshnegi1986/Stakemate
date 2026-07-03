import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Image } from "expo-image";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type Provider = "apple" | "google" | null;

export default function SignInScreen() {
  const { colors, spacing } = usePokerTheme();
  const { session, signInWithApple } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState<Provider>(null);

  useEffect(() => {
    if (session) router.replace("/(tabs)");
  }, [session]);

  async function handleApple() {
    if (loading) return;
    setLoading("apple");
    try {
      await signInWithApple();
    } finally {
      setLoading(null);
    }
  }

  async function handleGoogle() {
    if (loading) return;
    setLoading("google");
    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        Alert.alert("Sign in failed", error?.message ?? "Could not start Google sign in.");
        setLoading(null);
        return;
      }
      await Linking.openURL(data.url);
      // loading stays true — session effect navigates away on success
    } catch (e) {
      Alert.alert("Sign in failed", String(e));
      setLoading(null);
    }
  }

  const isLoading = loading !== null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.primary }]}>
      {/* Close button — absolutely positioned, equal padding from corner */}
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={[styles.closeBtn, { top: insets.top + 16, backgroundColor: colors.bg.secondary }]}
      >
        <MaterialCommunityIcons name="close" size={32} color={colors.text.secondary} />
      </TouchableOpacity>

      {/* Main content */}
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: 60, height: 60, borderRadius: 14, marginBottom: 28, overflow: "hidden" }}
          contentFit="contain"
        />

        <Text style={[styles.title, { color: colors.text.primary }]}>
          Sign in to Stakemate
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Back up your sessions, join challenges,{"\n"}and unlock all features.
        </Text>

        {/* ── Continue with Apple (iOS only) ── */}
        {Platform.OS === "ios" && (
          <TouchableOpacity
            onPress={handleApple}
            activeOpacity={0.88}
            disabled={isLoading}
            style={[styles.appleBtn, { opacity: isLoading && loading !== "apple" ? 0.5 : 1 }]}
          >
            {loading === "apple" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="apple" size={20} color="#fff" />
                <Text style={styles.appleBtnText}>Continue with Apple</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ── Continue with Google ── */}
        <TouchableOpacity
          onPress={handleGoogle}
          activeOpacity={0.88}
          disabled={isLoading}
          style={[
            styles.googleBtn,
            {
              backgroundColor: colors.bg.primary,
              borderColor: colors.border.default,
              opacity: isLoading && loading !== "google" ? 0.5 : 1,
            },
          ]}
        >
          {loading === "google" ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <>
              {/* Google G logo colours */}
              <View style={styles.googleIconWrap}>
                <MaterialCommunityIcons name="google" size={18} color="#4285F4" />
              </View>
              <Text style={[styles.googleBtnText, { color: colors.text.primary }]}>
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={{ marginTop: 24 }}
        >
          <Text style={[styles.skipText, { color: colors.text.tertiary }]}>
            Maybe later — continue without account
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.footerText, { color: colors.text.tertiary }]}>
          By continuing you agree to our{" "}
          <Text
            style={{ textDecorationLine: "underline" }}
            onPress={() => router.push("/terms")}
          >
            Terms of Service
          </Text>
          {" "}and{" "}
          <Text
            style={{ textDecorationLine: "underline" }}
            onPress={() => router.push("/privacy-policy")}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
  },

  // Apple button — black per HIG
  appleBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 12,
    minHeight: 54,
  },
  appleBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.1,
  },

  // Google button — outlined
  googleBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 16,
    minHeight: 54,
  },
  googleIconWrap: {
    width: 20,
    alignItems: "center",
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.1,
  },

  skipText: {
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 32,
  },
  footerText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
  },
});
