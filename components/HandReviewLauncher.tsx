import { HandAnalysisModal } from "./HandAnalysisModal";
import { SignInSheet } from "./SignInSheet";
import { useAuth } from "@/context/AuthContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const PURPLE = "#0891B2";

export function HandReviewLauncher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes]           = useState("");
  const [showAnalysis, setShowAnalysis] = useState(false);

  const canAnalyze = notes.trim().length >= 20;

  function handleClose() {
    setNotes("");
    setShowAnalysis(false);
    onClose();
  }

  if (visible && !user) {
    return (
      <SignInSheet
        visible={visible}
        onClose={onClose}
        icon="color-wand-outline"
        title="AI Hand Review"
        description="Sign in to get instant AI coaching on your poker hands and decisions."
      />
    );
  }

  if (showAnalysis) {
    return (
      <HandAnalysisModal
        visible
        notes={notes}
        onClose={() => {
          setShowAnalysis(false);
          setNotes("");
          onClose();
        }}
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: BRAND, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons name="cards-playing-outline" size={18} color={colors.text.primary} />
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "800" }}>Hand Review</Text>
          </View>
          <TouchableOpacity
            onPress={() => canAnalyze && setShowAnalysis(true)}
            disabled={!canAnalyze}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={{ color: canAnalyze ? BRAND : colors.text.tertiary, fontSize: 14, fontWeight: "700" }}>
              Analyze
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, padding: 16, gap: 14 }}>
          {/* Tip card */}
          <View style={[styles.tipCard, { backgroundColor: `${PURPLE}10`, borderColor: `${PURPLE}25` }]}>
            <Ionicons name="bulb-outline" size={15} color={PURPLE} />
            <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 13, lineHeight: 19 }}>
              Include your position, hole cards, opponent reads, and the action on each street. More detail = sharper coaching.
            </Text>
          </View>

          {/* Input */}
          <View style={[styles.inputBox, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={
                "Example:\nUTG with A♠K♦ in a $2/$5 cash game.\nRaise to $20, BTN calls.\nFlop: K♥8♣3♦ — I c-bet $30, BTN raises to $90. \nWhat should I do?"
              }
              placeholderTextColor={colors.text.tertiary}
              multiline
              autoFocus
              style={{ flex: 1, color: colors.text.primary, fontSize: 14, lineHeight: 21, textAlignVertical: "top" }}
            />
          </View>

          {/* Analyse button */}
          <TouchableOpacity
            onPress={() => canAnalyze && setShowAnalysis(true)}
            disabled={!canAnalyze}
            activeOpacity={0.85}
            style={[
              styles.analyzeBtn,
              { backgroundColor: canAnalyze ? PURPLE : colors.bg.secondary, marginBottom: insets.bottom + 8 },
            ]}
          >
            <MaterialCommunityIcons
              name="cards-playing-outline"
              size={17}
              color={canAnalyze ? "#fff" : colors.text.tertiary}
            />
            <Text style={{ color: canAnalyze ? "#fff" : colors.text.tertiary, fontSize: 15, fontWeight: "700" }}>
              Analyse with AI
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  inputBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
  },
});
