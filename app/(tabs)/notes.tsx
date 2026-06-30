import { BACKEND_URL } from "@/constants/config";
import {
  deleteNoteEntry, getNoteHistory, getSessions,
  HandMetadata, NoteEntry, saveNoteEntry, Session,
  updateNoteEntry,
} from "@/db/database";
import { createPost } from "@/lib/social";
import { syncNoteToCloud, deleteNoteFromCloud } from "@/lib/sync";
import { useAuth } from "@/context/AuthContext";
import { HandAnalysisModal } from "@/components/HandAnalysisModal";
import { SignInSheet } from "@/components/SignInSheet";
import { CardText } from "@/components/CardText";
import { CardRow } from "@/components/PlayingCard";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal,
  Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}
function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function noteDisplayText(entry: NoteEntry) {
  return (entry.enhanced_notes ?? entry.raw_notes).trim();
}
function parseMetadata(entry: NoteEntry): HandMetadata | null {
  if (!entry.metadata) return null;
  try { return JSON.parse(entry.metadata); } catch { return null; }
}
function buildExportText(entry: NoteEntry): string {
  const lines: string[] = [];
  if (entry.title) lines.push(`# ${entry.title}`, "");
  if (entry.session_type !== "standalone") {
    lines.push(`Session: ${entry.session_type === "tournament" ? "Tournament" : "Cash Game"}`);
    if (entry.session_date) lines.push(`Date: ${formatDate(entry.session_date)}`);
    if (entry.session_venue) lines.push(`Venue: ${entry.session_venue}`);
    const p = entry.session_profit ?? 0;
    lines.push(`Profit: ${p >= 0 ? "+" : ""}$${p.toFixed(0)}`, "");
  }
  lines.push(noteDisplayText(entry));
  if (entry.enhanced_notes && entry.raw_notes !== entry.enhanced_notes) {
    lines.push("", "---", "Original notes:", entry.raw_notes);
  }
  return lines.join("\n");
}

// ─── Chip selector ────────────────────────────────────────────────────────────

function ChipSelect({ label, options, value, onChange, colors }: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => onChange(active ? "" : opt)}
              activeOpacity={0.75}
              style={{
                paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
                backgroundColor: active ? colors.bg.brand : colors.bg.secondary,
                borderWidth: 1,
                borderColor: active ? colors.border.brand : colors.border.default,
              }}
            >
              <Text style={{ color: active ? colors.text.onBrand : colors.text.primary, fontSize: 13, fontWeight: active ? "700" : "500" }}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

export function NoteEditorModal({
  visible, initial, sessions, onClose, onSaved, colors,
}: {
  visible: boolean;
  initial: NoteEntry | null;
  sessions: Session[];
  onClose: () => void;
  onSaved: () => void;
  colors: any;
}) {
  const { user } = useAuth();
  const isEdit = !!initial;
  const initMeta = initial ? (parseMetadata(initial) ?? {}) : {};

  const [title,    setTitle]    = useState(initial?.title ?? "");
  const [body,     setBody]     = useState(initial ? (initial.enhanced_notes ?? initial.raw_notes) : "");
  const [sessionId, setSessionId] = useState<number>(initial?.session_id ?? 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [handOpen,  setHandOpen]  = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressedPreview, setCompressedPreview] = useState<string | null>(null);

  // Hand metadata state
  const [stakes,    setStakes]    = useState(initMeta.stakes   ?? "");
  const [betType,   setBetType]   = useState(initMeta.betType  ?? "");
  const [heroPos,   setHeroPos]   = useState(initMeta.heroPos  ?? "");
  const [vsPos,     setVsPos]     = useState(initMeta.vsPos    ?? "");
  const [holeInput, setHoleInput] = useState((initMeta.holeCards  ?? []).join(" "));
  const [boardInput, setBoardInput] = useState((initMeta.boardCards ?? []).join(" "));

  const insets = useSafeAreaInsets();
  const selectedSession = sessions.find(s => s.id === sessionId) ?? null;

  function buildMetadata(): HandMetadata | null {
    const holeCards  = holeInput.trim()  ? holeInput.trim().split(/\s+/)  : undefined;
    const boardCards = boardInput.trim() ? boardInput.trim().split(/\s+/) : undefined;
    const meta: HandMetadata = { stakes: stakes || undefined, betType: betType || undefined, heroPos: heroPos || undefined, vsPos: vsPos || undefined, holeCards, boardCards };
    const hasAny = Object.values(meta).some(v => v !== undefined);
    return hasAny ? meta : null;
  }

  async function handleCompress() {
    if (!body.trim()) return;
    if (!user) {
      Alert.alert("Sign in required", "Sign in to use AI features.");
      return;
    }
    setCompressing(true);
    setCompressedPreview(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/compress-hand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: body }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.compressed) setCompressedPreview(data.compressed);
      } else {
        Alert.alert("Compression failed", "Couldn't compress notes right now.");
      }
    } catch {
      Alert.alert("No connection", "AI compression needs an internet connection.");
    } finally { setCompressing(false); }
  }

  function handleSave() {
    if (!body.trim()) { Alert.alert("Empty note", "Please write something before saving."); return; }
    const metadata = buildMetadata();
    if (isEdit && initial) {
      updateNoteEntry(initial.id, { title, enhancedNotes: body, metadata });
      if (user?.id) syncNoteToCloud(user.id, initial.id).catch(console.error);
    } else {
      const sess = selectedSession;
      const newId = saveNoteEntry({
        sessionId: sess?.id ?? 0, sessionDate: sess?.date ?? "",
        sessionVenue: sess?.venue ?? "", sessionProfit: sess?.profit ?? 0,
        sessionType: sess ? (sess.type ?? "cash") : "standalone",
        rawNotes: body, enhancedNotes: null, title, metadata,
      });
      if (user?.id) syncNoteToCloud(user.id, newId).catch(console.error);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
          borderBottomWidth: 1, borderColor: colors.border.default,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: colors.text.brand, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "800" }}>
            {isEdit ? "Edit Note" : "New Note"}
          </Text>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: colors.text.brand, fontSize: 16, fontWeight: "800" }}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Hand title (e.g. Squeeze with 88)"
            placeholderTextColor={colors.text.tertiary}
            style={{ color: colors.text.primary, fontSize: 20, fontWeight: "700", borderBottomWidth: 1, borderColor: colors.border.default, paddingBottom: 10 }}
          />

          {/* ── Hand Details (collapsible) ── */}
          <TouchableOpacity
            onPress={() => setHandOpen(o => !o)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: colors.bg.tertiary, borderRadius: 12, borderWidth: 1.5,
              borderColor: colors.border.default, paddingHorizontal: 14, paddingVertical: 11,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="card-outline" size={16} color={colors.text.brand} />
              <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>Hand Details</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>(optional)</Text>
            </View>
            <Ionicons name={handOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.text.tertiary} />
          </TouchableOpacity>

          {handOpen && (
            <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border.default, padding: 14, gap: 4 }}>
              <ChipSelect label="Stakes" options={["1/1", "1/2", "2/3", "2/5", "5/5", "5/10"]} value={stakes} onChange={setStakes} colors={colors} />
              <ChipSelect label="Bet Type" options={["SRP", "3BP", "4BP", "5BP"]} value={betType} onChange={setBetType} colors={colors} />
              <ChipSelect label="Hero Position" options={["UTG", "HJ", "CO", "BTN", "SB", "BB"]} value={heroPos} onChange={setHeroPos} colors={colors} />
              <ChipSelect label="vs Villain" options={["OOP", "IP", "UTG", "HJ", "CO", "BTN", "SB", "BB"]} value={vsPos} onChange={setVsPos} colors={colors} />

              {/* Cards inputs */}
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 6, marginBottom: 6 }}>
                Hole Cards
              </Text>
              <TextInput
                value={holeInput}
                onChangeText={setHoleInput}
                placeholder="e.g. 8d 8h"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                style={{ backgroundColor: colors.bg.primary, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border.default, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, fontSize: 14, marginBottom: 10 }}
              />

              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                Board Cards
              </Text>
              <TextInput
                value={boardInput}
                onChangeText={setBoardInput}
                placeholder="e.g. Ts 7c 2c 5s 8c"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                style={{ backgroundColor: colors.bg.primary, borderRadius: 8, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, fontSize: 14 }}
              />
            </View>
          )}

          {/* Session picker */}
          {!isEdit && (
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                Link to session (optional)
              </Text>
              <TouchableOpacity
                onPress={() => setPickerOpen(p => !p)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg.tertiary, borderRadius: 12, borderWidth: 1.5, borderColor: sessionId ? colors.border.brand : colors.border.default, paddingHorizontal: 14, paddingVertical: 12 }}
              >
                <View style={{ flex: 1 }}>
                  {selectedSession ? (
                    <>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "600" }}>
                        {formatDate(selectedSession.date)} · {selectedSession.type === "tournament" ? "Tournament" : "Cash"}
                      </Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                        {selectedSession.venue || "No venue"} · {selectedSession.profit >= 0 ? "+" : ""}${selectedSession.profit.toFixed(0)}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>Standalone note</Text>
                  )}
                </View>
                <Ionicons name={pickerOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.text.tertiary} />
              </TouchableOpacity>

              {pickerOpen && (
                <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border.default, marginTop: 4, maxHeight: 220 }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <TouchableOpacity onPress={() => { setSessionId(0); setPickerOpen(false); }} style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border.subtle, flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name="document-outline" size={18} color={colors.text.tertiary} />
                      <Text style={{ color: sessionId === 0 ? colors.text.brand : colors.text.primary, fontSize: 14, fontWeight: sessionId === 0 ? "700" : "400" }}>Standalone note</Text>
                      {sessionId === 0 && <Ionicons name="checkmark" size={16} color={colors.text.brand} style={{ marginLeft: "auto" }} />}
                    </TouchableOpacity>
                    {sessions.map(s => (
                      <TouchableOpacity key={s.id} onPress={() => { setSessionId(s.id); setPickerOpen(false); }} style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border.subtle, flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: sessionId === s.id ? colors.text.brand : colors.text.primary, fontSize: 14, fontWeight: sessionId === s.id ? "700" : "400" }}>
                            {formatDate(s.date)} · {s.type === "tournament" ? "Tournament" : "Cash"}
                          </Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{s.venue || "No venue"} · {s.profit >= 0 ? "+" : ""}${s.profit.toFixed(0)}</Text>
                        </View>
                        {sessionId === s.id && <Ionicons name="checkmark" size={16} color={colors.text.brand} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Notes body */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>Notes</Text>
              {body.length > 0 && (
                <TouchableOpacity onPress={() => { setBody(""); setCompressedPreview(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: colors.text.danger, fontSize: 12, fontWeight: "600" }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              value={body} onChangeText={setBody} multiline
              placeholder="Write your hand notes here..."
              placeholderTextColor={colors.text.tertiary}
              style={{ backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border.default, padding: 14, color: colors.text.primary, fontSize: 15, lineHeight: 23, minHeight: 140, textAlignVertical: "top", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
            />
          </View>

          {/* Compress */}
          <TouchableOpacity onPress={handleCompress} disabled={compressing || !body.trim()} activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#155DFC", borderRadius: 12, paddingVertical: 14, opacity: !body.trim() ? 0.4 : 1 }}>
            {compressing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="list-outline" size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{compressing ? "Compressing…" : "Compress to Shorthand"}</Text>
          </TouchableOpacity>

          {/* Compressed preview */}
          {compressedPreview && (
            <View style={{ backgroundColor: "#155DFC14", borderRadius: 12, borderWidth: 1, borderColor: "#155DFC44", padding: 14, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#155DFC" />
                <Text style={{ color: "#155DFC", fontSize: 13, fontWeight: "700" }}>Compressed Version</Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 13, lineHeight: 21, fontFamily: "monospace" }}>{compressedPreview}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => { setBody(compressedPreview); setCompressedPreview(null); }}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#155DFC", borderRadius: 10, paddingVertical: 11 }}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Use This</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCompressedPreview(null)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg.secondary, borderRadius: 10, paddingVertical: 11, borderWidth: 1, borderColor: colors.border.default }}>
                  <Ionicons name="close" size={16} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: "700" }}>Keep Original</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Share Note Modal ─────────────────────────────────────────────────────────

function ShareNoteModal({
  entry, visible, onClose, colors, userId,
}: {
  entry: NoteEntry | null;
  visible: boolean;
  onClose: () => void;
  colors: any;
  userId: string | undefined;
}) {
  const [caption,     setCaption]     = useState("");
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [posting,     setPosting]     = useState(false);

  const BRAND = "#155DFC";

  async function handlePostToCommunity() {
    if (!userId) { Alert.alert("Not signed in", "Sign in to share to the community."); return; }
    if (!entry)  return;
    setPosting(true);
    try {
      const noteText  = noteDisplayText(entry);
      const baseText  = entry.title ? `${entry.title}\n\n${noteText}` : noteText;
      const content   = caption.trim() ? `${caption.trim()}\n\n${baseText}` : baseText;
      await createPost({
        user_id: userId,
        content,
        session_type: "cash",
        visibility: friendsOnly ? "friends" : "public",
      });
      setCaption("");
      onClose();
      Alert.alert(
        friendsOnly ? "Shared with followers!" : "Posted to community!",
        friendsOnly
          ? "Your hand note is visible to people who follow you."
          : "Your hand note is now on the community feed.",
      );
    } catch {
      Alert.alert("Error", "Could not share to community.");
    } finally {
      setPosting(false);
    }
  }

  async function handleShareToFriends() {
    if (!entry) return;
    onClose();
    try {
      const text = buildExportText(entry);
      await Share.share({ message: text, title: entry.title || "Hand Note" });
    } catch { /* cancelled */ }
  }

  if (!entry) return null;

  const preview = (entry.title || noteDisplayText(entry)).slice(0, 80);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
        {/* iOS nav header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.default, backgroundColor: colors.bg.primary }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ width: 72 }}>
            <Text style={{ fontSize: 16, color: colors.text.secondary }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text.primary }}>Share Hand Note</Text>
          <View style={{ width: 72 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Note preview chip */}
          <View style={[shareStyles.preview, { backgroundColor: colors.bg.primary, borderColor: colors.border.default, marginBottom: 16 }]}>
            <View style={[shareStyles.previewIcon, { backgroundColor: `${BRAND}14` }]}>
              <Ionicons name="document-text-outline" size={16} color={BRAND} />
            </View>
            <Text style={[shareStyles.previewText, { color: colors.text.secondary }]} numberOfLines={2}>
              {preview}
            </Text>
          </View>

          {/* Caption */}
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption… (optional)"
            placeholderTextColor={colors.text.disabled}
            multiline
            maxLength={200}
            style={[shareStyles.captionInput, {
              backgroundColor: colors.bg.primary,
              color: colors.text.primary,
              borderColor: colors.border.default,
            }]}
          />

          {/* Friends-only toggle */}
          <View style={[shareStyles.toggleRow, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="people-outline" size={16} color={friendsOnly ? BRAND : colors.text.secondary} />
                <Text style={[shareStyles.toggleLabel, { color: colors.text.primary }]}>Followers only</Text>
              </View>
              <Text style={[shareStyles.toggleSub, { color: colors.text.tertiary }]}>
                {friendsOnly ? "Only your followers will see this post" : "Visible to everyone on the community feed"}
              </Text>
            </View>
            <Switch
              value={friendsOnly}
              onValueChange={setFriendsOnly}
              trackColor={{ false: colors.border.default, true: `${BRAND}55` }}
              thumbColor={friendsOnly ? BRAND : colors.text.tertiary}
            />
          </View>

          {/* Actions */}
          <TouchableOpacity
            onPress={handlePostToCommunity}
            disabled={posting}
            activeOpacity={0.88}
            style={[shareStyles.primaryBtn, { backgroundColor: BRAND, opacity: posting ? 0.6 : 1 }]}
          >
            {posting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name={friendsOnly ? "people" : "earth"} size={17} color="#fff" />
            }
            <Text style={shareStyles.primaryBtnText}>
              {posting ? "Posting…" : friendsOnly ? "Post to Followers" : "Post to Community"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShareToFriends}
            activeOpacity={0.8}
            style={[shareStyles.secondaryBtn, { borderColor: colors.border.default, backgroundColor: colors.bg.primary }]}
          >
            <Ionicons name="share-outline" size={17} color={colors.text.secondary} />
            <Text style={[shareStyles.secondaryBtnText, { color: colors.text.secondary }]}>Share via…</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const shareStyles = StyleSheet.create({
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
  },
  previewIcon: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  previewText: { flex: 1, fontSize: 13, lineHeight: 19 },
  captionInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleSub: { fontSize: 12, lineHeight: 17 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 10,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600" },
});

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function Tag({ label, colors }: { label: string; colors: any }) {
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
      <Text style={[styles.tagText, { color: colors.text.secondary }]}>{label}</Text>
    </View>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({
  entry, onEdit, onDelete, onCopy, onExport, onReviewHand, onShare, colors,
}: {
  entry: NoteEntry;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onExport: () => void;
  onReviewHand: () => void;
  onShare: () => void;
  colors: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta        = parseMetadata(entry);
  const displayText = noteDisplayText(entry);
  const isEnhanced  = !!entry.enhanced_notes && entry.enhanced_notes !== entry.raw_notes;
  const isReviewed  = !!entry.hand_analysis;

  const hasChips    = meta && (meta.stakes || meta.betType || meta.heroPos || meta.vsPos);
  const hasCards    = meta && ((meta.holeCards?.length ?? 0) > 0 || (meta.boardCards?.length ?? 0) > 0);

  // Avatar initial from title or session date
  const avatarChar = (entry.title || "H")[0].toUpperCase();
  const date = formatTs(entry.updated_at > 0 ? entry.updated_at : entry.created_at);

  return (
    <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
      {/* ── Header row ── */}
      <View style={styles.cardHeader}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.bg.brand + "22", borderColor: colors.border.brand }]}>
          <Text style={[styles.avatarText, { color: colors.text.brand }]}>{avatarChar}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.authorName, { color: colors.text.primary }]}>My Hand</Text>
            {isEnhanced && (
              <View style={styles.aiBadge}>
                <Ionicons name="color-wand-outline" size={9} color="#7c3aed" />
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            )}
            {isReviewed && (
              <View style={[styles.aiBadge, { backgroundColor: colors.text.danger + "18" }]}>
                <Ionicons name="card-outline" size={9} color={colors.text.danger} />
                <Text style={[styles.aiBadgeText, { color: colors.text.danger }]}>Reviewed</Text>
              </View>
            )}
          </View>
          <Text style={[styles.dateText, { color: colors.text.tertiary }]}>{date}</Text>
        </View>

        <TouchableOpacity onPress={() => setExpanded(e => !e)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* ── Title ── */}
      {entry.title ? (
        <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
          <Text style={[styles.handTitle, { color: colors.text.primary }]}>{entry.title}</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Tag chips ── */}
      {hasChips && (
        <View style={styles.tagRow}>
          {meta!.stakes   && <Tag label={meta!.stakes}   colors={colors} />}
          {meta!.betType  && <Tag label={meta!.betType}  colors={colors} />}
          {meta!.heroPos  && <Tag label={meta!.heroPos}  colors={colors} />}
          {meta!.vsPos    && <Tag label={`vs ${meta!.vsPos}`} colors={colors} />}
        </View>
      )}

      {/* ── Playing cards ── */}
      {hasCards && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <CardRow
            holeCards={meta!.holeCards}
            boardCards={meta!.boardCards}
            size="md"
          />
        </View>
      )}

      {/* ── Note preview (collapsed) ── */}
      {!expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7}>
          <Text style={[styles.notePreview, { color: colors.text.secondary }]} numberOfLines={2}>
            {displayText}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Expanded body + actions ── */}
      {expanded && (
        <>
          <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }}>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle }} />
            <CardText text={displayText} baseColor={colors.text.primary} style={{ fontSize: 14, lineHeight: 22 }} />
            {isEnhanced && (
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Original</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 20 }}>{entry.raw_notes}</Text>
              </View>
            )}
          </View>

          <View style={[styles.actionBar, { borderTopColor: colors.border.subtle }]}>
            <TouchableOpacity onPress={onReviewHand} activeOpacity={0.7} style={styles.actionBarBtn}>
              <Ionicons name="card-outline" size={18} color={colors.text.tertiary} />
              <Text style={[styles.actionBarLabel, { color: colors.text.tertiary }]}>Review</Text>
            </TouchableOpacity>
            <View style={{ width: 1, height: 18, backgroundColor: colors.border.subtle }} />
            <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={styles.actionBarBtn}>
              <Ionicons name="create-outline" size={18} color={colors.text.tertiary} />
              <Text style={[styles.actionBarLabel, { color: colors.text.tertiary }]}>Edit</Text>
            </TouchableOpacity>
            <View style={{ width: 1, height: 18, backgroundColor: colors.border.subtle }} />
            <TouchableOpacity onPress={onCopy} activeOpacity={0.7} style={styles.actionBarBtn}>
              <Ionicons name="copy-outline" size={18} color={colors.text.tertiary} />
              <Text style={[styles.actionBarLabel, { color: colors.text.tertiary }]}>Copy</Text>
            </TouchableOpacity>
            <View style={{ width: 1, height: 18, backgroundColor: colors.border.subtle }} />
            <TouchableOpacity onPress={onShare} activeOpacity={0.7} style={styles.actionBarBtn}>
              <Ionicons name="share-social-outline" size={18} color={colors.text.brand} />
              <Text style={[styles.actionBarLabel, { color: colors.text.brand }]}>Share</Text>
            </TouchableOpacity>
            <View style={{ width: 1, height: 18, backgroundColor: colors.border.subtle }} />
            <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.actionBarBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.text.danger} />
              <Text style={[styles.actionBarLabel, { color: colors.text.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}


// ─── Main Screen ──────────────────────────────────────────────────────────────

const BRAND = "#155DFC";

export default function NotesScreen() {
  const { colors } = usePokerTheme();
  const { user, profile, isSyncing } = useAuth();
  const insets = useSafeAreaInsets();
  const { new: openNew } = useLocalSearchParams<{ new?: string }>();
  const [notes,    setNotes]    = useState<NoteEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editTarget,    setEditTarget]    = useState<NoteEntry | null>(null);
  const [newNoteCounter, setNewNoteCounter] = useState(0);
  const [toast,         setToast]         = useState<string | null>(null);
  const [handReviewEntry, setHandReviewEntry] = useState<NoteEntry | null>(null);
  const [shareEntry,      setShareEntry]      = useState<NoteEntry | null>(null);
  const [showSignIn,      setShowSignIn]      = useState(false);

  useFocusEffect(useCallback(() => {
    setNotes(getNoteHistory());
    setSessions(getSessions());
    if (openNew === "1") {
      setEditTarget(null);
      setNewNoteCounter(c => c + 1);
      setEditorVisible(true);
    }
  }, [openNew]));

  // Reload from SQLite once cloud sync completes
  useEffect(() => {
    if (!isSyncing) {
      setNotes(getNoteHistory());
      setSessions(getSessions());
    }
  }, [isSyncing]);

  function refresh() { setNotes(getNoteHistory()); }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2000); }

  function handleDelete(id: number) {
    Alert.alert("Delete Note", "Remove this note entry?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteNoteEntry(id); if (user?.id) deleteNoteFromCloud(user.id, id).catch(console.error); refresh(); } },
    ]);
  }

  async function handleCopy(entry: NoteEntry) {
    await Clipboard.setStringAsync(buildExportText(entry));
    showToast("Copied to clipboard");
  }

  async function handleExport(entry: NoteEntry) {
    const text = buildExportText(entry);
    const fileUri = `${FileSystem.cacheDirectory}poker-note-${entry.id}.txt`;
    await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: "text/plain", dialogTitle: "Export Note" });
    }
  }

  async function handleExportAll() {
    if (!notes.length) return;
    const text = notes.map(buildExportText).join("\n\n---\n\n");
    const fileUri = `${FileSystem.cacheDirectory}poker-notes-all.txt`;
    await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: "text/plain", dialogTitle: "Export All Notes" });
    }
  }

  function handleShare(entry: NoteEntry) {
    setShareEntry(entry);
  }

  const TAB_BAR_H = 49 + insets.bottom;

  const headerTranslateY    = useRef(new Animated.Value(0)).current;
  const headerContentMargin = useRef(new Animated.Value(0)).current;
  const headerShown         = useRef(true);
  const lastScrollY         = useRef(0);
  const headerHeightRef     = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (headerHeight > 0 && headerShown.current) {
      headerContentMargin.setValue(headerHeight);
    }
  }, [headerHeight]);

  const handleScroll = useCallback((event: any) => {
    const y    = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    if (diff > 6 && y > 10 && headerShown.current) {
      headerShown.current = false;
      Animated.parallel([
        Animated.timing(headerTranslateY, { toValue: -headerHeightRef.current, duration: 220, useNativeDriver: true }),
        Animated.timing(headerContentMargin, { toValue: 0, duration: 220, useNativeDriver: false }),
      ]).start();
    } else if ((diff < -6 || y <= 0) && !headerShown.current) {
      headerShown.current = true;
      Animated.parallel([
        Animated.timing(headerTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(headerContentMargin, { toValue: headerHeightRef.current, duration: 220, useNativeDriver: false }),
      ]).start();
    }
  }, [headerTranslateY, headerContentMargin]);

  function handleReviewHand(entry: NoteEntry) {
    if (!user) { setShowSignIn(true); return; }
    setHandReviewEntry(entry);
  }

  function handleAddPress() {
    setEditTarget(null);
    setNewNoteCounter(c => c + 1);
    setEditorVisible(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <HandAnalysisModal
        visible={!!handReviewEntry}
        notes={handReviewEntry ? (handReviewEntry.enhanced_notes ?? handReviewEntry.raw_notes) : ""}
        noteId={handReviewEntry?.id}
        savedAnalysis={handReviewEntry?.hand_analysis}
        onClose={() => setHandReviewEntry(null)}
        onSaved={refresh}
      />
      <SignInSheet
        visible={showSignIn}
        onClose={() => setShowSignIn(false)}
        title="Sign in to use AI"
        description="Create a free account to access AI hand review and note compression."
      />

      <ShareNoteModal
        entry={shareEntry}
        visible={!!shareEntry}
        onClose={() => setShareEntry(null)}
        colors={colors}
        userId={user?.id ?? profile?.id}
      />

      {/* ── Blue top bar (absolute, animated) ── */}
      <Animated.View
        onLayout={(e) => { const h = e.nativeEvent.layout.height; headerHeightRef.current = h; setHeaderHeight(h); }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: BRAND, paddingTop: insets.top + 10, paddingBottom: 16, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", transform: [{ translateY: headerTranslateY }] }}
      >
        <View>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>Hand Notes</Text>
          {notes.length > 0 && (
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500", marginTop: 2 }}>
              {notes.length} {notes.length === 1 ? "hand" : "hands"} logged
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          {notes.length > 0 && (
            <TouchableOpacity onPress={handleExportAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleAddPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="add-circle" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View style={{ flex: 1, marginTop: headerContentMargin }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_H + 80 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Empty state / sync loader */}
        {notes.length === 0 && (
          isSyncing ? (
            <View style={{ alignItems: "center", marginTop: 80, gap: 14 }}>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={{ color: colors.text.secondary, fontSize: 14 }}>Syncing your data…</Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", marginTop: 80, gap: 12 }}>
              <Ionicons name="card-outline" size={56} color={colors.text.tertiary} />
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>No hands logged yet</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 13, textAlign: "center", paddingHorizontal: 40, lineHeight: 19 }}>
                Record a hand with position, cards and notes to review your play and spot leaks.
              </Text>
              <TouchableOpacity
                onPress={handleAddPress}
                activeOpacity={0.85}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: BRAND, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, marginTop: 8 }}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Log First Hand</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Note cards */}
        {notes.map(entry => (
          <NoteCard
            key={entry.id}
            entry={entry}
            colors={colors}
            onEdit={() => { setEditTarget(entry); setEditorVisible(true); }}
            onDelete={() => handleDelete(entry.id)}
            onCopy={() => handleCopy(entry)}
            onExport={() => handleExport(entry)}
            onReviewHand={() => handleReviewHand(entry)}
            onShare={() => handleShare(entry)}
          />
        ))}
      </ScrollView>
      </Animated.View>

      {/* Toast */}
      {toast && (
        <View style={{ position: "absolute", bottom: TAB_BAR_H + 80, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.78)", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{toast}</Text>
        </View>
      )}

      <NoteEditorModal
        key={editTarget ? editTarget.id : `new-${newNoteCounter}`}
        visible={editorVisible}
        initial={editTarget}
        sessions={sessions}
        onClose={() => setEditorVisible(false)}
        onSaved={refresh}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 12,
    marginTop: 1,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#7c3aed18",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  aiBadgeText: {
    color: "#7c3aed",
    fontSize: 10,
    fontWeight: "700",
  },
  handTitle: {
    fontSize: 17,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingBottom: 10,
    lineHeight: 23,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  notePreview: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  actionBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBarBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  actionBarLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
});
