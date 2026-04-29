import { VenueSelector } from "@/components/VenueSelector";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { deleteSession, updateSession } from "../db/database";

export default function SessionDetailScreen() {
  const router  = useRouter();
  const { session } = useLocalSearchParams();
  const editing = session ? JSON.parse(session as string) : null;

  const { colors, spacing, radius, typography } = usePokerTheme();

  const isTournament = (editing?.type ?? "cash") === "tournament";

  // ── Shared ──
  const [buyIn, setBuyIn]           = useState(editing ? String(editing.buyIn) : "");
  const [duration, setDuration]     = useState<number | null>(editing?.duration ?? null);
  const [stateRegion, setStateRegion] = useState<string>(editing?.state ?? "NSW");
  const [venue, setVenue]           = useState<string>(editing?.venue ?? "");

  // ── Cash ──
  const cashOutRef = useRef<TextInput>(null);
  const [cashOut, setCashOut] = useState(!isTournament ? String(editing?.cashOut ?? "") : "");
  const [stakes, setStakes]   = useState<string>(editing?.stakes ?? "1/2");
  const [focusedField, setFocusedField] = useState<"buyIn" | "cashOut" | null>(null);

  // ── Tournament ──
  const [tournamentName, setTournamentName] = useState(editing?.tournamentName ?? "");
  const [entries, setEntries]   = useState(editing?.entries ? String(editing.entries) : "");
  const [position, setPosition] = useState(editing?.position ? String(editing.position) : "");
  const [payout, setPayout]     = useState(editing?.payout  ? String(editing.payout)  : "");

  // ── Profit ──
  const profit = useMemo(() => {
    const b = parseFloat(buyIn);
    if (isNaN(b)) return null;
    if (isTournament) {
      const p = parseFloat(payout) || 0;
      return p - b;
    }
    const c = parseFloat(cashOut);
    return isNaN(c) ? null : c - b;
  }, [isTournament, buyIn, cashOut, payout]);

  const isValid = isTournament
    ? buyIn !== "" && tournamentName.trim() !== ""
    : buyIn !== "" && cashOut !== "";

  const handleSave = () => {
    if (!isValid || !editing) return;

    const base = {
      buyIn:    parseFloat(buyIn),
      profit:   profit ?? 0,
      duration: duration ?? 0,
      date:     editing.date,
      venue:    venue.trim(),
      state:    stateRegion,
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) { console.log(e); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert("Delete Session", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteSession(editing.id); router.replace("/(tabs)"); } },
    ]);
  };

  const profitColor = profit === null ? colors.text.disabled : profit >= 0 ? colors.text.success : colors.text.danger;
  const profitLabel = profit === null ? "—" : `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toFixed(2)}`;

  const labelStyle = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    marginBottom: spacing.sm,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Type badge (read-only on edit) ── */}
          <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: spacing["2xl"] }}>
            <View style={{
              backgroundColor: isTournament ? colors.bg.tertiary : colors.bg.tertiary,
              borderRadius: radius.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderWidth: 1,
              borderColor: isTournament ? colors.border.default : colors.border.default,
            }}>
              <Text style={{
                color: isTournament ? colors.text.secondary : colors.text.secondary,
                fontWeight: "700",
                ...typography.label,
              }}>
                {isTournament ? "Tournament" : "Cash Game"}
              </Text>
            </View>
          </View>

          {/* ── Profit card ── */}
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: profit === null ? colors.border.subtle : profit >= 0 ? colors.border.success : colors.border.danger,
            padding: spacing["2xl"],
            alignItems: "center",
            marginBottom: spacing["2xl"],
          }}>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.sm }}>
              Profit
            </Text>
            <Text style={{ ...typography.display, fontWeight: "700", color: profitColor }}>
              {profitLabel}
            </Text>
            {profit !== null && (
              <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: spacing.xs }}>
                {profit >= 0 ? "Winning session" : "Better luck next time"}
              </Text>
            )}
          </View>

          {/* ═══════════════ CASH FIELDS ═══════════════ */}
          {!isTournament && (
            <>
              <Text style={labelStyle}>Money</Text>
              <View style={{
                backgroundColor: colors.surface.raised,
                borderRadius: radius.lg,
                borderWidth: focusedField ? 1.5 : 1,
                borderColor: focusedField ? colors.border.focus : colors.border.default,
                overflow: "hidden",
                marginBottom: spacing["2xl"],
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: focusedField === "buyIn" ? colors.state.hover : "transparent" }}>
                  <Text style={{ color: colors.text.secondary, ...typography.bodySm, width: 72 }}>Buy-in</Text>
                  <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
                  <TextInput
                    keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.text.disabled}
                    value={buyIn} onChangeText={setBuyIn} returnKeyType="next"
                    onSubmitEditing={() => cashOutRef.current?.focus()}
                    onFocus={() => setFocusedField("buyIn")} onBlur={() => setFocusedField(null)}
                    style={{ flex: 1, color: colors.text.primary, ...typography.body, fontWeight: "600", textAlign: "right" }}
                  />
                </View>
                <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: spacing.lg }} />
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: focusedField === "cashOut" ? colors.state.hover : "transparent" }}>
                  <Text style={{ color: colors.text.secondary, ...typography.bodySm, width: 72 }}>Cash-out</Text>
                  <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
                  <TextInput
                    ref={cashOutRef}
                    keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.text.disabled}
                    value={cashOut} onChangeText={setCashOut} returnKeyType="done"
                    onFocus={() => setFocusedField("cashOut")} onBlur={() => setFocusedField(null)}
                    style={{ flex: 1, color: colors.text.primary, ...typography.body, fontWeight: "600", textAlign: "right" }}
                  />
                </View>
              </View>

              <Text style={labelStyle}>Stakes</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
                {["1/1", "1/2", "2/3", "5/5", "10/10"].map((s) => (
                  <Chip key={s} label={s} selected={stakes === s} onPress={() => setStakes(s)}
                    colors={colors} spacing={spacing} radius={radius} typography={typography} />
                ))}
              </View>
            </>
          )}

          {/* ═══════════════ TOURNAMENT FIELDS ═══════════════ */}
          {isTournament && (
            <>
              <Text style={labelStyle}>Tournament Name</Text>
              <View style={{
                backgroundColor: colors.surface.raised, borderRadius: radius.lg, borderWidth: 1,
                borderColor: tournamentName.length > 0 ? colors.border.brand : colors.border.default,
                paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
              }}>
                <TextInput
                  placeholder="Tournament name" placeholderTextColor={colors.text.disabled}
                  value={tournamentName} onChangeText={setTournamentName} returnKeyType="next"
                  style={{ color: colors.text.primary, paddingVertical: spacing.md, ...typography.body }}
                />
              </View>

              <Text style={labelStyle}>Buy-in</Text>
              <View style={{
                backgroundColor: colors.surface.raised, borderRadius: radius.lg, borderWidth: 1,
                borderColor: buyIn.length > 0 ? colors.border.brand : colors.border.default,
                flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
              }}>
                <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
                <TextInput
                  keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.text.disabled}
                  value={buyIn} onChangeText={setBuyIn} returnKeyType="next"
                  style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.md, ...typography.body, fontWeight: "600", textAlign: "right" }}
                />
              </View>

              <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing["2xl"] }}>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Entries</Text>
                  <View style={{ backgroundColor: colors.surface.raised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: spacing.lg }}>
                    <TextInput
                      keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.text.disabled}
                      value={entries} onChangeText={setEntries} returnKeyType="next"
                      style={{ color: colors.text.primary, paddingVertical: spacing.md, ...typography.body, textAlign: "right" }}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Position</Text>
                  <View style={{ backgroundColor: colors.surface.raised, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: spacing.lg }}>
                    <TextInput
                      keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.text.disabled}
                      value={position} onChangeText={setPosition} returnKeyType="next"
                      style={{ color: colors.text.primary, paddingVertical: spacing.md, ...typography.body, textAlign: "right" }}
                    />
                  </View>
                </View>
              </View>

              <Text style={labelStyle}>Payout</Text>
              <View style={{
                backgroundColor: colors.surface.raised, borderRadius: radius.lg, borderWidth: 1,
                borderColor: parseFloat(payout) > 0 ? colors.border.success : colors.border.default,
                flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
              }}>
                <Text style={{ color: colors.text.disabled, ...typography.body, marginRight: spacing.xs }}>$</Text>
                <TextInput
                  keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.text.disabled}
                  value={payout} onChangeText={setPayout} returnKeyType="done"
                  style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.md, ...typography.body, fontWeight: "600", textAlign: "right" }}
                />
              </View>
            </>
          )}

          {/* ── Duration (shared) ── */}
          <Text style={labelStyle}>Duration</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
            {[1, 2, 3, 4, 5, 6, 8].map((h) => (
              <Chip key={h} label={h === 8 ? "8h+" : `${h}h`}
                selected={duration === h} onPress={() => setDuration(duration === h ? null : h)}
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

          {editing && (
            <TouchableOpacity onPress={handleDelete} style={{ marginTop: spacing["3xl"], padding: spacing.md, alignItems: "center" }}>
              <Text style={{ color: colors.text.danger, fontWeight: "600" }}>Delete Session</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border.default, backgroundColor: colors.bg.primary }}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!isValid}
            style={{ padding: spacing.lg, borderRadius: radius.md, alignItems: "center", backgroundColor: isValid ? colors.bg.brand : colors.state.disabled }}
          >
            <Text style={{ color: isValid ? colors.text.onBrand : colors.text.disabled, fontWeight: "700", ...typography.body }}>
              Update Session
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, selected, onPress, colors, spacing, radius, typography }: any) {
  return (
    <TouchableOpacity
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={{
        paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        backgroundColor: selected ? colors.bg.brand : colors.bg.tertiary,
        borderWidth: 1, borderColor: selected ? colors.border.brand : colors.border.default,
      }}
    >
      <Text style={{ color: selected ? colors.text.onBrand : colors.text.primary, ...typography.label, fontWeight: "500" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
