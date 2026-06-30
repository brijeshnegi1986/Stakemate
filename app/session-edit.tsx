import { SegmentedControl } from "@/components/SegmentedControl";
import { BuyInSheet, DurationSheet, FieldRow, StateSheet, StakesSheet, VenueSheet } from "@/components/SessionPickers";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getRebuysTotal, updateSession } from "@/db/database";
import { syncSessionToCloud } from "@/lib/sync";

export default function SessionEditScreen() {
  const { session: sessionParam } = useLocalSearchParams();
  const editing = sessionParam ? JSON.parse(sessionParam as string) : null;
  const { colors, spacing, typography, inputTypo } = usePokerTheme();
  const { user } = useAuth();

  const isTournament = (editing?.type ?? "cash") === "tournament";

  const [buyIn, setBuyIn]               = useState(editing ? String(editing.buyIn) : "");
  const [cashOut, setCashOut]           = useState(!isTournament ? String(editing?.cashOut ?? "") : "");
  const [stakes, setStakes]             = useState<string>(editing?.stakes ?? "1/2");
  const [duration, setDuration]         = useState<number | null>(editing?.duration ?? null);
  const [stateRegion, setStateRegion]   = useState<string>(editing?.state ?? "NSW");
  const [venue, setVenue]               = useState<string>(editing?.venue ?? "");
  const [tournamentName, setTournamentName] = useState(editing?.tournamentName ?? "");
  const [entries, setEntries]           = useState(editing?.entries ? String(editing.entries) : "");
  const [position, setPosition]         = useState(editing?.position ? String(editing.position) : "");
  const [payout, setPayout]             = useState(editing?.payout ? String(editing.payout) : "");
  const [notes, setNotes]               = useState<string>(editing?.notes ?? "");

  const [buyInOpen,    setBuyInOpen]    = useState(false);
  const [stakesOpen,   setStakesOpen]   = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [stateOpen,    setStateOpen]    = useState(false);
  const [venueOpen,    setVenueOpen]    = useState(false);

  const rebuysTotal = getRebuysTotal(editing ?? {});

  const profit = useMemo(() => {
    const b = parseFloat(buyIn);
    if (isNaN(b)) return null;
    const totalInvested = b + rebuysTotal;
    if (isTournament) {
      const p = parseFloat(payout) || 0;
      return p - totalInvested;
    }
    const c = parseFloat(cashOut);
    return isNaN(c) ? null : c - totalInvested;
  }, [isTournament, buyIn, cashOut, payout, rebuysTotal]);

  const isValid = isTournament
    ? buyIn !== "" && tournamentName.trim() !== ""
    : buyIn !== "" && cashOut !== "";

  const handleSave = () => {
    if (!isValid || !editing) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const base = {
      buyIn:    parseFloat(buyIn),
      profit:   profit ?? 0,
      duration: duration ?? 0,
      date:     editing.date,
      venue:    venue.trim(),
      state:    stateRegion,
      notes:    notes.trim(),
    };

    try {
      if (isTournament) {
        updateSession(editing.id, {
          type: "tournament",
          ...base,
          tournamentName: tournamentName.trim(),
          entries:  parseInt(entries)  || 0,
          position: parseInt(position) || 0,
          payout:   parseFloat(payout) || 0,
        });
      } else {
        updateSession(editing.id, {
          type: "cash",
          ...base,
          cashOut: parseFloat(cashOut),
          stakes,
        });
      }
      if (user?.id) syncSessionToCloud(user.id, editing.id).catch(console.error);
      router.canGoBack() ? router.back() : router.replace("/(tabs)/history");
    } catch (e) { console.error(e); }
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
          {/* Type toggle — disabled in edit mode */}
          <SegmentedControl
            options={[
              { value: "cash",       label: "Cash Game",  icon: "cash-outline"   },
              { value: "tournament", label: "Tournament",  icon: "trophy-outline" },
            ]}
            selected={isTournament ? "tournament" : "cash"}
            disabled
            onChange={() => {}}
            style={{ marginBottom: spacing["2xl"] }}
          />

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
              Updated Profit
            </Text>
            <Text style={{ ...typography.display, fontWeight: "700", color: profitColor }}>{profitLabel}</Text>
            <Text style={{ color: profit === null ? colors.text.disabled : colors.text.tertiary, ...typography.caption, marginTop: spacing.xs, textAlign: "center" }}>
              {profit === null
                ? isTournament ? "Enter buy-in & payout to see your result" : "Enter buy-in & cash-out to see your result"
                : profit >= 0 ? "Winning session" : "Better luck next time"}
            </Text>
          </View>

          {/* ═══ CASH FIELDS ═══ */}
          {!isTournament && (
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
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#155DFC12", marginRight: 12 }}>
                  <Text style={{ fontSize: 16 }}>💰</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: "500", width: 70, color: colors.text.tertiary }}>Cash-out</Text>
                <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: 4 }}>$</Text>
                <TextInput
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
          {isTournament && (
            <>
              <View style={{
                ...inputCard,
                borderColor: tournamentName.length > 0 ? colors.border.brand : colors.border.default,
                paddingHorizontal: spacing.lg,
                marginBottom: spacing["2xl"],
              }}>
                <TextInput
                  placeholder="Tournament name e.g. Sunday Major"
                  placeholderTextColor={colors.text.disabled}
                  value={tournamentName}
                  onChangeText={setTournamentName}
                  returnKeyType="next"
                  style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body }}
                />
              </View>

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

          {/* ── Duration, State, Venue ── */}
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

          {/* ── Notes ── */}
          <Text style={{ color: colors.text.tertiary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>
            Notes
          </Text>
          <View style={{
            ...inputCard,
            borderColor: notes.length > 0 ? colors.border.brand : colors.border.default,
            padding: spacing.lg,
            marginBottom: spacing["2xl"],
          }}>
            <TextInput
              multiline
              placeholder="Add notes about this session..."
              placeholderTextColor={colors.text.disabled}
              value={notes}
              onChangeText={setNotes}
              style={{
                color: colors.text.primary,
                ...inputTypo.bodySm,
                lineHeight: 22,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />
          </View>

          <BuyInSheet    visible={buyInOpen}    value={buyIn}       onChange={setBuyIn}       onClose={() => setBuyInOpen(false)}    />
          <StakesSheet   visible={stakesOpen}   value={stakes}      onChange={setStakes}      onClose={() => setStakesOpen(false)}   />
          <DurationSheet visible={durationOpen} value={duration}    onChange={setDuration}    onClose={() => setDurationOpen(false)} />
          <StateSheet    visible={stateOpen}    value={stateRegion} onChange={setStateRegion} onClose={() => setStateOpen(false)}    />
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
              {isTournament ? "Enter buy-in and tournament name to continue" : "Enter buy-in and cash-out to continue"}
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
              Update Session
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
