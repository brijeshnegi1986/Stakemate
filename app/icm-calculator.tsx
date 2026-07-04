import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const MINT   = "#49E6BA";
const GREEN  = "#22C55E";
const AMBER  = "#F59E0B";

// ─── ICM Algorithm ────────────────────────────────────────────────────────────
// Standard recursive ICM: for each player, calculate probability of finishing
// in each position, multiply by prize, sum to get equity.

function icmEquity(stacks: number[], prizes: number[]): number[] {
  const n = stacks.length;
  const total = stacks.reduce((a, b) => a + b, 0);
  if (total === 0 || n === 0) return stacks.map(() => 0);

  const equity = new Array(n).fill(0);

  function recurse(
    remaining: number[],   // indices of players still in
    prizeIdx: number,      // which prize we're distributing
    probability: number    // cumulative probability to reach here
  ) {
    if (prizeIdx >= prizes.length || remaining.length === 0) return;
    const prize = prizes[prizeIdx];
    const remTotal = remaining.reduce((sum, i) => sum + stacks[i], 0);

    for (const i of remaining) {
      const p = (stacks[i] / remTotal) * probability;
      equity[i] += p * prize;
      recurse(remaining.filter((j) => j !== i), prizeIdx + 1, p);
    }
  }

  recurse(
    Array.from({ length: n }, (_, i) => i),
    0,
    1
  );

  return equity;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; chips: string };
type PrizeRow = { id: string; amount: string };

const PRESETS: { label: string; prizes: number[] }[] = [
  { label: "Heads Up",    prizes: [100, 0] },
  { label: "Top 3",      prizes: [50, 30, 20] },
  { label: "Final Table", prizes: [40, 25, 15, 10, 7, 3] },
  { label: "Top 10%",    prizes: [30, 20, 15, 12, 10, 7, 6] },
];

let uid = 0;
const nextId = () => String(++uid);

function makePlayer(n = 1): Player {
  return { id: nextId(), name: `Player ${n}`, chips: "" };
}
function makePrize(): PrizeRow {
  return { id: nextId(), amount: "" };
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({
  rank, player, chips, totalChips, equity, totalPrize, colors,
}: {
  rank: number; player: string; chips: number;
  totalChips: number; equity: number; totalPrize: number; colors: any;
}) {
  const chipPct  = totalChips > 0 ? (chips / totalChips) * 100 : 0;
  const icmPct   = totalPrize > 0 ? (equity / totalPrize) * 100 : 0;
  const diff     = icmPct - chipPct;
  const diffColor = diff >= 0 ? GREEN : "#EF4444";

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      <View style={[styles.rankBadge, { backgroundColor: BRAND + "18" }]}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: BRAND }}>#{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>{player}</Text>
        <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 1 }}>{chips.toLocaleString()} chips · {chipPct.toFixed(1)}% of stack</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: "900", color: BRAND }}>${equity.toFixed(2)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.tertiary }}>{icmPct.toFixed(1)}% ICM</Text>
          <Text style={{ fontSize: 11, fontWeight: "700", color: diffColor }}>
            ({diff >= 0 ? "+" : ""}{diff.toFixed(1)}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ICMCalculatorScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [players,  setPlayers]  = useState<Player[]>([makePlayer(1), makePlayer(2), makePlayer(3)]);
  const [prizes,   setPrizes]   = useState<PrizeRow[]>([
    { id: nextId(), amount: "600" },
    { id: nextId(), amount: "300" },
    { id: nextId(), amount: "100" },
  ]);
  const [results,  setResults]  = useState<number[] | null>(null);
  const [prizeTotal, setPrizeTotal] = useState<number>(0);

  // ── Player helpers
  function addPlayer() {
    setPlayers((p) => [...p, makePlayer(p.length + 1)]);
    setResults(null);
  }
  function removePlayer(id: string) {
    if (players.length <= 2) { Alert.alert("Minimum 2 players"); return; }
    setPlayers((p) => p.filter((x) => x.id !== id));
    setResults(null);
  }
  function updatePlayer(id: string, field: keyof Player, value: string) {
    setPlayers((p) => p.map((x) => x.id === id ? { ...x, [field]: value } : x));
    setResults(null);
  }

  // ── Prize helpers
  function addPrize() {
    setPrizes((p) => [...p, makePrize()]);
    setResults(null);
  }
  function removePrize(id: string) {
    if (prizes.length <= 1) { Alert.alert("Minimum 1 prize"); return; }
    setPrizes((p) => p.filter((x) => x.id !== id));
    setResults(null);
  }
  function updatePrize(id: string, value: string) {
    setPrizes((p) => p.map((x) => x.id === id ? { ...x, amount: value } : x));
    setResults(null);
  }

  // ── Apply preset
  function applyPreset(preset: typeof PRESETS[0]) {
    const newPrizes = preset.prizes.map((amt) => ({ id: nextId(), amount: String(amt) }));
    setPrizes(newPrizes);
    setResults(null);
  }

  // ── Calculate
  function calculate() {
    const stacks = players.map((p) => parseFloat(p.chips.replace(/,/g, "")) || 0);
    const prizeAmounts = prizes.map((p) => parseFloat(p.amount.replace(/,/g, "")) || 0);

    if (stacks.every((s) => s === 0)) {
      Alert.alert("Missing chips", "Enter chip counts for at least 2 players."); return;
    }
    if (prizeAmounts.every((a) => a === 0)) {
      Alert.alert("Missing prizes", "Enter at least one prize amount."); return;
    }
    if (stacks.some((s) => s < 0) || prizeAmounts.some((a) => a < 0)) {
      Alert.alert("Invalid values", "Chip counts and prize amounts must be positive."); return;
    }

    const equity = icmEquity(stacks, prizeAmounts);
    const total  = prizeAmounts.reduce((a, b) => a + b, 0);
    setResults(equity);
    setPrizeTotal(total);
  }

  // ── Reset
  function reset() {
    setPlayers([makePlayer(1), makePlayer(2), makePlayer(3)]);
    setPrizes([
      { id: nextId(), amount: "600" },
      { id: nextId(), amount: "300" },
      { id: nextId(), amount: "100" },
    ]);
    setResults(null);
    setPrizeTotal(0);
  }

  const totalChips = players.reduce((s, p) => s + (parseFloat(p.chips.replace(/,/g, "")) || 0), 0);

  // Sort results by equity descending for display
  const rankedResults = results
    ? players
        .map((p, i) => ({ player: p, equity: results[i], chips: parseFloat(p.chips.replace(/,/g, "")) || 0 }))
        .sort((a, b) => b.equity - a.equity)
    : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Info banner ── */}
        <View style={[styles.infoBanner, { backgroundColor: BRAND + "0E", borderColor: BRAND + "25" }]}>
          <Ionicons name="information-circle-outline" size={16} color={BRAND} />
          <Text style={{ flex: 1, fontSize: 13, color: BRAND, lineHeight: 18 }}>
            ICM calculates each player's real money equity based on chip stacks and prize structure — essential for bubble decisions and chop negotiations.
          </Text>
        </View>

        {/* ── Prize presets ── */}
        <View>
          <Text style={[styles.label, { color: colors.text.tertiary }]}>QUICK PRESETS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                onPress={() => applyPreset(p)}
                activeOpacity={0.75}
                style={[styles.preset, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.primary }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Prize structure ── */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Prize Structure</Text>
            <TouchableOpacity onPress={addPrize} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="add-circle-outline" size={22} color={BRAND} />
            </TouchableOpacity>
          </View>
          {prizes.map((prize, i) => (
            <View key={prize.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }]}>
              <View style={[styles.positionBadge, { backgroundColor: AMBER + "18" }]}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: AMBER }}>
                  {i === 0 ? "1ST" : i === 1 ? "2ND" : i === 2 ? "3RD" : `${i + 1}TH`}
                </Text>
              </View>
              <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>$</Text>
              <TextInput
                style={[styles.rowInput, { color: colors.text.primary }]}
                value={prize.amount}
                onChangeText={(v) => updatePrize(prize.id, v)}
                placeholder="0"
                placeholderTextColor={colors.text.disabled}
                keyboardType="numeric"
              />
              <TouchableOpacity onPress={() => removePrize(prize.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="remove-circle-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.text.tertiary, fontWeight: "500" }}>Total prize pool</Text>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text.primary }}>
              ${prizes.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* ── Players ── */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Players & Chip Counts</Text>
            <TouchableOpacity onPress={addPlayer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="add-circle-outline" size={22} color={BRAND} />
            </TouchableOpacity>
          </View>
          {players.map((player, i) => (
            <View key={player.id} style={[styles.playerRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }]}>
              <TextInput
                style={[styles.nameInput, { color: colors.text.primary, borderColor: colors.border.default }]}
                value={player.name}
                onChangeText={(v) => updatePlayer(player.id, "name", v)}
                placeholder={`Player ${i + 1}`}
                placeholderTextColor={colors.text.disabled}
              />
              <View style={[styles.chipsWrap, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
                <TextInput
                  style={[styles.chipsInput, { color: colors.text.primary }]}
                  value={player.chips}
                  onChangeText={(v) => updatePlayer(player.id, "chips", v)}
                  placeholder="0"
                  placeholderTextColor={colors.text.disabled}
                  keyboardType="numeric"
                />
              </View>
              <TouchableOpacity onPress={() => removePlayer(player.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="remove-circle-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
          {totalChips > 0 && (
            <View style={{ paddingTop: 10, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle }}>
              <Text style={{ fontSize: 12, color: colors.text.tertiary }}>
                Total chips in play: <Text style={{ fontWeight: "700", color: colors.text.primary }}>{totalChips.toLocaleString()}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* ── Calculate button ── */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={calculate}
            activeOpacity={0.85}
            style={[styles.calcBtn, { backgroundColor: BRAND, flex: 1 }]}
          >
            <Ionicons name="calculator-outline" size={18} color="#fff" />
            <Text style={styles.calcBtnText}>Calculate ICM</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={reset}
            activeOpacity={0.75}
            style={[styles.calcBtn, { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.default, width: 52 }]}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── Results ── */}
        {rankedResults && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.label, { color: colors.text.tertiary }]}>ICM EQUITY RESULTS</Text>

            {rankedResults.map((r, i) => (
              <ResultCard
                key={r.player.id}
                rank={i + 1}
                player={r.player.name || `Player ${i + 1}`}
                chips={r.chips}
                totalChips={totalChips}
                equity={r.equity}
                totalPrize={prizeTotal}
                colors={colors}
              />
            ))}

            {/* Chop suggestion */}
            <View style={[styles.chopCard, { backgroundColor: MINT + "14", borderColor: MINT + "40" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Ionicons name="git-merge-outline" size={18} color={MINT} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: MINT }}>Suggested Chop Amounts</Text>
              </View>
              {rankedResults.map((r) => (
                <View key={r.player.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: "500" }} numberOfLines={1}>{r.player.name || "Player"}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: MINT }}>${r.equity.toFixed(2)}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 8, lineHeight: 15 }}>
                Based on ICM equity. Players may negotiate adjustments for short stacks, blinds position, or skill edges.
              </Text>
            </View>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  label:        { fontSize: 11, fontWeight: "700", letterSpacing: 0.7, marginBottom: 8 },
  infoBanner:   { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  preset:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  card:         { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  cardHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, paddingBottom: 10 },
  cardTitle:    { fontSize: 15, fontWeight: "700" },
  row:          { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  rowLabel:     { fontSize: 15, fontWeight: "600", width: 14 },
  rowInput:     { flex: 1, fontSize: 15, fontWeight: "600" },
  positionBadge:{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, minWidth: 36, alignItems: "center" },
  playerRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  nameInput:    { flex: 1, fontSize: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  chipsWrap:    { width: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  chipsInput:   { fontSize: 14, fontWeight: "700", textAlign: "right", width: "100%" },
  calcBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  calcBtnText:  { color: "#fff", fontSize: 16, fontWeight: "700" },
  resultCard:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  rankBadge:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chopCard:     { borderRadius: 14, borderWidth: 1, padding: 14 },
});
