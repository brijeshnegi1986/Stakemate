import { StyleSheet, Text, View } from "react-native";

function parseCard(card: string): { rank: string; suit: string; isRed: boolean } {
  const raw  = card.trim().toUpperCase();
  const rank = raw.slice(0, raw.length - 1) === "T" ? "10" : raw.slice(0, raw.length - 1);
  const suitChar = raw.slice(-1).toLowerCase();
  const suitMap: Record<string, string> = { h: "♥", d: "♦", s: "♠", c: "♣" };
  const suit   = suitMap[suitChar] ?? suitChar;
  const isRed  = suitChar === "h" || suitChar === "d";
  return { rank, suit, isRed };
}

type Size = "sm" | "md";

export function PlayingCard({ card, size = "md" }: { card: string; size?: Size }) {
  const { rank, suit, isRed } = parseCard(card);
  const color = isRed ? "#e53e3e" : "#1a202c";
  const isSm = size === "sm";

  return (
    <View style={[styles.card, isSm ? styles.cardSm : styles.cardMd]}>
      <Text style={[styles.rank, isSm ? styles.rankSm : styles.rankMd, { color }]}>{rank}</Text>
      <Text style={[styles.suit, isSm ? styles.suitSm : styles.suitMd, { color }]}>{suit}</Text>
    </View>
  );
}

export function CardRow({
  holeCards = [],
  boardCards = [],
  size = "md",
}: {
  holeCards?: string[];
  boardCards?: string[];
  size?: Size;
}) {
  const hasHole  = holeCards.length > 0;
  const hasBoard = boardCards.length > 0;
  if (!hasHole && !hasBoard) return null;

  // When both groups are present, show them as labeled columns
  if (hasHole && hasBoard) {
    return (
      <View style={styles.row}>
        {/* Hole cards group */}
        <View style={styles.group}>
          <Text style={styles.groupLabel}>MY HAND</Text>
          <View style={styles.cards}>
            {holeCards.map((c, i) => (
              <PlayingCard key={`h${i}`} card={c} size={size} />
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Board cards group */}
        <View style={styles.group}>
          <Text style={styles.groupLabel}>BOARD</Text>
          <View style={styles.cards}>
            {boardCards.map((c, i) => (
              <PlayingCard key={`b${i}`} card={c} size={size} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  // Single group — no label needed
  return (
    <View style={styles.cards}>
      {hasHole && holeCards.map((c, i) => (
        <PlayingCard key={`h${i}`} card={c} size={size} />
      ))}
      {hasBoard && boardCards.map((c, i) => (
        <PlayingCard key={`b${i}`} card={c} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  cardMd: { width: 42, height: 54, borderRadius: 7, gap: 2 },
  cardSm: { width: 32, height: 42, borderRadius: 5, gap: 1 },
  rank:   { fontWeight: "800" },
  rankMd: { fontSize: 15, fontWeight: "800" },
  rankSm: { fontSize: 11, fontWeight: "800" },
  suit:   {},
  suitMd: { fontSize: 13 },
  suitSm: { fontSize: 10 },
  // Row layout for two groups
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  group: {
    gap: 5,
  },
  groupLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  cards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#e2e8f0",
    marginTop: 18,
  },
});
