import { SegmentedControl } from "@/components/SegmentedControl";
import { BuyInSheet, FieldRow, StakesSheet, StateSheet, VenueSheet } from "@/components/SessionPickers";
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

import { detectStateFromLocation } from "@/lib/locationState";
import { getSetting, SessionType, startLiveSession, startLiveTournament } from "../../db/database";

function getAvailableTypes(): SessionType[] {
  return ["cash", "tournament"];
}

export default function StartSessionScreen() {
  const { colors, spacing, typography, inputTypo } = usePokerTheme();
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

  const [buyInOpen,   setBuyInOpen]   = useState(false);
  const [stakesOpen,  setStakesOpen]  = useState(false);
  const [stateOpen,   setStateOpen]   = useState(false);
  const [venueOpen,   setVenueOpen]   = useState(false);

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 10 }).start();
    detectStateFromLocation().then((state) => {
      if (state) setStateRegion(state);
    });
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
      router.replace("/live/active");
    } else {
      startLiveSession({
        buyIn:     parseFloat(buyIn),
        stakes,
        state:     stateRegion,
        venue:     venue.trim(),
        startTime: now,
      });
      router.replace("/live/active");
    }
  };

  const inputCard = {
    backgroundColor: colors.bg.primary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    shadowColor: "#000" as const,
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
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
                { value: "cash",       label: "Cash Game",   icon: "cash-outline"   },
                { value: "tournament", label: "Tournament",   icon: "trophy-outline" },
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

          {/* ── Session detail fields ── */}
          <View style={{ ...inputCard, marginBottom: spacing["2xl"] }}>
            <FieldRow
              icon="cash-outline"
              label="Buy-in"
              value={buyIn ? `$${parseFloat(buyIn).toLocaleString()}` : ""}
              placeholder="Set buy-in"
              onPress={() => setBuyInOpen(true)}
              colors={colors}
            />
            {type === "cash" && (
              <FieldRow
                icon="swap-horizontal-outline"
                label="Stakes"
                value={stakes}
                placeholder="Choose stakes"
                onPress={() => setStakesOpen(true)}
                colors={colors}
              />
            )}
            <FieldRow
              icon="map-outline"
              label="State"
              value={stateRegion}
              placeholder="Choose state"
              onPress={() => setStateOpen(true)}
              colors={colors}
            />
            <FieldRow
              icon="location-outline"
              label="Venue"
              value={venue}
              placeholder="Choose venue"
              onPress={() => setVenueOpen(true)}
              colors={colors}
              isLast
            />
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

          <BuyInSheet  visible={buyInOpen}  value={buyIn}       onChange={setBuyIn}        onClose={() => setBuyInOpen(false)}  />
          <StakesSheet visible={stakesOpen} value={stakes}      onChange={setStakes}       onClose={() => setStakesOpen(false)} />
          <StateSheet  visible={stateOpen}  value={stateRegion} onChange={setStateRegion}  onClose={() => setStateOpen(false)}  />
          <VenueSheet
            visible={venueOpen}
            venue={venue}
            state={stateRegion}
            onChangeVenue={setVenue}
            onChangeState={setStateRegion}
            onClose={() => setVenueOpen(false)}
            hideStateChips
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

