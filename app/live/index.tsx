import { SegmentedControl } from "@/components/SegmentedControl";
import { VenueSelector } from "@/components/VenueSelector";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTotalSessionCount, getSetting, SessionType, startLiveSession, startLiveTournament } from "../../db/database";

const STAKES       = ["1/1", "1/2", "2/3", "5/5", "10/10"];
const QUICK_BUYINS = [100, 200, 300, 500, 1000, 2000, 5000];

function getAvailableTypes(): SessionType[] {
  return ["cash", "tournament"];
}

export default function StartSessionScreen() {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const availableTypes  = getAvailableTypes();
  const showTypeToggle  = availableTypes.length > 1;

  const [type, setType] = useState<SessionType>(() => {
    const types     = getAvailableTypes();
    const saved     = getSetting("dashboardView") ?? "all";
    const preferred = saved === "tournament" ? "tournament" : "cash";
    return types.includes(preferred) ? preferred : types[0];
  });
  const [buyIn, setBuyIn]                   = useState("");
  const [stakes, setStakes]                 = useState(() => getSetting("defaultStakes") ?? "1/2");
  const [stateRegion, setStateRegion]       = useState(() => getSetting("defaultState") ?? "NSW");
  const [venue, setVenue]                   = useState(() => getSetting("defaultVenue") ?? "");
  const [tournamentName, setTournamentName] = useState("");
  const [entries, setEntries]               = useState("");

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 10 }).start();
  }, []);

  const isReady = type === "cash"
    ? buyIn !== "" && parseFloat(buyIn) > 0
    : buyIn !== "" && parseFloat(buyIn) > 0 && tournamentName.trim() !== "";

  const handleGoLive = () => {
    if (!isReady) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now = new Date().toISOString();

    if (type === "tournament") {
      startLiveTournament({
        buyIn:          parseFloat(buyIn),
        tournamentName: tournamentName.trim(),
        entries:        parseInt(entries) || 0,
        venue:          venue.trim(),
        state:          stateRegion,
        startTime:      now,
      });
    } else {
      startLiveSession({
        buyIn:     parseFloat(buyIn),
        stakes,
        state:     stateRegion,
        venue:     venue.trim(),
        startTime: now,
      });
    }
    router.replace("/live/active");
  };

  const inputCard = {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 8,
    borderWidth: 1,
  };

  const labelStyle = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    marginBottom: spacing.sm,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View style={{
        flex: 1,
        opacity: enterAnim,
        transform: [{ translateY: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Type toggle (only shown when both types are enabled) ── */}
          {showTypeToggle && (
            <SegmentedControl
              options={[
                { value: "cash", label: "Cash Game" },
                { value: "tournament", label: "Tournament" },
              ]}
              selected={type}
              onChange={(value) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setType(value);
              }}
              style={{ marginBottom: spacing["2xl"] }}
            />
          )}

          {/* ── Tournament name ── */}
          {type === "tournament" && (
            <>
              <Text style={labelStyle}>Tournament Name</Text>
              <View style={{
                ...inputCard,
                borderColor: tournamentName.length > 0 ? colors.border.brand : colors.border.default,
                paddingHorizontal: spacing.lg,
                marginBottom: spacing["2xl"],
              }}>
                <TextInput
                  placeholder="e.g. Sunday Major, WSOP Event #14"
                  placeholderTextColor={colors.text.disabled}
                  value={tournamentName}
                  onChangeText={setTournamentName}
                  returnKeyType="next"
                  style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body }}
                />
              </View>
            </>
          )}

          {/* ── Buy-in ── */}
          <Text style={labelStyle}>Buy-in</Text>
          <View style={{
            ...inputCard,
            borderColor: buyIn !== "" && parseFloat(buyIn) > 0 ? colors.border.brand : colors.border.default,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            marginBottom: spacing.sm,
          }}>
            <Text style={{ color: colors.text.disabled, ...typography.heading3, marginRight: spacing.xs }}>$</Text>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.text.disabled}
              value={buyIn}
              onChangeText={setBuyIn}
              returnKeyType="done"
              style={{
                flex: 1,
                color: colors.text.primary,
                paddingVertical: spacing.lg,
                ...typography.heading2,
                fontWeight: "700",
                textAlign: "right",
              }}
            />
          </View>

          {/* Quick buy-in chips */}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
            {QUICK_BUYINS.map((amount) => (
              <TouchableOpacity
                key={amount}
                onPress={() => setBuyIn(String(amount))}
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  alignItems: "center",
                  backgroundColor: buyIn === String(amount) ? colors.bg.brand : colors.bg.tertiary,
                  borderWidth: 1,
                  borderColor: buyIn === String(amount) ? colors.border.brand : colors.border.subtle,
                }}
              >
                <Text style={{
                  color: buyIn === String(amount) ? colors.text.onBrand : colors.text.secondary,
                  ...typography.caption,
                  fontWeight: "600",
                }}>
                  ${amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Entries (tournament only) ── */}
          {type === "tournament" && (
            <>
              <Text style={labelStyle}>Total Entries (optional)</Text>
              <View style={{
                ...inputCard,
                borderColor: colors.border.default,
                paddingHorizontal: spacing.lg,
                marginBottom: spacing["2xl"],
              }}>
                <TextInput
                  keyboardType="number-pad"
                  placeholder="120"
                  placeholderTextColor={colors.text.disabled}
                  value={entries}
                  onChangeText={setEntries}
                  returnKeyType="done"
                  style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body, textAlign: "right" }}
                />
              </View>
            </>
          )}

          {/* ── Stakes (cash only) ── */}
          {type === "cash" && (
            <>
              <Text style={labelStyle}>Stakes</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
                {STAKES.map((s) => (
                  <Chip key={s} label={s} selected={stakes === s} onPress={() => setStakes(s)}
                    colors={colors} spacing={spacing} radius={radius} typography={typography} />
                ))}
              </View>
            </>
          )}

          <VenueSelector
            stateRegion={stateRegion}
            setStateRegion={setStateRegion}
            venue={venue}
            setVenue={setVenue}
          />
        </ScrollView>

        {/* ── Go Live button ── */}
        <View style={{
          padding: spacing.lg,
          paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.border.default,
          backgroundColor: colors.bg.primary,
        }}>
          {!isReady && (
            <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing.sm }}>
              {type === "cash"
                ? "Enter a buy-in amount to start"
                : "Enter buy-in and tournament name to start"}
            </Text>
          )}
          <TouchableOpacity
            onPress={handleGoLive}
            disabled={!isReady}
            activeOpacity={0.85}
            style={{
              paddingVertical: spacing.lg + 2,
              borderRadius: 8,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.sm,
              backgroundColor: isReady ? colors.bg.brand : colors.state.disabled,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isReady ? colors.text.onBrand : colors.text.disabled }} />
            <Text style={{ color: isReady ? colors.text.onBrand : colors.text.disabled, fontWeight: "700", ...typography.body }}>
              Go Live
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, selected, onPress, colors, spacing, radius, typography }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        backgroundColor: selected ? colors.bg.brand : colors.bg.tertiary,
        borderWidth: 1,
        borderColor: selected ? colors.border.brand : colors.border.default,
      }}
    >
      <Text style={{ color: selected ? colors.text.onBrand : colors.text.primary, ...typography.label, fontWeight: selected ? "700" : "500" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
