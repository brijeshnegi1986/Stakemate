import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { abandonLiveSession, getActiveSession, Session } from "../../db/database";

const BREAK_OPTIONS = [15, 20, 30, 45];

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ActiveSessionScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const { width } = useWindowDimensions();

  const innerRing = Math.min(width * 0.55, 220);
  const outerRing = innerRing + 44;

  const [session, setSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakRemaining, setBreakRemaining] = useState(0);

  const breakEndsAtRef = useRef<number | null>(null);
  const startMsRef = useRef<number>(0);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0.5)).current;
  const enterAnim = useRef(new Animated.Value(0)).current;
  const breakBtnScale = useRef(new Animated.Value(1)).current;
  const badgeFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0.5, duration: 2800, useNativeDriver: true }),
      ])
    ).start();

    Animated.spring(enterAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 55,
      friction: 9,
      delay: 100,
    }).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const s = getActiveSession();
      if (!s) {
        router.replace("/(tabs)");
        return;
      }
      setSession(s);
      startMsRef.current = new Date(s.startTime ?? "").getTime();
    }, [])
  );

  useEffect(() => {
    const tick = () => {
      if (isOnBreak && breakEndsAtRef.current) {
        const rem = Math.max(0, Math.ceil((breakEndsAtRef.current - Date.now()) / 1000));
        setBreakRemaining(rem);
        if (rem === 0) {
          breakEndsAtRef.current = null;
          setIsOnBreak(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else if (!isOnBreak && startMsRef.current) {
        setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOnBreak]);

  const pulseBadge = () => {
    badgeFade.setValue(0.3);
    Animated.timing(badgeFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const handleBreakPress = () => {
    if (isOnBreak) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.spring(breakBtnScale, { toValue: 1.2, useNativeDriver: true, tension: 120, friction: 6 }),
        Animated.spring(breakBtnScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      ]).start();
      breakEndsAtRef.current = null;
      setIsOnBreak(false);
      pulseBadge();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Coffee Break", "How long is your break?", [
        ...BREAK_OPTIONS.map((m) => ({
          text: `${m} min`,
          onPress: () => {
            breakEndsAtRef.current = Date.now() + m * 60 * 1000;
            setBreakRemaining(m * 60);
            setIsOnBreak(true);
            pulseBadge();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        })),
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleAbandon = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Abandon Session", "This will permanently delete this session.", [
      { text: "Keep Playing", style: "cancel" },
      {
        text: "Abandon",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (session) abandonLiveSession(session.id);
          router.replace("/(tabs)");
        },
      },
    ]);
  };

  const handleEnd = () => router.push("/live/end");

  if (!session) return null;

  const elapsedHours = (elapsed / 3600).toFixed(1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <StatusBar barStyle={colors.bg.primary === "#020618" ? "light-content" : "dark-content"} />

      {/* ── TOP BAR ── */}
      <View style={{
        paddingTop: Platform.OS === "ios" ? 60 : 40,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>

          {/* Left spacer */}
          <View style={{ width: 68 }} />

          {/* LIVE / PAUSED badge — center */}
          <Animated.View style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.full,
            paddingVertical: 6,
            paddingHorizontal: spacing.md,
            borderWidth: 1,
            borderColor: isOnBreak ? colors.border.warning : colors.border.success,
            opacity: badgeFade,
          }}>
            <Animated.View style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: isOnBreak ? colors.text.warning : colors.bg.success,
              opacity: isOnBreak ? 1 : pulseAnim,
            }} />
            <Text style={{
              color: isOnBreak ? colors.text.warning : colors.text.success,
              ...typography.caption,
              fontWeight: "700",
              letterSpacing: 1.2,
            }}>
              {isOnBreak ? "BREAK" : "LIVE"}
            </Text>
          </Animated.View>

          {/* Abandon — right */}
          <TouchableOpacity
            onPress={handleAbandon}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 4 }}
            style={{ width: 68, alignItems: "flex-end" }}
          >
            <Text style={{
              color: colors.text.danger,
              ...typography.bodySm,
              fontWeight: "600",
            }}>
              Abandon
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── CENTER: TIMER ── */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg }}>
        <Animated.View style={{
          alignItems: "center",
          opacity: enterAnim,
          transform: [{ scale: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
        }}>

          {/* Ring cluster */}
          <View style={{
            position: "relative",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing["2xl"],
          }}>
            {/* Outer breathing ring */}
            <Animated.View style={{
              position: "absolute",
              width: outerRing,
              height: outerRing,
              borderRadius: outerRing / 2,
              borderWidth: 1,
              borderColor: isOnBreak ? colors.border.warning : colors.bg.brand,
              opacity: ringAnim,
            }} />

            {/* Mid subtle ring */}
            <View style={{
              position: "absolute",
              width: outerRing - 22,
              height: outerRing - 22,
              borderRadius: (outerRing - 22) / 2,
              borderWidth: 0.5,
              borderColor: colors.border.subtle,
              opacity: 0.35,
            }} />

            {/* Inner content ring */}
            <View style={{
              width: innerRing,
              height: innerRing,
              borderRadius: innerRing / 2,
              borderWidth: 1,
              borderColor: isOnBreak ? colors.border.warning : colors.border.subtle,
              alignItems: "center",
              justifyContent: "center",
            }}>
              {isOnBreak ? (
                <>
                  <Text style={{
                    fontSize: 46,
                    fontWeight: "200",
                    color: colors.text.warning,
                    fontVariant: ["tabular-nums"],
                    letterSpacing: -1,
                  }}>
                    {formatCountdown(breakRemaining)}
                  </Text>
                  <Text style={{
                    color: colors.text.warning,
                    ...typography.caption,
                    marginTop: spacing.xs,
                    opacity: 0.65,
                    letterSpacing: 0.5,
                  }}>
                    break remaining
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{
                    fontSize: 50,
                    fontWeight: "200",
                    color: colors.text.primary,
                    fontVariant: ["tabular-nums"],
                    letterSpacing: -2,
                  }}>
                    {formatElapsed(elapsed)}
                  </Text>
                  <Text style={{
                    color: colors.text.tertiary,
                    ...typography.caption,
                    marginTop: spacing.xs,
                    letterSpacing: 0.5,
                  }}>
                    {elapsedHours}h elapsed
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={{
            width: 28,
            height: 1,
            backgroundColor: colors.border.subtle,
            marginBottom: spacing["2xl"],
          }} />

          {/* Session pills */}
          <View style={{
            flexDirection: "row",
            gap: spacing.sm,
            flexWrap: "wrap",
            justifyContent: "center",
          }}>
            {session.type === "tournament" ? (
              <InfoPill label="Tournament" value={session.tournamentName || "Tournament"} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            ) : (
              <InfoPill label="Stakes" value={session.stakes} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            )}
            <InfoPill label="Buy-in" value={`$${session.buyIn}`} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            {session.venue ? (
              <InfoPill label="Venue" value={session.venue} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            ) : null}
            {session.state ? (
              <InfoPill label="State" value={session.state} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            ) : null}
          </View>
        </Animated.View>
      </View>

      {/* ── BOTTOM ACTIONS ── */}
      <View style={{
        padding: spacing.lg,
        paddingBottom: Platform.OS === "ios" ? spacing["2xl"] + spacing.md : spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
      }}>
        {/* Break circular FAB */}
        <Animated.View style={{ transform: [{ scale: breakBtnScale }] }}>
          <TouchableOpacity
            onPress={handleBreakPress}
            activeOpacity={0.75}
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: isOnBreak ? colors.bg.success : colors.bg.secondary,
              borderWidth: 1.5,
              borderColor: isOnBreak ? colors.border.success : colors.border.default,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: isOnBreak ? colors.bg.success : "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isOnBreak ? 0.35 : 0.12,
              shadowRadius: 6,
              elevation: isOnBreak ? 6 : 2,
            }}
          >
            <MaterialCommunityIcons
              name={isOnBreak ? "play" : "coffee"}
              size={26}
              color={isOnBreak ? colors.text.onBrand : colors.text.secondary}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* End Session */}
        <TouchableOpacity
          onPress={handleEnd}
          activeOpacity={0.85}
          style={{
            flex: 1,
            paddingVertical: spacing.lg + 2,
            borderRadius: radius.lg,
            alignItems: "center",
            backgroundColor: colors.bg.brand,
            shadowColor: colors.bg.brand,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text style={{
            color: colors.text.onBrand,
            fontWeight: "700",
            ...typography.body,
          }}>
            End Session
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoPill({ label, value, colors, spacing, radius, typography }: any) {
  return (
    <View style={{
      backgroundColor: colors.bg.secondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: "center",
      minWidth: 80,
    }}>
      <Text style={{
        color: colors.text.tertiary,
        ...typography.caption,
        letterSpacing: 0.5,
      }}>
        {label}
      </Text>
      <Text style={{
        color: colors.text.primary,
        ...typography.bodySm,
        fontWeight: "600",
        marginTop: 2,
      }}>
        {value}
      </Text>
    </View>
  );
}
