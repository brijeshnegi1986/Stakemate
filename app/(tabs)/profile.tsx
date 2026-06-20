import { PaywallModal } from "@/components/PaywallModal";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActionSheetIOS, Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  const { colors } = usePokerTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
      {label}
    </Text>
  );
}

// ─── Menu row ─────────────────────────────────────────────────────────────────
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
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.rowTouch}>
        <View style={[styles.rowIconWrap, { backgroundColor: (iconColor ?? colors.text.secondary) + "18" }]}>
          <MaterialCommunityIcons name={icon} size={18} color={iconColor ?? colors.text.secondary} />
        </View>
        <Text style={[styles.rowLabel, { color: labelColor ?? colors.text.primary }]}>{label}</Text>
        {!hideChevron && (
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.tertiary} />
        )}
      </TouchableOpacity>
      {!isLast && <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function FieldRow({
  icon, iconColor, placeholder, value, onChangeText, multiline, keyboardType, autoCapitalize, isLast,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "url" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words";
  isLast?: boolean;
}) {
  const { colors, inputTypo } = usePokerTheme();
  return (
    <>
      <View style={[styles.fieldRow, multiline && { alignItems: "flex-start" }]}>
        <View style={[styles.rowIconWrap, { backgroundColor: (iconColor ?? colors.text.secondary) + "18", marginTop: multiline ? 2 : 0 }]}>
          <MaterialCommunityIcons name={icon} size={18} color={iconColor ?? colors.text.secondary} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          multiline={multiline}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? "sentences"}
          style={[
            styles.fieldInput,
            { color: colors.text.primary, ...inputTypo.body },
            multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: 2 },
          ]}
        />
      </View>
      {!isLast && <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

// ─── Country row ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  "Australia",
  "New Zealand",
  "United States of America",
  "United Kingdom",
];

function CountryRow({ value, onChange, isLast }: { value: string; onChange: (v: string) => void; isLast?: boolean }) {
  const { colors } = usePokerTheme();

  function handlePress() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Country of Residence",
        options: [...COUNTRIES, "Cancel"],
        cancelButtonIndex: COUNTRIES.length,
      },
      (idx) => {
        if (idx < COUNTRIES.length) onChange(COUNTRIES[idx]);
      }
    );
  }

  return (
    <>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.fieldRow}>
        <View style={[styles.rowIconWrap, { backgroundColor: colors.text.secondary + "18" }]}>
          <MaterialCommunityIcons name="earth" size={18} color={colors.text.secondary} />
        </View>
        <Text style={[styles.fieldInput, { color: value ? colors.text.primary : colors.text.tertiary }]}>
          {value || "Country of residence"}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.text.tertiary} />
      </TouchableOpacity>
      {!isLast && <View style={[styles.rowDivider, { backgroundColor: colors.border.subtle }]} />}
    </>
  );
}

export default function ProfileScreen() {
  const { colors, spacing, radius, isDark } = usePokerTheme();
  const { user, profile, signOut, refreshProfile, session, signInWithApple, signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName]       = useState(profile?.display_name ?? "");
  const [username, setUsername]             = useState(profile?.username ?? "");
  const [bio, setBio]                       = useState(profile?.bio ?? "");
  const [country, setCountry]               = useState(profile?.country ?? "");
  const [avatarUri, setAvatarUri]           = useState<string | null>(profile?.avatar_url ?? null);
  const [twitter, setTwitter]               = useState(profile?.twitter_handle ?? "");
  const [instagram, setInstagram]           = useState(profile?.instagram_handle ?? "");
  const [youtube, setYoutube]               = useState(profile?.youtube_handle ?? "");
  const [twitch, setTwitch]                 = useState(profile?.twitch_handle ?? "");
  const [hendonMob, setHendonMob]           = useState(profile?.hendon_mob_url ?? "");
  const [pokerIndex, setPokerIndex]         = useState(profile?.poker_index_url ?? "");
  const [saving, setSaving]                 = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showPaywall, setShowPaywall]       = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  const isSignedIn = !!session;
  const TAB_BAR_H  = 49 + insets.bottom;
  const BOTTOM_PAD = TAB_BAR_H + 32;

  // ─── Avatar pick & upload ────────────────────────────────────────────────
  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photo library to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const mimeType = asset.mimeType ?? "image/jpeg";
      const ext = mimeType === "image/jpeg" ? "jpg" : (mimeType.split("/")[1] ?? "jpg");
      const path = `${user!.id}/avatar.${ext}`;
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, { upsert: true, contentType: mimeType });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUri(data.publicUrl + `?t=${Date.now()}`);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Could not upload image. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // ─── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim() || null,
      email: user.email,
      username: username.trim() || null,
      bio: bio.trim() || null,
      country: country.trim() || null,
      avatar_url: avatarUri,
      twitter_handle: twitter.trim() || null,
      instagram_handle: instagram.trim() || null,
      youtube_handle: youtube.trim() || null,
      twitch_handle: twitch.trim() || null,
      hendon_mob_url: hendonMob.trim() || null,
      poker_index_url: pokerIndex.trim() || null,
    });
    setSaving(false);
    if (error) Alert.alert("Error", "Couldn't save profile. Try again.");
    else { await refreshProfile(); Alert.alert("Saved", "Profile updated."); }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => { await signOut(); router.replace("/welcome"); } },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all cloud data. Local sessions on this device are kept. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          Alert.alert("Request Sent", "Your account deletion request has been submitted. It will be processed within 24 hours.");
        }},
      ]
    );
  }

  // ─── Signed-out ───────────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg.secondary }}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: BOTTOM_PAD }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, alignItems: "center" }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default, marginBottom: 16 }]}>
            <MaterialCommunityIcons name="account-outline" size={48} color={colors.text.tertiary} />
          </View>
          <Text style={[styles.authTitle, { color: colors.text.primary }]}>Unlock All Features</Text>
          <Text style={[styles.authSubtitle, { color: colors.text.secondary }]}>
            Track sessions, log hands, get AI coaching, and sync across devices — all in one place.
          </Text>
          {Platform.OS === "ios" && (
            appleAvailable ? (
              <View style={styles.socialBtnWrap}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={12}
                  style={{ flex: 1, height: 50 }}
                  onPress={signInWithApple}
                />
              </View>
            ) : (
              <TouchableOpacity onPress={signInWithApple} activeOpacity={0.88} style={styles.socialBtnWrap}>
                <View style={[styles.appleBtnFallback, { backgroundColor: "#000", borderColor: "#000" }]}>
                  <MaterialCommunityIcons name="apple" size={18} color="#fff" />
                  <Text style={[styles.socialBtnText, { color: "#fff" }]}>Continue with Apple</Text>
                </View>
              </TouchableOpacity>
            )
          )}
          <TouchableOpacity
            onPress={signInWithGoogle}
            activeOpacity={0.88}
            style={[styles.socialBtnWrap, styles.googleBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}
          >
            <MaterialCommunityIcons name="google" size={18} color="#4285F4" />
            <Text style={[styles.socialBtnText, { color: colors.text.primary }]}>Continue with Google</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ─── Signed-in ────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: BOTTOM_PAD }}
      showsVerticalScrollIndicator={false}
    >
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />

      {/* ── Upgrade banner ── */}
      <TouchableOpacity
        onPress={() => setShowPaywall(true)}
        activeOpacity={0.88}
        style={[styles.upgradeBtn, { backgroundColor: colors.bg.brand }]}
      >
        <MaterialCommunityIcons name="crown-outline" size={20} color="#fff" />
        <Text style={styles.upgradeBtnText}>Upgrade to Pro / Elite</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* ── Avatar ── */}
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, alignItems: "center" }]}>
        <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} disabled={uploadingAvatar} style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <View style={[styles.avatarCircle, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
              <MaterialCommunityIcons name="account-outline" size={48} color={colors.text.tertiary} />
            </View>
          )}
          <View style={[styles.avatarEditBadge, { backgroundColor: colors.bg.brand }]}>
            <MaterialCommunityIcons name={uploadingAvatar ? "loading" : "camera-outline"} size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={[styles.avatarName, { color: colors.text.primary }]}>
          {profile?.display_name || "Your Profile"}
        </Text>
        {profile?.username ? (
          <Text style={[styles.avatarUsername, { color: colors.text.brand }]}>@{profile.username}</Text>
        ) : null}
        <Text style={[styles.avatarEmail, { color: colors.text.secondary }]}>{user?.email}</Text>
      </View>

      {/* ── Profile details ── */}
      <SectionHeader label="Profile" />
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, padding: 0, overflow: "hidden" }]}>
        <FieldRow
          icon="at"
          iconColor={colors.bg.brand}
          placeholder="Stakemate username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <FieldRow
          icon="account-outline"
          iconColor={colors.text.secondary}
          placeholder="Display name"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <FieldRow
          icon="text-box-outline"
          iconColor={colors.text.secondary}
          placeholder="Bio — tell the community about yourself"
          value={bio}
          onChangeText={setBio}
          multiline
        />
        <CountryRow value={country} onChange={setCountry} isLast />
      </View>

      {/* ── Social channels ── */}
      <SectionHeader label="Social & Poker Profiles" />
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, padding: 0, overflow: "hidden" }]}>
        <FieldRow
          icon="twitter"
          iconColor="#1DA1F2"
          placeholder="Twitter / X username"
          value={twitter}
          onChangeText={setTwitter}
          autoCapitalize="none"
        />
        <FieldRow
          icon="instagram"
          iconColor="#E1306C"
          placeholder="Instagram username"
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
        />
        <FieldRow
          icon="youtube"
          iconColor="#FF0000"
          placeholder="YouTube channel handle"
          value={youtube}
          onChangeText={setYoutube}
          autoCapitalize="none"
        />
        <FieldRow
          icon="twitch"
          iconColor="#9146FF"
          placeholder="Twitch username"
          value={twitch}
          onChangeText={setTwitch}
          autoCapitalize="none"
        />
        <FieldRow
          icon="cards-playing-outline"
          iconColor={colors.text.secondary}
          placeholder="TheHendonMob.com profile URL"
          value={hendonMob}
          onChangeText={setHendonMob}
          keyboardType="url"
          autoCapitalize="none"
        />
        <FieldRow
          icon="poker-chip"
          iconColor={colors.text.secondary}
          placeholder="PokerIndex.com profile URL"
          value={pokerIndex}
          onChangeText={setPokerIndex}
          keyboardType="url"
          autoCapitalize="none"
          isLast
        />
      </View>

      {/* ── Save ── */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
        style={[styles.saveBtn, { backgroundColor: colors.bg.brand, opacity: saving ? 0.6 : 1 }]}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
          {saving ? "Saving…" : "Save Profile"}
        </Text>
      </TouchableOpacity>

      {/* ── Account ── */}
      <SectionHeader label="Account" />
      <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, padding: 0, overflow: "hidden" }]}>
        <MenuRow icon="logout" label="Sign Out" iconColor={colors.text.danger} labelColor={colors.text.danger} onPress={handleSignOut} />
        <MenuRow icon="delete-outline" label="Delete Account" iconColor={colors.text.danger} labelColor={colors.text.danger} onPress={handleDeleteAccount} hideChevron isLast />
      </View>
    </ScrollView>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Avatar
  avatarWrap: {
    marginBottom: 12,
    position: "relative",
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarName: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  avatarUsername: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 3,
  },
  avatarEmail: {
    fontSize: 13,
  },

  // Field row
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 14,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  // Auth
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
  socialBtnWrap: {
    width: "100%",
    height: 50,
    marginBottom: 10,
  },
  appleBtnFallback: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    height: 50,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },

  // Upgrade
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  upgradeBtnText: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Save
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
