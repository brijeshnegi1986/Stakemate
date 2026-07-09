import { CasinoDateSheet } from "@/components/CasinoDateSheet";
import { SegmentedControl } from "@/components/SegmentedControl";
import { FieldRow, StateSheet, VenueSheet } from "@/components/SessionPickers";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { detectStateFromLocation } from "@/lib/locationState";
import { syncCasinoToCloud } from "@/lib/sync";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  addCasinoTransaction,
  CasinoTxnType,
  findOrCreateCasino,
  getCasinoBalance,
  getSetting,
} from "../db/database";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CasinoBalanceEntryScreen() {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const { user } = useAuth();

  const [casinoName, setCasinoName] = useState("");
  const [state, setState] = useState(() => getSetting("defaultState") ?? "NSW");
  const [date, setDate] = useState(new Date());
  const [type, setType] = useState<CasinoTxnType>("deposit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);

  const [venueOpen, setVenueOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    detectStateFromLocation().then((s) => { if (s) setState(s); });
  }, []);

  useEffect(() => {
    if (!casinoName.trim()) { setCurrentBalance(null); return; }
    const id = findOrCreateCasino(casinoName.trim(), state);
    setCurrentBalance(getCasinoBalance(id));
  }, [casinoName, state]);

  const parsedAmount = parseFloat(amount);
  const isReady = casinoName.trim().length > 0 && amount !== "" && !isNaN(parsedAmount) && parsedAmount > 0;

  const handleSave = () => {
    if (!isReady) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const casinoId = findOrCreateCasino(casinoName.trim(), state);
    addCasinoTransaction(casinoId, type, parsedAmount, toISODate(date), note.trim());
    if (user?.id) syncCasinoToCloud(user.id, casinoId).catch(console.error);
    router.back();
  };

  const labelStyle = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    marginBottom: spacing.sm,
  };

  const inputCard = {
    backgroundColor: colors.bg.primary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={labelStyle}>Casino</Text>
        <View style={{ ...inputCard, marginBottom: spacing["2xl"] }}>
          <FieldRow
            icon="map-outline"
            label="State"
            value={state}
            onPress={() => setStateOpen(true)}
            colors={colors}
          />
          <FieldRow
            icon="business-outline"
            label="Casino"
            value={casinoName}
            placeholder="Select casino"
            onPress={() => setVenueOpen(true)}
            colors={colors}
            isLast
          />
        </View>

        {currentBalance !== null && (
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
            borderColor: colors.border.default, padding: spacing.lg, marginBottom: spacing["2xl"],
          }}>
            <Text style={{ color: colors.text.secondary, ...typography.bodySm, fontWeight: "600" }}>Current balance</Text>
            <Text style={{
              color: currentBalance >= 0 ? colors.text.success : colors.text.danger,
              ...typography.body, fontWeight: "800",
            }}>
              ${Math.abs(currentBalance).toFixed(0)}
            </Text>
          </View>
        )}

        <Text style={labelStyle}>Date</Text>
        <View style={{ ...inputCard, marginBottom: spacing["2xl"] }}>
          <FieldRow
            icon="calendar-outline"
            label="Date"
            value={fmtDate(date)}
            onPress={() => setDateOpen(true)}
            colors={colors}
            isLast
          />
        </View>

        <Text style={labelStyle}>Type</Text>
        <SegmentedControl
          options={[
            { value: "deposit", label: "Deposit", icon: "arrow-down-circle-outline" },
            { value: "withdraw", label: "Withdraw", icon: "arrow-up-circle-outline" },
          ]}
          selected={type}
          onChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setType(v); }}
          style={{ marginBottom: spacing["2xl"] }}
        />

        <Text style={labelStyle}>Amount</Text>
        <View style={{
          ...inputCard,
          borderColor: amount.length > 0 ? colors.border.brand : colors.border.default,
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
        }}>
          <Text style={{ color: colors.text.disabled, ...typography.heading2, marginRight: spacing.xs }}>$</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.text.disabled}
            value={amount}
            onChangeText={setAmount}
            returnKeyType="done"
            style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.heading2, fontWeight: "700", textAlign: "right" }}
          />
        </View>

        <Text style={labelStyle}>Note (optional)</Text>
        <View style={{ ...inputCard, paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"] }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything to note..."
            placeholderTextColor={colors.text.disabled}
            style={{ color: colors.text.primary, paddingVertical: spacing.md, ...inputTypo.body }}
          />
        </View>
      </ScrollView>

      <View style={{
        padding: spacing.lg,
        paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.border.default,
        backgroundColor: colors.bg.primary,
      }}>
        {!isReady && (
          <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing.sm }}>
            Select a casino and enter an amount
          </Text>
        )}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!isReady}
          activeOpacity={0.85}
          style={{
            paddingVertical: spacing.lg + 2,
            borderRadius: radius.lg,
            alignItems: "center",
            backgroundColor: isReady ? colors.bg.brand : colors.state.disabled,
          }}
        >
          <Text style={{ color: isReady ? colors.text.onBrand : colors.text.disabled, fontWeight: "700", ...typography.body }}>
            Save Entry
          </Text>
        </TouchableOpacity>
      </View>

      <VenueSheet
        visible={venueOpen}
        venue={casinoName}
        state={state}
        onChangeVenue={setCasinoName}
        onChangeState={setState}
        onClose={() => setVenueOpen(false)}
        hideStateChips
      />

      <StateSheet
        visible={stateOpen}
        value={state}
        onChange={setState}
        onClose={() => setStateOpen(false)}
      />

      <CasinoDateSheet
        visible={dateOpen}
        value={date}
        onChange={setDate}
        onClose={() => setDateOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
