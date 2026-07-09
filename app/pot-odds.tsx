import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const GREEN  = "#22C55E";
const RED    = "#EF4444";
const AMBER  = "#F59E0B";

// ─── Common bet sizes for quick fill ─────────────────────────────────────────
const BET_SIZES = ["1/4", "1/3", "1/2", "2/3", "3/4", "Pot", "2x Pot"];

function calcPotOdds(pot: number, call: number) {
  if (pot <= 0 || call <= 0) return null;
  const totalPot    = pot + call;
  const odds        = pot / call;             // e.g. 3:1
  const pct         = (call / totalPot) * 100; // equity needed to break even
  return { odds, pct, totalPot };
}

export default function PotOddsScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [pot,      setPot]      = useState("");
  const [call,     setCall]     = useState("");
  const [myEquity, setMyEquity] = useState("");

  const potNum    = parseFloat(pot.replace(/,/g, ""))   || 0;
  const callNum   = parseFloat(call.replace(/,/g, ""))  || 0;
  const equityNum = parseFloat(myEquity) || 0;

  const result = calcPotOdds(potNum, callNum);

  const isProfitable = result && equityNum > 0
    ? equityNum >= result.pct
    : null;

  function applyBetSize(label: string) {
    if (potNum <= 0) return;
    const map: Record<string, number> = {
      "1/4":    potNum * 0.25,
      "1/3":    potNum * 0.33,
      "1/2":    potNum * 0.5,
      "2/3":    potNum * 0.67,
      "3/4":    potNum * 0.75,
      "Pot":    potNum,
      "2x Pot": potNum * 2,
    };
    const val = map[label];
    if (val) setCall(val.toFixed(0));
  }

  function reset() { setPot(""); setCall(""); setMyEquity(""); }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Info banner */}
        <View style={[styles.banner, { backgroundColor: BRAND + "0E", borderColor: BRAND + "25" }]}>
          <Ionicons name="information-circle-outline" size={16} color={BRAND} />
          <Text style={{ flex: 1, fontSize: 13, color: BRAND, lineHeight: 18 }}>
            Enter the pot size and the amount you need to call to see your pot odds and the minimum equity required to profitably call.
          </Text>
        </View>

        {/* Inputs */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Pot & Bet Size</Text>

          <View style={styles.inputRow}>
            <View style={[styles.inputWrap, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}>
              <Text style={[styles.inputLabel, { color: colors.text.tertiary }]}>Pot size</Text>
              <View style={styles.inputInner}>
                <Text style={[styles.dollar, { color: BRAND }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: colors.text.primary }]}
                  value={pot}
                  onChangeText={setPot}
                  placeholder="0"
                  placeholderTextColor={colors.text.disabled}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={[styles.inputWrap, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}>
              <Text style={[styles.inputLabel, { color: colors.text.tertiary }]}>To call</Text>
              <View style={styles.inputInner}>
                <Text style={[styles.dollar, { color: AMBER }]}>$</Text>
                <TextInput
                  style={[styles.input, { color: colors.text.primary }]}
                  value={call}
                  onChangeText={setCall}
                  placeholder="0"
                  placeholderTextColor={colors.text.disabled}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Quick bet size buttons */}
          <Text style={[styles.quickLabel, { color: colors.text.tertiary }]}>Quick bet size (of pot)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {BET_SIZES.map((label) => (
              <TouchableOpacity
                key={label}
                onPress={() => applyBetSize(label)}
                activeOpacity={0.75}
                style={[styles.betChip, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.secondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Results */}
        {result ? (
          <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Pot Odds</Text>

            <View style={styles.resultsGrid}>
              {/* Odds ratio */}
              <View style={[styles.resultBox, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <Text style={[styles.resultValue, { color: BRAND }]}>
                  {result.odds.toFixed(1)}:1
                </Text>
                <Text style={[styles.resultLabel, { color: colors.text.tertiary }]}>Odds ratio</Text>
              </View>

              {/* Pot odds % */}
              <View style={[styles.resultBox, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <Text style={[styles.resultValue, { color: AMBER }]}>
                  {result.pct.toFixed(1)}%
                </Text>
                <Text style={[styles.resultLabel, { color: colors.text.tertiary }]}>Min equity to call</Text>
              </View>

              {/* Total pot */}
              <View style={[styles.resultBox, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <Text style={[styles.resultValue, { color: colors.text.primary }]}>
                  ${result.totalPot.toLocaleString("en-AU")}
                </Text>
                <Text style={[styles.resultLabel, { color: colors.text.tertiary }]}>Total pot if called</Text>
              </View>
            </View>

            {/* Explanation */}
            <View style={[styles.explain, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary, marginBottom: 4 }}>
                What this means
              </Text>
              <Text style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 20 }}>
                You're getting <Text style={{ fontWeight: "800", color: BRAND }}>{result.odds.toFixed(1)}:1</Text> on your call. You need at least{" "}
                <Text style={{ fontWeight: "800", color: AMBER }}>{result.pct.toFixed(1)}% equity</Text> against your opponent's range to make this a profitable call in the long run.
              </Text>
            </View>
          </View>
        ) : null}

        {/* My equity checker */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>My Equity (optional)</Text>
          <Text style={{ fontSize: 13, color: colors.text.tertiary, marginBottom: 12, lineHeight: 18 }}>
            Know your equity against the villain's range? Enter it to see if calling is profitable.
          </Text>

          <View style={[styles.equityWrap, { borderColor: colors.border.default, backgroundColor: colors.bg.secondary }]}>
            <TextInput
              style={[styles.equityInput, { color: colors.text.primary }]}
              value={myEquity}
              onChangeText={setMyEquity}
              placeholder="e.g. 35"
              placeholderTextColor={colors.text.disabled}
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text.tertiary }}>%</Text>
          </View>

          {/* Verdict */}
          {result && equityNum > 0 && (
            <View style={[
              styles.verdict,
              { backgroundColor: isProfitable ? GREEN + "14" : RED + "14",
                borderColor: isProfitable ? GREEN + "40" : RED + "40" },
            ]}>
              <Ionicons
                name={isProfitable ? "checkmark-circle" : "close-circle"}
                size={22}
                color={isProfitable ? GREEN : RED}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: isProfitable ? GREEN : RED }}>
                  {isProfitable ? "Profitable call" : "Unprofitable call"}
                </Text>
                <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2, lineHeight: 18 }}>
                  {isProfitable
                    ? `Your equity (${equityNum}%) exceeds the required ${result.pct.toFixed(1)}% — calling is +EV.`
                    : `Your equity (${equityNum}%) is below the required ${result.pct.toFixed(1)}% — folding is better in the long run.`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Quick reference */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Quick Reference</Text>
          <View style={{ gap: 8 }}>
            {[
              { bet: "1/3 pot",  odds: "4:1",  equity: "20%" },
              { bet: "1/2 pot",  odds: "3:1",  equity: "25%" },
              { bet: "2/3 pot",  odds: "2.5:1",equity: "29%" },
              { bet: "Pot",      odds: "2:1",  equity: "33%" },
              { bet: "1.5x pot", odds: "1.67:1",equity: "38%" },
              { bet: "2x pot",   odds: "1.5:1",equity: "40%" },
            ].map((row) => (
              <View key={row.bet} style={[styles.refRow, { borderColor: colors.border.subtle }]}>
                <Text style={{ flex: 1, fontSize: 13, color: colors.text.secondary }}>{row.bet} bet</Text>
                <Text style={{ width: 60, fontSize: 13, fontWeight: "700", color: BRAND, textAlign: "center" }}>{row.odds}</Text>
                <Text style={{ width: 60, fontSize: 13, fontWeight: "700", color: AMBER, textAlign: "right" }}>{row.equity}</Text>
              </View>
            ))}
            <View style={[styles.refRow, { borderColor: "transparent" }]}>
              <Text style={{ flex: 1, fontSize: 11, color: colors.text.disabled }}>Bet size</Text>
              <Text style={{ width: 60, fontSize: 11, color: colors.text.disabled, textAlign: "center" }}>Ratio</Text>
              <Text style={{ width: 60, fontSize: 11, color: colors.text.disabled, textAlign: "right" }}>Min equity</Text>
            </View>
          </View>
        </View>

        {/* Reset */}
        <TouchableOpacity
          onPress={reset}
          activeOpacity={0.75}
          style={[styles.resetBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.text.secondary} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.secondary }}>Reset</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  banner:    { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  card:      { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  inputRow:  { flexDirection: "row", gap: 12 },
  inputWrap: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 },
  inputLabel:{ fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
  inputInner:{ flexDirection: "row", alignItems: "center", gap: 4 },
  dollar:    { fontSize: 20, fontWeight: "800" },
  input:     { flex: 1, fontSize: 22, fontWeight: "800" },
  quickLabel:{ fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  betChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  resultsGrid:{ flexDirection: "row", gap: 8 },
  resultBox: { flex: 1, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, alignItems: "center", gap: 4 },
  resultValue:{ fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  resultLabel:{ fontSize: 11, fontWeight: "500", textAlign: "center" },
  explain:   { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  equityWrap:{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14 },
  equityInput:{ flex: 1, fontSize: 24, fontWeight: "800" },
  verdict:   { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  refRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  resetBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
});
