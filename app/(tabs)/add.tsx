import { SegmentedControl } from "@/components/SegmentedControl";
import { VenueSelector } from "@/components/VenueSelector";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addSession, addTournament, getTotalSessionCount, getSetting, SessionType, updateSession } from "../../db/database";

// ── Read type availability from settings (synchronous, stable for screen lifetime) ──
function getAvailableTypes(): SessionType[] {
  return ["cash", "tournament"];
}

export default function AddSessionScreen() {
  const { session } = useLocalSearchParams();
  const editing = session ? JSON.parse(session as string) : null;

  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const cashOutRef = useRef<TextInput>(null);

  const availableTypes = getAvailableTypes();
  const showTypeToggle = availableTypes.length > 1;

  // ── Shared state ──
  const [type, setType] = useState<SessionType>(() => {
    if (editing) return editing.type ?? "cash";
    const saved = getSetting("dashboardView") ?? "all";
    const preferred: SessionType = saved === "tournament" ? "tournament" : "cash";
    return availableTypes.includes(preferred) ? preferred : availableTypes[0];
  });
  const [buyIn, setBuyIn]           = useState(editing ? String(editing.buyIn) : "");
  const [duration, setDuration]     = useState<number | null>(editing?.duration ?? null);
  const [stateRegion, setStateRegion] = useState<string>(editing?.state ?? "NSW");
  const [venue, setVenue]           = useState<string>(editing?.venue ?? "");

  // ── Cash state ──
  const [cashOut, setCashOut] = useState(editing?.type !== "tournament" ? String(editing?.cashOut ?? "") : "");
  const [stakes, setStakes]   = useState<string>(editing?.stakes ?? (getSetting("defaultStakes") ?? "1/2"));

  // ── Tournament state ──
  const [tournamentName, setTournamentName] = useState(editing?.tournamentName ?? "");
  const [entries, setEntries]   = useState(editing?.entries ? String(editing.entries) : "");
  const [position, setPosition] = useState(editing?.position ? String(editing.position) : "");
  const [payout, setPayout]     = useState(editing?.payout  ? String(editing.payout)  : "");
  const [notes]                 = useState(editing?.notes ?? "");

  // Reset all fields when opening fresh (no editing param), so previous session data doesn't linger
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

  // ── Profit ──
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
        notes:          notes.trim(),
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
            notes: payload.notes,
          });
        } else {
          addTournament(payload);
        }
        router.canGoBack() ? router.back() : router.navigate("/(tabs)");
      } catch (e) { console.log(e); }
    } else {
      const p = profit ?? 0;
      const payload = {
        buyIn:    parseFloat(buyIn),
        cashOut:  parseFloat(cashOut),
        duration: duration ?? 0,
        stakes,
        state:    stateRegion,
        venue:    venue.trim(),
        profit:   p,
        date:     editing ? editing.date : new Date().toISOString(),
      };
      try {
        if (editing) {
          updateSession(editing.id, { type: "cash", ...payload });
        } else {
          addSession(payload);
        }
        router.canGoBack() ? router.back() : router.navigate("/(tabs)");
      } catch (e) { console.log(e); }
    }
  };

  const profitColor =
    profit === null ? colors.text.disabled
    : profit >= 0   ? colors.text.success
    :                 colors.text.danger;

  const profitLabel =
    profit === null ? "—"
    : `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toFixed(2)}`;

  // ── Input card style (Figma: bg-tertiary, radius 8, border-default) ──
  const inputCard = {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden" as const,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.secondary, paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Type toggle (Figma tab style, only when both types enabled) ── */}
          {showTypeToggle && (
            <SegmentedControl
              options={[
                { value: "cash", label: "Cash Game" },
                { value: "tournament", label: "Tournament" },
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

          {/* ── Profit preview card ── */}
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
            <Text style={{ ...typography.display, fontWeight: "700", color: profitColor }}>
              {profitLabel}
            </Text>
            <Text style={{ color: profit === null ? colors.text.disabled : colors.text.tertiary, ...typography.caption, marginTop: spacing.xs, textAlign: "center" }}>
              {profit === null
                ? type === "cash" ? "Enter buy-in & cash-out to see your result" : "Enter buy-in & payout to see your result"
                : profit >= 0 ? "Winning session" : "Better luck next time"}
            </Text>
          </View>

          {/* ═══ CASH FIELDS ═══ */}
          {type === "cash" && (
            <>
              <SectionLabel label="Money" colors={colors} spacing={spacing} typography={typography} />
              <View style={{ ...inputCard, marginBottom: spacing["2xl"] }}>
                <MoneyRow label="Buy-in" value={buyIn} onChange={setBuyIn}
                  returnKeyType="next" onSubmit={() => cashOutRef.current?.focus()}
                  colors={colors} spacing={spacing} typography={typography} inputTypo={inputTypo} />
                <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: spacing.lg }} />
                <MoneyRow ref={cashOutRef} label="Cash-out" value={cashOut} onChange={setCashOut}
                  returnKeyType="done"
                  colors={colors} spacing={spacing} typography={typography} inputTypo={inputTypo} />
              </View>

              <SectionLabel label="Stakes" colors={colors} spacing={spacing} typography={typography} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
                {["1/1", "1/2", "2/3", "5/5", "10/10"].map((s) => (
                  <Chip key={s} label={s} selected={stakes === s}
                    onPress={() => setStakes(s)}
                    colors={colors} spacing={spacing} radius={radius} typography={typography} />
                ))}
              </View>
            </>
          )}

          {/* ═══ TOURNAMENT FIELDS ═══ */}
          {type === "tournament" && (
            <>
              <SectionLabel label="Tournament Name" colors={colors} spacing={spacing} typography={typography} />
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

              <SectionLabel label="Buy-in" colors={colors} spacing={spacing} typography={typography} />
              <View style={{
                ...inputCard,
                borderColor: buyIn.length > 0 ? colors.border.brand : colors.border.default,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                marginBottom: spacing["2xl"],
              }}>
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

              <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing["2xl"] }}>
                <View style={{ flex: 1 }}>
                  <SectionLabel label="Entries" colors={colors} spacing={spacing} typography={typography} />
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
                  <SectionLabel label="Position" colors={colors} spacing={spacing} typography={typography} />
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

              <SectionLabel label="Payout (0 if busted)" colors={colors} spacing={spacing} typography={typography} />
              <View style={{
                ...inputCard,
                borderColor: payout.length > 0 && parseFloat(payout) > 0 ? colors.border.success : colors.border.default,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                marginBottom: spacing["2xl"],
              }}>
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
            </>
          )}

          {/* ── Duration (shared) ── */}
          <SectionLabel label="Duration" colors={colors} spacing={spacing} typography={typography} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
            {[1, 2, 3, 4, 5, 6, 8].map((h) => (
              <Chip key={h} label={h === 8 ? "8h+" : `${h}h`}
                selected={duration === h}
                onPress={() => setDuration(duration === h ? null : h)}
                colors={colors} spacing={spacing} radius={radius} typography={typography} />
            ))}
          </View>

          {/* ── Venue / State (shared) ── */}
          <VenueSelector
            stateRegion={stateRegion}
            setStateRegion={setStateRegion}
            venue={venue}
            setVenue={setVenue}
          />
        </ScrollView>

        {/* ── Sticky save button ── */}
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: spacing.lg,
          paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
          backgroundColor: colors.bg.primary,
          borderTopWidth: 1,
          borderTopColor: colors.border.default,
        }}>
          {!isValid && (
            <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing.sm }}>
              {type === "cash"
                ? "Enter buy-in and cash-out to continue"
                : "Enter buy-in and tournament name to continue"}
            </Text>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!isValid}
            activeOpacity={0.85}
            style={{
              padding: spacing.lg,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: isValid ? colors.bg.brand : colors.state.disabled,
            }}
          >
            <Text style={{ color: isValid ? colors.text.onBrand : colors.text.disabled, fontWeight: "700", ...typography.body }}>
              {editing ? "Update Session" : "Save Session"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function SectionLabel({ label, colors, spacing, typography }: any) {
  return (
    <Text style={{
      color: colors.text.tertiary,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      fontWeight: "600",
      marginBottom: spacing.sm,
    }}>
      {label}
    </Text>
  );
}

const MoneyRow = require("react").forwardRef(function MoneyRow(
  { label, value, onChange, returnKeyType, onSubmit, colors, spacing, typography, inputTypo }: any,
  ref: any
) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Text style={{ color: colors.text.secondary, ...typography.bodySm, width: 72 }}>{label}</Text>
      <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
      <TextInput
        ref={ref}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.text.disabled}
        value={value}
        onChangeText={onChange}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmit}
        style={{ flex: 1, color: colors.text.primary, ...inputTypo.body, fontWeight: "600", textAlign: "right" }}
      />
    </View>
  );
});

function Chip({ label, selected, onPress, colors, spacing, radius, typography }: any) {
  return (
    <TouchableOpacity
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
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
