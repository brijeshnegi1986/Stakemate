import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { syncSessionToCloud } from "@/lib/sync";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { endLiveSession, endLiveTournament, getActiveSession, getRebuysTotal, parseRebuys, Session } from "../../db/database";

export default function EndSessionScreen() {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);

  // Cash
  const [cashOut, setCashOut] = useState("");
  // Tournament
  const [position, setPosition] = useState("");
  const [payout, setPayout]     = useState("");

  const cashOutRef  = useRef<TextInput>(null);
  const profitAnim  = useRef(new Animated.Value(1)).current;
  const prevProfit  = useRef<number | null>(null);
  const enterAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 10 }).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const s = getActiveSession();
      if (!s) { router.replace("/(tabs)"); return; }
      setSession(s);
      setTimeout(() => cashOutRef.current?.focus(), 300);
    }, [])
  );

  const isTournament  = session?.type === "tournament";
  const rebuysTotal   = session ? getRebuysTotal(session) : 0;
  const rebuysCount   = session ? parseRebuys(session).length : 0;
  const totalInvested = (session?.buyIn ?? 0) + rebuysTotal;

  const profit = useMemo(() => {
    if (!session) return null;
    if (isTournament) {
      const p = parseFloat(payout) || 0;
      return p - totalInvested;
    }
    const c = parseFloat(cashOut);
    return isNaN(c) ? null : c - totalInvested;
  }, [isTournament, cashOut, payout, session, totalInvested]);

  useEffect(() => {
    if (profit === prevProfit.current) return;
    prevProfit.current = profit;
    profitAnim.setValue(0.6);
    Animated.spring(profitAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
  }, [profit]);

  const durationHours = useMemo(() => {
    if (!session?.startTime) return 0;
    const ms = Date.now() - new Date(session.startTime).getTime();
    return Math.round((ms / 3600000) * 10) / 10;
  }, [session]);

  // For cash: require cashOut. For tournament: require position (payout can be 0 = bust).
  const isReady = isTournament
    ? position !== ""
    : cashOut !== "" && !isNaN(parseFloat(cashOut));

  const handleConfirm = () => {
    if (!isReady || !session || profit === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isTournament) {
      endLiveTournament(
        session.id,
        parseInt(position) || 0,
        parseFloat(payout) || 0,
        durationHours
      );
    } else {
      endLiveSession(session.id, parseFloat(cashOut), profit, durationHours);
    }
    if (user?.id) syncSessionToCloud(user.id, session.id).catch(console.error);
    router.replace("/(tabs)");
  };

  const profitColor =
    profit === null ? colors.text.disabled
    : profit >= 0   ? colors.text.success
    :                 colors.text.danger;

  const profitLabel =
    profit === null ? "—"
    : `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toFixed(2)}`;

  if (!session) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View style={{
        flex: 1,
        padding: spacing.lg,
        opacity: enterAnim,
        transform: [{ translateY: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
      }}>

        {/* ── Session summary ── */}
        <View style={{
          backgroundColor: colors.bg.secondary,
          borderRadius: radius.lg,
          padding: spacing["2xl"],
          borderWidth: 1,
          borderColor: colors.border.subtle,
          marginBottom: spacing["2xl"],
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              {isTournament && (
                <View style={{
                  alignSelf: "flex-start",
                  backgroundColor: colors.bg.tertiary,
                  borderRadius: radius.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  marginBottom: spacing.xs,
                }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }}>
                    TOURNAMENT
                  </Text>
                </View>
              )}
              <Text style={{
                color: colors.text.tertiary,
                ...typography.caption,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontWeight: "600",
              }}>
                {isTournament ? "Tournament" : "Session"}
              </Text>
              <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "600", marginTop: spacing.xs }}>
                {isTournament ? (session.tournamentName || "Tournament") : (session.venue || "Unknown venue")}
              </Text>
              <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginTop: spacing.xs }}>
                {isTournament
                  ? (session.entries ? `${session.entries} entries` : "")
                  : `${session.stakes}${session.state ? ` • ${session.state}` : ""}`}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600" }}>
                Duration
              </Text>
              <Text style={{ color: colors.text.primary, ...typography.body, fontWeight: "600", marginTop: spacing.xs }}>
                {durationHours}h
              </Text>
              <Text style={{ color: colors.text.secondary, ...typography.bodySm, marginTop: spacing.xs }}>
                Buy-in ${session.buyIn}
              </Text>
              {rebuysCount > 0 && (
                <Text style={{ color: colors.text.warning, ...typography.bodySm, marginTop: 2 }}>
                  +${rebuysTotal} rebuy ({rebuysCount}x)
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Profit preview ── */}
        <View style={{ alignItems: "center", marginBottom: spacing["2xl"] }}>
          <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>
            Result
          </Text>
          <Animated.Text style={{ ...typography.display, fontWeight: "800", color: profitColor, transform: [{ scale: profitAnim }] }}>
            {profitLabel}
          </Animated.Text>
          {profit !== null && (
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: spacing.xs }}>
              {profit >= 0
                ? (isTournament ? "ITM 🏆" : "Nice session 🎉")
                : (isTournament ? "Better luck next time" : "Better luck next time")}
              {!isTournament && durationHours > 0 ? ` · $${(Math.abs(profit) / durationHours).toFixed(0)}/hr` : ""}
            </Text>
          )}
        </View>

        {/* ── Cash-out input (cash game) ── */}
        {!isTournament && (
          <>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>
              Cash-out
            </Text>
            <View style={{
              backgroundColor: colors.surface.raised,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: isReady ? colors.border.brand : colors.border.default,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.lg,
              marginBottom: spacing["3xl"],
            }}>
              <Text style={{ color: colors.text.disabled, ...typography.heading2, marginRight: spacing.xs }}>$</Text>
              <TextInput
                ref={cashOutRef}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.text.disabled}
                value={cashOut}
                onChangeText={setCashOut}
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
                style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.heading2, fontWeight: "700", textAlign: "right" }}
              />
            </View>
          </>
        )}

        {/* ── Position + Payout inputs (tournament) ── */}
        {isTournament && (
          <>
            <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing["2xl"] }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>
                  Finish Position
                </Text>
                <View style={{
                  backgroundColor: colors.surface.raised,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: position !== "" ? colors.border.brand : colors.border.default,
                  paddingHorizontal: spacing.lg,
                }}>
                  <TextInput
                    ref={cashOutRef}
                    keyboardType="number-pad"
                    placeholder={session.entries ? `1–${session.entries}` : "e.g. 12"}
                    placeholderTextColor={colors.text.disabled}
                    value={position}
                    onChangeText={setPosition}
                    returnKeyType="next"
                    style={{ color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.heading2, fontWeight: "700", textAlign: "center" }}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600", marginBottom: spacing.sm }}>
                  Payout
                </Text>
                <View style={{
                  backgroundColor: colors.surface.raised,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: parseFloat(payout) > 0 ? colors.border.success : colors.border.default,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: spacing.md,
                }}>
                  <Text style={{ color: colors.text.disabled, ...typography.body }}>$</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.text.disabled}
                    value={payout}
                    onChangeText={setPayout}
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                    style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.heading2, fontWeight: "700", textAlign: "right" }}
                  />
                </View>
              </View>
            </View>
            <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing["2xl"] }}>
              Leave payout as 0 if you didn't cash
            </Text>
          </>
        )}

        <View style={{ flex: 1 }} />

        {!isReady && (
          <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing.sm }}>
            {isTournament ? "Enter your finish position" : "Enter your cash-out amount"}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={!isReady}
          activeOpacity={0.85}
          style={{
            paddingVertical: spacing.lg + 2,
            borderRadius: radius.lg,
            alignItems: "center",
            backgroundColor: isReady ? colors.bg.brand : colors.state.disabled,
            marginBottom: Platform.OS === "ios" ? spacing.lg : 0,
          }}
        >
          <Text style={{ color: isReady ? colors.text.onBrand : colors.text.disabled, fontWeight: "700", ...typography.body }}>
            Confirm & Save
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
