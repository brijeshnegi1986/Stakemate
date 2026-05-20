import { Text } from "react-native";

const SUIT_MAP: Record<string, { symbol: string; color: string }> = {
  h: { symbol: "♥", color: "#e53e3e" },
  d: { symbol: "♦", color: "#e53e3e" },
  s: { symbol: "♠", color: "#1a1a2e" },
  c: { symbol: "♣", color: "#276749" },
};

const RANK_MAP: Record<string, string> = {
  T: "10", J: "J", Q: "Q", K: "K", A: "A",
};

// Splits text into plain strings and card tokens like "Ah", "Kd", "2s"
function tokenize(text: string): string[] {
  return text.split(/([2-9TJQKA][hdsc])/g);
}

interface Props {
  text: string;
  style?: object;
  baseColor: string;
}

export function CardText({ text, style, baseColor }: Props) {
  const tokens = tokenize(text);
  return (
    <Text style={[{ lineHeight: 20 }, style]}>
      {tokens.map((token, i) => {
        if (/^[2-9TJQKA][hdsc]$/.test(token)) {
          const rank = RANK_MAP[token[0]] ?? token[0];
          const suit = SUIT_MAP[token[1]];
          return (
            <Text key={i} style={{ fontWeight: "800" }}>
              <Text style={{ color: baseColor }}>{rank}</Text>
              <Text style={{ color: suit.color }}>{suit.symbol}</Text>
            </Text>
          );
        }
        return (
          <Text key={i} style={{ color: baseColor }}>{token}</Text>
        );
      })}
    </Text>
  );
}
