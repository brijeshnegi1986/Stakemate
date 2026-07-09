import { StakesSheet, StateSheet, VenueSheet } from "@/components/SessionPickers";
import { PaywallModal } from "@/components/PaywallModal";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useThemeContext, type ThemePreference } from "@/store/ThemeContext";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  clearAllSessions,
  getSessions,
  getSetting,
  setSetting,
} from "@/db/database";

const version   = Constants.expoConfig?.version ?? "1.0.0";
const buildNum  = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode?.toString() ?? "";
const APP_VERSION = buildNum ? `${version} (${buildNum})` : version;
const STAKES_OPTIONS = ["1/1", "1/2", "2/3", "5/5", "5/10", "10/20", "25/50"];
const STATE_OPTIONS = ["NSW", "VIC", "QLD", "WA", "SA", "ACT"];
const VIEW_OPTIONS: { value: string; label: string; sublabel: string; icon: any }[] = [
  { value: "all",        label: "All",        sublabel: "Combined cash + tournament stats", icon: "layers-outline"  },
  { value: "cash",       label: "Cash",       sublabel: "Cash game metrics only",           icon: "cash-outline"    },
  { value: "tournament", label: "Tournament", sublabel: "Tournament metrics only",           icon: "trophy-outline"  },
];
const CURRENCY_OPTIONS: { value: string; label: string; flag: string; sublabel: string }[] = [
  { value: "AUD", label: "AUD", flag: "🇦🇺", sublabel: "Australian Dollar" },
  { value: "USD", label: "USD", flag: "🇺🇸", sublabel: "US Dollar" },
  { value: "GBP", label: "GBP", flag: "🇬🇧", sublabel: "British Pound" },
  { value: "NZD", label: "NZD", flag: "🇳🇿", sublabel: "New Zealand Dollar" },
  { value: "ZAR", label: "ZAR", flag: "🇿🇦", sublabel: "South African Rand" },
  { value: "EUR", label: "EUR", flag: "🇮🇪", sublabel: "Euro (Ireland)" },
  { value: "SGD", label: "SGD", flag: "🇸🇬", sublabel: "Singapore Dollar" },
  { value: "HKD", label: "HKD", flag: "🇭🇰", sublabel: "Hong Kong Dollar" },
];

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  sublabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { value: "dark",  label: "Dark",      sublabel: "Rich dark navy, easy on the eyes",   icon: "weather-night"    },
  { value: "light", label: "Light",     sublabel: "Clean bright look for daylight use", icon: "weather-sunny"    },
  { value: "auto",  label: "Automatic", sublabel: "Follows your device system setting",  icon: "theme-light-dark" },
];

export default function SettingsScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { user, isSyncing } = useAuth();
  const { isPro, isElite } = useSubscription();
  const { preference: themePreference, setPreference: setThemePreference } = useThemeContext();
  const [showPaywall, setShowPaywall] = useState(false);
  const [defaultStakes, setDefaultStakes] = useState("1/2");
  const [defaultState, setDefaultState]   = useState("NSW");
  const [defaultView, setDefaultView]     = useState("all");
  const [sessionCount, setSessionCount]   = useState(0);
  const [currency, setCurrency]           = useState("AUD");
  const [locationGranted, setLocationGranted]   = useState<boolean | null>(null);
  const [calAccessGranted, setCalAccessGranted] = useState<boolean | null>(null);
  const [calPermStatus, setCalPermStatus]       = useState<string>("undetermined");
  const [hidePastEvents, setHidePastEvents]     = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible]       = useState(false);
  const [viewModalVisible, setViewModalVisible]         = useState(false);
  const [defaultVenue, setDefaultVenue]                 = useState("");
  const [stakesOpen, setStakesOpen]                     = useState(false);
  const [stateOpen, setStateOpen]                       = useState(false);
  const [venueOpen, setVenueOpen]                       = useState(false);

  useFocusEffect(
    useCallback(() => {
      setDefaultStakes(getSetting("defaultStakes") ?? "1/2");
      setDefaultState(getSetting("defaultState") ?? "NSW");
      setDefaultVenue(getSetting("defaultVenue") ?? "");
      setDefaultView(getSetting("dashboardView") ?? "all");
      setCurrency(getSetting("currency") ?? "AUD");
      setSessionCount(getSessions().length);
      setHidePastEvents(getSetting("hidePastEvents") === "true");
    }, [])
  );

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => setLocationGranted(status === "granted"))
      .catch(() => setLocationGranted(false));
    Calendar.getCalendarPermissionsAsync()
      .then(({ status }) => { setCalAccessGranted(status === "granted"); setCalPermStatus(status); })
      .catch(() => { setCalAccessGranted(false); setCalPermStatus("denied"); });
  }, []);

  const handleCurrencyChange = (c: string) => {
    setSetting("currency", c);
    setCurrency(c);
    setCurrencyModalVisible(false);
  };

  const handleViewChange = (v: string) => {
    setSetting("dashboardView", v);
    setDefaultView(v);
  };

  const handleStakesChange = (s: string) => {
    setSetting("defaultStakes", s);
    setDefaultStakes(s);
  };

  const handleStateChange = (s: string) => {
    setSetting("defaultState", s);
    setDefaultState(s);
  };

  const handleVenueChange = (v: string) => {
    setSetting("defaultVenue", v);
    setDefaultVenue(v);
  };

  const handleRequestCalAccess = async () => {
    // If already denied, iOS won't show a dialog — go straight to Settings
    if (calPermStatus === "denied") {
      Alert.alert(
        "Calendar Access Required",
        "Calendar access was previously denied. Open iOS Settings to enable it for Stakemate.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openURL("app-settings:") },
        ]
      );
      return;
    }
    // First-time request — show the native iOS prompt
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    setCalAccessGranted(status === "granted");
    setCalPermStatus(status);
    if (status === "denied") {
      Alert.alert(
        "Calendar Access Denied",
        "You can enable calendar access in iOS Settings → Stakemate → Calendars.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openURL("app-settings:") },
        ]
      );
    }
  };

  const handleHidePastEventsChange = (v: boolean) => {
    setSetting("hidePastEvents", String(v));
    setHidePastEvents(v);
  };

  const handleClearSessions = () => {
    if (sessionCount === 0) return;
    Alert.alert(
      "Clear All Sessions",
      `Permanently delete all ${sessionCount} session${sessionCount === 1 ? "" : "s"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            clearAllSessions();
            setSessionCount(0);
          },
        },
      ]
    );
  };

  const handleResetStreak = () => {
    Alert.alert(
      "Reset Streak",
      "Your current streak will be reset to zero.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => setSetting("streakResetDate", new Date().toISOString()),
        },
      ]
    );
  };

  const card = {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden" as const,
    marginBottom: spacing["2xl"],
  };

  const divider = {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginHorizontal: spacing.lg,
  };

  return (
    <>
    <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["3xl"] }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── DATA & BACKUP ── */}
      <SectionLabel label="Data & Backup" colors={colors} spacing={spacing} typography={typography} />
      <View style={[{ backgroundColor: colors.bg.primary, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default, padding: 16, marginBottom: spacing.lg, gap: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: user ? "#22C55E18" : "#F59E0B18", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={user ? "cloud-done-outline" : "cloud-offline-outline"} size={20} color={user ? "#22C55E" : "#F59E0B"} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text.primary }}>
              {user ? (isSyncing ? "Syncing…" : "Cloud backup active") : "No backup — device only"}
            </Text>
            <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2, lineHeight: 16 }}>
              {user
                ? `Signed in as ${user.email ?? "your account"} · sessions, notes and results sync automatically across all your devices`
                : "Your data exists only on this device. Sign in with a free account to back it up automatically."}
            </Text>
          </View>
        </View>
        {!user && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F59E0B14", borderRadius: 8, padding: 10 }}>
            <Ionicons name="warning-outline" size={14} color="#D97706" />
            <Text style={{ flex: 1, fontSize: 12, color: "#D97706", lineHeight: 16 }}>
              If you lose or change this device, all your session data will be lost permanently.
            </Text>
          </View>
        )}
      </View>

      {/* ── CURRENCY ── */}
      <SectionLabel label="Currency" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>
        <TouchableOpacity
          onPress={() => setCurrencyModalVisible(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md + 2,
            gap: spacing.md,
          }}
        >
          <Text style={{ fontSize: 22 }}>
            {CURRENCY_OPTIONS.find((o) => o.value === currency)?.flag ?? "🌐"}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>
              {currency}
            </Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              {CURRENCY_OPTIONS.find((o) => o.value === currency)?.sublabel}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* ── THEME ── */}
      <SectionLabel label="Theme" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>
        {(() => {
          const active = THEME_OPTIONS.find((o) => o.value === themePreference) ?? THEME_OPTIONS[0];
          return (
            <TouchableOpacity
              onPress={() => setThemeModalVisible(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md + 2,
                gap: spacing.md,
              }}
            >
              <MaterialCommunityIcons name={active.icon} size={22} color={colors.text.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>
                  {active.label}
                </Text>
                <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
                  {active.sublabel}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          );
        })()}
      </View>

      {/* ── PREFERENCES ── */}
      <SectionLabel label="Game Preferences" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>

        {/* Default dashboard view */}
        {(() => {
          const activeView = VIEW_OPTIONS.find((o) => o.value === defaultView) ?? VIEW_OPTIONS[0];
          return (
            <TouchableOpacity
              onPress={() => setViewModalVisible(true)}
              activeOpacity={0.7}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}
            >
              <Ionicons name={activeView.icon} size={20} color={colors.text.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>{activeView.label}</Text>
                <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>{activeView.sublabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          );
        })()}

        <View style={divider} />

        {/* Default stakes — pageSheet picker */}
        <TouchableOpacity
          onPress={() => setStakesOpen(true)}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}
        >
          <MaterialCommunityIcons name="poker-chip" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>Default Stakes</Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>{defaultStakes}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>

        <View style={divider} />

        {/* Default state — fallback when GPS unavailable */}
        <TouchableOpacity
          onPress={() => setStateOpen(true)}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}
        >
          <Ionicons name="map-outline" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>Default State</Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              {defaultState} · used when location is unavailable
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>

        <View style={divider} />

        {/* Default venue */}
        <TouchableOpacity
          onPress={() => setVenueOpen(true)}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}
        >
          <Ionicons name="location-outline" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>Default Venue</Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              {defaultVenue || "None · choose each session"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>

        <View style={divider} />

        {/* Location status — read-only, no toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}>
          <Ionicons
            name={locationGranted ? "navigate" : "navigate-outline"}
            size={20}
            color={locationGranted ? colors.text.brand : colors.text.tertiary}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>Location Detection</Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              {locationGranted === null
                ? "Checking…"
                : locationGranted
                ? "Active · state auto-fills from your GPS"
                : "Off · enable in iOS Settings → Stakemate"}
            </Text>
          </View>
          <View style={[styles.locationBadge, { backgroundColor: locationGranted ? "#22C55E18" : colors.bg.secondary }]}>
            <Text style={[styles.locationBadgeText, { color: locationGranted ? "#16A34A" : colors.text.tertiary }]}>
              {locationGranted ? "On" : "Off"}
            </Text>
          </View>
        </View>

      </View>

      {/* ── HOME ── */}
      <SectionLabel label="Home" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>
        <TouchableOpacity
          onPress={() => router.push("/dashboard-customize")}
          activeOpacity={0.7}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}
        >
          <Ionicons name="options-outline" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>Customize Dashboard</Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              Choose which sections appear on your home screen
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* ── CALENDAR ── */}
      <SectionLabel label="Calendar" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>

        {/* Calendar Access */}
        <TouchableOpacity
          style={[styles.settingRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }]}
          onPress={calAccessGranted === true ? undefined : handleRequestCalAccess}
          activeOpacity={calAccessGranted === true ? 1 : 0.7}
        >
          <View style={[styles.settingIconWrap, { backgroundColor: "#22C55E15" }]}>
            <Ionicons name="calendar" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>Calendar Access</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17 }}>
              {calAccessGranted === true
                ? "Stakemate can sync tournaments to your device calendar"
                : calAccessGranted === false
                  ? "Tap to grant access"
                  : "Checking permission…"}
            </Text>
          </View>
          {calAccessGranted === true ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#22C55E" }}>Granted</Text>
            </View>
          ) : calAccessGranted === false ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.text.tertiary} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text.tertiary }}>Enable</Text>
            </View>
          ) : (
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.text.tertiary} />
          )}
        </TouchableOpacity>

        {/* Hide Past Events */}
        <View style={styles.settingRow}>
          <View style={[styles.settingIconWrap, { backgroundColor: "#F9731615" }]}>
            <Ionicons name="eye-off-outline" size={18} color="#F97316" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>Hide Past Events</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17 }}>
              Only show upcoming tournaments in My Tournaments
            </Text>
          </View>
          <Switch
            value={hidePastEvents}
            onValueChange={handleHidePastEventsChange}
            trackColor={{ false: colors.border.default, true: `${colors.bg.brand}88` }}
            thumbColor={hidePastEvents ? colors.bg.brand : colors.text.tertiary}
          />
        </View>

      </View>

      {/* ── DATA MANAGEMENT ── */}
      <SectionLabel label="Data Management" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>
        <Row
          label="Clear All Sessions"
          sublabel={sessionCount > 0 ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} stored` : "No sessions"}
          onPress={handleClearSessions}
          destructive
          disabled={sessionCount === 0}
          colors={colors} spacing={spacing} typography={typography}
        />
        <View style={divider} />
        <Row
          label="Reset Streak"
          sublabel="Zeroes your current streak counter"
          onPress={handleResetStreak}
          destructive
          colors={colors} spacing={spacing} typography={typography}
        />
      </View>

      {/* ── STAKES pageSheet ── */}
      <StakesSheet
        visible={stakesOpen}
        value={defaultStakes}
        onChange={(s) => { handleStakesChange(s); setStakesOpen(false); }}
        onClose={() => setStakesOpen(false)}
      />

      {/* ── STATE pageSheet ── */}
      <StateSheet
        visible={stateOpen}
        value={defaultState}
        onChange={(s) => { handleStateChange(s); setStateOpen(false); }}
        onClose={() => setStateOpen(false)}
      />

      {/* ── VENUE pageSheet ── */}
      <VenueSheet
        visible={venueOpen}
        venue={defaultVenue}
        state={defaultState}
        onChangeVenue={handleVenueChange}
        onChangeState={handleStateChange}
        onClose={() => setVenueOpen(false)}
        hideStateChips
      />

      {/* ── CURRENCY MODAL ── */}
      <Modal visible={currencyModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCurrencyModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
          <View style={[styles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.strong }]}>
            <TouchableOpacity onPress={() => setCurrencyModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.navSide}>
              <Ionicons name="close" size={32} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: colors.text.primary }]}>Select Currency</Text>
            <View style={styles.navSide} />
          </View>
          <View style={{ backgroundColor: colors.bg.primary, marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}>
            {CURRENCY_OPTIONS.map((opt, i) => {
              const isSelected = currency === opt.value;
              return (
                <View key={opt.value}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginLeft: 72 }} />}
                  <TouchableOpacity onPress={() => handleCurrencyChange(opt.value)} activeOpacity={0.7}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: isSelected ? colors.bg.brandLight : colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: isSelected ? colors.border.brand : colors.border.default, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 22 }}>{opt.flag}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{opt.label}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>{opt.sublabel}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.bg.brand} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── THEME MODAL ── */}
      <Modal visible={themeModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setThemeModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
          <View style={[styles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.strong }]}>
            <TouchableOpacity onPress={() => setThemeModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.navSide}>
              <Ionicons name="close" size={32} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: colors.text.primary }]}>Select Theme</Text>
            <View style={styles.navSide} />
          </View>
          <View style={{ backgroundColor: colors.bg.primary, marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}>
            {THEME_OPTIONS.map((opt, i) => {
              const isSelected = themePreference === opt.value;
              return (
                <View key={opt.value}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginLeft: 72 }} />}
                  <TouchableOpacity onPress={() => { setThemePreference(opt.value); setThemeModalVisible(false); }} activeOpacity={0.7}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: isSelected ? colors.bg.brandLight : colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: isSelected ? colors.border.brand : colors.border.default, alignItems: "center", justifyContent: "center" }}>
                      <MaterialCommunityIcons name={opt.icon} size={22} color={isSelected ? colors.text.brand : colors.text.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{opt.label}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>{opt.sublabel}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.bg.brand} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── VIEW MODAL ── */}
      <Modal visible={viewModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
          <View style={[styles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.strong }]}>
            <TouchableOpacity onPress={() => setViewModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.navSide}>
              <Ionicons name="close" size={32} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: colors.text.primary }]}>Default Dashboard View</Text>
            <View style={styles.navSide} />
          </View>
          <View style={{ backgroundColor: colors.bg.primary, marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }}>
            {VIEW_OPTIONS.map((opt, i) => {
              const isSelected = defaultView === opt.value;
              return (
                <View key={opt.value}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginLeft: 72 }} />}
                  <TouchableOpacity onPress={() => { handleViewChange(opt.value); setViewModalVisible(false); }} activeOpacity={0.7}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: isSelected ? colors.bg.brandLight : colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: isSelected ? colors.border.brand : colors.border.default, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={opt.icon} size={20} color={isSelected ? colors.text.brand : colors.text.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600" }}>{opt.label}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 1 }}>{opt.sublabel}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.bg.brand} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── APP ── */}
      <SectionLabel label="App" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>
        <Row
          label="Version"
          value={APP_VERSION}
          colors={colors} spacing={spacing} typography={typography}
        />
        <View style={divider} />
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginBottom: spacing.xs }}>
            About StakeMate
          </Text>
          <Text style={{ color: colors.text.tertiary, ...typography.caption, lineHeight: 18 }}>
            A poker bankroll tracker for serious players. Log sessions, track performance, and make better decisions at the table.
          </Text>
        </View>
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  locationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  locationBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  navSide:   { width: 44, alignItems: "flex-start", justifyContent: "center" },
  navTitle:  { flex: 1, fontSize: 17, fontWeight: "600", textAlign: "center" },
  navCancel: { fontSize: 16 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  settingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ label, colors, spacing, typography }: any) {
  return (
    <Text style={{
      color: colors.text.tertiary,
      ...typography.caption,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontWeight: "600",
      marginBottom: spacing.sm,
    }}>
      {label}
    </Text>
  );
}

function Row({
  label,
  sublabel,
  value,
  onPress,
  destructive = false,
  chevron = false,
  locked = false,
  disabled = false,
  colors,
  spacing,
  typography,
}: {
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
  locked?: boolean;
  disabled?: boolean;
  colors: any;
  spacing: any;
  typography: any;
}) {
  const content = (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      opacity: disabled ? 0.38 : 1,
    }}>
      <View style={{ flex: 1, marginRight: spacing.lg }}>
        <Text style={{
          color: destructive ? colors.text.danger : colors.text.primary,
          ...typography.body,
        }}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 2 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        {value ? (
          <Text style={{ color: colors.text.secondary, ...typography.bodySm }}>{value}</Text>
        ) : null}
        {locked ? (
          <Text style={{ color: colors.text.disabled, ...typography.caption }}>🔒</Text>
        ) : null}
        {chevron ? (
          <Text style={{ color: colors.text.disabled, fontSize: 20, lineHeight: 24 }}>›</Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}
