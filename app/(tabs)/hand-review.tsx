import { usePokerTheme } from "@/hooks/use-poker-theme";
import { BACKEND_URL } from "@/constants/config";
import type { ReactNode } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "s" | "h" | "d" | "c";
type Rank = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
type Card = `${Rank}${Suit}` | null;
type ActionType = "Fold" | "Check" | "Call" | "Raise" | "Bet" | "All-in";
type Position = "UTG" | "UTG+1" | "MP" | "HJ" | "CO" | "BTN" | "SB" | "BB";
type SlotKey =
  | "hole1" | "hole2"
  | "flop1" | "flop2" | "flop3"
  | "turn" | "river";

interface StreetAction { type: ActionType; amount: string; }
interface StreetAnalysis {
  heroAction: string;
  assessment: string;
  suggestion: string;
  reasoning: string;
  grade: "A" | "B" | "C" | "D";
}
interface AIResult {
  preflop?: StreetAnalysis;
  flop?: StreetAnalysis;
  turn?: StreetAnalysis;
  river?: StreetAnalysis;
  summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANKS: Rank[] = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS: Suit[] = ["s","h","d","c"];
const SUIT_SYMBOLS: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const POSITIONS: Position[] = ["UTG", "UTG+1", "MP", "HJ", "CO", "BTN", "SB", "BB"];
const ACTIONS: ActionType[] = ["Fold", "Check", "Call", "Raise", "Bet", "All-in"];

// Positions available for each player count (clockwise table order: BTN first)
const POSITIONS_BY_COUNT: Record<number, Position[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["CO", "BTN", "SB", "BB"],
  5: ["UTG", "CO", "BTN", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  7: ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"],
  8: ["UTG", "UTG+1", "MP", "HJ", "CO", "BTN", "SB", "BB"],
  9: ["UTG", "UTG+1", "MP", "HJ", "CO", "BTN", "SB", "BB"],
};

const SCREEN_W = Dimensions.get("window").width;
const TABLE_W = Math.min(SCREEN_W - 48, 360);
const TABLE_H = TABLE_W * 0.52;
const SEAT_W = 64;
const SEAT_H = 72;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRed(suit: Suit) { return suit === "h" || suit === "d"; }

function parseCard(c: Card): { rank: Rank; suit: Suit } | null {
  if (!c) return null;
  return { rank: c[0] as Rank, suit: c[1] as Suit };
}

function allSelectedCards(
  holeCards: [Card, Card],
  flop: [Card, Card, Card],
  turn: Card,
  river: Card
): string[] {
  return [holeCards[0], holeCards[1], flop[0], flop[1], flop[2], turn, river]
    .filter(Boolean) as string[];
}

// Returns seat labels clockwise starting from hero
function getTablePositions(heroPos: Position, numPlayers: number): string[] {
  const pool = POSITIONS_BY_COUNT[numPlayers] ?? POSITIONS_BY_COUNT[6];
  const heroIdx = pool.indexOf(heroPos);
  if (heroIdx === -1) return pool;
  const result: string[] = [];
  for (let i = 0; i < numPlayers; i++) {
    result.push(pool[(heroIdx + i) % pool.length]);
  }
  return result;
}

// Returns {x, y} relative to table center for each seat index
function seatPosition(idx: number, total: number) {
  const rx = TABLE_W / 2 + 28;
  const ry = TABLE_H / 2 + 24;
  // Hero at bottom (PI/2), others clockwise (increasing angle in screen-y-down coords)
  const angle = Math.PI / 2 + idx * ((2 * Math.PI) / total);
  return {
    x: rx * Math.cos(angle),
    y: ry * Math.sin(angle),
  };
}

function gradeColor(grade: string, colors: any): string {
  switch (grade) {
    case "A": return colors.bg.success;
    case "B": return "#3b82f6";
    case "C": return colors.bg.warning;
    case "D": return colors.bg.danger;
    default:  return colors.bg.brand;
  }
}

function buildUserMessage(
  holeCards: [Card, Card],
  position: Position,
  stackSize: string,
  numPlayers: number,
  flop: [Card, Card, Card],
  turn: Card,
  river: Card,
  actions: Record<string, StreetAction>
): string {
  const hero = `Hero: [${holeCards[0] ?? "??"} ${holeCards[1] ?? "??"}] | Position: ${position} | Stack: ${stackSize}BB | Villains: ${numPlayers - 1}`;
  const pre = `Preflop action: ${actions.preflop.type}${actions.preflop.amount ? ` ${actions.preflop.amount}BB` : ""}`;
  const lines = [hero, pre];
  if (flop[0] && flop[1] && flop[2]) {
    lines.push(`Flop: [${flop[0]} ${flop[1]} ${flop[2]}] | Flop action: ${actions.flop.type}${actions.flop.amount ? ` ${actions.flop.amount}BB` : ""}`);
  }
  if (turn) {
    lines.push(`Turn: [${turn}] | Turn action: ${actions.turn.type}${actions.turn.amount ? ` ${actions.turn.amount}BB` : ""}`);
  }
  if (river) {
    lines.push(`River: [${river}] | River action: ${actions.river.type}${actions.river.amount ? ` ${actions.river.amount}BB` : ""}`);
  }
  return lines.join("\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardChip({ card, onPress, colors }: { card: Card; onPress?: () => void; colors: any }) {
  const parsed = parseCard(card);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width: 36,
        height: 48,
        borderRadius: 5,
        backgroundColor: parsed ? "#ffffff" : "transparent",
        borderWidth: parsed ? 0 : 1.5,
        borderStyle: parsed ? "solid" : "dashed",
        borderColor: parsed ? "transparent" : "rgba(255,255,255,0.35)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {parsed ? (
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: isRed(parsed.suit) ? "#dc2626" : "#1e293b", lineHeight: 16 }}>
            {parsed.rank}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: "700", color: isRed(parsed.suit) ? "#dc2626" : "#1e293b", lineHeight: 13 }}>
            {SUIT_SYMBOLS[parsed.suit]}
          </Text>
        </View>
      ) : null}
    </Wrap>
  );
}

function FormCardSlot({ card, onPress, colors }: { card: Card; onPress: () => void; colors: any }) {
  const parsed = parseCard(card);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: 44,
        height: 58,
        borderRadius: 6,
        backgroundColor: parsed ? "#ffffff" : colors.bg.tertiary,
        borderWidth: 1.5,
        borderStyle: parsed ? "solid" : "dashed",
        borderColor: parsed ? colors.border.brand : colors.border.strong,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {parsed ? (
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: isRed(parsed.suit) ? "#dc2626" : "#1e293b", lineHeight: 18 }}>
            {parsed.rank}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: isRed(parsed.suit) ? "#dc2626" : "#1e293b", lineHeight: 15 }}>
            {SUIT_SYMBOLS[parsed.suit]}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 10, color: colors.text.tertiary }}>+</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Poker Table ──────────────────────────────────────────────────────────────

function PokerTable({
  numPlayers,
  heroPosition,
  holeCards,
  onCardSlotPress,
  colors,
}: {
  numPlayers: number;
  heroPosition: Position;
  holeCards: [Card, Card];
  onCardSlotPress: (slot: "hole1" | "hole2") => void;
  colors: any;
}) {
  const positions = getTablePositions(heroPosition, numPlayers);
  const cx = TABLE_W / 2;
  const cy = TABLE_H / 2;

  return (
    <View style={{ alignItems: "center", marginBottom: 24 }}>
      <View
        style={{
          width: TABLE_W + SEAT_W + 16,
          height: TABLE_H + SEAT_H + 16,
          position: "relative",
        }}
      >
        {/* Table felt */}
        <View
          style={{
            position: "absolute",
            left: SEAT_W / 2 + 8,
            top: SEAT_H / 2 + 8,
            width: TABLE_W,
            height: TABLE_H,
            borderRadius: TABLE_H / 2,
            backgroundColor: "#1a5c38",
            borderWidth: 8,
            borderColor: "#7b4a2d",
            shadowColor: "#000",
            shadowOpacity: 0.5,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 12,
            elevation: 8,
          }}
        />
        {/* Table logo center */}
        <View
          style={{
            position: "absolute",
            left: SEAT_W / 2 + 8 + cx - 40,
            top: SEAT_H / 2 + 8 + cy - 16,
            width: 80,
            height: 32,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, fontWeight: "700", letterSpacing: 2 }}>
            POKER
          </Text>
        </View>

        {/* Seats */}
        {positions.map((pos, idx) => {
          const { x, y } = seatPosition(idx, numPlayers);
          const isHero = idx === 0;
          const isBtn = pos === "BTN";
          const seatLeft = SEAT_W / 2 + 8 + cx + x - SEAT_W / 2;
          const seatTop  = SEAT_H / 2 + 8 + cy + y - SEAT_H / 2;

          return (
            <View
              key={idx}
              style={{
                position: "absolute",
                left: seatLeft,
                top: seatTop,
                width: SEAT_W,
                height: SEAT_H,
                alignItems: "center",
              }}
            >
              {/* Position label */}
              <View
                style={{
                  backgroundColor: isHero ? "#f59e0b" : "rgba(15,23,43,0.85)",
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  marginBottom: 4,
                }}
              >
                <Text style={{ color: isHero ? "#020618" : "#ffffff", fontSize: 9, fontWeight: "700" }}>
                  {pos}
                </Text>
              </View>

              {/* Dealer button */}
              {isBtn && (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -2,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: "#ffffff",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}
                >
                  <Text style={{ fontSize: 7, fontWeight: "900", color: "#000" }}>D</Text>
                </View>
              )}

              {/* Card area */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 3,
                  padding: 4,
                  borderRadius: 8,
                  borderWidth: isHero ? 2 : 0,
                  borderColor: isHero ? "#f59e0b" : "transparent",
                  backgroundColor: isHero ? "rgba(245,158,11,0.1)" : "transparent",
                }}
              >
                {isHero ? (
                  <>
                    <CardChip card={holeCards[0]} onPress={() => onCardSlotPress("hole1")} colors={colors} />
                    <CardChip card={holeCards[1]} onPress={() => onCardSlotPress("hole2")} colors={colors} />
                  </>
                ) : (
                  <>
                    {[0, 1].map((ci) => (
                      <View
                        key={ci}
                        style={{
                          width: 18,
                          height: 26,
                          borderRadius: 3,
                          backgroundColor: "#4a5568",
                          borderWidth: 1,
                          borderColor: "#718096",
                        }}
                      />
                    ))}
                  </>
                )}
              </View>

              {isHero && (
                <Text style={{ color: "#f59e0b", fontSize: 8, fontWeight: "800", marginTop: 2 }}>
                  YOU
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Card Picker Modal ────────────────────────────────────────────────────────

function CardPickerModal({
  visible,
  activeSlot,
  usedCards,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  activeSlot: SlotKey | null;
  usedCards: string[];
  onSelect: (card: string) => void;
  onClose: () => void;
  colors: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
        <View
          style={{
            backgroundColor: colors.bg.secondary,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 16,
            paddingBottom: 32,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>
              Select Card
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Suit headers */}
          <View style={{ flexDirection: "row", marginBottom: 4, paddingLeft: 28 }}>
            {RANKS.map((r) => (
              <View key={r} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 9, fontWeight: "600" }}>{r}</Text>
              </View>
            ))}
          </View>

          {/* Card grid: 4 rows (suits) × 13 cols (ranks) */}
          {SUITS.map((suit) => (
            <View key={suit} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ width: 24, color: isRed(suit) ? "#dc2626" : colors.text.primary, fontSize: 14, fontWeight: "700" }}>
                {SUIT_SYMBOLS[suit]}
              </Text>
              {RANKS.map((rank) => {
                const cardStr = `${rank}${suit}`;
                const used = usedCards.includes(cardStr);
                return (
                  <TouchableOpacity
                    key={cardStr}
                    disabled={used}
                    onPress={() => onSelect(cardStr)}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      marginHorizontal: 1.5,
                      paddingVertical: 6,
                      borderRadius: 5,
                      backgroundColor: used ? "transparent" : (isRed(suit) ? "rgba(220,38,38,0.12)" : colors.bg.tertiary),
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: used ? colors.border.subtle : (isRed(suit) ? "rgba(220,38,38,0.3)" : colors.border.default),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: used
                          ? colors.text.disabled
                          : isRed(suit)
                          ? "#dc2626"
                          : colors.text.primary,
                      }}
                    >
                      {rank}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── Grade Badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade, colors }: { grade: string; colors: any }) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: gradeColor(grade, colors),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "900" }}>{grade}</Text>
    </View>
  );
}

// ─── Street Result Panel ──────────────────────────────────────────────────────

function StreetPanel({
  street,
  data,
  boardCards,
  colors,
}: {
  street: string;
  data: StreetAnalysis;
  boardCards?: Card[];
  colors: any;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.bg.secondary,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border.default,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>{street}</Text>
        <GradeBadge grade={data.grade} colors={colors} />
      </View>

      {boardCards && boardCards.filter(Boolean).length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
          {boardCards.filter(Boolean).map((c, i) => {
            const p = parseCard(c);
            return p ? (
              <View key={i} style={{ width: 32, height: 44, borderRadius: 4, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: isRed(p.suit) ? "#dc2626" : "#1e293b", lineHeight: 14 }}>{p.rank}</Text>
                <Text style={{ fontSize: 10, fontWeight: "700", color: isRed(p.suit) ? "#dc2626" : "#1e293b", lineHeight: 12 }}>{SUIT_SYMBOLS[p.suit]}</Text>
              </View>
            ) : null;
          })}
        </View>
      )}

      <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 4 }}>
        <Text style={{ fontWeight: "700", color: colors.text.primary }}>Action: </Text>{data.heroAction}
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 4 }}>
        <Text style={{ fontWeight: "700", color: colors.text.primary }}>Assessment: </Text>{data.assessment}
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 4 }}>
        <Text style={{ fontWeight: "700", color: colors.text.primary }}>Suggestion: </Text>{data.suggestion}
      </Text>
      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
        <Text style={{ fontWeight: "700", color: colors.text.primary }}>Reasoning: </Text>{data.reasoning}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HandReviewScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();

  // ── Hand state ──
  const [numPlayers, setNumPlayers] = useState(6);
  const [heroPosition, setHeroPosition] = useState<Position>("BTN");
  const [stackSize, setStackSize] = useState("100");
  const [holeCards, setHoleCards] = useState<[Card, Card]>([null, null]);
  const [flop, setFlop] = useState<[Card, Card, Card]>([null, null, null]);
  const [turn, setTurn] = useState<Card>(null);
  const [river, setRiver] = useState<Card>(null);
  const [preflopAction, setPreflopAction] = useState<StreetAction>({ type: "Raise", amount: "3" });
  const [flopAction, setFlopAction] = useState<StreetAction>({ type: "Bet", amount: "" });
  const [turnAction, setTurnAction] = useState<StreetAction>({ type: "Check", amount: "" });
  const [riverAction, setRiverAction] = useState<StreetAction>({ type: "Call", amount: "" });

  // ── UI state ──
  const [pickerVisible, setPickerVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allUsed = allSelectedCards(holeCards, flop, turn, river);
  const holesFilled = holeCards[0] && holeCards[1];
  const flopFilled = flop[0] && flop[1] && flop[2];
  const showFlop = !!holesFilled;
  const showTurn = !!flopFilled;
  const showRiver = !!turn;

  // Street is folded if action type is Fold
  const preflopFolded = preflopAction.type === "Fold";
  const flopFolded = flopAction.type === "Fold";
  const turnFolded = turnAction.type === "Fold";

  function openPicker(slot: SlotKey) {
    setActiveSlot(slot);
    setPickerVisible(true);
  }

  function handleCardSelect(cardStr: string) {
    if (!activeSlot) return;
    const card = cardStr as Card;
    if (activeSlot === "hole1") setHoleCards([card, holeCards[1]]);
    else if (activeSlot === "hole2") setHoleCards([holeCards[0], card]);
    else if (activeSlot === "flop1") setFlop([card, flop[1], flop[2]]);
    else if (activeSlot === "flop2") setFlop([flop[0], card, flop[2]]);
    else if (activeSlot === "flop3") setFlop([flop[0], flop[1], card]);
    else if (activeSlot === "turn") setTurn(card);
    else if (activeSlot === "river") setRiver(card);
    setPickerVisible(false);
    setActiveSlot(null);
  }

  function resetHand() {
    setHoleCards([null, null]);
    setFlop([null, null, null]);
    setTurn(null);
    setRiver(null);
    setPreflopAction({ type: "Raise", amount: "3" });
    setFlopAction({ type: "Bet", amount: "" });
    setTurnAction({ type: "Check", amount: "" });
    setRiverAction({ type: "Call", amount: "" });
    setResult(null);
    setError(null);
  }

  async function analyzeHand() {
    if (!holeCards[0] || !holeCards[1]) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const userMsg = buildUserMessage(
      holeCards, heroPosition, stackSize, numPlayers,
      flop, turn, river,
      { preflop: preflopAction, flop: flopAction, turn: turnAction, river: riverAction }
    );

    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: userMsg }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any)?.error ?? `Server error ${response.status}`);
      }

      const data = await response.json();
      const text: string = data.text ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Invalid response from server");
      const parsed: AIResult = JSON.parse(jsonMatch[0]);
      setResult(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Renders ──

  function renderActionRow(action: StreetAction, setAction: (a: StreetAction) => void) {
    const needsAmount = ["Raise", "Bet", "Call", "All-in"].includes(action.type);
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" }}>
          Action
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {ACTIONS.map((a) => (
            <TouchableOpacity
              key={a}
              onPress={() => setAction({ ...action, type: a })}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.full,
                backgroundColor: action.type === a ? colors.bg.brand : colors.bg.tertiary,
                borderWidth: 1,
                borderColor: action.type === a ? colors.border.brand : colors.border.default,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: "600",
                color: action.type === a ? colors.text.onBrand : colors.text.primary,
              }}>
                {a}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {needsAmount && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <TextInput
              value={action.amount}
              onChangeText={(t) => setAction({ ...action, amount: t })}
              placeholder="Amount (BB)"
              placeholderTextColor={colors.text.tertiary}
              keyboardType="numeric"
              style={{
                flex: 1,
                backgroundColor: colors.bg.tertiary,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border.default,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.text.primary,
                fontSize: 14,
              }}
            />
            <Text style={{ color: colors.text.secondary, fontSize: 13 }}>BB</Text>
          </View>
        )}
      </View>
    );
  }

  function renderSectionLabel(label: string) {
    return (
      <Text style={{
        color: colors.text.secondary,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.5,
        textTransform: "uppercase",
        marginBottom: 8,
      }}>
        {label}
      </Text>
    );
  }

  function renderCard(label: string, node: ReactNode) {
    return (
      <View style={{
        backgroundColor: colors.bg.secondary,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border.default,
        padding: 16,
        marginBottom: 12,
        gap: 12,
      }}>
        {renderSectionLabel(label)}
        {node}
      </View>
    );
  }

  // ── Result view ──
  if (result) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: "800", marginBottom: 4 }}>
          Hand Analysis
        </Text>
        <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 20 }}>
          AI coaching feedback on every decision
        </Text>

        {result.preflop && (
          <StreetPanel street="Preflop" data={result.preflop} colors={colors} />
        )}
        {result.flop && (
          <StreetPanel street="Flop" data={result.flop} boardCards={[flop[0], flop[1], flop[2]]} colors={colors} />
        )}
        {result.turn && (
          <StreetPanel street="Turn" data={result.turn} boardCards={[turn]} colors={colors} />
        )}
        {result.river && (
          <StreetPanel street="River" data={result.river} boardCards={[river]} colors={colors} />
        )}

        {/* Summary */}
        <View style={{
          backgroundColor: colors.bg.secondary,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border.brand,
          padding: 16,
          marginBottom: 20,
        }}>
          <Text style={{ color: colors.text.brand, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            Summary
          </Text>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 21 }}>
            {result.summary}
          </Text>
        </View>

        <TouchableOpacity
          onPress={resetHand}
          style={{
            backgroundColor: colors.bg.brand,
            borderRadius: radius.md,
            paddingVertical: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "700" }}>
            Review Another Hand
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Input view ──
  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Poker table */}
        <PokerTable
          numPlayers={numPlayers}
          heroPosition={heroPosition}
          holeCards={holeCards}
          onCardSlotPress={openPicker}
          colors={colors}
        />

        {/* Setup card */}
        {renderCard("Setup", (
          <View style={{ gap: 12 }}>
            {/* Players */}
            <View>
              {renderSectionLabel("Number of Players")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[2,3,4,5,6,7,8,9].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setNumPlayers(n)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: radius.full,
                      backgroundColor: numPlayers === n ? colors.bg.brand : colors.bg.tertiary,
                      borderWidth: 1,
                      borderColor: numPlayers === n ? colors.border.brand : colors.border.default,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: numPlayers === n ? colors.text.onBrand : colors.text.primary }}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Position */}
            <View>
              {renderSectionLabel("Hero Position")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {POSITIONS.map((p) => {
                  const available = (POSITIONS_BY_COUNT[numPlayers] ?? []).includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => available && setHeroPosition(p)}
                      disabled={!available}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.full,
                        backgroundColor: heroPosition === p ? colors.bg.brand : available ? colors.bg.tertiary : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: heroPosition === p ? colors.border.brand : available ? colors.border.default : colors.border.subtle,
                        opacity: available ? 1 : 0.4,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: heroPosition === p ? colors.text.onBrand : colors.text.primary }}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Stack */}
            <View>
              {renderSectionLabel("Effective Stack (BB)")}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={stackSize}
                  onChangeText={setStackSize}
                  placeholder="100"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="numeric"
                  style={{
                    flex: 1,
                    backgroundColor: colors.bg.tertiary,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.border.default,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: colors.text.primary,
                    fontSize: 14,
                  }}
                />
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>BB</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Hole cards */}
        {renderCard("Hole Cards", (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <FormCardSlot card={holeCards[0]} onPress={() => openPicker("hole1")} colors={colors} />
            <FormCardSlot card={holeCards[1]} onPress={() => openPicker("hole2")} colors={colors} />
            {holesFilled && (
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginLeft: 4 }}>
                Tap to change
              </Text>
            )}
          </View>
        ))}

        {/* Preflop action */}
        {renderCard("Preflop Action", renderActionRow(preflopAction, setPreflopAction))}

        {/* Flop */}
        {showFlop && !preflopFolded && renderCard("Flop", (
          <View style={{ gap: 12 }}>
            <View>
              {renderSectionLabel("Board Cards")}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <FormCardSlot card={flop[0]} onPress={() => openPicker("flop1")} colors={colors} />
                <FormCardSlot card={flop[1]} onPress={() => openPicker("flop2")} colors={colors} />
                <FormCardSlot card={flop[2]} onPress={() => openPicker("flop3")} colors={colors} />
              </View>
            </View>
            {flopFilled && renderActionRow(flopAction, setFlopAction)}
          </View>
        ))}

        {/* Turn */}
        {showTurn && !preflopFolded && !flopFolded && renderCard("Turn", (
          <View style={{ gap: 12 }}>
            <View>
              {renderSectionLabel("Board Card")}
              <FormCardSlot card={turn} onPress={() => openPicker("turn")} colors={colors} />
            </View>
            {turn && renderActionRow(turnAction, setTurnAction)}
          </View>
        ))}

        {/* River */}
        {showRiver && !preflopFolded && !flopFolded && !turnFolded && renderCard("River", (
          <View style={{ gap: 12 }}>
            <View>
              {renderSectionLabel("Board Card")}
              <FormCardSlot card={river} onPress={() => openPicker("river")} colors={colors} />
            </View>
            {river && renderActionRow(riverAction, setRiverAction)}
          </View>
        ))}

        {/* Error state */}
        {error && (
          <View style={{
            backgroundColor: colors.bg.danger + "18",
            borderWidth: 1,
            borderColor: colors.border.danger,
            borderRadius: radius.sm,
            padding: 12,
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.text.danger} />
            <Text style={{ color: colors.text.danger, fontSize: 13, flex: 1 }}>{error}</Text>
            <TouchableOpacity onPress={analyzeHand}>
              <Text style={{ color: colors.text.brand, fontSize: 13, fontWeight: "700" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Analyze button */}
        <TouchableOpacity
          onPress={analyzeHand}
          disabled={!holesFilled || loading}
          activeOpacity={0.85}
          style={{
            backgroundColor: holesFilled && !loading ? colors.bg.brand : colors.bg.tertiary,
            borderRadius: radius.md,
            paddingVertical: 16,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          {loading ? (
            <ActivityIndicator color={colors.text.onBrand} size="small" />
          ) : (
            <MaterialCommunityIcons
              name="robot-outline"
              size={20}
              color={holesFilled ? colors.text.onBrand : colors.text.disabled}
            />
          )}
          <Text style={{
            color: holesFilled && !loading ? colors.text.onBrand : colors.text.disabled,
            fontSize: 16,
            fontWeight: "700",
          }}>
            {loading ? "Analyzing Hand…" : "Analyze Hand"}
          </Text>
        </TouchableOpacity>

        {!holesFilled && (
          <Text style={{ color: colors.text.tertiary, fontSize: 12, textAlign: "center" }}>
            Select your hole cards to enable analysis
          </Text>
        )}
      </ScrollView>

      {/* Card picker */}
      <CardPickerModal
        visible={pickerVisible}
        activeSlot={activeSlot}
        usedCards={allUsed}
        onSelect={handleCardSelect}
        onClose={() => { setPickerVisible(false); setActiveSlot(null); }}
        colors={colors}
      />

    </>
  );
}
