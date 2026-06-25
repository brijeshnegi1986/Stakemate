import { StakesSheet, StateSheet, VenueSheet } from "@/components/SessionPickers";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useThemeContext, type ThemePreference } from "@/store/ThemeContext";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
  const [defaultState, setDefaultState]   = useState("NSW");
  const [defaultView, setDefaultView]     = useState("all");
  const [sessionCount, setSessionCount]   = useState(0);
  const [currency, setCurrency]           = useState("AUD");
  const [locationGranted, setLocationGranted]   = useState<boolean | null>(null);
  const [calAccessGranted, setCalAccessGranted] = useState<boolean | null>(null);
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
      .then(({ status }) => setCalAccessGranted(status === "granted"))
      .catch(() => setCalAccessGranted(false));
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
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    setCalAccessGranted(status === "granted");
    if (status !== "granted") {
      Alert.alert("Calendar Access", "To enable calendar access, go to Settings → Privacy → Calendars and allow Stakemate.");
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

      {/* ── CALENDAR ── */}
      <SectionLabel label="Calendar" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>

        {/* Calendar Access */}
        <View style={[styles.settingRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default }]}>
          <View style={[styles.settingIconWrap, { backgroundColor: "#22C55E15" }]}>
            <Ionicons name="calendar" size={18} color="#22C55E" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>Calendar Access</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17 }}>
              {calAccessGranted === true
                ? "Stakemate can read/write your device calendar"
                : calAccessGranted === false
                  ? "Tap to request access"
                  : "Checking permission…"}
            </Text>
          </View>
          <Switch
            value={calAccessGranted === true}
            onValueChange={(val) => {
              if (val) {
                handleRequestCalAccess();
              } else {
                Alert.alert("Disable Calendar Access", "To revoke access, go to iOS Settings → Privacy → Calendars.");
              }
            }}
            trackColor={{ false: colors.border.default, true: "#22C55E55" }}
            thumbColor={calAccessGranted ? "#22C55E" : colors.text.tertiary}
          />
        </View>

        {/* Hide Past Events */}
        <View style={styles.settingRow}>
          <View style={[styles.settingIconWrap, { backgroundColor: "#F9731615" }]}>
            <Ionicons name="eye-off-outline" size={18} color="#F97316" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>Hide Past Events</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 17 }}>
              Only show upcoming tournaments in My Schedule
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
        <View style={divider} />
        <Row
          label="Export Data"
          sublabel="CSV — coming soon"
          value="Soon"
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
      <Modal visible={currencyModalVisible} transparent animationType="slide" onRequestClose={() => setCurrencyModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setCurrencyModalVisible(false)}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
            <TouchableWithoutFeedback>
              <View style={[styles.sheet, { backgroundColor: colors.bg.primary, paddingBottom: insets.bottom + 24 }]}>
                <View style={[styles.sheetHandle, { backgroundColor: colors.border.strong }]} />
                <View style={styles.sheetHeader}>
                  <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Select Currency</Text>
                  <TouchableOpacity onPress={() => setCurrencyModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={[styles.closeBtn, { backgroundColor: colors.bg.secondary }]}><Ionicons name="close" size={16} color={colors.text.secondary} /></View>
                  </TouchableOpacity>
                </View>
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
              <View style={[styles.sheet, { backgroundColor: colors.bg.primary, paddingBottom: insets.bottom + 24 }]}>
                <View style={[styles.sheetHandle, { backgroundColor: colors.border.strong }]} />
                <View style={styles.sheetHeader}>
                  <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Select Theme</Text>
                  <TouchableOpacity onPress={() => setThemeModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={[styles.closeBtn, { backgroundColor: colors.bg.secondary }]}><Ionicons name="close" size={16} color={colors.text.secondary} /></View>
                  </TouchableOpacity>
                </View>
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
              <View style={[styles.sheet, { backgroundColor: colors.bg.primary, paddingBottom: insets.bottom + 24 }]}>
                <View style={[styles.sheetHandle, { backgroundColor: colors.border.strong }]} />
                <View style={styles.sheetHeader}>
                  <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Default Dashboard View</Text>
                  <TouchableOpacity onPress={() => setViewModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={[styles.closeBtn, { backgroundColor: colors.bg.secondary }]}><Ionicons name="close" size={16} color={colors.text.secondary} /></View>
                  </TouchableOpacity>
                </View>
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
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
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
