import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useThemeContext, type ThemePreference } from "@/store/ThemeContext";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clearAllSessions,
  getSessions,
  getSetting,
  setSetting,
} from "@/db/database";

import { VENUES_BY_STATE } from "@/constants/venues";

const APP_VERSION = "1.0.0";
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
  const { preference: themePreference, setPreference: setThemePreference } = useThemeContext();
  const insets = useSafeAreaInsets();

  const [defaultStakes, setDefaultStakes] = useState("1/2");
  const [defaultState, setDefaultState] = useState("NSW");
  const [defaultVenue, setDefaultVenue] = useState("");
  const [defaultView, setDefaultView] = useState("all");
  const [sessionCount, setSessionCount] = useState(0);
  const [currency, setCurrency] = useState("AUD");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [stakesModalVisible, setStakesModalVisible] = useState(false);
  const [gameDefaultsVisible, setGameDefaultsVisible] = useState(false);
  // temp state for the game-defaults sheet (committed on Save)
  const [tempState, setTempState] = useState(defaultState);
  const [tempVenue, setTempVenue] = useState(defaultVenue);

  useFocusEffect(
    useCallback(() => {
      setDefaultStakes(getSetting("defaultStakes") ?? "1/2");
      setDefaultState(getSetting("defaultState") ?? "NSW");
      setDefaultVenue(getSetting("defaultVenue") ?? "");
      setDefaultView(getSetting("dashboardView") ?? "all");
      setCurrency(getSetting("currency") ?? "AUD");
      setLocationEnabled(getSetting("locationEnabled") === "true");
      setSessionCount(getSessions().length);
    }, [])
  );

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
    setDefaultVenue(v);
    setSetting("defaultVenue", v);
  };

  const handleLocationToggle = async (value: boolean) => {
    if (value) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Allow location access in your device Settings to enable this feature.");
        return;
      }
    }
    setSetting("locationEnabled", value ? "true" : "false");
    setLocationEnabled(value);
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["3xl"] }}
      showsVerticalScrollIndicator={false}
    >
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

        {/* Default dashboard view — row → modal */}
        {(() => {
          const activeView = VIEW_OPTIONS.find((o) => o.value === defaultView) ?? VIEW_OPTIONS[0];
          return (
            <TouchableOpacity
              onPress={() => setViewModalVisible(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md + 2,
                gap: spacing.md,
              }}
            >
              <Ionicons name={activeView.icon} size={20} color={colors.text.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>
                  {activeView.label}
                </Text>
                <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
                  {activeView.sublabel}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          );
        })()}

        <View style={divider} />

        {/* Default stakes row */}
        <TouchableOpacity
          onPress={() => setStakesModalVisible(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md + 2,
            gap: spacing.md,
          }}
        >
          <MaterialCommunityIcons name="poker-chip" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>
              Default Stakes
            </Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              {defaultStakes}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>

        <View style={divider} />

        {/* Game defaults row (state + venue) */}
        <TouchableOpacity
          onPress={() => {
            setTempState(defaultState);
            setTempVenue(defaultVenue);
            setGameDefaultsVisible(true);
          }}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md + 2,
            gap: spacing.md,
          }}
        >
          <Ionicons name="location-outline" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>
              Default Location
            </Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }} numberOfLines={1}>
              {[defaultState, defaultVenue].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>

        <View style={divider} />

        {/* Location access toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md }}>
          <Ionicons name="navigate-outline" size={20} color={colors.text.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, ...typography.bodySm, fontWeight: "600" }}>
              Use My Location
            </Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: 1 }}>
              Auto-detect state when starting a session
            </Text>
          </View>
          <Switch
            value={locationEnabled}
            onValueChange={handleLocationToggle}
            trackColor={{ false: colors.border.default, true: colors.bg.brand }}
            thumbColor="#fff"
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
        <View style={divider} />
        <Row
          label="Export Data"
          sublabel="CSV — coming soon"
          value="Soon"
          colors={colors} spacing={spacing} typography={typography}
        />
      </View>

      {/* ── STAKES MODAL ── */}
      <Modal visible={stakesModalVisible} transparent animationType="slide" onRequestClose={() => setStakesModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setStakesModalVisible(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <TouchableWithoutFeedback>
              <View style={[sheetStyle(colors), { paddingBottom: insets.bottom + 24 }]}>
                <SheetHandle colors={colors} />
                <SheetHeader title="Default Stakes" onClose={() => setStakesModalVisible(false)} colors={colors} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {STAKES_OPTIONS.map((s) => {
                    const isSelected = defaultStakes === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => { handleStakesChange(s); setStakesModalVisible(false); }}
                        activeOpacity={0.75}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 20,
                          borderRadius: 999,
                          backgroundColor: isSelected ? colors.bg.brand : colors.bg.secondary,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: isSelected ? colors.border.brand : colors.border.default,
                        }}
                      >
                        <Text style={{ color: isSelected ? colors.text.onBrand : colors.text.primary, fontSize: 15, fontWeight: isSelected ? "700" : "500" }}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── GAME DEFAULTS MODAL (state + venue) ── */}
      <Modal visible={gameDefaultsVisible} transparent animationType="slide" onRequestClose={() => setGameDefaultsVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <TouchableWithoutFeedback>
              <View style={[sheetStyle(colors), { maxHeight: "85%" }]}>
                <SheetHandle colors={colors} />
                <SheetHeader title="Default Location" onClose={() => setGameDefaultsVisible(false)} colors={colors} />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* State */}
                  <Text style={sectionLabel(colors)}>State</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                    {STATE_OPTIONS.map((s) => {
                      const isSelected = tempState === s;
                      return (
                        <TouchableOpacity key={s} onPress={() => { setTempState(s); setTempVenue(""); }} activeOpacity={0.75}
                          style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: isSelected ? colors.bg.brand : colors.bg.secondary, borderWidth: StyleSheet.hairlineWidth, borderColor: isSelected ? colors.border.brand : colors.border.default }}>
                          <Text style={{ color: isSelected ? colors.text.onBrand : colors.text.primary, fontSize: 14, fontWeight: isSelected ? "700" : "500" }}>{s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Venues */}
                  <Text style={sectionLabel(colors)}>Venue · {tempState}</Text>
                  <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default, marginBottom: 24 }}>
                    {(VENUES_BY_STATE[tempState] ?? []).map((v, i) => {
                      const isSelected = tempVenue === v;
                      return (
                        <TouchableOpacity key={v} onPress={() => setTempVenue(v)} activeOpacity={0.7}
                          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: isSelected ? colors.bg.brandLight : colors.bg.primary, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border.default }}>
                          <Text style={{ flex: 1, color: isSelected ? colors.text.brand : colors.text.primary, fontSize: 15, fontWeight: isSelected ? "600" : "400" }}>{v}</Text>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.bg.brand} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Save */}
                  <TouchableOpacity onPress={() => { handleStateChange(tempState); handleVenueChange(tempVenue); setGameDefaultsVisible(false); }} activeOpacity={0.88}
                    style={{ backgroundColor: colors.bg.brand, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: insets.bottom + 16 }}>
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Save</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── CURRENCY MODAL ── */}
      <Modal visible={currencyModalVisible} transparent animationType="slide" onRequestClose={() => setCurrencyModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setCurrencyModalVisible(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <TouchableWithoutFeedback>
              <View style={[sheetStyle(colors), { paddingBottom: insets.bottom + 24 }]}>
                <SheetHandle colors={colors} />
                <SheetHeader title="Select Currency" onClose={() => setCurrencyModalVisible(false)} colors={colors} />
                {CURRENCY_OPTIONS.map((opt, i) => {
                  const isSelected = currency === opt.value;
                  return (
                    <View key={opt.value}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginVertical: 2 }} />}
                      <TouchableOpacity onPress={() => handleCurrencyChange(opt.value)} activeOpacity={0.7}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 }}>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── THEME MODAL ── */}
      <Modal visible={themeModalVisible} transparent animationType="slide" onRequestClose={() => setThemeModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setThemeModalVisible(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <TouchableWithoutFeedback>
              <View style={[sheetStyle(colors), { paddingBottom: insets.bottom + 24 }]}>
                <SheetHandle colors={colors} />
                <SheetHeader title="Select Theme" onClose={() => setThemeModalVisible(false)} colors={colors} />
                {THEME_OPTIONS.map((opt, i) => {
                  const isSelected = themePreference === opt.value;
                  return (
                    <View key={opt.value}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginVertical: 2 }} />}
                      <TouchableOpacity onPress={() => { setThemePreference(opt.value); setThemeModalVisible(false); }} activeOpacity={0.7}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 }}>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── VIEW MODAL ── */}
      <Modal visible={viewModalVisible} transparent animationType="slide" onRequestClose={() => setViewModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setViewModalVisible(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <TouchableWithoutFeedback>
              <View style={[sheetStyle(colors), { paddingBottom: insets.bottom + 24 }]}>
                <SheetHandle colors={colors} />
                <SheetHeader title="Default Dashboard View" onClose={() => setViewModalVisible(false)} colors={colors} />
                {VIEW_OPTIONS.map((opt, i) => {
                  const isSelected = defaultView === opt.value;
                  return (
                    <View key={opt.value}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.default, marginVertical: 2 }} />}
                      <TouchableOpacity onPress={() => { handleViewChange(opt.value); setViewModalVisible(false); }} activeOpacity={0.7}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 }}>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
  );
}

// ── Sheet helpers ──────────────────────────────────────────────────────────────

const sheetStyle = (colors: any) => ({
  backgroundColor: colors.bg.primary,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  paddingHorizontal: 20,
  paddingTop: 12,
});

const sectionLabel = (colors: any) => ({
  color: colors.text.tertiary,
  fontSize: 11,
  fontWeight: "700" as const,
  letterSpacing: 0.8,
  textTransform: "uppercase" as const,
  marginBottom: 10,
});

function SheetHandle({ colors }: { colors: any }) {
  return (
    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border.strong, alignSelf: "center", marginBottom: 16 }} />
  );
}

function SheetHeader({ title, onClose, colors }: { title: string; onClose: () => void; colors: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: "800" }}>{title}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="close" size={16} color={colors.text.secondary} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

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
