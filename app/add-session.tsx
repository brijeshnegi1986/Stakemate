import { SegmentedControl } from "@/components/SegmentedControl";
import { BuyInSheet, DurationSheet, FieldRow, StateSheet, StakesSheet, VenueSheet } from "@/components/SessionPickers";
import { TournamentPickerSheet } from "@/components/TournamentPickerSheet";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { addSession, addTournament, getSetting, SessionType, updateSession } from "@/db/database";
import { detectStateFromLocation } from "@/lib/locationState";
import { syncSessionToCloud } from "@/lib/sync";

function getAvailableTypes(): SessionType[] {
  return ["cash", "tournament"];
}

export default function AddSessionScreen() {
  const { session } = useLocalSearchParams();
  const editing = session ? JSON.parse(session as string) : null;

  const { colors, spacing, typography, inputTypo } = usePokerTheme();
  const { user } = useAuth();
  const cashOutRef = useRef<TextInput>(null);

  const availableTypes = getAvailableTypes();
  const showTypeToggle = availableTypes.length > 1;

  const [type, setType] = useState<SessionType>(() => {
    if (editing) return editing.type ?? "cash";
    const saved = getSetting("dashboardView") ?? "all";
    const preferred: SessionType = saved === "tournament" ? "tournament" : "cash";
    return availableTypes.includes(preferred) ? preferred : availableTypes[0];
  });

  const [buyIn, setBuyIn]             = useState(editing ? String(editing.buyIn) : "");
  const [cashOut, setCashOut]         = useState(editing?.type !== "tournament" ? String(editing?.cashOut ?? "") : "");
  const [stakes, setStakes]           = useState<string>(editing?.stakes ?? (getSetting("defaultStakes") ?? "1/2"));
  const [duration, setDuration]       = useState<number | null>(editing?.duration ?? null);
  const [stateRegion, setStateRegion] = useState<string>(editing?.state ?? (getSetting("defaultState") ?? "NSW"));
  const [venue, setVenue]             = useState<string>(editing?.venue ?? "");
  const [tournamentName, setTournamentName] = useState(editing?.tournamentName ?? "");
  const [entries, setEntries]         = useState(editing?.entries ? String(editing.entries) : "");
  const [position, setPosition]       = useState(editing?.position ? String(editing.position) : "");
  const [payout, setPayout]           = useState(editing?.payout  ? String(editing.payout)  : "");

  const [buyInOpen,          setBuyInOpen]          = useState(false);
  const [stakesOpen,         setStakesOpen]         = useState(false);
  const [durationOpen,       setDurationOpen]       = useState(false);
  const [stateOpen,          setStateOpen]          = useState(false);
  const [venueOpen,          setVenueOpen]          = useState(false);
  const [tournamentPickerOpen, setTournamentPickerOpen] = useState(false);

  // Auto-detect state from location on new sessions only
  useEffect(() => {
    if (editing) return;
    detectStateFromLocation().then((state) => {
      if (state) setStateRegion(state);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!editing) {
        const saved = getSetting("dashboardView") ?? "all";
        const preferred: SessionType = saved === "tournament" ? "tournament" : "cash";
        setType(availableTypes.includes(preferred) ? preferred : availableTypes[0]);
        setBuyIn("");
        setCashOut("");
        setDuration(null);
        setStateRegion(getSetting("defaultState") ?? "NSW");
        setVenue(getSetting("defaultVenue") ?? "");
        setStakes(getSetting("defaultStakes") ?? "1/2");
        setTournamentName("");
        setEntries("");
        setPosition("");
        setPayout("");
      }
    }, [editing])
  );

  const profit = useMemo(() => {
    const b = parseFloat(buyIn);
    if (isNaN(b)) return null;
    if (type === "cash") {
      const c = parseFloat(cashOut);
      return isNaN(c) ? null : c - b;
    }
    const p = parseFloat(payout) || 0;
    return p - b;
  }, [type, buyIn, cashOut, payout]);

  const isValid = type === "cash"
    ? buyIn !== "" && cashOut !== ""
    : buyIn !== "" && tournamentName.trim() !== "";

  const handleSave = () => {
    if (!isValid) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (type === "tournament") {
      const payload = {
        buyIn:          parseFloat(buyIn),
        tournamentName: tournamentName.trim(),
        entries:        parseInt(entries) || 0,
        position:       parseInt(position) || 0,
        payout:         parseFloat(payout) || 0,
        duration:       duration ?? 0,
        venue:          venue.trim(),
        state:          stateRegion,
        date:           editing ? editing.date : new Date().toISOString(),
      };
      try {
        if (editing) {
          updateSession(editing.id, {
            type: "tournament",
            buyIn: payload.buyIn,
            profit: payload.payout - payload.buyIn,
            duration: payload.duration,
            date: payload.date,
            venue: payload.venue,
            state: payload.state,
            tournamentName: payload.tournamentName,
            entries: payload.entries,
            position: payload.position,
            payout: payload.payout,
          });
          if (user?.id) syncSessionToCloud(user.id, editing.id).catch(console.error);
        } else {
          const newId = addTournament(payload);
          if (user?.id) syncSessionToCloud(user.id, newId).catch(console.error);
        }
        router.canGoBack() ? router.back() : router.navigate("/(tabs)");
      } catch (e) { console.error(e); }
    } else {
      const payload = {
        buyIn:    parseFloat(buyIn),
        cashOut:  parseFloat(cashOut),
        duration: duration ?? 0,
        stakes,
        state:    stateRegion,
        venue:    venue.trim(),
        profit:   profit ?? 0,
        date:     editing ? editing.date : new Date().toISOString(),
      };
      try {
        if (editing) {
          updateSession(editing.id, { type: "cash", ...payload });
          if (user?.id) syncSessionToCloud(user.id, editing.id).catch(console.error);
        } else {
          const newId = addSession(payload);
          if (user?.id) syncSessionToCloud(user.id, newId).catch(console.error);
        }
        router.canGoBack() ? router.back() : router.navigate("/(tabs)");
      } catch (e) { console.error(e); }
    }
  };

  const profitColor =
    profit === null ? colors.text.disabled
    : profit >= 0   ? colors.text.success
    :                 colors.text.danger;

  const profitLabel =
    profit === null ? "—"
    : `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toFixed(2)}`;

  const inputCard = {
    backgroundColor: colors.bg.primary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    overflow: "hidden" as const,
    shadowColor: "#000" as const,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Type toggle */}
          {showTypeToggle && (
            <SegmentedControl
              options={[
                { value: "cash",       label: "Cash Game",  icon: "cash-outline"   },
                { value: "tournament", label: "Tournament",  icon: "trophy-outline" },
              ]}
              selected={type}
              disabled={!!editing}
              onChange={(value) => {
                if (editing) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setType(value);
              }}
              style={{ marginBottom: spacing["2xl"] }}
            />
          )}

          {/* Profit preview */}
          <View style={{
            backgroundColor: colors.bg.tertiary,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: profit === null ? colors.border.default : profit >= 0 ? colors.border.success : colors.border.danger,
            padding: spacing["2xl"],
            alignItems: "center",
            marginBottom: spacing["2xl"],
          }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>
              {editing ? "Updated profit" : "Profit"}
            </Text>
            <Text style={{ ...typography.display, fontWeight: "700", color: profitColor }}>{profitLabel}</Text>
            <Text style={{ color: profit === null ? colors.text.disabled : colors.text.tertiary, ...typography.caption, marginTop: spacing.xs, textAlign: "center" }}>
              {profit === null
                ? type === "cash" ? "Enter buy-in & cash-out to see your result" : "Enter buy-in & payout to see your result"
                : profit >= 0 ? "Winning session" : "Better luck next time"}
            </Text>
          </View>

          {/* ═══ CASH FIELDS ═══ */}
          {type === "cash" && (
            <View style={{ ...inputCard, marginBottom: spacing["2xl"] }}>
              <FieldRow
                icon="cash-outline"
                label="Buy-in"
                value={buyIn ? `$${parseFloat(buyIn).toLocaleString()}` : ""}
                placeholder="Set buy-in"
                onPress={() => setBuyInOpen(true)}
                colors={colors}
              />
              <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: spacing.lg }} />
              {/* Cash-out stays as direct input for precision */}
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#155DFC12", marginRight: 12 }}>
                  <Ionicons name="wallet-outline" size={16} color="#155DFC" />
                </View>
                <Text style={{ fontSize: 14, fontWeight: "500", width: 70, color: colors.text.tertiary }}>Cash-out</Text>
                <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: 4 }}>$</Text>
                <TextInput
                  ref={cashOutRef}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.text.disabled}
                  value={cashOut}
                  onChangeText={setCashOut}
                  returnKeyType="done"
                  style={{ flex: 1, color: colors.text.primary, ...inputTypo.body, fontWeight: "600", textAlign: "right" }}
                />
              </View>
              <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: spacing.lg }} />
              <FieldRow
                icon="swap-horizontal-outline"
                label="Stakes"
                value={stakes}
                placeholder="Choose stakes"
                onPress={() => setStakesOpen(true)}
                colors={colors}
                isLast
              />
            </View>
          )}

          {/* ═══ TOURNAMENT FIELDS ═══ */}
          {type === "tournament" && (
            <>
              <TouchableOpacity
                style={{
                  ...inputCard,
                  borderColor: tournamentName.length > 0 ? colors.border.brand : colors.border.default,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  marginBottom: spacing["2xl"],
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
                onPress={() => setTournamentPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="trophy-outline" size={16} color={tournamentName.length > 0 ? colors.text.secondary : colors.text.disabled} />
                <Text
                  style={{ flex: 1, ...inputTypo.body, color: tournamentName.length > 0 ? colors.text.primary : colors.text.disabled }}
                  numberOfLines={1}
                >
                  {tournamentName.length > 0 ? tournamentName : "Search or enter tournament name"}
                </Text>
                {tournamentName.length > 0 && (
                  <TouchableOpacity onPress={() => setTournamentName("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
                  </TouchableOpacity>
                )}
                <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
              </TouchableOpacity>

              {/* Buy-in + Payout in one row */}
              <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing["2xl"] }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>Buy-in</Text>
                  <View style={{ ...inputCard, borderColor: buyIn.length > 0 ? colors.border.brand : colors.border.default, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg }}>
                    <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.text.disabled}
                      value={buyIn}
                      onChangeText={setBuyIn}
                      returnKeyType="next"
                      style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body, fontWeight: "600", textAlign: "right" }}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: spacing.sm }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600" }}>Payout</Text>
                    <Text style={{ color: colors.text.disabled, fontSize: 10, fontWeight: "400" }}>0 if busted</Text>
                  </View>
                  <View style={{ ...inputCard, borderColor: payout.length > 0 && parseFloat(payout) > 0 ? colors.border.success : colors.border.default, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg }}>
                    <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.text.disabled}
                      value={payout}
                      onChangeText={setPayout}
                      returnKeyType="done"
                      style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body, fontWeight: "600", textAlign: "right" }}
                    />
                  </View>
                </View>
              </View>

              {/* Entries + Position (optional) */}
              <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing["2xl"] }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: spacing.sm }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600" }}>Entries</Text>
                    <Text style={{ color: colors.text.disabled, fontSize: 10, fontWeight: "400" }}>optional</Text>
                  </View>
                  <View style={{ ...inputCard, paddingHorizontal: spacing.lg }}>
                    <TextInput
                      keyboardType="number-pad"
                      placeholder="120"
                      placeholderTextColor={colors.text.disabled}
                      value={entries}
                      onChangeText={setEntries}
                      returnKeyType="next"
                      style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body, textAlign: "right" }}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: spacing.sm }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600" }}>Position</Text>
                    <Text style={{ color: colors.text.disabled, fontSize: 10, fontWeight: "400" }}>optional</Text>
                  </View>
                  <View style={{ ...inputCard, paddingHorizontal: spacing.lg }}>
                    <TextInput
                      keyboardType="number-pad"
                      placeholder="12"
                      placeholderTextColor={colors.text.disabled}
                      value={position}
                      onChangeText={setPosition}
                      returnKeyType="next"
                      style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body, textAlign: "right" }}
                    />
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ── Duration, State, Venue (shared) ── */}
          <View style={{ ...inputCard, marginBottom: spacing["2xl"] }}>
            <FieldRow
              icon="time-outline"
              label="Duration"
              value={duration ? (duration === 8 ? "8h+" : `${duration}h`) : ""}
              placeholder="How long?"
              onPress={() => setDurationOpen(true)}
              colors={colors}
            />
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

          <BuyInSheet    visible={buyInOpen}    value={buyIn}        onChange={setBuyIn}        onClose={() => setBuyInOpen(false)}    />
          <StakesSheet   visible={stakesOpen}   value={stakes}       onChange={setStakes}       onClose={() => setStakesOpen(false)}   />
          <DurationSheet visible={durationOpen} value={duration}     onChange={setDuration}     onClose={() => setDurationOpen(false)} />
          <StateSheet    visible={stateOpen}    value={stateRegion}  onChange={setStateRegion}  onClose={() => setStateOpen(false)}    />
          <VenueSheet
            visible={venueOpen}
            venue={venue}
            state={stateRegion}
            onChangeVenue={setVenue}
            onChangeState={setStateRegion}
            onClose={() => setVenueOpen(false)}
            hideStateChips
          />
          <TournamentPickerSheet
            visible={tournamentPickerOpen}
            initialValue={tournamentName}
            onClose={() => setTournamentPickerOpen(false)}
            onSelect={({ name, buyIn: b, venue: v }) => {
              setTournamentName(name);
              if (b) setBuyIn(b);
              if (v && !venue) setVenue(v);
            }}
          />
        </ScrollView>

        {/* Sticky save button */}
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: spacing.lg,
          paddingBottom: Platform.OS === "ios" ? 32 : spacing.lg,
          backgroundColor: colors.bg.primary,
          borderTopWidth: 1,
          borderTopColor: colors.border.default,
        }}>
          {!isValid && (
            <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing.sm }}>
              {type === "cash" ? "Enter buy-in and cash-out to continue" : "Enter buy-in and tournament name to continue"}
            </Text>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!isValid}
            activeOpacity={0.85}
            style={{
              padding: spacing.lg,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: isValid ? "#155DFC" : colors.state.disabled,
            }}
          >
            <Text style={{ color: isValid ? "#fff" : colors.text.disabled, fontWeight: "700", ...typography.body }}>
              {editing ? "Update Session" : "Save Session"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
