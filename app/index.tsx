import { PokerRollLogo } from "@/components/PokerRollLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";

export default function SplashScreen() {
  const { colors } = usePokerTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(async () => {
      const onboarded = await SecureStore.getItemAsync("onboarded");
      router.replace(onboarded ? "/(tabs)" : "/welcome");
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PokerRollLogo size={100} style={{ marginRight: 14 }} />
        <View>
          <Text
            style={{
              color: colors.text.primary,
              fontSize: 32,
              fontWeight: "800",
              letterSpacing: 0.3,
              lineHeight: 36,
            }}
          >
            PokerRoll
          </Text>
          <Text
            style={{
              color: colors.text.tertiary,
              fontSize: 14,
              letterSpacing: 0.4,
              marginTop: 4,
            }}
          >
            by Stakemate
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
