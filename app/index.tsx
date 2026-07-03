import { StakemateLogo } from "@/components/StakemateLogo";
import { useAuth } from "@/context/AuthContext";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

const LOGO_WIDTH  = 260;
const LOGO_HEIGHT = Math.round(260 * (247 / 902));

export default function SplashScreen() {
  const { session, loading } = useAuth();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [minTimePassed, setMinTimePassed] = useState(false);
  const navigated = useRef(false);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => setMinTimePassed(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  // Exit animation then navigate
  useEffect(() => {
    if (!loading && minTimePassed && !navigated.current) {
      navigated.current = true;
      const dest = session ? "/(tabs)" : "/welcome";
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.75,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start(() => router.replace(dest));
    }
  }, [loading, minTimePassed, session]);

  return (
    <LinearGradient
      colors={["#009FEE", "#155DFC"]}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }],
        alignItems: "center",
      }}>
        <StakemateLogo
          variant="light"
          style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}
        />
      </Animated.View>
    </LinearGradient>
  );
}
