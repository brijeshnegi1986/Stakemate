import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";
const DARK  = "#111827";

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function SignInSheet({ visible, onClose, title, description, icon = "lock-closed-outline" }: Props) {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn]           = useState<"apple" | "google" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  async function handleApple() {
    setSigningIn("apple");
    try { await signInWithApple(); onClose(); } catch {}
    finally { setSigningIn(null); }
  }

  async function handleGoogle() {
    setSigningIn("google");
    try { await signInWithGoogle(); onClose(); } catch {}
    finally { setSigningIn(null); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* App icon */}
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.appIcon}
          contentFit="contain"
        />

        {/* Text */}
        <Text style={styles.title}>
          {title ?? "Sign in to continue"}
        </Text>
        <Text style={styles.sub}>
          {description ?? "Create a free account to unlock this feature and keep your data safe."}
        </Text>

        {/* Apple */}
        {Platform.OS === "ios" && (
          appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={{ width: "100%", height: 50, marginBottom: 10 }}
              onPress={handleApple}
            />
          ) : (
            <TouchableOpacity
              onPress={handleApple}
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
          onPress={handleGoogle}
          disabled={signingIn !== null}
          activeOpacity={0.88}
          style={styles.googleBtn}
        >
          {signingIn === "google" ? (
            <ActivityIndicator color={DARK} size="small" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#4285F4" />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity onPress={onClose} activeOpacity={0.6} style={styles.skipBtn}>
          <Text style={styles.skipText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "#e2e8f0",
    marginBottom: 22,
  },
  appIcon: {
    width: 60, height: 60, borderRadius: 14,
    marginBottom: 16, overflow: "hidden",
  },
  title: {
    fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8,
    color: "#0f172b",
  },
  sub: {
    fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28,
    color: "#62748e",
  },
  appleBtn: {
    width: "100%", height: 50, borderRadius: 14,
    backgroundColor: "#000",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginBottom: 10,
  },
  appleBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  googleBtn: {
    width: "100%", height: 50, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginBottom: 6,
  },
  googleBtnText: { fontSize: 16, fontWeight: "600", color: "#0f172b" },
  skipBtn: { paddingVertical: 12, marginTop: 4 },
  skipText: { fontSize: 14, color: "#90a1b9" },
});
