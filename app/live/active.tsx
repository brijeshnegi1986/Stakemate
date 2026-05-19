import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  abandonLiveSession,
  addRebuy,
  getActiveSession,
  getRebuysTotal,
  parseRebuys,
  saveNotes,
  Session,
} from "../../db/database";

const BREAK_OPTIONS = [15, 20, 30, 45];

type ActiveModal = "break" | "notes" | "rebuy" | null;

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

  // Modal state — only one open at a time
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Break modal fields
  const [breakNote, setBreakNote]       = useState("");
  const [breakDuration, setBreakDuration] = useState<number | null>(null);

  // Notes modal fields
  const [editingNotes, setEditingNotes] = useState("");

  // Rebuy modal fields
  const [rebuyAmount, setRebuyAmount] = useState("");

  const breakEndsAtRef = useRef<number | null>(null);
  const startMsRef     = useRef<number>(0);

  // Animations
  const pulseAnim     = useRef(new Animated.Value(1)).current;
  const ringAnim      = useRef(new Animated.Value(0.5)).current;
  const enterAnim     = useRef(new Animated.Value(0)).current;
  const breakBtnScale = useRef(new Animated.Value(1)).current;
  const badgeFade     = useRef(new Animated.Value(1)).current;
  const panelAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1,   duration: 2800, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0.5, duration: 2800, useNativeDriver: true }),
      ])
    ).start();

    Animated.spring(enterAnim, {
      toValue: 1, useNativeDriver: true, tension: 55, friction: 9, delay: 100,
    }).start();
  }, []);

  // Animate modal panel in whenever a modal opens
  useEffect(() => {
    if (activeModal) {
      panelAnim.setValue(0);
      Animated.spring(panelAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [activeModal]);

  useFocusEffect(
    useCallback(() => {
      const s = getActiveSession();
      if (!s) { router.replace("/(tabs)"); return; }
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

  const closeModal = () => {
    setActiveModal(null);
    setBreakNote("");
    setBreakDuration(null);
    setRebuyAmount("");
  };

  // ── Break ──
  const handleBreakPress = () => {
    if (isOnBreak) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.spring(breakBtnScale, { toValue: 1.2, useNativeDriver: true, tension: 120, friction: 6 }),
        Animated.spring(breakBtnScale, { toValue: 1,   useNativeDriver: true, tension: 80,  friction: 8 }),
      ]).start();
      breakEndsAtRef.current = null;
      setIsOnBreak(false);
      pulseBadge();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActiveModal("break");
    }
  };

  const handleStartBreak = () => {
    if (!breakDuration || !session) return;
    if (breakNote.trim()) {
      const time = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
      const entry = `[Break ${time}] ${breakNote.trim()}`;
      const existing = session.notes ?? "";
      const combined = existing ? `${existing}\n${entry}` : entry;
      saveNotes(session.id, combined);
      setSession({ ...session, notes: combined });
    }
    breakEndsAtRef.current = Date.now() + breakDuration * 60 * 1000;
    setBreakRemaining(breakDuration * 60);
    setIsOnBreak(true);
    closeModal();
    pulseBadge();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Notes ──
  const handleOpenNotes = () => {
    setEditingNotes(session?.notes ?? "");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveModal("notes");
  };

  const handleSaveNotes = () => {
    if (!session) return;
    saveNotes(session.id, editingNotes);
    setSession({ ...session, notes: editingNotes });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeModal();
  };

  // ── Rebuy ──
  const handleOpenRebuy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveModal("rebuy");
  };

  const handleConfirmRebuy = () => {
    const amount = parseFloat(rebuyAmount);
    if (!session || isNaN(amount) || amount <= 0) return;
    addRebuy(session.id, amount);
    const existing = parseRebuys(session);
    setSession({ ...session, rebuys: JSON.stringify([...existing, amount]) });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeModal();
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

  const elapsedHours  = (elapsed / 3600).toFixed(1);
  const rebuysTotal   = getRebuysTotal(session);
  const rebuysCount   = parseRebuys(session).length;
  const totalInvested = session.buyIn + rebuysTotal;

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
          {/* Home */}
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)")}
            hitSlop={{ top: 12, bottom: 12, left: 4, right: 16 }}
            style={{ width: 68, alignItems: "flex-start" }}
          >
            <MaterialCommunityIcons name="home-outline" size={24} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* LIVE / BREAK badge */}
          <Animated.View style={{
            flexDirection: "row", alignItems: "center", gap: spacing.xs,
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.full,
            paddingVertical: 6, paddingHorizontal: spacing.md,
            borderWidth: 1,
            borderColor: isOnBreak ? colors.border.warning : colors.border.success,
            opacity: badgeFade,
          }}>
            <Animated.View style={{
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: isOnBreak ? colors.text.warning : colors.bg.success,
              opacity: isOnBreak ? 1 : pulseAnim,
            }} />
            <Text style={{
              color: isOnBreak ? colors.text.warning : colors.text.success,
              ...typography.caption, fontWeight: "700", letterSpacing: 1.2,
            }}>
              {isOnBreak ? "BREAK" : "LIVE"}
            </Text>
          </Animated.View>

          {/* Abandon */}
          <TouchableOpacity
            onPress={handleAbandon}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 4 }}
            style={{ width: 68, alignItems: "flex-end" }}
          >
            <Text style={{ color: colors.text.danger, ...typography.bodySm, fontWeight: "600" }}>
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
          <View style={{ position: "relative", alignItems: "center", justifyContent: "center", marginBottom: spacing["2xl"] }}>
            <Animated.View style={{
              position: "absolute",
              width: outerRing, height: outerRing, borderRadius: outerRing / 2,
              borderWidth: 1,
              borderColor: isOnBreak ? colors.border.warning : colors.bg.brand,
              opacity: ringAnim,
            }} />
            <View style={{
              position: "absolute",
              width: outerRing - 22, height: outerRing - 22, borderRadius: (outerRing - 22) / 2,
              borderWidth: 0.5, borderColor: colors.border.subtle, opacity: 0.35,
            }} />
            <View style={{
              width: innerRing, height: innerRing, borderRadius: innerRing / 2,
              borderWidth: 1,
              borderColor: isOnBreak ? colors.border.warning : colors.border.subtle,
              alignItems: "center", justifyContent: "center",
            }}>
              {isOnBreak ? (
                <>
                  <Text style={{
                    fontSize: 46, fontWeight: "200", color: colors.text.warning,
                    fontVariant: ["tabular-nums"], letterSpacing: -1,
                  }}>
                    {formatCountdown(breakRemaining)}
                  </Text>
                  <Text style={{ color: colors.text.warning, ...typography.caption, marginTop: spacing.xs, opacity: 0.65, letterSpacing: 0.5 }}>
                    break remaining
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{
                    fontSize: 50, fontWeight: "200", color: colors.text.primary,
                    fontVariant: ["tabular-nums"], letterSpacing: -2,
                  }}>
                    {formatElapsed(elapsed)}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: spacing.xs, letterSpacing: 0.5 }}>
                    {elapsedHours}h elapsed
                  </Text>
                </>
              )}
            </View>
          </View>

          <View style={{ width: 28, height: 1, backgroundColor: colors.border.subtle, marginBottom: spacing["2xl"] }} />

          {/* Session pills */}
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center" }}>
            {session.type === "tournament" ? (
              <InfoPill label="Tournament" value={session.tournamentName || "Tournament"} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            ) : (
              <InfoPill label="Stakes" value={session.stakes} colors={colors} spacing={spacing} radius={radius} typography={typography} />
            )}
            <InfoPill
              label={rebuysCount > 0 ? "Total invested" : "Buy-in"}
              value={`$${totalInvested}`}
              colors={colors} spacing={spacing} radius={radius} typography={typography}
            />
            {rebuysCount > 0 && (
              <InfoPill
                label="Rebuys"
                value={`${rebuysCount}x · +$${rebuysTotal}`}
                colors={colors} spacing={spacing} radius={radius} typography={typography}
                accent={colors.text.warning}
              />
            )}
            {session.venue ? <InfoPill label="Venue" value={session.venue} colors={colors} spacing={spacing} radius={radius} typography={typography} /> : null}
          </View>
        </Animated.View>
      </View>

      {/* ── BOTTOM ACTIONS ── */}
      <View style={{
        padding: spacing.lg,
        paddingBottom: Platform.OS === "ios" ? spacing["2xl"] + spacing.md : spacing.lg,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: spacing.sm,
      }}>
        {/* Break FAB */}
        <SmallFAB
          icon={isOnBreak ? "play" : "pause"}
          label={isOnBreak ? "Resume" : "Break"}
          onPress={handleBreakPress}
          active={isOnBreak}
          activeColor={colors.bg.success}
          activeBorder={colors.border.success}
          activeIcon={colors.text.onBrand}
          colors={colors}
          spacing={spacing}
          typography={typography}
          scaleAnim={breakBtnScale}
        />

        {/* Notes FAB */}
        <SmallFAB
          icon="pencil-outline"
          label="Notes"
          onPress={handleOpenNotes}
          active={!!(session.notes)}
          activeColor={colors.bg.secondary}
          activeBorder={colors.border.brand}
          activeIcon={colors.text.brand}
          colors={colors}
          spacing={spacing}
          typography={typography}
        />

        {/* Rebuy FAB */}
        <SmallFAB
          icon="cash-plus"
          label="Rebuy"
          onPress={handleOpenRebuy}
          active={rebuysCount > 0}
          activeColor={colors.bg.secondary}
          activeBorder={colors.border.warning}
          activeIcon={colors.text.warning}
          colors={colors}
          spacing={spacing}
          typography={typography}
        />

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
          <Text style={{ color: colors.text.onBrand, fontWeight: "700", ...typography.body }}>
            End Session
          </Text>
        </TouchableOpacity>
      </View>

      {/* ══════════ MODALS ══════════ */}
      <Modal
        visible={activeModal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
            activeOpacity={1}
            onPress={closeModal}
          />
          <Animated.View style={{
            backgroundColor: colors.bg.primary,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: spacing["2xl"],
            paddingBottom: Platform.OS === "ios" ? 40 : spacing["2xl"],
            borderTopWidth: 1,
            borderColor: colors.border.default,
            transform: [{ translateY: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
            opacity: panelAnim,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default, alignSelf: "center", marginBottom: spacing["2xl"] }} />

            {/* ── Break ── */}
            {activeModal === "break" && (
              <>
            <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: spacing.lg }}>
              Take a Break
            </Text>

            <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>Note (optional)</Text>
            <View style={{
              backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
              borderColor: breakNote.length > 0 ? colors.border.brand : colors.border.default,
              paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
              marginBottom: spacing["2xl"], minHeight: 72,
            }}>
              <TextInput
                multiline
                placeholder="Anything to note during the break..."
                placeholderTextColor={colors.text.disabled}
                value={breakNote}
                onChangeText={setBreakNote}
                style={{ color: colors.text.primary, ...typography.bodySm, lineHeight: 22, textAlignVertical: "top" }}
              />
            </View>

            <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>Duration</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
              {BREAK_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => { setBreakDuration(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{
                    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center",
                    backgroundColor: breakDuration === m ? colors.bg.brand : colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: breakDuration === m ? colors.border.brand : colors.border.default,
                  }}
                >
                  <Text style={{
                    color: breakDuration === m ? colors.text.onBrand : colors.text.secondary,
                    ...typography.bodySm,
                    fontWeight: breakDuration === m ? "700" : "500",
                  }}>
                    {m}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <TouchableOpacity
                onPress={closeModal}
                style={{ flex: 1, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border.default }}
              >
                <Text style={{ color: colors.text.secondary, fontWeight: "600", ...typography.body }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleStartBreak}
                disabled={breakDuration === null}
                style={{
                  flex: 2, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center",
                  backgroundColor: breakDuration !== null ? colors.bg.warning : colors.state.disabled,
                }}
              >
                <Text style={{
                  color: breakDuration !== null ? colors.text.onBrand : colors.text.disabled,
                  fontWeight: "700", ...typography.body,
                }}>
                  Start Break
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════ NOTES MODAL ══════════ */}
        {activeModal === "notes" && (
          <>
            <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: spacing.lg }}>
              Session Notes
            </Text>

            <View style={{
              backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
              borderColor: editingNotes.length > 0 ? colors.border.brand : colors.border.default,
              paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
              marginBottom: spacing["2xl"], minHeight: 140,
            }}>
              <TextInput
                multiline
                autoFocus
                placeholder="Write notes about this session..."
                placeholderTextColor={colors.text.disabled}
                value={editingNotes}
                onChangeText={setEditingNotes}
                style={{ color: colors.text.primary, ...typography.bodySm, lineHeight: 22, textAlignVertical: "top", minHeight: 120 }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <TouchableOpacity
                onPress={closeModal}
                style={{ flex: 1, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border.default }}
              >
                <Text style={{ color: colors.text.secondary, fontWeight: "600", ...typography.body }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNotes}
                style={{ flex: 2, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.bg.brand }}
              >
                <Text style={{ color: colors.text.onBrand, fontWeight: "700", ...typography.body }}>Save Notes</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════ REBUY MODAL ══════════ */}
        {activeModal === "rebuy" && (
          <>
            <Text style={{ color: colors.text.primary, ...typography.heading3, fontWeight: "700", marginBottom: spacing.xs }}>
              Add Rebuy
            </Text>
            {rebuysCount > 0 && (
              <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginBottom: spacing.lg }}>
                {rebuysCount} rebuy{rebuysCount > 1 ? "s" : ""} so far · +${rebuysTotal} · Total invested ${totalInvested}
              </Text>
            )}
            {rebuysCount === 0 && (
              <Text style={{ color: colors.text.tertiary, ...typography.bodySm, marginBottom: spacing.lg }}>
                Initial buy-in ${session.buyIn}
              </Text>
            )}

            <Text style={[sectionLabel(colors, typography), { marginBottom: spacing.sm }]}>Rebuy Amount</Text>
            <View style={{
              backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
              borderColor: rebuyAmount.length > 0 ? colors.border.brand : colors.border.default,
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
            }}>
              <Text style={{ color: colors.text.disabled, ...typography.heading2, marginRight: spacing.xs }}>$</Text>
              <TextInput
                autoFocus
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.text.disabled}
                value={rebuyAmount}
                onChangeText={setRebuyAmount}
                returnKeyType="done"
                onSubmitEditing={handleConfirmRebuy}
                style={{ flex: 1, color: colors.text.primary, paddingVertical: spacing.lg, ...typography.heading2, fontWeight: "700", textAlign: "right" }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <TouchableOpacity
                onPress={closeModal}
                style={{ flex: 1, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border.default }}
              >
                <Text style={{ color: colors.text.secondary, fontWeight: "600", ...typography.body }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmRebuy}
                disabled={!rebuyAmount || parseFloat(rebuyAmount) <= 0}
                style={{
                  flex: 2, paddingVertical: spacing.lg, borderRadius: radius.md, alignItems: "center",
                  backgroundColor: rebuyAmount && parseFloat(rebuyAmount) > 0 ? colors.bg.warning : colors.state.disabled,
                }}
              >
                <Text style={{
                  color: rebuyAmount && parseFloat(rebuyAmount) > 0 ? colors.text.onBrand : colors.text.disabled,
                  fontWeight: "700", ...typography.body,
                }}>
                  Confirm Rebuy
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sectionLabel(colors: any, typography: any) {
  return {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
  };
}

function SmallFAB({ icon, label, onPress, active, activeColor, activeBorder, activeIcon, colors, spacing, typography, scaleAnim }: any) {
  const btn = (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: active ? activeColor : colors.bg.secondary,
        borderWidth: 1.5,
        borderColor: active ? activeBorder : colors.border.default,
        alignItems: "center", justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: active ? 0.2 : 0.08,
        shadowRadius: 4,
        elevation: active ? 4 : 1,
      }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={active ? activeIcon : colors.text.secondary}
      />
    </TouchableOpacity>
  );

  return (
    <View style={{ alignItems: "center" }}>
      {scaleAnim ? (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>{btn}</Animated.View>
      ) : btn}
      <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: "500", letterSpacing: 0.4, marginTop: spacing.xs }}>
        {label}
      </Text>
    </View>
  );
}

function InfoPill({ label, value, colors, spacing, radius, typography, accent }: any) {
  return (
    <View style={{
      backgroundColor: colors.bg.secondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: accent ? colors.border.warning : colors.border.subtle,
      alignItems: "center",
      minWidth: 80,
    }}>
      <Text style={{ color: colors.text.tertiary, ...typography.caption, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ color: accent ?? colors.text.primary, ...typography.bodySm, fontWeight: "600", marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}
