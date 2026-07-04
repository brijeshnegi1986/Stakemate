import { usePokerTheme } from "@/hooks/use-poker-theme";
import {
  calcEquity, card, cardLabel, EquityResult,
  FULL_DECK, RANKS, suitColor, SUITS,
} from "@/lib/pokerEquity";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator, Alert, Modal, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const GREEN  = "#22C55E";
const AMBER  = "#F59E0B";
const PINK   = "#EC4899";

// ─── Card picker modal ────────────────────────────────────────────────────────

function CardPicker({
  visible, onSelect, onClose, usedCards,
}: {
  visible: boolean;
  onSelect: (c: number) => void;
  onClose: () => void;
  usedCards: Set<number>;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#f8fafc" }}>
        {/* Header */}
        <View style={[styles.pickerHeader, { backgroundColor: "#ffffff", borderBottomColor: "#e2e8f0" }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={32} color="#64748b" />
          </TouchableOpacity>
          <Text style={[styles.pickerTitle, { color: "#0f172b" }]}>Select a Card</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {SUITS.map((suit, si) => (
            <View key={suit}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b", letterSpacing: 0.6, marginBottom: 8 }}>
                {["SPADES ♠","HEARTS ♥","DIAMONDS ♦","CLUBS ♣"][si]}
              </Text>
              <View style={styles.rankGrid}>
                {RANKS.map((_, ri) => {
                  const c = card(ri, si);
                  const used = usedCards.has(c);
                  const label = cardLabel(c);
                  const color = suitColor(c);
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => { if (!used) { onSelect(c); onClose(); } }}
                      activeOpacity={0.75}
                      style={[
                        styles.cardBtn,
                        { backgroundColor: used ? "#f1f5f9" : "#ffffff", borderColor: used ? "#cbd5e1" : "#94a3b8" },
                      ]}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "800", color: used ? "#94a3b8" : color }}>
                        {RANKS[ri]}
                      </Text>
                      <Text style={{ fontSize: 12, color: used ? "#94a3b8" : color }}>{suit}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Card slot ────────────────────────────────────────────────────────────────

function CardSlot({ cardVal, onPress, size = "md" }: { cardVal: number; onPress: () => void; size?: "sm" | "md" }) {
  const { colors } = usePokerTheme();
  const empty = cardVal < 0;
  const isSmall = size === "sm";
  const w = isSmall ? 38 : 48;
  const h = isSmall ? 52 : 66;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.cardSlot,
        { width: w, height: h, backgroundColor: empty ? colors.bg.tertiary : "#ffffff", borderColor: empty ? colors.border.default : "#94a3b8" },
      ]}
    >
      {empty ? (
        <Ionicons name="add" size={isSmall ? 16 : 20} color={colors.text.disabled} />
      ) : (
        <>
          <Text style={{ fontSize: isSmall ? 13 : 16, fontWeight: "900", color: suitColor(cardVal), lineHeight: isSmall ? 15 : 18 }}>
            {RANKS[Math.floor(cardVal / 4)]}
          </Text>
          <Text style={{ fontSize: isSmall ? 11 : 14, color: suitColor(cardVal) }}>
            {SUITS[cardVal % 4]}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Equity bar ───────────────────────────────────────────────────────────────

const PLAYER_COLORS = [BRAND, "#EF4444", GREEN, AMBER, PINK, "#8B5CF6"];

function EquityBar({ results }: { results: EquityResult }) {
  return (
    <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden" }}>
      {results.map((r, i) => (
        <View key={i} style={{ flex: r.equity, backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Hand = [number, number]; // two hole cards, -1 = unknown

export default function HandEquityScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [hands,   setHands]   = useState<Hand[]>([[-1,-1],[-1,-1]]);
  const [board,   setBoard]   = useState<number[]>([-1,-1,-1,-1,-1]);
  const [results, setResults] = useState<EquityResult | null>(null);
  const [running, setRunning] = useState(false);

  // Picker state
  const [picking, setPicking] = useState<{ type: "hand" | "board"; handIdx: number; cardIdx: number } | null>(null);

  const usedCards = new Set<number>([
    ...hands.flat().filter((c) => c >= 0),
    ...board.filter((c) => c >= 0),
  ]);

  function setHandCard(hi: number, ci: number, c: number) {
    setHands((prev) => {
      const next = prev.map((h) => [...h] as Hand);
      next[hi][ci] = c;
      return next;
    });
    setResults(null);
  }

  function setBoardCard(bi: number, c: number) {
    setBoard((prev) => { const next = [...prev]; next[bi] = c; return next; });
    setResults(null);
  }

  function clearHandCard(hi: number, ci: number) {
    setHands((prev) => { const next = prev.map((h) => [...h] as Hand); next[hi][ci] = -1; return next; });
    setResults(null);
  }

  function clearBoardCard(bi: number) {
    setBoard((prev) => { const next = [...prev]; next[bi] = -1; return next; });
    setResults(null);
  }

  function addPlayer() {
    if (hands.length >= 6) { Alert.alert("Max 6 players"); return; }
    setHands((prev) => [...prev, [-1,-1]]);
    setResults(null);
  }

  function removePlayer(hi: number) {
    if (hands.length <= 2) { Alert.alert("Minimum 2 players"); return; }
    setHands((prev) => prev.filter((_, i) => i !== hi));
    setResults(null);
  }

  function reset() {
    setHands([[-1,-1],[-1,-1]]);
    setBoard([-1,-1,-1,-1,-1]);
    setResults(null);
  }

  function runEquity() {
    setRunning(true);
    setResults(null);
    // Defer to next tick so spinner renders
    setTimeout(() => {
      try {
        const res = calcEquity(hands, board, 20_000);
        setResults(res);
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Could not calculate equity.");
      } finally {
        setRunning(false);
      }
    }, 50);
  }

  const playerLabels = ["Hero", "Villain 1", "Villain 2", "Villain 3", "Villain 4", "Villain 5"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Info banner */}
        <View style={[styles.info, { backgroundColor: BRAND + "0E", borderColor: BRAND + "25" }]}>
          <Ionicons name="information-circle-outline" size={16} color={BRAND} />
          <Text style={{ flex: 1, fontSize: 13, color: BRAND, lineHeight: 18 }}>
            Enter hole cards and board to calculate equity. Leave cards empty to run random hand simulations.
          </Text>
        </View>

        {/* Board */}
        <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Board</Text>
          <View style={styles.boardRow}>
            {board.map((c, bi) => (
              <View key={bi}>
                {c >= 0 ? (
                  <TouchableOpacity onLongPress={() => clearBoardCard(bi)} onPress={() => clearBoardCard(bi)}>
                    <CardSlot cardVal={c} onPress={() => clearBoardCard(bi)} />
                  </TouchableOpacity>
                ) : (
                  <CardSlot
                    cardVal={-1}
                    onPress={() => setPicking({ type: "board", handIdx: 0, cardIdx: bi })}
                  />
                )}
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
            Tap a board card to clear it · Flop (1-3) · Turn (4) · River (5)
          </Text>
        </View>

        {/* Players */}
        <View style={{ gap: 10 }}>
          {hands.map((hand, hi) => {
            const color = PLAYER_COLORS[hi % PLAYER_COLORS.length];
            const equity = results?.[hi];
            return (
              <View key={hi} style={[styles.handCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, borderLeftColor: color }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {/* Label */}
                  <Text style={{ fontSize: 13, fontWeight: "700", color, width: 72 }} numberOfLines={1}>
                    {playerLabels[hi]}
                  </Text>

                  {/* Cards */}
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {[0, 1].map((ci) => (
                      <View key={ci}>
                        {hand[ci] >= 0 ? (
                          <TouchableOpacity onPress={() => clearHandCard(hi, ci)}>
                            <CardSlot cardVal={hand[ci]} onPress={() => clearHandCard(hi, ci)} size="sm" />
                          </TouchableOpacity>
                        ) : (
                          <CardSlot
                            cardVal={-1}
                            size="sm"
                            onPress={() => setPicking({ type: "hand", handIdx: hi, cardIdx: ci })}
                          />
                        )}
                      </View>
                    ))}
                  </View>

                  {/* Equity result */}
                  {equity && (
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 20, fontWeight: "900", color }}>{(equity.equity * 100).toFixed(1)}%</Text>
                      <Text style={{ fontSize: 10, color: colors.text.tertiary }}>
                        W:{equity.wins.toLocaleString()} T:{equity.ties.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {/* Remove */}
                  <TouchableOpacity onPress={() => removePlayer(hi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="remove-circle-outline" size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>

                {/* Equity bar */}
                {results && equity && (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bg.secondary, overflow: "hidden" }}>
                      <View style={{ width: `${equity.equity * 100}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Combined equity bar */}
        {results && (
          <View style={{ gap: 8 }}>
            <EquityBar results={results} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {results.map((r, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                  <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                    {playerLabels[i]}: {(r.equity * 100).toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={runEquity}
            disabled={running}
            activeOpacity={0.85}
            style={[styles.btn, { backgroundColor: BRAND, flex: 1, opacity: running ? 0.7 : 1 }]}
          >
            {running
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="analytics-outline" size={18} color="#fff" />
            }
            <Text style={styles.btnText}>{running ? "Calculating…" : "Calculate Equity"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={addPlayer}
            activeOpacity={0.75}
            style={[styles.btn, { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.default }]}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.text.secondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={reset}
            activeOpacity={0.75}
            style={[styles.btn, { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.default }]}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Legend */}
        <View style={[styles.legend, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text.primary, marginBottom: 6 }}>How to use</Text>
          <Text style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 18 }}>
            • Tap a card slot to pick a card{"\n"}
            • Tap a selected card to remove it{"\n"}
            • Leave hands empty for random simulation{"\n"}
            • Add up to 6 players with the + button{"\n"}
            • 20,000 Monte Carlo simulations run instantly
          </Text>
        </View>

      </ScrollView>

      {/* Card picker */}
      <CardPicker
        visible={picking !== null}
        usedCards={usedCards}
        onClose={() => setPicking(null)}
        onSelect={(c) => {
          if (!picking) return;
          if (picking.type === "hand") setHandCard(picking.handIdx, picking.cardIdx, c);
          else setBoardCard(picking.cardIdx, c);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  info:         { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  card:         { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  cardTitle:    { fontSize: 15, fontWeight: "700" },
  boardRow:     { flexDirection: "row", gap: 8 },
  handCard:     { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, padding: 14, gap: 0 },
  cardSlot:     { borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 1 },
  btn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, paddingHorizontal: 14 },
  btnText:      { color: "#fff", fontSize: 15, fontWeight: "700" },
  legend:       { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle:  { fontSize: 17, fontWeight: "600" },
  rankGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardBtn:      { width: 44, height: 56, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 1 },
});
