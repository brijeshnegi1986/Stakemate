import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useThemeContext, type ThemePreference } from "@/store/ThemeContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
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
} from "../../db/database";

const APP_VERSION = "1.0.0";
const STAKES_OPTIONS = ["1/1", "1/2", "2/3", "5/5", "10/10"];
const STATE_OPTIONS = ["NSW", "VIC", "QLD", "WA", "SA", "ACT"];
const VENUES_BY_STATE: Record<string, string[]> = {
  NSW: ["Star Sydney", "APL", "NPL", "Poker Palace", "Home Games", "Other"],
  VIC: ["Crown Melbourne", "APL", "NPL", "Home Games", "Other"],
  QLD: ["Star Brisbane", "Star GoldCoast", "APL", "Home Games", "Other"],
  WA: ["APL", "Home Games", "Other"],
  SA: ["Adelaide Casino", "APL", "Home Games", "Other"],
  ACT: ["Canberra Casino", "APL", "Home Games", "Other"],
};
const VIEW_OPTIONS: { value: string; label: string; sublabel: string }[] = [
  { value: "all",        label: "All",        sublabel: "Combined cash + tournament stats" },
  { value: "cash",       label: "Cash",       sublabel: "Cash game metrics only" },
  { value: "tournament", label: "Tournament", sublabel: "Tournament metrics only" },
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

  const [defaultStakes, setDefaultStakes] = useState("1/2");
  const [defaultState, setDefaultState] = useState("NSW");
  const [defaultVenue, setDefaultVenue] = useState("");
  const [defaultView, setDefaultView] = useState("all");
  const [sessionCount, setSessionCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setDefaultStakes(getSetting("defaultStakes") ?? "1/2");
      setDefaultState(getSetting("defaultState") ?? "NSW");
      setDefaultVenue(getSetting("defaultVenue") ?? "");
      setDefaultView(getSetting("dashboardView") ?? "all");
      setSessionCount(getSessions().length);
    }, [])
  );

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
      {/* ── THEME ── */}
      <SectionLabel label="Theme" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>
        {THEME_OPTIONS.map((opt, i) => {
          const isSelected = themePreference === opt.value;
          return (
            <View key={opt.value}>
              {i > 0 && <View style={divider} />}
              <TouchableOpacity
                onPress={() => setThemePreference(opt.value)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md + 2,
                  gap: spacing.md,
                }}
              >
                {/* Icon badge */}
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.sm,
                  backgroundColor: isSelected ? colors.bg.brand + "22" : colors.bg.primary,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.border.brand : colors.border.default,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <MaterialCommunityIcons
                    name={opt.icon}
                    size={20}
                    color={isSelected ? colors.text.brand : colors.text.secondary}
                  />
                </View>

                {/* Labels */}
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: colors.text.primary,
                    ...typography.bodySm,
                    fontWeight: "600",
                  }}>
                    {opt.label}
                  </Text>
                  <Text style={{
                    color: colors.text.tertiary,
                    ...typography.caption,
                    marginTop: 2,
                  }}>
                    {opt.sublabel}
                  </Text>
                </View>

                {/* Radio button */}
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.bg.brand : colors.border.strong,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {isSelected && (
                    <View style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.bg.brand,
                    }} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
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

      {/* ── SESSION TYPES ── */}
      {/* ── PREFERENCES ── */}
      <SectionLabel label="Preferences" colors={colors} spacing={spacing} typography={typography} />
      <View style={card}>

        {/* Default dashboard view */}
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginBottom: spacing.xs }}>
            Default Dashboard View
          </Text>
          <Text style={{ color: colors.text.tertiary, ...typography.caption, marginBottom: spacing.md }}>
            Which stats to show when you open the app
          </Text>
          <View style={{ gap: spacing.sm }}>
            {VIEW_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => handleViewChange(opt.value)}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 2,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  backgroundColor: defaultView === opt.value ? colors.bg.brand : colors.bg.tertiary,
                  borderColor: defaultView === opt.value ? colors.border.brand : colors.border.default,
                }}
              >
                <View>
                  <Text style={{
                    color: defaultView === opt.value ? colors.text.onBrand : colors.text.primary,
                    ...typography.bodySm,
                    fontWeight: "600",
                  }}>
                    {opt.label}
                  </Text>
                  <Text style={{
                    color: defaultView === opt.value ? colors.text.onBrand : colors.text.tertiary,
                    ...typography.caption,
                    marginTop: 2,
                    opacity: defaultView === opt.value ? 0.8 : 1,
                  }}>
                    {opt.sublabel}
                  </Text>
                </View>
                {defaultView === opt.value && (
                  <Text style={{ color: colors.text.onBrand, fontSize: 16 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={divider} />

        {/* Default stakes */}
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginBottom: spacing.sm }}>
            Default Stakes
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {STAKES_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => handleStakesChange(s)}
                activeOpacity={0.75}
                style={{
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.full,
                  backgroundColor: defaultStakes === s ? colors.bg.brand : colors.bg.tertiary,
                  borderWidth: 1,
                  borderColor: defaultStakes === s ? colors.border.brand : colors.border.default,
                }}
              >
                <Text style={{
                  color: defaultStakes === s ? colors.text.onBrand : colors.text.primary,
                  ...typography.label,
                  fontWeight: defaultStakes === s ? "700" : "500",
                }}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={divider} />

        {/* Default state */}
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginBottom: spacing.sm }}>
            Default State
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {STATE_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => handleStateChange(s)}
                activeOpacity={0.75}
                style={{
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.full,
                  backgroundColor: defaultState === s ? colors.bg.brand : colors.bg.tertiary,
                  borderWidth: 1,
                  borderColor: defaultState === s ? colors.border.brand : colors.border.default,
                }}
              >
                <Text style={{
                  color: defaultState === s ? colors.text.onBrand : colors.text.primary,
                  ...typography.label,
                  fontWeight: defaultState === s ? "700" : "500",
                }}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={divider} />

        {/* Default venue */}
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginBottom: spacing.sm }}>
            Default Venue
          </Text>
          <View style={{
            height: 44,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.bg.tertiary,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: defaultVenue.length > 0 ? colors.border.brand : colors.border.default,
            paddingHorizontal: spacing.md,
            marginBottom: spacing.sm,
          }}>
            <TextInput
              value={defaultVenue}
              onChangeText={handleVenueChange}
              placeholder="e.g. Star Sydney"
              placeholderTextColor={colors.text.disabled}
              returnKeyType="done"
              style={{
                flex: 1,
                height: 44,
                color: colors.text.primary,
                ...typography.bodySm,
              }}
            />
            {defaultVenue.length > 0 && (
              <TouchableOpacity onPress={() => handleVenueChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.border.default,
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: spacing.sm,
                }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 10, lineHeight: 12 }}>✕</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {(VENUES_BY_STATE[defaultState] ?? VENUES_BY_STATE["NSW"]).map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => handleVenueChange(v)}
                activeOpacity={0.75}
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: defaultVenue === v ? colors.bg.brand : colors.bg.tertiary,
                  borderWidth: 1,
                  borderColor: defaultVenue === v ? colors.border.brand : colors.border.default,
                }}
              >
                <Text style={{
                  color: defaultVenue === v ? colors.text.onBrand : colors.text.primary,
                  ...typography.caption,
                  fontWeight: defaultVenue === v ? "700" : "400",
                }}>
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={divider} />

        {/* Currency — locked */}
        <Row
          label="Currency"
          value="AUD"
          locked
          colors={colors} spacing={spacing} typography={typography}
        />
      </View>

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
