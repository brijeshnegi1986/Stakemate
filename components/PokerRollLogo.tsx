import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Text, View, type ViewStyle } from "react-native";

type Props = {
  size?: number;
  style?: ViewStyle;
};

// Matches the Figma PokerRoll logo:
// – rotated rounded-square background (brand, low opacity)
// – outer ring (subtle border)
// – inner ring (brand border)
// – "PR" monogram centred
export function PokerRollLogo({ size = 48, style }: Props) {
  const { colors } = usePokerTheme();

  // All sizes scaled from the 100px reference in Figma
  const squareSize = size * 0.79;
  const outerRing  = size * 0.71;
  const innerRing  = size * 0.63;
  const borderThick = Math.max(2, Math.round(size * 0.04));

  return (
    <View
      style={[
        { width: size, height: size, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      {/* Rotated rounded-square glow */}
      <View
        style={{
          position: "absolute",
          width: squareSize,
          height: squareSize,
          borderRadius: squareSize * 0.2,
          backgroundColor: colors.bg.brand,
          opacity: 0.14,
          transform: [{ rotate: "-15deg" }],
        }}
      />

      {/* Outer subtle ring */}
      <View
        style={{
          position: "absolute",
          width: outerRing,
          height: outerRing,
          borderRadius: outerRing / 2,
          borderWidth: borderThick,
          borderColor: colors.border.strong,
        }}
      />

      {/* Inner brand ring */}
      <View
        style={{
          position: "absolute",
          width: innerRing,
          height: innerRing,
          borderRadius: innerRing / 2,
          borderWidth: borderThick,
          borderColor: colors.border.brand,
        }}
      />

      {/* PR monogram */}
      <Text
        style={{
          color: colors.text.brand,
          fontSize: size * 0.22,
          fontWeight: "900",
          letterSpacing: -0.5,
        }}
      >
        PR
      </Text>
    </View>
  );
}
