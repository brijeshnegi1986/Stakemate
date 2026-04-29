import { usePokerTheme } from "@/hooks/use-poker-theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View, ViewStyle } from "react-native";

type Option<T extends string> = {
  value: T;
  label: string;
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
  const [layoutWidth, setLayoutWidth] = useState(0);
  const activeAnim = useRef(new Animated.Value(0)).current;

  const activeIndex = useMemo(
    () => options.findIndex((opt) => opt.value === selected),
    [options, selected]
  );

  useEffect(() => {
    if (layoutWidth <= 0 || activeIndex < 0) return;

    Animated.spring(activeAnim, {
      toValue: activeIndex,
      useNativeDriver: true,
      tension: 120,
      friction: 18,
    }).start();
  }, [activeIndex, layoutWidth, activeAnim]);

  const innerWidth = layoutWidth > 0 ? layoutWidth - 8 : 0;
  const segmentWidth = innerWidth > 0 ? innerWidth / options.length : 0;
  const translateX = activeAnim.interpolate({
    inputRange: [0, options.length - 1],
    outputRange: [0, segmentWidth * (options.length - 1)],
    extrapolate: "clamp",
  });

  return (
    <View
      onLayout={(event) => setLayoutWidth(event.nativeEvent.layout.width)}
      style={[
        {
          position: "relative",
          flexDirection: "row",
          backgroundColor: colors.bg.tertiary,
          borderRadius: 999,
          padding: 4,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {layoutWidth > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 4,
            width: segmentWidth - 8,
            borderRadius: 999,
            borderColor: colors.border.brand,
            borderWidth: 1,
            backgroundColor: colors.bg.brandLight,
            transform: [{ translateX }],
          }}
        />
      )}

      {options.map((opt) => {
        const isActive = opt.value === selected;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            disabled={disabled}
            activeOpacity={disabled ? 1 : 0.8}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: isActive ? colors.text.primary : disabled ? colors.text.disabled : colors.text.secondary,
                fontSize: isActive ? 14 : 14,
                fontWeight: isActive ? "600" : "500",
                lineHeight: 24,
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
