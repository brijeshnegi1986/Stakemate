import { CardText } from "@/components/CardText";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { createPost } from "@/lib/social";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteSession, getRebuysTotal, parseRebuys } from "../db/database";
import { deleteSessionFromCloud } from "@/lib/sync";

export default function SessionDetailScreen() {
  const { session: sessionParam } = useLocalSearchParams();
  const session = sessionParam ? JSON.parse(sessionParam as string) : null;
  const { colors, spacing, typography } = usePokerTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [shareVisible, setShareVisible] = useState(false);
  const [shareCaption, setShareCaption] = useState("");
  const [sharing, setSharing] = useState(false);

  if (!session) {
    router.back();
    return null;
  }

  const isTournament = session.type === "tournament";
  const profit: number = session.profit ?? 0;
  const profitColor = profit >= 0 ? colors.text.success : colors.text.danger;
  const cardBorderColor = profit >= 0 ? colors.border.success : colors.border.danger;

  const handleDelete = () => {
    Alert.alert("Delete Session", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteSession(session.id);
          if (user?.id) deleteSessionFromCloud(user.id, session.id).catch(console.error);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace("/(tabs)");
        },
      },
    ]);
  };

  const handleEdit = () => {
    router.push({ pathname: "/session-edit", params: { session: sessionParam } });
  };

  const handleShare = async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "You need to be signed in to share sessions.");
      return;
    }
    setSharing(true);
    try {
      await createPost({
        user_id: user.id,
        session_type: isTournament ? "tournament" : "cash",
        session_name: isTournament ? (session.tournamentName || "Tournament") : (session.stakes ? `${session.stakes} NLH` : "Cash Game"),
        venue: session.venue ?? null,
        amount: profit,
        amount_label: isTournament ? "Payout" : "Profit",
        status: shareCaption.trim() || null,
        content: null,
        is_live: false,
        visibility: "public",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShareVisible(false);
      setShareCaption("");
      Alert.alert("Shared!", "Your session has been posted to the Social feed.");
    } catch (e) {
      Alert.alert("Error", "Could not share session. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const handleShareResult = async () => {
    try {
      const title = isTournament
        ? (session.tournamentName || "Tournament")
        : (session.stakes ? `${session.stakes} NLH` : "Cash Game");
      const netResult = Number(profit) || 0;
      const lines = [
        `🃏 ${title}`,
        `📅 ${formatDate(session.date)}`,
        session.venue ? `📍 ${session.venue}` : null,
        `💰 Buy-in: $${session.buyIn}`,
        `${netResult >= 0 ? "📈" : "📉"} ${isTournament ? "Net result" : "Profit"}: ${netResult >= 0 ? "+" : "-"}$${Math.abs(netResult).toFixed(0)}`,
        `\nTracked on Stakemate 🃏`,
      ].filter(Boolean).join("\n");
      await Share.share({
        message: lines,
        url: "https://apps.apple.com/app/id6772975225",
        title: "Stakemate — Poker Bankroll Tracker",
      });
    } catch { /* cancelled */ }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const sectionLabel = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TouchableOpacity
                onPress={() => setShareVisible(true)}
                activeOpacity={0.75}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="share-social-outline" size={17} color={colors.text.brand} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEdit}
                activeOpacity={0.75}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="create-outline" size={17} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                activeOpacity={0.75}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(239,68,68,0.1)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="trash-outline" size={17} color={colors.text.danger} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Profit card ── */}
          <View style={{
            backgroundColor: colors.bg.primary,
            borderRadius: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border.default,
            overflow: "hidden",
            marginBottom: spacing["2xl"],
          }}>
            {/* Top row — matches home/stats session row layout */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingBottom: 14 }}>
              <View style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isTournament ? "#8B5CF6" : "#F97316",
              }}>
                <Ionicons name={isTournament ? "trophy-outline" : "cash-outline"} size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>
                  {isTournament ? (session.tournamentName || "Tournament") : `${session.stakes} NLH`}
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.tertiary }}>
                  {new Date(session.date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {session.venue ? ` · ${session.venue}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={{ fontSize: 22, fontWeight: "900", color: profitColor, letterSpacing: -0.5 }}>
                  {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(0)}
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.tertiary }}>
                  {profit >= 0 ? "Winning session" : "Better luck next time"}
                </Text>
              </View>
            </View>

            {/* Divider stat strip */}
            <View style={{
              flexDirection: "row",
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border.subtle,
            }}>
              {[
                { label: "Buy-in", value: `$${session.buyIn}` },
                { label: isTournament ? "Payout" : "Cash-out", value: isTournament ? (session.payout > 0 ? `$${session.payout}` : "—") : `$${session.cashOut}` },
                { label: "Duration", value: session.duration > 0 ? `${Math.floor(session.duration)}h${Math.round((session.duration % 1) * 60) > 0 ? `${Math.round((session.duration % 1) * 60)}m` : ""}` : "—" },
              ].map((s, i, arr) => (
                <View key={s.label} style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 12,
                  borderRightWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderRightColor: colors.border.subtle,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text.primary, marginBottom: 2 }}>{s.value}</Text>
                  <Text style={{ fontSize: 11, color: colors.text.tertiary }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Details ── */}
          <Text style={[sectionLabel, { marginBottom: spacing.sm }]}>Details</Text>
          <View style={{
            backgroundColor: colors.bg.primary,
            borderRadius: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border.default,
            marginBottom: spacing["2xl"],
            overflow: "hidden",
          }}>
            <Row label="Date" value={formatDate(session.date)} colors={colors} spacing={spacing} typography={typography} />
            {isTournament ? (
              <>
                <Row label="Tournament" value={session.tournamentName || "—"} colors={colors} spacing={spacing} typography={typography} />
                <Row label="Buy-in" value={`$${session.buyIn}`} colors={colors} spacing={spacing} typography={typography} />
                {parseRebuys(session).length > 0 && (
                  <Row label="Re-entries" value={`${parseRebuys(session).length}x · +$${getRebuysTotal(session)}`}
                    colors={colors} spacing={spacing} typography={typography} accent={colors.text.warning} />
                )}
                {parseRebuys(session).length > 0 && (
                  <Row label="Total invested" value={`$${session.buyIn + getRebuysTotal(session)}`}
                    colors={colors} spacing={spacing} typography={typography} />
                )}
                {session.entries > 0 && <Row label="Entries" value={String(session.entries)} colors={colors} spacing={spacing} typography={typography} />}
                {session.position > 0 && <Row label="Position" value={`#${session.position}`} colors={colors} spacing={spacing} typography={typography} />}
                <Row label="Payout" value={session.payout > 0 ? `$${session.payout}` : "—"} colors={colors} spacing={spacing} typography={typography} />
                {session.duration > 0 && <Row label="Duration" value={`${session.duration}h`} colors={colors} spacing={spacing} typography={typography} />}
                {session.venue ? <Row label="Venue" value={session.venue} colors={colors} spacing={spacing} typography={typography} last /> : null}
              </>
            ) : (
              <>
                {session.venue ? <Row label="Venue" value={session.venue} colors={colors} spacing={spacing} typography={typography} /> : null}
                <Row label="Stakes" value={session.stakes || "—"} colors={colors} spacing={spacing} typography={typography} />
                <Row label="Buy-in" value={`$${session.buyIn}`} colors={colors} spacing={spacing} typography={typography} />
                {parseRebuys(session).length > 0 && (
                  <Row
                    label="Rebuys"
                    value={`${parseRebuys(session).length}x · +$${getRebuysTotal(session)}`}
                    colors={colors} spacing={spacing} typography={typography}
                    accent={colors.text.warning}
                  />
                )}
                {parseRebuys(session).length > 0 && (
                  <Row
                    label="Total invested"
                    value={`$${session.buyIn + getRebuysTotal(session)}`}
                    colors={colors} spacing={spacing} typography={typography}
                  />
                )}
                <Row label="Cash-out" value={`$${session.cashOut}`} colors={colors} spacing={spacing} typography={typography} />
                {session.duration > 0 && <Row label="Duration" value={`${session.duration}h`} colors={colors} spacing={spacing} typography={typography} last />}
              </>
            )}
          </View>
        </ScrollView>


        {/* ── Share to Social modal ── */}
        <Modal visible={shareVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShareVisible(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
            {/* iOS nav header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.strong, backgroundColor: colors.bg.primary, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3, zIndex: 1 }}>
              <TouchableOpacity onPress={() => setShareVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ width: 72 }}>
                <Text style={{ fontSize: 16, color: colors.text.secondary }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text.primary }}>Share to Social</Text>
              <View style={{ width: 72 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 13, color: colors.text.tertiary, marginBottom: 20 }}>Post this session to the Stakemate community feed.</Text>

              {/* Session preview */}
              <View style={{ backgroundColor: colors.bg.primary, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border.default }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: isTournament ? "#8B5CF6" : "#F97316" }}>
                    <Ionicons name={isTournament ? "trophy-outline" : "cash-outline"} size={18} color="#fff" />
                  </View>
                  <View>
                    <Text style={{ color: colors.text.primary, fontWeight: "600", fontSize: 14 }}>
                      {isTournament ? (session.tournamentName || "Tournament") : `${session.stakes} NLH`}
                    </Text>
                    {session.venue ? <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{session.venue}</Text> : null}
                  </View>
                </View>
                <Text style={{ fontSize: 28, fontWeight: "900", color: profit >= 0 ? "#22C55E" : "#EF4444", letterSpacing: -0.5 }}>
                  {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(0)}
                </Text>
                <Text style={{ fontSize: 13, color: colors.text.tertiary, marginTop: 2 }}>{isTournament ? "Payout" : "Profit"}</Text>
              </View>

              {/* Caption input */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.secondary, marginBottom: 8 }}>Add a caption (optional)</Text>
              <TextInput
                value={shareCaption}
                onChangeText={setShareCaption}
                placeholder="e.g. Great night at the casino 🎰"
                placeholderTextColor={colors.text.disabled}
                multiline
                maxLength={140}
                style={{
                  backgroundColor: colors.bg.primary,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  padding: 12,
                  color: colors.text.primary,
                  fontSize: 14,
                  minHeight: 70,
                  textAlignVertical: "top",
                  marginBottom: 20,
                }}
              />

              <TouchableOpacity
                onPress={handleShare}
                disabled={sharing}
                activeOpacity={0.85}
                style={{
                  backgroundColor: "#155DFC",
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {sharing
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="share-social-outline" size={18} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Post to Social</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShareResult}
                activeOpacity={0.85}
                style={{
                  marginTop: 10,
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  borderWidth: 1.5,
                  borderColor: colors.border.brand,
                }}
              >
                <Ionicons name="share-outline" size={18} color={colors.text.brand} />
                <Text style={{ color: colors.text.brand, fontSize: 16, fontWeight: "700" }}>Share Externally</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </View>
  );
}

function Row({ label, value, colors, spacing, typography, last, accent }: any) {
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: colors.border.subtle,
    }}>
      <Text style={{ flex: 1, color: colors.text.tertiary, ...typography.bodySm }}>{label}</Text>
      <Text style={{ color: accent ?? colors.text.primary, ...typography.bodySm, fontWeight: "500" }}>{value}</Text>
    </View>
  );
}
