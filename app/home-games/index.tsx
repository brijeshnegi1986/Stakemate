import { AddPlayerSheet } from "@/components/HomeGameSheets";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { syncHomeGameToCloud } from "@/lib/sync";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  addHomeGamePlayer,
  getActiveHomeGame,
  HomeGameUnit,
  startHomeGame,
} from "../../db/database";

export default function NewHomeGameScreen() {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const { user } = useAuth();

  const [name, setName]     = useState("Home Game");
  const [venue, setVenue]   = useState("");
  const [unit, setUnit]     = useState<HomeGameUnit>("currency");
  const [players, setPlayers] = useState<string[]>([]);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);

  const isReady = name.trim().length > 0 && players.length > 0;

  const handleRemovePlayer = (i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayers((p) => p.filter((_, idx) => idx !== i));
  };

  const handleStart = () => {
    if (!isReady) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const today = new Date().toISOString().slice(0, 10);
    const gameId = startHomeGame({ name: name.trim(), venue: venue.trim(), date: today, unit });
    players.forEach((p) => addHomeGamePlayer(gameId, p));
    if (user?.id) syncHomeGameToCloud(user.id, gameId).catch(console.error);
    router.replace("/home-games/active");
  };

  const labelStyle = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    marginBottom: spacing.sm,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {getActiveHomeGame() && (
          <TouchableOpacity
            onPress={() => router.replace("/home-games/active")}
            activeOpacity={0.85}
            style={{
              flexDirection: "row", alignItems: "center", gap: spacing.sm,
              backgroundColor: colors.bg.brand + "12", borderRadius: radius.lg,
              borderWidth: 1, borderColor: colors.border.brand,
              padding: spacing.lg, marginBottom: spacing["2xl"],
            }}
          >
            <Ionicons name="play-circle" size={20} color={colors.text.brand} />
            <Text style={{ flex: 1, color: colors.text.brand, ...typography.bodySm, fontWeight: "600" }}>
              You have a game in progress — resume it?
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text.brand} />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => router.push("/home-game-history")} style={{ alignSelf: "flex-end", marginBottom: spacing.lg }}>
          <Text style={{ color: colors.text.brand, ...typography.bodySm, fontWeight: "600" }}>History</Text>
        </TouchableOpacity>

        <Text style={labelStyle}>Game Name</Text>
        <View style={{
          backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
          borderColor: colors.border.default, paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
        }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Friday Night Game"
            placeholderTextColor={colors.text.disabled}
            style={{ color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.body }}
          />
        </View>

        <Text style={labelStyle}>Venue (optional)</Text>
        <View style={{
          backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
          borderColor: colors.border.default, paddingHorizontal: spacing.lg, marginBottom: spacing["2xl"],
        }}>
          <TextInput
            value={venue}
            onChangeText={setVenue}
            placeholder="e.g. My place"
            placeholderTextColor={colors.text.disabled}
            style={{ color: colors.text.primary, paddingVertical: spacing.lg, ...inputTypo.body }}
          />
        </View>

        <Text style={labelStyle}>Unit</Text>
        <SegmentedControl
          options={[
            { value: "currency", label: "Currency", icon: "cash-outline" },
            { value: "chips",    label: "Chips",    icon: "ellipse-outline" },
          ]}
          selected={unit}
          onChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setUnit(v); }}
          style={{ marginBottom: spacing["2xl"] }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={labelStyle}>Players</Text>
          <TouchableOpacity onPress={() => setAddPlayerOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add-circle" size={18} color={colors.text.brand} />
            <Text style={{ color: colors.text.brand, ...typography.bodySm, fontWeight: "600" }}>Add</Text>
          </TouchableOpacity>
        </View>

        {players.length === 0 ? (
          <View style={{
            borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default,
            borderStyle: "dashed", padding: spacing["2xl"], alignItems: "center",
          }}>
            <Text style={{ color: colors.text.disabled, ...typography.bodySm }}>No players added yet</Text>
          </View>
        ) : (
          <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden" }}>
            {players.map((p, i) => (
              <View
                key={`${p}-${i}`}
                style={[
                  styles.playerRow,
                  { backgroundColor: colors.bg.primary },
                  i < players.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                ]}
              >
                <Text style={{ flex: 1, color: colors.text.primary, ...typography.body, fontWeight: "500" }}>{p}</Text>
                <TouchableOpacity onPress={() => handleRemovePlayer(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{
        padding: spacing.lg,
        paddingBottom: Platform.OS === "ios" ? spacing["2xl"] : spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.border.default,
        backgroundColor: colors.bg.primary,
      }}>
        {!isReady && (
          <Text style={{ color: colors.text.disabled, ...typography.caption, textAlign: "center", marginBottom: spacing.sm }}>
            Add a name and at least one player to start
          </Text>
        )}
        <TouchableOpacity
          onPress={handleStart}
          disabled={!isReady}
          activeOpacity={0.85}
          style={{
            paddingVertical: spacing.lg + 2,
            borderRadius: radius.lg,
            alignItems: "center",
            backgroundColor: isReady ? colors.bg.brand : colors.state.disabled,
          }}
        >
          <Text style={{ color: isReady ? colors.text.onBrand : colors.text.disabled, fontWeight: "700", ...typography.body }}>
            Start Game
          </Text>
        </TouchableOpacity>
      </View>

      <AddPlayerSheet
        visible={addPlayerOpen}
        unit={unit}
        onClose={() => setAddPlayerOpen(false)}
        onAdd={(playerName) => setPlayers((p) => [...p, playerName])}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
