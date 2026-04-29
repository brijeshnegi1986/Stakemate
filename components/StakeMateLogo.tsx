import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Text, View, type ViewStyle } from "react-native";

type Props = {
  size?: number;
  style?: ViewStyle;
};

export function StakeMateLogo({ size = 48, style }: Props) {
  const { colors } = usePokerTheme();
  const outerSize = size;
  const accentSize = outerSize * 0.9;
  const innerSize = outerSize * 0.7;

  return (
    <View
      style={[
        { width: outerSize, height: outerSize, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <View
        style={{
          position: "absolute",
          width: accentSize,
          height: accentSize,
          borderRadius: accentSize * 0.32,
          backgroundColor: colors.bg.brand,
          opacity: 0.18,
          transform: [{ rotate: "20deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: accentSize * 0.88,
          height: accentSize * 0.88,
          borderRadius: accentSize * 0.28,
          backgroundColor: colors.bg.brand,
          transform: [{ rotate: "-12deg" }],
        }}
      />
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize * 0.28,
          backgroundColor: colors.bg.primary,
          borderWidth: 2,
          borderColor: colors.bg.brand,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: "-12deg" }],
        }}
      >
        <Text
          style={{
            color: colors.text.brand,
            fontSize: innerSize * 0.4,
            fontWeight: "900",
            letterSpacing: -0.5,
            transform: [{ rotate: "12deg" }],
          }}
        >
          PR
        </Text>
      </View>
    </View>
  );
}
