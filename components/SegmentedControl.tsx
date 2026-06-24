import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View, ViewStyle } from "react-native";

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

type Props<T extends string> = {
  options: Option<T>[];
  selected: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  options,
  selected,
  onChange,
  style,
  disabled = false,
}: Props<T>) {
  const { colors } = usePokerTheme();

  return (
    <View
      style={[
        {
          flexDirection: "row",
          backgroundColor: colors.bg.secondary,
          borderRadius: 12,
          padding: 3,
          gap: 2,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {options.map((opt) => {
        const isActive = opt.value === selected;
        const iconName = opt.icon;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            activeOpacity={0.8}
            style={[
              {
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 9,
                borderRadius: 10,
              },
              isActive && {
                backgroundColor: colors.bg.primary,
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 2,
              },
            ]}
          >
            {iconName && (
              <Ionicons
                name={iconName}
                size={14}
                color={isActive ? colors.text.primary : colors.text.tertiary}
              />
            )}
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: isActive ? colors.text.primary : colors.text.tertiary,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
