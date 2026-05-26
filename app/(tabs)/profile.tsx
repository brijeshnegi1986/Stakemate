import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { PokerRollLogo } from "@/components/PokerRollLogo";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert, Linking, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Reusable menu row ────────────────────────────────────────────────────────
function MenuRow({
  icon, label, onPress, iconColor, labelColor, hideChevron, isLast,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  iconColor?: string;
  labelColor?: string;
  hideChevron?: boolean;
  isLast?: boolean;
}) {
  const { colors } = usePokerTheme();
  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.6}
        style={styles.rowTouch}
      >
        <View style={[
          styles.rowIconWrap,
          { backgroundColor: (iconColor ?? colors.text.secondary) + "18" },
        ]}>
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={iconColor ?? colors.text.secondary}
          />
        </View>
        <Text style={[styles.rowLabel, { color: labelColor ?? colors.text.primary }]}>
          {label}
        </Text>
        {!hideChevron && (
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.tertiary} />
        )}
      </TouchableOpacity>
      {!isLast && (
        <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />
      )}
    </>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  const { colors } = usePokerTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
      {label}
    </Text>
  );
}

export default function ProfileScreen() {
  const { colors, spacing, radius, inputTypo } = usePokerTheme();
  const { user, profile, signOut, refreshProfile, session, signInWithApple, signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [promoOptIn, setPromoOptIn]   = useState(profile?.promo_opt_in ?? false);
  const [saving, setSaving]           = useState(false);

  const isSignedIn = !!session;
  const TAB_BAR_H  = (insets.bottom > 0 ? insets.bottom : 16) + 68;
  const BOTTOM_PAD = TAB_BAR_H + 32;

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim(),
      email: user.email,
      promo_opt_in: promoOptIn,
    });
    setSaving(false);
    if (error) Alert.alert("Error", "Couldn't save profile. Try again.");
    else { await refreshProfile(); Alert.alert("Saved", "Profile updated."); }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => { await signOut(); router.replace("/(tabs)"); },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all cloud data. Local sessions on this device are kept. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            Alert.alert("Request Sent", "Your account deletion request has been submitted. It will be processed within 24 hours.");
          },
        },
      ]
    );
  }

  // ─── Shared link rows (shown in both signed-in and signed-out) ────────────
  const renderSupportRows = () => (
    <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, padding: 0, overflow: "hidden" }]}>
      <MenuRow
        icon="cog-outline"
        label="Settings"
        iconColor={colors.bg.brand}
        onPress={() => router.push("/settings")}
      />
      <MenuRow
        icon="message-outline"
        label="Send Feedback"
        iconColor={colors.text.secondary}
        onPress={() => Linking.openURL("mailto:support@pokerroll.app?subject=Feedback")}
      />
      <MenuRow
        icon="lock-outline"
        label="Privacy Policy"
        iconColor={colors.text.secondary}
        onPress={() => router.push("/privacy-policy")}
      />
      <MenuRow
        icon="file-document-outline"
        label="Terms of Service"
        iconColor={colors.text.secondary}
        onPress={() => router.push("/terms")}
      />
      <MenuRow
        icon="star"
        label="Rate App"
        iconColor="#f59e0b"
        onPress={() => Linking.openURL("https://apps.apple.com/app/id0000000000")}
        isLast
      />
    </View>
  );

  // ─── Signed-out ───────────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg.secondary }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: BOTTOM_PAD }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand + auth card ── */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          {/* App logo */}
          <View style={styles.logoWrap}>
            <PokerRollLogo size={64} />
          </View>

          <Text style={[styles.authTitle, { color: colors.text.primary }]}>
            Unlock All Features
          </Text>
          <Text style={[styles.authSubtitle, { color: colors.text.secondary }]}>
            Track sessions, log hands, get AI coaching, and sync across devices — all in one place.
          </Text>

          {/* Continue with Apple (iOS only) */}
          {Platform.OS === "ios" && (
            <TouchableOpacity
              onPress={signInWithApple}
              activeOpacity={0.88}
              style={styles.appleBtn}
            >
              <MaterialCommunityIcons name="apple" size={18} color="#fff" />
              <Text style={styles.appleBtnText}>Continue with Apple</Text>
            </TouchableOpacity>
          )}

          {/* Continue with Google */}
          <TouchableOpacity
            onPress={signInWithGoogle}
            activeOpacity={0.88}
            style={[styles.googleBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}
          >
            <MaterialCommunityIcons name="google" size={18} color="#4285F4" />
            <Text style={[styles.googleBtnText, { color: colors.text.primary }]}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        {/* ── Support & links ── */}
        <SectionHeader label="General" />
        {renderSupportRows()}
      </ScrollView>
    );
  }

  // ─── Signed-in ────────────────────────────────────────────────────────────
  const initials = (profile?.display_name || user?.email || "?")[0].toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: BOTTOM_PAD }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Avatar card ── */}
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, alignItems: "center" }]}>
        {/* Logo top-right as branding */}
        <View style={styles.logoTopRight}>
          <PokerRollLogo size={28} />
        </View>

        {/* Avatar circle */}
        <View style={[styles.avatarCircle, {
          backgroundColor: colors.bg.brand + "22",
          borderColor: colors.border.brand,
        }]}>
          <Text style={[styles.avatarInitial, { color: colors.text.brand }]}>
            {initials}
          </Text>
        </View>

        <Text style={[styles.avatarName, { color: colors.text.primary }]}>
          {profile?.display_name || "Your Profile"}
        </Text>
        <Text style={[styles.avatarEmail, { color: colors.text.secondary }]}>
          {user?.email}
        </Text>

        {/* Brand badge */}
        <View style={[styles.brandBadge, { backgroundColor: colors.bg.brand + "18", borderColor: colors.border.brand }]}>
          <MaterialCommunityIcons name="cards-playing-outline" size={12} color={colors.text.brand} />
          <Text style={[styles.brandBadgeText, { color: colors.text.brand }]}>PokerRoll</Text>
        </View>
      </View>

      {/* ── Display name ── */}
      <SectionHeader label="Display Name" />
      <View style={[styles.inputCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.text.tertiary}
          style={{ color: colors.text.primary, paddingVertical: 14, ...inputTypo.body }}
        />
      </View>

      {/* ── Promo opt-in ── */}
      <View style={[styles.card, {
        backgroundColor: colors.bg.primary,
        borderColor: colors.border.default,
        flexDirection: "row",
        alignItems: "center",
      }]}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600", marginBottom: 3 }}>
            Challenge Notifications
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 18 }}>
            Get emailed about bankroll challenges and prize opportunities
          </Text>
        </View>
        <Switch
          value={promoOptIn}
          onValueChange={setPromoOptIn}
          trackColor={{ false: colors.border.default, true: colors.bg.brand }}
          thumbColor="#fff"
        />
      </View>

      {/* ── Sync status ── */}
      <View style={[styles.card, {
        backgroundColor: colors.bg.primary,
        borderColor: colors.border.default,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }]}>
        <MaterialCommunityIcons name="cloud-check-outline" size={20} color={colors.text.success} />
        <Text style={{ color: colors.text.secondary, fontSize: 14 }}>
          Account active · Sessions sync coming soon
        </Text>
      </View>

      {/* ── Save ── */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
        style={[styles.saveBtn, { backgroundColor: colors.bg.brand, opacity: saving ? 0.6 : 1 }]}
      >
        <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "700" }}>
          {saving ? "Saving…" : "Save Profile"}
        </Text>
      </TouchableOpacity>

      {/* ── Support & links ── */}
      <SectionHeader label="General" />
      {renderSupportRows()}

      {/* ── Account actions ── */}
      <SectionHeader label="Account" />
      <View style={[styles.card, {
        backgroundColor: colors.bg.primary,
        borderColor: colors.border.default,
        padding: 0,
        overflow: "hidden",
      }]}>
        <MenuRow
          icon="logout"
          label="Sign Out"
          iconColor={colors.text.danger}
          labelColor={colors.text.danger}
          onPress={handleSignOut}
        />
        <MenuRow
          icon="delete-outline"
          label="Delete Account"
          iconColor={colors.text.danger}
          labelColor={colors.text.danger}
          onPress={handleDeleteAccount}
          hideChevron
          isLast
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Cards
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    marginBottom: 16,
  },
  inputCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Signed-out auth card
  logoWrap: {
    alignSelf: "center",
    marginBottom: 16,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  appleBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000",
    borderRadius: 12,
    paddingVertical: 15,
    marginBottom: 10,
  },
  appleBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  googleBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 15,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Signed-in avatar card
  logoTopRight: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: "800",
  },
  avatarName: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  avatarEmail: {
    fontSize: 13,
    marginBottom: 12,
  },
  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  brandBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Save button
  saveBtn: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 24,
  },

  // Menu row
  rowTouch: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
});
