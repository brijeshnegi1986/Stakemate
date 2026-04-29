import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Text, View } from "react-native";

type Props = {
  value: string;
  label: string;
};

// Figma "Data Card": bg-tertiary, border-default, radius-sm, centred value + label
export function StatsCard({ value, label }: Props) {
  const { colors } = usePokerTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.secondary,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border.default,
        padding: 8,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: colors.text.primary,
          fontSize: 16,
          fontWeight: "600",
          lineHeight: 24,
          letterSpacing: 0.24,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: colors.text.tertiary,
          fontSize: 12,
          lineHeight: 16,
          marginTop: 2,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
