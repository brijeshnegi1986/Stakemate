import { BACKEND_URL } from "@/constants/config";
import { addHandReview, deleteHandReview, getHandReviews, HandReview } from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, useCallback } from "react";
import {
  ActivityIndicator, Dimensions, KeyboardAvoidingView, Modal,
  Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "s" | "h" | "d" | "c";
type Rank = "A"|"K"|"Q"|"J"|"T"|"9"|"8"|"7"|"6"|"5"|"4"|"3"|"2";
type Card = `${Rank}${Suit}` | null;
type ActionType = "Fold"|"Check"|"Call"|"Raise"|"Bet"|"All-in";
type Position = "UTG"|"UTG+1"|"MP"|"HJ"|"CO"|"BTN"|"SB"|"BB";
type StackMode = "BB"|"$";
type SlotKey = "hole1"|"hole2"|"flop1"|"flop2"|"flop3"|"turn"|"river";
type Step = "setup"|"deal"|"preflop"|"flop"|"turn"|"river";

interface StreetEntry {
  context: string;  // optional: action before hero acted
  action: ActionType;
  amount: string;
}

interface StreetAnalysis {
  heroAction: string; assessment: string; suggestion: string;
  reasoning: string; grade: "A"|"B"|"C"|"D";
}
interface AIResult {
  preflop?: StreetAnalysis; flop?: StreetAnalysis;
  turn?: StreetAnalysis; river?: StreetAnalysis; summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANKS: Rank[] = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS: Suit[] = ["s","h","d","c"];
const SUIT_SYMBOLS: Record<Suit,string> = { s:"♠", h:"♥", d:"♦", c:"♣" };
const POSITIONS: Position[] = ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"];
const ACTIONS: ActionType[] = ["Fold","Check","Call","Raise","Bet","All-in"];

const POSITIONS_BY_COUNT: Record<number,Position[]> = {
  2: ["BTN","BB"],
  3: ["BTN","SB","BB"],
  4: ["CO","BTN","SB","BB"],
  5: ["UTG","CO","BTN","SB","BB"],
  6: ["UTG","HJ","CO","BTN","SB","BB"],
  7: ["UTG","UTG+1","HJ","CO","BTN","SB","BB"],
  8: ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"],
  9: ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"],
};

const SCREEN_W = Dimensions.get("window").width;

const SLOT_NEXT: Partial<Record<SlotKey,SlotKey>> = {
  hole1: "hole2", flop1: "flop2", flop2: "flop3",
};
const SLOT_LABEL: Record<SlotKey,string> = {
  hole1:"Hole Card 1 of 2", hole2:"Hole Card 2 of 2",
  flop1:"Flop Card 1 of 3", flop2:"Flop Card 2 of 3", flop3:"Flop Card 3 of 3",
  turn:"Turn Card", river:"River Card",
};

const STEP_ORDER: Step[] = ["setup","deal","preflop","flop","turn","river"];
const STEP_LABEL: Record<Step,string> = {
  setup:"Setup", deal:"Cards", preflop:"Preflop",
  flop:"Flop", turn:"Turn", river:"River",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRed(s: Suit) { return s === "h" || s === "d"; }
function parseCard(c: Card) {
  if (!c) return null;
  return { rank: c[0] as Rank, suit: c[1] as Suit };
}
function allSelected(h: [Card,Card], f: [Card,Card,Card], t: Card, r: Card): string[] {
  return [h[0],h[1],f[0],f[1],f[2],t,r].filter(Boolean) as string[];
}
function stackInBB(size: string, mode: StackMode, bb: string): number {
  const v = parseFloat(size) || 0;
  return mode === "BB" ? v : Math.round(v / (parseFloat(bb) || 1));
}
function needsAmount(t: ActionType) { return ["Raise","Bet","All-in"].includes(t); }
function gradeColor(g: string, c: any) {
  return g==="A" ? c.bg.success : g==="B" ? "#3b82f6" : g==="C" ? c.bg.warning : c.bg.danger;
}
function overallGrade(r: AIResult): string {
  const gs = [r.preflop?.grade, r.flop?.grade, r.turn?.grade, r.river?.grade].filter(Boolean) as string[];
  if (gs.includes("D")) return "D";
  if (gs.includes("C")) return "C";
  if (gs.includes("B")) return "B";
  return "A";
}
function gradeIsGood(g: string) { return g==="A" || g==="B"; }
function defaultEntry(): StreetEntry { return { context:"", action:"Check", amount:"" }; }

function buildUserMessage(
  holeCards: [Card,Card], position: Position,
  stackSize: string, stackMode: StackMode, bbDollars: string,
  numPlayers: number,
  flop: [Card,Card,Card], turn: Card, river: Card,
  pf: StreetEntry, fl: StreetEntry, tu: StreetEntry, ri: StreetEntry,
): string {
  const unit = stackMode;
  const stackBB = stackInBB(stackSize, stackMode, bbDollars);
  const stackDisplay = stackMode === "$" ? `$${stackSize} (~${stackBB}BB)` : `${stackSize}BB`;

  const fmtEntry = (e: StreetEntry) => {
    const ctx = e.context ? `[Before: ${e.context}] ` : "";
    const amt = e.amount
      ? (stackMode==="$" ? ` $${e.amount} (~${Math.round(parseFloat(e.amount)/(parseFloat(bbDollars)||1))}BB)` : ` ${e.amount}BB`)
      : "";
    return `${ctx}Hero: ${e.action}${amt}`;
  };

  const lines = [
    `Hero: [${holeCards[0]??"???"} ${holeCards[1]??"???"}] | Position: ${position} | Stack: ${stackDisplay} | ${numPlayers} players`,
    `Preflop: ${fmtEntry(pf)}`,
  ];
  if (pf.action!=="Fold" && flop[0] && flop[1] && flop[2]) {
    lines.push(`Flop [${flop[0]} ${flop[1]} ${flop[2]}]: ${fmtEntry(fl)}`);
    if (fl.action!=="Fold" && turn) {
      lines.push(`Turn [${turn}]: ${fmtEntry(tu)}`);
      if (tu.action!=="Fold" && river) {
        lines.push(`River [${river}]: ${fmtEntry(ri)}`);
      }
    }
  }
  return lines.join("\n");
}

// ─── Card Slot ────────────────────────────────────────────────────────────────

function CardSlot({ card, onPress, size = 52, colors }: {
  card: Card; onPress: () => void; size?: number; colors: any;
}) {
  const p = parseCard(card);
  const w = size; const h = Math.round(size * 1.36);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        width: w, height: h, borderRadius: 8,
        backgroundColor: p ? "#fff" : colors.bg.tertiary,
        borderWidth: 2, borderStyle: p ? "solid" : "dashed",
        borderColor: p ? colors.border.brand : colors.border.strong,
        alignItems:"center", justifyContent:"center",
        shadowColor: p ? colors.bg.brand : "transparent",
        shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width:0, height:2 },
        elevation: p ? 4 : 0,
      }}>
      {p ? (
        <View style={{ alignItems:"center" }}>
          <Text style={{ fontSize: size*0.32, fontWeight:"800", lineHeight: size*0.38, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
          <Text style={{ fontSize: size*0.26, fontWeight:"700", lineHeight: size*0.32, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
        </View>
      ) : (
        <MaterialCommunityIcons name="plus" size={size*0.36} color={colors.text.tertiary} />
      )}
    </TouchableOpacity>
  );
}

// ─── Card Picker Dot Progress ─────────────────────────────────────────────────

function SlotDots({ slot }: { slot: SlotKey }) {
  const groups: SlotKey[][] = [["hole1","hole2"],["flop1","flop2","flop3"]];
  const group = groups.find(g => g.includes(slot));
  if (!group || group.length < 2) return null;
  return (
    <View style={{ flexDirection:"row", gap:5, alignItems:"center" }}>
      {group.map(s => (
        <View key={s} style={{
          width: s===slot ? 18 : 6, height:6, borderRadius:3,
          backgroundColor: s===slot ? "#f59e0b" : "rgba(255,255,255,0.25)",
        }} />
      ))}
    </View>
  );
}

// ─── Card Picker Modal ────────────────────────────────────────────────────────

function CardPickerModal({ visible, activeSlot, usedCards, onSelect, onClose, colors }: {
  visible: boolean; activeSlot: SlotKey|null; usedCards: string[];
  onSelect: (c: string) => void; onClose: () => void; colors: any;
}) {
  const label = activeSlot ? SLOT_LABEL[activeSlot] : "Select Card";
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, justifyContent:"flex-end", backgroundColor:"rgba(0,0,0,0.7)" }}>
        <View style={{ backgroundColor: colors.bg.secondary, borderTopLeftRadius:24, borderTopRightRadius:24, padding:16, paddingBottom:36 }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <View style={{ gap:4 }}>
              <Text style={{ color: colors.text.primary, fontSize:16, fontWeight:"700" }}>{label}</Text>
              {activeSlot && <SlotDots slot={activeSlot} />}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection:"row", marginTop:12, marginBottom:4, paddingLeft:24 }}>
            {RANKS.map(r => (
              <View key={r} style={{ flex:1, alignItems:"center" }}>
                <Text style={{ color: colors.text.tertiary, fontSize:8, fontWeight:"600" }}>{r}</Text>
              </View>
            ))}
          </View>
          {SUITS.map(suit => (
            <View key={suit} style={{ flexDirection:"row", alignItems:"center", marginBottom:5 }}>
              <Text style={{ width:22, fontSize:14, fontWeight:"700", color: isRed(suit) ? "#dc2626" : colors.text.primary }}>{SUIT_SYMBOLS[suit]}</Text>
              {RANKS.map(rank => {
                const cs = `${rank}${suit}`;
                const used = usedCards.includes(cs);
                return (
                  <TouchableOpacity key={cs} disabled={used} onPress={() => onSelect(cs)} activeOpacity={0.7}
                    style={{
                      flex:1, marginHorizontal:1, paddingVertical:7, borderRadius:5, alignItems:"center",
                      backgroundColor: used ? "transparent" : isRed(suit) ? "rgba(220,38,38,0.12)" : colors.bg.tertiary,
                      borderWidth:1,
                      borderColor: used ? colors.border.subtle : isRed(suit) ? "rgba(220,38,38,0.3)" : colors.border.default,
                    }}>
                    <Text style={{ fontSize:11, fontWeight:"700", color: used ? colors.text.disabled : isRed(suit) ? "#dc2626" : colors.text.primary }}>
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

// ─── Step Progress Bar ────────────────────────────────────────────────────────

function StepBar({ step, steps, colors }: { step: Step; steps: Step[]; colors: any }) {
  const idx = steps.indexOf(step);
  return (
    <View style={{ flexDirection:"row", alignItems:"center", paddingHorizontal:20, paddingVertical:14 }}>
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <View key={s} style={{ flex: i < steps.length-1 ? 1 : undefined, flexDirection:"row", alignItems:"center" }}>
            <View style={{ alignItems:"center" }}>
              <View style={{
                width: active ? 28 : 22, height: active ? 28 : 22,
                borderRadius: 14,
                backgroundColor: done ? colors.bg.brand : active ? colors.bg.brand : colors.bg.tertiary,
                borderWidth: active ? 0 : 1.5,
                borderColor: done ? colors.border.brand : active ? colors.border.brand : colors.border.default,
                alignItems:"center", justifyContent:"center",
              }}>
                {done
                  ? <MaterialCommunityIcons name="check" size={13} color={colors.text.onBrand} />
                  : <Text style={{ fontSize: active ? 11 : 10, fontWeight:"800", color: active ? colors.text.onBrand : colors.text.tertiary }}>{i+1}</Text>
                }
              </View>
              <Text style={{ fontSize:9, fontWeight: active ? "700" : "500", color: active ? colors.text.brand : done ? colors.text.secondary : colors.text.tertiary, marginTop:3 }}>
                {STEP_LABEL[s]}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View style={{ flex:1, height:2, marginHorizontal:4, marginBottom:14,
                backgroundColor: done ? colors.bg.brand : colors.border.default }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Action Entry (per street) ────────────────────────────────────────────────

function ActionEntry({ entry, onChange, stackMode, colors, radius }: {
  entry: StreetEntry; onChange: (e: StreetEntry) => void;
  stackMode: StackMode; colors: any; radius: any;
}) {
  return (
    <View style={{ gap:14 }}>
      {/* Context */}
      <View>
        <Text style={{ color: colors.text.secondary, fontSize:12, fontWeight:"600", marginBottom:6 }}>
          Action before you <Text style={{ color: colors.text.tertiary, fontWeight:"400" }}>(optional)</Text>
        </Text>
        <TextInput
          value={entry.context}
          onChangeText={t => onChange({ ...entry, context: t })}
          placeholder="e.g. UTG raised to 3BB, BTN called"
          placeholderTextColor={colors.text.tertiary}
          multiline
          style={{
            backgroundColor: colors.bg.tertiary, borderRadius: radius.sm,
            borderWidth:1, borderColor: colors.border.default,
            paddingHorizontal:12, paddingVertical:10,
            color: colors.text.primary, fontSize:14, lineHeight:20,
          }}
        />
      </View>

      {/* Hero action */}
      <View>
        <Text style={{ color: colors.text.secondary, fontSize:12, fontWeight:"600", marginBottom:8 }}>Your action</Text>
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
          {ACTIONS.map(a => {
            const active = entry.action === a;
            const isBad = a === "Fold";
            const activeColor = isBad ? "#ef4444" : colors.bg.brand;
            const activeBorder = isBad ? "#ef4444" : colors.border.brand;
            return (
              <TouchableOpacity key={a} onPress={() => onChange({ ...entry, action: a, amount: "" })}
                style={{
                  paddingHorizontal:16, paddingVertical:10, borderRadius: radius.full,
                  backgroundColor: active ? activeColor : colors.bg.tertiary,
                  borderWidth:1.5,
                  borderColor: active ? activeBorder : colors.border.default,
                  flexDirection:"row", alignItems:"center", gap:4,
                }}>
                {a === "Fold" && <MaterialCommunityIcons name="flag-outline" size={13} color={active ? "#fff" : colors.text.tertiary} />}
                {(a === "Raise" || a === "Bet") && <MaterialCommunityIcons name="trending-up" size={13} color={active ? "#fff" : colors.text.tertiary} />}
                {a === "All-in" && <MaterialCommunityIcons name="fire" size={13} color={active ? "#fff" : "#f97316"} />}
                <Text style={{ fontSize:13, fontWeight:"700", color: active ? "#fff" : colors.text.primary }}>{a}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Amount */}
      {needsAmount(entry.action) && (
        <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
          <TextInput
            value={entry.amount}
            onChangeText={t => onChange({ ...entry, amount: t })}
            placeholder="Amount"
            placeholderTextColor={colors.text.tertiary}
            keyboardType="numeric"
            style={{
              flex:1, backgroundColor: colors.bg.tertiary, borderRadius: radius.sm,
              borderWidth:1, borderColor: colors.border.brand,
              paddingHorizontal:12, paddingVertical:10,
              color: colors.text.primary, fontSize:14, fontWeight:"600",
            }}
          />
          <Text style={{ color: colors.text.secondary, fontSize:14, fontWeight:"700", minWidth:28 }}>{stackMode}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Results: Grade Badge + Street Panel ──────────────────────────────────────

function GradeBadge({ grade, colors }: { grade: string; colors: any }) {
  return (
    <View style={{ width:38, height:38, borderRadius:19, backgroundColor: gradeColor(grade, colors), alignItems:"center", justifyContent:"center" }}>
      <Text style={{ color:"#fff", fontSize:17, fontWeight:"900" }}>{grade}</Text>
    </View>
  );
}

function StreetPanel({ street, data, boardCards, colors }: {
  street: string; data: StreetAnalysis; boardCards?: Card[]; colors: any;
}) {
  const boards = (boardCards ?? []).filter(Boolean);
  return (
    <View style={{ backgroundColor: colors.bg.secondary, borderRadius:16, borderWidth:1, borderColor: colors.border.default, padding:16, marginBottom:12 }}>
      <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <Text style={{ color: colors.text.primary, fontSize:16, fontWeight:"700" }}>{street}</Text>
        <GradeBadge grade={data.grade} colors={colors} />
      </View>
      {boards.length > 0 && (
        <View style={{ flexDirection:"row", gap:6, marginBottom:10 }}>
          {boards.map((c, i) => {
            const p = parseCard(c);
            return p ? (
              <View key={i} style={{ width:34, height:46, borderRadius:5, backgroundColor:"#fff", alignItems:"center", justifyContent:"center" }}>
                <Text style={{ fontSize:13, fontWeight:"800", lineHeight:16, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
                <Text style={{ fontSize:11, fontWeight:"700", lineHeight:13, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
              </View>
            ) : null;
          })}
        </View>
      )}
      {([["Action",data.heroAction],["Assessment",data.assessment],["Suggestion",data.suggestion],["Reasoning",data.reasoning]] as const).map(([l,v]) => (
        <Text key={l} style={{ color: colors.text.secondary, fontSize:13, marginBottom:5, lineHeight:18 }}>
          <Text style={{ fontWeight:"700", color: colors.text.primary }}>{l}: </Text>{v}
        </Text>
      ))}
    </View>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────

function HistoryModal({ visible, onClose, colors, radius }: {
  visible: boolean; onClose: () => void; colors: any; radius: any;
}) {
  const [items] = useState(() => getHandReviews(30));
  const [expanded, setExpanded] = useState<HandReview|null>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor: colors.bg.primary }}>
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:16, paddingTop:56, borderBottomWidth:1, borderColor: colors.border.default }}>
          <Text style={{ color: colors.text.primary, fontSize:18, fontWeight:"800" }}>
            {expanded ? "Hand Detail" : "Review History"}
          </Text>
          <TouchableOpacity onPress={() => { if (expanded) setExpanded(null); else onClose(); }} hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
            <MaterialCommunityIcons name={expanded ? "arrow-left" : "close"} size={24} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:40 }} showsVerticalScrollIndicator={false}>
          {expanded ? (
            (() => {
              let parsed: AIResult|null = null;
              try { parsed = JSON.parse(expanded.result_json); } catch {}
              if (!parsed) return <Text style={{ color: colors.text.secondary }}>Could not load.</Text>;
              return (
                <>
                  <View style={{ flexDirection:"row", alignItems:"center", gap:10, marginBottom:16 }}>
                    <Text style={{ color: colors.text.primary, fontSize:20, fontWeight:"800" }}>{expanded.hole_cards}</Text>
                    <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.full, paddingHorizontal:10, paddingVertical:4 }}>
                      <Text style={{ color: colors.text.secondary, fontSize:12, fontWeight:"700" }}>{expanded.position} · {expanded.num_players}p · {expanded.stack_display}</Text>
                    </View>
                    <MaterialCommunityIcons name={gradeIsGood(expanded.overall_grade) ? "check-circle" : "close-circle"} size={26} color={gradeIsGood(expanded.overall_grade) ? "#22c55e" : "#ef4444"} style={{ marginLeft:"auto" }} />
                  </View>
                  {parsed.preflop && <StreetPanel street="Preflop" data={parsed.preflop} colors={colors} />}
                  {parsed.flop && <StreetPanel street="Flop" data={parsed.flop} colors={colors} />}
                  {parsed.turn && <StreetPanel street="Turn" data={parsed.turn} colors={colors} />}
                  {parsed.river && <StreetPanel street="River" data={parsed.river} colors={colors} />}
                  <View style={{ backgroundColor: colors.bg.secondary, borderRadius:16, borderWidth:1, borderColor: colors.border.brand, padding:16 }}>
                    <Text style={{ color: colors.text.brand, fontSize:12, fontWeight:"700", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Summary</Text>
                    <Text style={{ color: colors.text.primary, fontSize:14, lineHeight:21 }}>{parsed.summary}</Text>
                  </View>
                </>
              );
            })()
          ) : items.length === 0 ? (
            <View style={{ alignItems:"center", marginTop:60, gap:12 }}>
              <MaterialCommunityIcons name="cards-playing-outline" size={52} color={colors.text.tertiary} />
              <Text style={{ color: colors.text.tertiary, fontSize:15 }}>No reviews saved yet</Text>
            </View>
          ) : items.map(item => {
            const good = gradeIsGood(item.overall_grade);
            const date = new Date(item.created_at);
            return (
              <TouchableOpacity key={item.id} onPress={() => setExpanded(item)}
                style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth:1, borderColor: colors.border.default, padding:14, marginBottom:10, flexDirection:"row", alignItems:"center", gap:12 }}>
                <MaterialCommunityIcons name={good ? "check-circle" : "close-circle"} size={34} color={good ? "#22c55e" : "#ef4444"} />
                <View style={{ flex:1 }}>
                  <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:3 }}>
                    <Text style={{ color: colors.text.primary, fontSize:17, fontWeight:"800" }}>{item.hole_cards}</Text>
                    <View style={{ backgroundColor: good ? "#22c55e18" : "#ef444418", borderRadius: radius.full, paddingHorizontal:8, paddingVertical:2 }}>
                      <Text style={{ color: good ? "#22c55e" : "#ef4444", fontSize:11, fontWeight:"800" }}>Grade {item.overall_grade}</Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.text.secondary, fontSize:12 }}>{item.position} · {item.num_players}p · {item.stack_display}</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize:11, marginTop:2 }}>
                    {date.toLocaleDateString(undefined,{month:"short",day:"numeric"})} · {date.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}
                  </Text>
                </View>
                <View style={{ width:36, height:36, borderRadius:18, backgroundColor: gradeColor(item.overall_grade, colors), alignItems:"center", justifyContent:"center" }}>
                  <Text style={{ color:"#fff", fontSize:16, fontWeight:"900" }}>{item.overall_grade}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HandReviewScreen() {
  const { colors, radius } = usePokerTheme();

  // ── Hand state ──
  const [numPlayers, setNumPlayers] = useState(6);
  const [heroPosition, setHeroPosition] = useState<Position>("BTN");
  const [stackSize, setStackSize] = useState("100");
  const [stackMode, setStackMode] = useState<StackMode>("BB");
  const [bbDollars, setBbDollars] = useState("2");
  const [holeCards, setHoleCards] = useState<[Card,Card]>([null,null]);
  const [flop, setFlop] = useState<[Card,Card,Card]>([null,null,null]);
  const [turn, setTurn] = useState<Card>(null);
  const [river, setRiver] = useState<Card>(null);
  const [pfEntry, setPfEntry] = useState<StreetEntry>(defaultEntry);
  const [flEntry, setFlEntry] = useState<StreetEntry>(defaultEntry);
  const [tuEntry, setTuEntry] = useState<StreetEntry>(defaultEntry);
  const [riEntry, setRiEntry] = useState<StreetEntry>(defaultEntry);

  // ── Wizard state ──
  const [step, setStep] = useState<Step>("setup");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotKey|null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // ── Derived ──
  const holesOk = !!(holeCards[0] && holeCards[1]);
  const flopOk  = !!(flop[0] && flop[1] && flop[2]);
  const pfFolded = pfEntry.action === "Fold";
  const flFolded = flEntry.action === "Fold";
  const tuFolded = tuEntry.action === "Fold";
  const allUsed  = allSelected(holeCards, flop, turn, river);
  const availablePositions = POSITIONS_BY_COUNT[numPlayers] ?? [];

  // Visible steps for progress bar
  const steps: Step[] = ["setup","deal","preflop",
    ...(!pfFolded ? ["flop" as Step] : []),
    ...(!pfFolded && !flFolded ? ["turn" as Step] : []),
    ...(!pfFolded && !flFolded && !tuFolded ? ["river" as Step] : []),
  ];

  // ── Navigation ──
  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    if (step === "preflop" && pfFolded) { analyzeHand(); return; }
    if (step === "flop"    && flFolded) { analyzeHand(); return; }
    if (step === "turn"    && tuFolded) { analyzeHand(); return; }
    if (step === "river")              { analyzeHand(); return; }
    // Advance to next valid step
    if (step === "preflop" && !pfFolded) { setStep("flop"); return; }
    if (step === "flop"    && !flFolded) { setStep("turn"); return; }
    if (step === "turn"    && !tuFolded) { setStep("river"); return; }
    setStep(STEP_ORDER[idx + 1] as Step);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1] as Step);
  }

  function reset() {
    setStep("setup"); setHoleCards([null,null]);
    setFlop([null,null,null]); setTurn(null); setRiver(null);
    setPfEntry(defaultEntry()); setFlEntry(defaultEntry());
    setTuEntry(defaultEntry()); setRiEntry(defaultEntry());
    setResult(null); setError(null);
  }

  // ── Card picker ──
  function openPicker(slot: SlotKey) {
    let start: SlotKey = slot;
    if (slot === "hole2" && !holeCards[0]) start = "hole1";
    if (slot === "flop2" && !flop[0]) start = "flop1";
    if (slot === "flop3") {
      if (!flop[0]) start = "flop1";
      else if (!flop[1]) start = "flop2";
    }
    setActiveSlot(start); setPickerVisible(true);
  }

  function handleCardSelect(cardStr: string) {
    if (!activeSlot) return;
    const c = cardStr as Card;
    if      (activeSlot==="hole1") setHoleCards([c, holeCards[1]]);
    else if (activeSlot==="hole2") setHoleCards([holeCards[0], c]);
    else if (activeSlot==="flop1") setFlop([c, flop[1], flop[2]]);
    else if (activeSlot==="flop2") setFlop([flop[0], c, flop[2]]);
    else if (activeSlot==="flop3") setFlop([flop[0], flop[1], c]);
    else if (activeSlot==="turn")  setTurn(c);
    else if (activeSlot==="river") setRiver(c);
    const next = SLOT_NEXT[activeSlot];
    if (next) { setActiveSlot(next); }
    else { setPickerVisible(false); setActiveSlot(null); }
  }

  // ── Analyze ──
  async function analyzeHand() {
    if (!holesOk) { setStep("deal"); return; }
    setLoading(true); setError(null); setResult(null);
    const msg = buildUserMessage(
      holeCards, heroPosition, stackSize, stackMode, bbDollars,
      numPlayers, flop, turn, river, pfEntry, flEntry, tuEntry, riEntry,
    );
    try {
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ userMessage: msg }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any)?.error ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      const text: string = data.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Unexpected response from server");
      const parsed = JSON.parse(match[0]) as AIResult;
      setResult(parsed);
      try {
        addHandReview({
          holeCards: `${holeCards[0]} ${holeCards[1]}`,
          position: heroPosition, numPlayers,
          stackDisplay: stackMode==="$" ? `$${stackSize}` : `${stackSize}BB`,
          resultJson: JSON.stringify(parsed),
          overallGrade: overallGrade(parsed),
        });
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed");
    } finally { setLoading(false); }
  }

  // ── Is the Continue/Analyze button the analyze action? ──
  const isAnalyzeStep = step==="river" || (step==="preflop" && pfFolded) || (step==="flop" && flFolded) || (step==="turn" && tuFolded);
  const nextLabel = isAnalyzeStep ? "Analyze Hand" : step==="preflop" && !pfFolded ? "Flop →" : step==="flop" && !flFolded ? "Turn →" : step==="turn" && !tuFolded ? "River →" : "Continue →";

  // ── Results view ──
  if (result) {
    const grade = overallGrade(result);
    return (
      <View style={{ flex:1, backgroundColor: colors.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:140 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800" }}>Hand Analysis</Text>
              <View style={{ flexDirection:"row", alignItems:"center", gap:6, marginTop:4 }}>
                <MaterialCommunityIcons name={gradeIsGood(grade) ? "check-circle" : "close-circle"} size={18} color={gradeIsGood(grade) ? "#22c55e" : "#ef4444"} />
                <Text style={{ color: gradeIsGood(grade) ? "#22c55e" : "#ef4444", fontSize:13, fontWeight:"700" }}>
                  {gradeIsGood(grade) ? "Well played" : "Needs improvement"} · Grade {grade}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => { setHistoryKey(k => k+1); setHistoryVisible(true); }}
              style={{ flexDirection:"row", alignItems:"center", gap:4, paddingVertical:7, paddingHorizontal:11, borderRadius: radius.full, borderWidth:1, borderColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
              <MaterialCommunityIcons name="history" size={14} color={colors.text.secondary} />
              <Text style={{ color: colors.text.secondary, fontSize:12, fontWeight:"600" }}>History</Text>
            </TouchableOpacity>
          </View>

          {/* Hand summary card */}
          <View style={{ backgroundColor: colors.bg.secondary, borderRadius:16, borderWidth:1, borderColor: colors.border.default, padding:14, marginBottom:16, flexDirection:"row", alignItems:"center", gap:12 }}>
            <View style={{ flexDirection:"row", gap:6 }}>
              {holeCards.map((c,i) => {
                const p = parseCard(c);
                return p ? (
                  <View key={i} style={{ width:36, height:50, borderRadius:6, backgroundColor:"#fff", alignItems:"center", justifyContent:"center" }}>
                    <Text style={{ fontSize:14, fontWeight:"800", lineHeight:17, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
                    <Text style={{ fontSize:12, fontWeight:"700", lineHeight:14, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
                  </View>
                ) : null;
              })}
            </View>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:15, fontWeight:"700" }}>{heroPosition} · {numPlayers} players</Text>
              <Text style={{ color: colors.text.secondary, fontSize:12, marginTop:2 }}>
                {stackMode==="$" ? `$${stackSize}` : `${stackSize}BB`} effective stack
              </Text>
            </View>
          </View>

          {/* Streets */}
          {result.preflop && <StreetPanel street="Preflop" data={result.preflop} colors={colors} />}
          {result.flop && <StreetPanel street="Flop" data={result.flop} boardCards={[flop[0],flop[1],flop[2]]} colors={colors} />}
          {result.turn && <StreetPanel street="Turn" data={result.turn} boardCards={[turn]} colors={colors} />}
          {result.river && <StreetPanel street="River" data={result.river} boardCards={[river]} colors={colors} />}

          {/* Summary */}
          <View style={{ backgroundColor: colors.bg.secondary, borderRadius:16, borderWidth:1, borderColor: colors.border.brand, padding:16, marginBottom:20 }}>
            <Text style={{ color: colors.text.brand, fontSize:12, fontWeight:"700", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Summary</Text>
            <Text style={{ color: colors.text.primary, fontSize:14, lineHeight:22 }}>{result.summary}</Text>
          </View>

          <TouchableOpacity onPress={reset} style={{ backgroundColor: colors.bg.brand, borderRadius: radius.md, paddingVertical:16, alignItems:"center" }}>
            <Text style={{ color: colors.text.onBrand, fontSize:16, fontWeight:"700" }}>Review Another Hand</Text>
          </TouchableOpacity>
        </ScrollView>

        <HistoryModal key={historyKey} visible={historyVisible} onClose={() => setHistoryVisible(false)} colors={colors} radius={radius} />
      </View>
    );
  }

  // ── Wizard input view ──
  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios" ? "padding" : undefined}>
      {/* Step bar */}
      <View style={{ backgroundColor: colors.bg.primary, borderBottomWidth:1, borderColor: colors.border.default }}>
        <StepBar step={step} steps={steps} colors={colors} />
      </View>

      <ScrollView
        style={{ flex:1, backgroundColor: colors.bg.primary }}
        contentContainerStyle={{ padding:16, paddingBottom:120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── SETUP ── */}
        {step === "setup" && (
          <View style={{ gap:24 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800", marginBottom:4 }}>Setup Hand</Text>
              <Text style={{ color: colors.text.secondary, fontSize:14 }}>Configure the table before reviewing</Text>
            </View>

            {/* Players */}
            <View>
              <Text style={{ color: colors.text.secondary, fontSize:13, fontWeight:"700", marginBottom:10 }}>Number of players</Text>
              <View style={{ flexDirection:"row", gap:6 }}>
                {[2,3,4,5,6,7,8,9].map(n => (
                  <TouchableOpacity key={n} onPress={() => setNumPlayers(n)}
                    style={{ flex:1, paddingVertical:12, borderRadius: radius.sm, alignItems:"center",
                      backgroundColor: numPlayers===n ? colors.bg.brand : colors.bg.secondary,
                      borderWidth:1.5, borderColor: numPlayers===n ? colors.border.brand : colors.border.default }}>
                    <Text style={{ fontSize:14, fontWeight:"800", color: numPlayers===n ? colors.text.onBrand : colors.text.primary }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hero position */}
            <View>
              <Text style={{ color: colors.text.secondary, fontSize:13, fontWeight:"700", marginBottom:10 }}>Your position</Text>
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                {POSITIONS.map(p => {
                  const available = availablePositions.includes(p);
                  const active = heroPosition === p;
                  return (
                    <TouchableOpacity key={p} onPress={() => available && setHeroPosition(p)} disabled={!available}
                      style={{ paddingHorizontal:16, paddingVertical:11, borderRadius: radius.full,
                        backgroundColor: active ? colors.bg.brand : available ? colors.bg.secondary : "transparent",
                        borderWidth:1.5, borderColor: active ? colors.border.brand : available ? colors.border.default : colors.border.subtle,
                        opacity: available ? 1 : 0.3 }}>
                      <Text style={{ fontSize:13, fontWeight:"800", color: active ? colors.text.onBrand : colors.text.primary }}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Stack */}
            <View>
              <Text style={{ color: colors.text.secondary, fontSize:13, fontWeight:"700", marginBottom:10 }}>Effective stack</Text>
              <View style={{ flexDirection:"row", gap:6, marginBottom:10 }}>
                {(["BB","$"] as StackMode[]).map(m => (
                  <TouchableOpacity key={m} onPress={() => setStackMode(m)}
                    style={{ paddingHorizontal:20, paddingVertical:10, borderRadius: radius.full,
                      backgroundColor: stackMode===m ? colors.bg.brand : colors.bg.secondary,
                      borderWidth:1.5, borderColor: stackMode===m ? colors.border.brand : colors.border.default }}>
                    <Text style={{ fontSize:14, fontWeight:"800", color: stackMode===m ? colors.text.onBrand : colors.text.primary }}>{m}</Text>
                  </TouchableOpacity>
                ))}
                {stackMode==="$" && (
                  <View style={{ flex:1, flexDirection:"row", alignItems:"center", gap:6 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize:12 }}>1BB =</Text>
                    <TextInput value={bbDollars} onChangeText={setBbDollars} placeholder="2"
                      placeholderTextColor={colors.text.tertiary} keyboardType="numeric"
                      style={{ flex:1, backgroundColor: colors.bg.secondary, borderRadius:8, borderWidth:1, borderColor: colors.border.default, paddingHorizontal:10, paddingVertical:8, color: colors.text.primary, fontSize:13 }} />
                    <Text style={{ color: colors.text.tertiary, fontSize:12 }}>$</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
                <TextInput value={stackSize} onChangeText={setStackSize}
                  placeholder={stackMode==="BB" ? "100" : "200"}
                  placeholderTextColor={colors.text.tertiary} keyboardType="numeric"
                  style={{ flex:1, backgroundColor: colors.bg.secondary, borderRadius:10, borderWidth:1.5, borderColor: colors.border.default, paddingHorizontal:14, paddingVertical:12, color: colors.text.primary, fontSize:16, fontWeight:"600" }} />
                <Text style={{ color: colors.text.secondary, fontSize:14, fontWeight:"700", minWidth:28 }}>{stackMode}</Text>
              </View>
              {stackSize ? (
                <Text style={{ color: colors.text.tertiary, fontSize:12, marginTop:6 }}>
                  {stackMode==="$" && bbDollars
                    ? `≈ ${stackInBB(stackSize,stackMode,bbDollars)} BB`
                    : `≈ $${((parseFloat(stackSize)||0)*(parseFloat(bbDollars)||1)).toFixed(0)}`
                  }
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ── DEAL ── */}
        {step === "deal" && (
          <View style={{ gap:24 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800", marginBottom:4 }}>Your Hole Cards</Text>
              <Text style={{ color: colors.text.secondary, fontSize:14 }}>Tap a card slot to pick — both cards are picked in one flow</Text>
            </View>

            <View style={{ flexDirection:"row", gap:16, justifyContent:"center", marginTop:8 }}>
              <CardSlot card={holeCards[0]} onPress={() => openPicker("hole1")} size={80} colors={colors} />
              <CardSlot card={holeCards[1]} onPress={() => openPicker("hole2")} size={80} colors={colors} />
            </View>

            {holesOk && (
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius:14, borderWidth:1, borderColor: colors.border.default, padding:14, flexDirection:"row", alignItems:"center", gap:10 }}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.text.brand} />
                <Text style={{ color: colors.text.secondary, fontSize:13, flex:1, lineHeight:18 }}>
                  <Text style={{ fontWeight:"700", color: colors.text.primary }}>{holeCards[0]} {holeCards[1]} </Text>
                  from <Text style={{ fontWeight:"700", color: colors.text.brand }}>{heroPosition}</Text>. Tap a card to change it.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── PREFLOP ── */}
        {step === "preflop" && (
          <View style={{ gap:20 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800", marginBottom:4 }}>Preflop</Text>
              <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                {holeCards.map((c,i) => { const p = parseCard(c); return p ? (
                  <View key={i} style={{ width:32, height:44, borderRadius:5, backgroundColor:"#fff", alignItems:"center", justifyContent:"center" }}>
                    <Text style={{ fontSize:12, fontWeight:"800", lineHeight:14, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
                    <Text style={{ fontSize:10, fontWeight:"700", lineHeight:12, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
                  </View>) : null; })}
                <Text style={{ color: colors.text.tertiary, fontSize:13 }}>· {heroPosition} · {numPlayers} players</Text>
              </View>
            </View>
            <ActionEntry entry={pfEntry} onChange={setPfEntry} stackMode={stackMode} colors={colors} radius={radius} />
          </View>
        )}

        {/* ── FLOP ── */}
        {step === "flop" && (
          <View style={{ gap:20 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800", marginBottom:4 }}>Flop</Text>
              <Text style={{ color: colors.text.secondary, fontSize:14 }}>Select the 3 flop cards then enter the action</Text>
            </View>
            <View>
              <Text style={{ color: colors.text.secondary, fontSize:13, fontWeight:"700", marginBottom:10 }}>Board cards</Text>
              <View style={{ flexDirection:"row", gap:10 }}>
                <CardSlot card={flop[0]} onPress={() => openPicker("flop1")} size={60} colors={colors} />
                <CardSlot card={flop[1]} onPress={() => openPicker("flop2")} size={60} colors={colors} />
                <CardSlot card={flop[2]} onPress={() => openPicker("flop3")} size={60} colors={colors} />
              </View>
            </View>
            {flopOk && (
              <View style={{ borderTopWidth:1, borderColor: colors.border.default, paddingTop:20 }}>
                <ActionEntry entry={flEntry} onChange={setFlEntry} stackMode={stackMode} colors={colors} radius={radius} />
              </View>
            )}
          </View>
        )}

        {/* ── TURN ── */}
        {step === "turn" && (
          <View style={{ gap:20 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800", marginBottom:4 }}>Turn</Text>
              <View style={{ flexDirection:"row", gap:6, marginTop:2 }}>
                {[...flop].map((c,i) => { const p=parseCard(c); return p?(
                  <View key={i} style={{ width:28,height:38,borderRadius:4,backgroundColor:"#fff",alignItems:"center",justifyContent:"center" }}>
                    <Text style={{ fontSize:10,fontWeight:"800",lineHeight:12,color:isRed(p.suit)?"#dc2626":"#1e293b" }}>{p.rank}</Text>
                    <Text style={{ fontSize:9,fontWeight:"700",lineHeight:11,color:isRed(p.suit)?"#dc2626":"#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
                  </View>):null;})}
              </View>
            </View>
            <View>
              <Text style={{ color: colors.text.secondary, fontSize:13, fontWeight:"700", marginBottom:10 }}>Turn card</Text>
              <CardSlot card={turn} onPress={() => openPicker("turn")} size={60} colors={colors} />
            </View>
            {turn && (
              <View style={{ borderTopWidth:1, borderColor: colors.border.default, paddingTop:20 }}>
                <ActionEntry entry={tuEntry} onChange={setTuEntry} stackMode={stackMode} colors={colors} radius={radius} />
              </View>
            )}
          </View>
        )}

        {/* ── RIVER ── */}
        {step === "river" && (
          <View style={{ gap:20 }}>
            <View>
              <Text style={{ color: colors.text.primary, fontSize:22, fontWeight:"800", marginBottom:4 }}>River</Text>
              <View style={{ flexDirection:"row", gap:6, marginTop:2 }}>
                {[...flop, turn].map((c,i) => { const p=parseCard(c); return p?(
                  <View key={i} style={{ width:28,height:38,borderRadius:4,backgroundColor:"#fff",alignItems:"center",justifyContent:"center" }}>
                    <Text style={{ fontSize:10,fontWeight:"800",lineHeight:12,color:isRed(p.suit)?"#dc2626":"#1e293b" }}>{p.rank}</Text>
                    <Text style={{ fontSize:9,fontWeight:"700",lineHeight:11,color:isRed(p.suit)?"#dc2626":"#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
                  </View>):null;})}
              </View>
            </View>
            <View>
              <Text style={{ color: colors.text.secondary, fontSize:13, fontWeight:"700", marginBottom:10 }}>River card</Text>
              <CardSlot card={river} onPress={() => openPicker("river")} size={60} colors={colors} />
            </View>
            {river && (
              <View style={{ borderTopWidth:1, borderColor: colors.border.default, paddingTop:20 }}>
                <ActionEntry entry={riEntry} onChange={setRiEntry} stackMode={stackMode} colors={colors} radius={radius} />
              </View>
            )}
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={{ backgroundColor: colors.bg.danger+"18", borderWidth:1, borderColor: colors.border.danger, borderRadius: radius.sm, padding:12, marginTop:16, flexDirection:"row", alignItems:"center", gap:8 }}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.text.danger} />
            <Text style={{ color: colors.text.danger, fontSize:13, flex:1 }}>{error}</Text>
            <TouchableOpacity onPress={analyzeHand}>
              <Text style={{ color: colors.text.brand, fontSize:13, fontWeight:"700" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom navigation ── */}
      <View style={{
        position:"absolute", bottom:0, left:0, right:0,
        backgroundColor: colors.bg.primary,
        borderTopWidth:1, borderColor: colors.border.default,
        paddingHorizontal:16, paddingTop:12, paddingBottom:Platform.OS==="ios" ? 34 : 16,
        flexDirection:"row", gap:12,
      }}>
        {/* Back / History */}
        <View style={{ flexDirection:"row", gap:8 }}>
          {step !== "setup" && (
            <TouchableOpacity onPress={goBack}
              style={{ paddingHorizontal:16, paddingVertical:14, borderRadius: radius.md, borderWidth:1.5, borderColor: colors.border.default, backgroundColor: colors.bg.secondary, flexDirection:"row", alignItems:"center", gap:6 }}>
              <MaterialCommunityIcons name="arrow-left" size={18} color={colors.text.secondary} />
              <Text style={{ color: colors.text.secondary, fontSize:14, fontWeight:"700" }}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { setHistoryKey(k => k+1); setHistoryVisible(true); }}
            style={{ paddingHorizontal:12, paddingVertical:14, borderRadius: radius.md, borderWidth:1.5, borderColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
            <MaterialCommunityIcons name="history" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Continue / Analyze */}
        <TouchableOpacity onPress={isAnalyzeStep ? analyzeHand : goNext}
          disabled={loading || (step==="deal" && !holesOk) || (step==="flop" && !flopOk) || (step==="turn" && !turn) || (step==="river" && !river)}
          activeOpacity={0.85}
          style={{
            flex:1, paddingVertical:14, borderRadius: radius.md, alignItems:"center",
            justifyContent:"center", flexDirection:"row", gap:8,
            backgroundColor: (step==="deal"&&!holesOk)||(step==="flop"&&!flopOk)||(step==="turn"&&!turn)||(step==="river"&&!river)
              ? colors.bg.tertiary : isAnalyzeStep ? "#7c3aed" : colors.bg.brand,
          }}>
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <MaterialCommunityIcons
                  name={isAnalyzeStep ? "robot-outline" : "arrow-right"}
                  size={18} color="#fff"
                />
                <Text style={{ color:"#fff", fontSize:15, fontWeight:"800" }}>
                  {loading ? "Analyzing…" : nextLabel}
                </Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* Card picker */}
      <CardPickerModal
        visible={pickerVisible} activeSlot={activeSlot}
        usedCards={allUsed.filter(c => {
          if (activeSlot==="hole1") return c!==holeCards[0];
          if (activeSlot==="hole2") return c!==holeCards[1];
          if (activeSlot==="flop1") return c!==flop[0];
          if (activeSlot==="flop2") return c!==flop[1];
          if (activeSlot==="flop3") return c!==flop[2];
          if (activeSlot==="turn")  return c!==turn;
          if (activeSlot==="river") return c!==river;
          return true;
        })}
        onSelect={handleCardSelect}
        onClose={() => { setPickerVisible(false); setActiveSlot(null); }}
        colors={colors}
      />

      {/* History */}
      <HistoryModal key={historyKey} visible={historyVisible} onClose={() => setHistoryVisible(false)} colors={colors} radius={radius} />
    </KeyboardAvoidingView>
  );
}
