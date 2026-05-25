import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Text } from "react-native";

const RANK_MAP: Record<string, string> = {
  T: "10", J: "J", Q: "Q", K: "K", A: "A",
};

function tokenize(text: string): string[] {
  return text.split(/([2-9TJQKA][hdsc])/g);
}

interface Props {
  text: string;
  style?: object;
  baseColor: string;
}

export function CardText({ text, style, baseColor }: Props) {
  const { isDark } = usePokerTheme();
  const tokens = tokenize(text);

  // Hearts/diamonds: red on both themes. Spades/clubs: adapt to theme.
  const suitColors: Record<string, string> = {
    h: "#e53e3e",
    d: "#e53e3e",
    s: isDark ? "#cbd5e1" : "#1a1a2e",
    c: isDark ? "#4ade80" : "#276749",
  };

  return (
    <Text style={[{ lineHeight: 20 }, style]}>
      {tokens.map((token, i) => {
        if (/^[2-9TJQKA][hdsc]$/.test(token)) {
          const rank = RANK_MAP[token[0]] ?? token[0];
          const suitColor = suitColors[token[1]];
          return (
            <Text key={i} style={{ fontWeight: "800" }}>
              <Text style={{ color: baseColor }}>{rank}</Text>
              <Text style={{ color: suitColor }}>{token[1] === "h" ? "♥" : token[1] === "d" ? "♦" : token[1] === "s" ? "♠" : "♣"}</Text>
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
