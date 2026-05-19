import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  venue: string;
  stakes: string;
  date: string;
  profit: number;
  onPress?: () => void;
};

export function SessionCard({ venue, stakes, date, profit, onPress }: Props) {
  const { colors } = usePokerTheme();
  const isWin = profit >= 0;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={{
        backgroundColor: colors.bg.tertiary,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border.default,
        flexDirection: "row",
        alignItems: "stretch",
        overflow: "hidden",
        marginBottom: 4,
      }}
    >
      {/* Left accent bar */}
      <View
        style={{
          width: 4,
          backgroundColor: isWin ? colors.bg.success : colors.bg.danger,
        }}
      />

      {/* Content */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text.primary,
              fontSize: 14,
              fontWeight: "400",
              lineHeight: 20,
            }}
          >
            {venue}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16 }}>
              {stakes}
            </Text>
            <View
              style={{
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: colors.text.tertiary,
              }}
            />
            <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 16 }}>
              {date}
            </Text>
          </View>
        </View>

        <Text
          style={{
            color: isWin ? colors.text.success : colors.text.danger,
            fontSize: 16,
            fontWeight: "600",
            letterSpacing: 0.24,
          }}
        >
          {isWin ? "" : "-"}${Math.abs(profit).toFixed(0)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
