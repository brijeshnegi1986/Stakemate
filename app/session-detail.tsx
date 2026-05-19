import { usePokerTheme } from "@/hooks/use-poker-theme";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { deleteSession, getRebuysTotal, parseRebuys, saveNotes } from "../db/database";

export default function SessionDetailScreen() {
  const { session: sessionParam } = useLocalSearchParams();
  const session = sessionParam ? JSON.parse(sessionParam as string) : null;
  const { colors, spacing, radius, typography } = usePokerTheme();

  const [notes, setNotes] = useState<string>(session?.notes ?? "");
  const [notesChanged, setNotesChanged] = useState(false);

  if (!session) {
    router.back();
    return null;
  }

  const isTournament = session.type === "tournament";
  const profit: number = session.profit ?? 0;
  const profitColor = profit >= 0 ? colors.text.success : colors.text.danger;
  const cardBorderColor = profit >= 0 ? colors.border.success : colors.border.danger;

  const handleSaveNotes = () => {
    saveNotes(session.id, notes);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotesChanged(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete Session", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteSession(session.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace("/(tabs)");
        },
      },
    ]);
  };

  const handleEdit = () => {
    router.push({ pathname: "/session-edit", params: { session: sessionParam } });
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Type badge ── */}
          <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: spacing["2xl"] }}>
            <View style={{
              backgroundColor: colors.bg.tertiary,
              borderRadius: radius.full,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderWidth: 1,
              borderColor: colors.border.default,
            }}>
              <Text style={{ color: colors.text.secondary, fontWeight: "700", ...typography.label }}>
                {isTournament ? "Tournament" : "Cash Game"}
              </Text>
            </View>
          </View>

          {/* ── Profit card ── */}
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: cardBorderColor,
            padding: spacing["2xl"],
            alignItems: "center",
            marginBottom: spacing["2xl"],
          }}>
            <Text style={{
              color: colors.text.tertiary,
              ...typography.caption,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: spacing.sm,
            }}>
              Profit
            </Text>
            <Text style={{ ...typography.display, fontWeight: "700", color: profitColor }}>
              {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(0)}
            </Text>
            <Text style={{ color: colors.text.tertiary, ...typography.caption, marginTop: spacing.xs }}>
              {profit >= 0 ? "Winning session" : "Better luck next time"}
            </Text>
          </View>

          {/* ── Details ── */}
          <Text style={[sectionLabel, { marginBottom: spacing.sm }]}>Details</Text>
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.lg,
            borderWidth: 1,
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

          {/* ── Notes ── */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.sm,
          }}>
            <Text style={sectionLabel}>Notes</Text>
            {notesChanged && (
              <TouchableOpacity
                onPress={handleSaveNotes}
                style={{
                  backgroundColor: colors.bg.brand,
                  borderRadius: radius.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                }}
              >
                <Text style={{ color: colors.text.onBrand, ...typography.caption, fontWeight: "700" }}>
                  Save
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: notesChanged ? colors.border.brand : colors.border.default,
            padding: spacing.lg,
            minHeight: 100,
          }}>
            <TextInput
              multiline
              placeholder="Add notes about this session..."
              placeholderTextColor={colors.text.disabled}
              value={notes}
              onChangeText={(t) => { setNotes(t); setNotesChanged(true); }}
              style={{
                color: colors.text.primary,
                ...typography.bodySm,
                lineHeight: 22,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />
          </View>
        </ScrollView>

        {/* ── Bottom action bar ── */}
        <View style={{
          padding: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.border.default,
          backgroundColor: colors.bg.primary,
          flexDirection: "row",
          gap: spacing.md,
        }}>
          <TouchableOpacity
            onPress={handleDelete}
            style={{
              flex: 1,
              paddingVertical: spacing.lg,
              borderRadius: radius.md,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border.danger,
            }}
          >
            <Text style={{ color: colors.text.danger, fontWeight: "600", ...typography.body }}>
              Delete
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleEdit}
            style={{
              flex: 2,
              paddingVertical: spacing.lg,
              borderRadius: radius.md,
              alignItems: "center",
              backgroundColor: colors.bg.brand,
            }}
          >
            <Text style={{ color: colors.text.onBrand, fontWeight: "700", ...typography.body }}>
              Edit Session
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
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
