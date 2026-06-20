import { useAuth } from "@/context/AuthContext";
import { StakemateLogo } from "@/components/StakemateLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";

export default function SplashScreen() {
  const { colors } = usePokerTheme();
  const { session, loading } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => setMinTimePassed(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && minTimePassed) {
      router.replace(session ? "/(tabs)" : "/welcome");
    }
  }, [loading, minTimePassed, session]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#155DFC",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={{ opacity: fadeAnim, alignItems: "center" }}>
        <StakemateLogo size={180} />
      </Animated.View>
    </View>
  );
}
