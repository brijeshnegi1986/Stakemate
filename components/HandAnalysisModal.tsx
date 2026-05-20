import { BACKEND_URL } from "@/constants/config";
import { CardText } from "@/components/CardText";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StreetAnalysis {
  heroAction?: string;
  assessment?: string;
  suggestion?: string;
  reasoning?: string;
  grade?: string;
}

interface HandAnalysis {
  preflop?: StreetAnalysis;
  flop?: StreetAnalysis;
  turn?: StreetAnalysis;
  river?: StreetAnalysis;
  summary?: string;
}

// ── Grade config ──────────────────────────────────────────────────────────────

const GRADE_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  A: { color: "#38a169", label: "Excellent", bg: "#38a16922" },
  B: { color: "#3182ce", label: "Good",      bg: "#3182ce22" },
  C: { color: "#d69e2e", label: "Marginal",  bg: "#d69e2e22" },
  D: { color: "#e53e3e", label: "Mistake",   bg: "#e53e3e22" },
};

const STREETS = ["preflop", "flop", "turn", "river"] as const;

// ── Street Card ───────────────────────────────────────────────────────────────

function StreetCard({ street, data, colors, radius }: {
  street: string;
  data: StreetAnalysis;
  colors: any;
  radius: any;
}) {
  const grade = data.grade ?? "?";
  const gradeConf = GRADE_CONFIG[grade];

  return (
    <View style={{
      backgroundColor: colors.bg.secondary, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border.default, overflow: "hidden",
    }}>
      {/* Street header */}
      <View style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: colors.bg.tertiary,
        borderBottomWidth: 1, borderColor: colors.border.subtle,
      }}>
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "800", textTransform: "capitalize" }}>
          {street}
        </Text>
        {gradeConf && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 5,
            backgroundColor: gradeConf.bg, borderRadius: radius.full,
            paddingHorizontal: 10, paddingVertical: 3,
          }}>
            <Text style={{ color: gradeConf.color, fontSize: 14, fontWeight: "900" }}>{grade}</Text>
            <Text style={{ color: gradeConf.color, fontSize: 11, fontWeight: "600" }}>{gradeConf.label}</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        {data.heroAction && (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Your Action
            </Text>
            <CardText text={data.heroAction} baseColor={colors.text.primary} style={{ fontSize: 13 }} />
          </View>
        )}

        {data.assessment && (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Assessment
            </Text>
            <CardText text={data.assessment} baseColor={colors.text.secondary} style={{ fontSize: 13 }} />
          </View>
        )}

        {data.reasoning && (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Reasoning
            </Text>
            <CardText text={data.reasoning} baseColor={colors.text.secondary} style={{ fontSize: 13 }} />
          </View>
        )}

        {data.suggestion && (
          <View style={{
            backgroundColor: colors.bg.brand + "14", borderRadius: radius.sm,
            borderLeftWidth: 3, borderLeftColor: colors.bg.brand, padding: 10,
          }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Do This Instead
            </Text>
            <CardText text={data.suggestion} baseColor={colors.text.brand} style={{ fontSize: 13 }} />
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  notes: string;
  onClose: () => void;
}

export function HandAnalysisModal({ visible, notes, onClose }: Props) {
  const { colors, radius } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading]     = useState(false);
  const [analysis, setAnalysis]   = useState<HandAnalysis | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function analyze() {
    if (!notes.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: notes }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Server returned ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      let rawText: string = data.text ?? "";

      // Strip markdown code fences if Claude wrapped the JSON
      rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      // Extract JSON object from text in case there's surrounding prose
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`No JSON found in response: ${rawText.slice(0, 100)}`);

      const parsed: HandAnalysis = JSON.parse(jsonMatch[0]);
      setAnalysis(parsed);
    } catch (e: any) {
      console.error("Hand analysis error:", e?.message ?? e);
      setError(
        e?.message?.includes("Network request failed")
          ? "No internet connection. Please try again when online."
          : "Analysis failed. Try again or make sure your notes describe a specific hand."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setAnalysis(null);
    setError(null);
    analyze();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 14,
          borderBottomWidth: 1, borderColor: colors.border.default,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: colors.text.brand, fontSize: 16, fontWeight: "600" }}>Close</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons name="cards-playing-outline" size={18} color={colors.text.primary} />
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "800" }}>Hand Review</Text>
          </View>
          <TouchableOpacity
            onPress={analyze}
            disabled={loading}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={{ color: loading ? colors.text.disabled : colors.text.brand, fontSize: 14, fontWeight: "700" }}>
              {analysis ? "Re-run" : "Analyze"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Notes preview */}
          <View style={{
            backgroundColor: colors.bg.secondary, borderRadius: radius.lg,
            borderWidth: 1, borderColor: colors.border.default,
            padding: 14, marginBottom: 20,
          }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
              Your Notes
            </Text>
            <CardText text={notes} baseColor={colors.text.secondary} style={{ fontSize: 13 }} />
          </View>

          {/* Loading */}
          {loading && (
            <View style={{ alignItems: "center", gap: 14, marginTop: 48 }}>
              <ActivityIndicator color={colors.text.brand} size="large" />
              <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Analyzing your hand…</Text>
            </View>
          )}

          {/* Error */}
          {!loading && error && (
            <View style={{ alignItems: "center", gap: 12, marginTop: 48 }}>
              <MaterialCommunityIcons name="alert-circle-outline" size={44} color={colors.text.danger} />
              <Text style={{ color: colors.text.danger, fontSize: 14, textAlign: "center", paddingHorizontal: 24 }}>
                {error}
              </Text>
              <TouchableOpacity
                onPress={analyze}
                style={{ backgroundColor: colors.bg.brand, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 12 }}
              >
                <Text style={{ color: colors.text.onBrand, fontWeight: "700" }}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty — not yet analyzed */}
          {!loading && !error && !analysis && (
            <View style={{ alignItems: "center", gap: 12, marginTop: 48 }}>
              <MaterialCommunityIcons name="cards-playing-outline" size={56} color={colors.text.tertiary} />
              <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: "700" }}>Analyzing hand…</Text>
              <Text style={{ color: colors.text.secondary, fontSize: 13, textAlign: "center", paddingHorizontal: 32, lineHeight: 19 }}>
                Getting street-by-street coaching feedback on your hand.
              </Text>
            </View>
          )}

          {/* Results */}
          {!loading && analysis && (
            <View style={{ gap: 12 }}>
              {STREETS.map(street => {
                const streetData = analysis[street];
                if (!streetData) return null;
                return (
                  <StreetCard
                    key={street}
                    street={street}
                    data={streetData}
                    colors={colors}
                    radius={radius}
                  />
                );
              })}

              {/* Summary */}
              {analysis.summary && (
                <View style={{
                  backgroundColor: colors.bg.secondary, borderRadius: radius.lg,
                  borderWidth: 2, borderColor: colors.border.brand, padding: 16,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <MaterialCommunityIcons name="school-outline" size={16} color={colors.text.brand} />
                    <Text style={{ color: colors.text.brand, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Coach Summary
                    </Text>
                  </View>
                  <CardText text={analysis.summary} baseColor={colors.text.primary} style={{ fontSize: 14, lineHeight: 22 }} />
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
