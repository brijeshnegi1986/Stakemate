import { BACKEND_URL } from "@/constants/config";
import {
  deleteNoteEntry, getNoteHistory, getSessions, NoteEntry,
  saveNoteEntry, Session, updateNoteEntry,
} from "@/db/database";
import { PaywallModal } from "@/components/PaywallModal";
import { useSubscription } from "@/context/SubscriptionContext";
import { FREE_NOTES_LIMIT } from "@/constants/subscription";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
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
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function noteDisplayText(entry: NoteEntry) {
  return (entry.enhanced_notes ?? entry.raw_notes).trim();
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

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function NoteEditorModal({
  visible, initial, sessions, onClose, onSaved, colors, radius, isPro,
}: {
  visible: boolean;
  initial: NoteEntry | null;
  sessions: Session[];
  onClose: () => void;
  onSaved: () => void;
  colors: any;
  radius: any;
  isPro: boolean;
}) {
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(
    initial ? (initial.enhanced_notes ?? initial.raw_notes) : ""
  );
  const [sessionId, setSessionId] = useState<number>(initial?.session_id ?? 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const insets = useSafeAreaInsets();

  const selectedSession = sessions.find(s => s.id === sessionId) ?? null;

  async function handleEnhance() {
    if (!body.trim()) return;
    setEnhancing(true);
    try {
      const ctx = selectedSession
        ? `${selectedSession.type === "tournament" ? "Tournament" : "Cash Game"} · ${selectedSession.venue || ""} · ${selectedSession.date} · Profit: $${selectedSession.profit}`
        : "Standalone note";
      const res = await fetch(`${BACKEND_URL}/api/enhance-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: body, sessionContext: ctx }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.enhanced) setBody(data.enhanced);
      } else {
        Alert.alert("Enhancement failed", "Couldn't improve notes right now. Try again later.");
      }
    } catch {
      Alert.alert("No connection", "AI enhancement needs an internet connection. Try again when back online.");
    } finally { setEnhancing(false); }
  }

  function handleSave() {
    if (!body.trim()) {
      Alert.alert("Empty note", "Please write something before saving.");
      return;
    }
    if (isEdit && initial) {
      updateNoteEntry(initial.id, { title, enhancedNotes: body });
    } else {
      const sess = selectedSession;
      saveNoteEntry({
        sessionId: sess?.id ?? 0,
        sessionDate: sess?.date ?? "",
        sessionVenue: sess?.venue ?? "",
        sessionProfit: sess?.profit ?? 0,
        sessionType: sess ? (sess.type ?? "cash") : "standalone",
        rawNotes: body,
        enhancedNotes: null,
        title,
      });
    }
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg.primary }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 14,
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
            placeholder="Title (optional)"
            placeholderTextColor={colors.text.tertiary}
            style={{
              color: colors.text.primary, fontSize: 20, fontWeight: "700",
              borderBottomWidth: 1, borderColor: colors.border.default, paddingBottom: 10,
            }}
          />

          {/* Session picker (only for new notes) */}
          {!isEdit && (
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                Link to session (optional)
              </Text>
              <TouchableOpacity
                onPress={() => setPickerOpen(p => !p)}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: colors.bg.secondary, borderRadius: 12, borderWidth: 1,
                  borderColor: sessionId ? colors.border.brand : colors.border.default,
                  paddingHorizontal: 14, paddingVertical: 12,
                }}
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
                <MaterialCommunityIcons
                  name={pickerOpen ? "chevron-up" : "chevron-down"}
                  size={20} color={colors.text.tertiary}
                />
              </TouchableOpacity>

              {pickerOpen && (
                <View style={{
                  backgroundColor: colors.bg.secondary, borderRadius: 12, borderWidth: 1,
                  borderColor: colors.border.default, marginTop: 4, maxHeight: 220,
                }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Standalone option */}
                    <TouchableOpacity
                      onPress={() => { setSessionId(0); setPickerOpen(false); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 12,
                        borderBottomWidth: 1, borderColor: colors.border.subtle,
                        flexDirection: "row", alignItems: "center", gap: 10,
                      }}
                    >
                      <MaterialCommunityIcons name="note-outline" size={18} color={colors.text.tertiary} />
                      <Text style={{ color: sessionId === 0 ? colors.text.brand : colors.text.primary, fontSize: 14, fontWeight: sessionId === 0 ? "700" : "400" }}>
                        Standalone note
                      </Text>
                      {sessionId === 0 && <MaterialCommunityIcons name="check" size={16} color={colors.text.brand} style={{ marginLeft: "auto" }} />}
                    </TouchableOpacity>
                    {sessions.map(s => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => { setSessionId(s.id); setPickerOpen(false); }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 12,
                          borderBottomWidth: 1, borderColor: colors.border.subtle,
                          flexDirection: "row", alignItems: "center", gap: 10,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: sessionId === s.id ? colors.text.brand : colors.text.primary, fontSize: 14, fontWeight: sessionId === s.id ? "700" : "400" }}>
                            {formatDate(s.date)} · {s.type === "tournament" ? "Tournament" : "Cash"}
                          </Text>
                          <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                            {s.venue || "No venue"} · {s.profit >= 0 ? "+" : ""}${s.profit.toFixed(0)}
                          </Text>
                        </View>
                        {sessionId === s.id && <MaterialCommunityIcons name="check" size={16} color={colors.text.brand} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Notes body */}
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Notes
            </Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              placeholder="Write your session notes here..."
              placeholderTextColor={colors.text.tertiary}
              style={{
                backgroundColor: colors.bg.secondary, borderRadius: 12, borderWidth: 1,
                borderColor: colors.border.default, padding: 14,
                color: colors.text.primary, fontSize: 15, lineHeight: 23,
                minHeight: 160, textAlignVertical: "top",
              }}
            />
          </View>

          {/* Enhance with AI */}
          {isPro ? (
            <TouchableOpacity
              onPress={handleEnhance}
              disabled={enhancing || !body.trim()}
              activeOpacity={0.8}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: "#7c3aed", borderRadius: 12, paddingVertical: 14,
                opacity: !body.trim() ? 0.4 : 1,
              }}
            >
              {enhancing
                ? <ActivityIndicator color="#fff" size="small" />
                : <MaterialCommunityIcons name="auto-fix" size={18} color="#fff" />
              }
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                {enhancing ? "Enhancing…" : "Enhance with AI"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              backgroundColor: "#7c3aed22", borderRadius: 12, paddingVertical: 14,
              borderWidth: 1, borderColor: "#7c3aed44",
            }}>
              <MaterialCommunityIcons name="crown" size={16} color="#7c3aed" />
              <Text style={{ color: "#7c3aed", fontSize: 14, fontWeight: "700" }}>AI Enhancement · Pro only</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({
  entry, onEdit, onDelete, onCopy, onExport, colors, radius,
}: {
  entry: NoteEntry;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onExport: () => void;
  colors: any;
  radius: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const profit = entry.session_profit ?? 0;
  const profitColor = profit >= 0 ? colors.text.success : colors.text.danger;
  const isStandalone = entry.session_type === "standalone" || entry.session_id === 0;
  const isEnhanced = !!entry.enhanced_notes && entry.enhanced_notes !== entry.raw_notes;
  const displayText = noteDisplayText(entry);

  return (
    <View style={{
      backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1,
      borderColor: colors.border.default, marginBottom: 12, overflow: "hidden",
    }}>
      {/* Collapsed header */}
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.75}
        style={{ padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {/* Left accent bar */}
        <View style={{
          width: 3, borderRadius: 2, alignSelf: "stretch",
          backgroundColor: isStandalone ? colors.border.brand : profit >= 0 ? colors.bg.success : colors.bg.danger,
          minHeight: 40,
        }} />

        <View style={{ flex: 1, gap: 4 }}>
          {/* Title or session meta */}
          {entry.title ? (
            <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "800" }}>{entry.title}</Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {isStandalone ? (
              <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: "600" }}>Standalone</Text>
              </View>
            ) : (
              <>
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: "700" }}>
                  {formatDate(entry.session_date)}
                </Text>
                <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: "600" }}>
                    {entry.session_type === "tournament" ? "Tournament" : "Cash"}
                  </Text>
                </View>
                {entry.session_venue ? <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{entry.session_venue}</Text> : null}
                <Text style={{ color: profitColor, fontSize: 12, fontWeight: "700" }}>
                  {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(0)}
                </Text>
              </>
            )}
            {isEnhanced && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#7c3aed18", borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2 }}>
                <MaterialCommunityIcons name="auto-fix" size={10} color="#7c3aed" />
                <Text style={{ color: "#7c3aed", fontSize: 10, fontWeight: "700" }}>AI Enhanced</Text>
              </View>
            )}
          </View>

          <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 1 }}>
            {formatTs(entry.updated_at > 0 ? entry.updated_at : entry.created_at)}
          </Text>

          {/* Preview */}
          {!expanded && (
            <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 4 }} numberOfLines={2}>
              {displayText}
            </Text>
          )}
        </View>

        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20} color={colors.text.tertiary}
        />
      </TouchableOpacity>

      {/* Expanded body */}
      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          <View style={{ height: 1, backgroundColor: colors.border.default }} />

          {/* Full note text */}
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 22 }}>
            {displayText}
          </Text>

          {/* Original notes (if enhanced) */}
          {isEnhanced && (
            <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.sm, padding: 12 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                Original
              </Text>
              <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 20 }}>
                {entry.raw_notes}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <ActionBtn icon="pencil-outline"  label="Edit"   color={colors.text.brand}   border={colors.border.brand}  onPress={onEdit}   />
            <ActionBtn icon="content-copy"    label="Copy"   color={colors.text.secondary} border={colors.border.default} onPress={onCopy}   />
            <ActionBtn icon="export-variant"  label="Export" color={colors.text.secondary} border={colors.border.default} onPress={onExport} />
            <ActionBtn icon="delete-outline"  label="Delete" color={colors.text.danger}  border={colors.border.danger}  onPress={onDelete} />
          </View>
        </View>
      )}
    </View>
  );
}

function ActionBtn({ icon, label, color, border, onPress }: {
  icon: any; label: string; color: string; border: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8,
        borderWidth: 1, borderColor: border,
      }}>
      <MaterialCommunityIcons name={icon} size={14} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotesScreen() {
  const { colors, radius } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isPro } = useSubscription();
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<NoteEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleAddPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, marginRight: 16 }}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.text.brand} />
          <Text style={{ color: colors.text.brand, fontSize: 15, fontWeight: "700" }}>Add</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors, notes.length, isPro]);

  useFocusEffect(
    useCallback(() => {
      setNotes(getNoteHistory());
      setSessions(getSessions());
    }, [])
  );

  function refresh() { setNotes(getNoteHistory()); }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function handleDelete(id: number) {
    Alert.alert("Delete Note", "Remove this note entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => { deleteNoteEntry(id); refresh(); },
      },
    ]);
  }

  async function handleCopy(entry: NoteEntry) {
    await Clipboard.setStringAsync(buildExportText(entry));
    showToast("Copied to clipboard");
  }

  async function handleExport(entry: NoteEntry) {
    const text = buildExportText(entry);
    const fileName = `poker-note-${entry.id}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
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

  const TAB_BAR_H = (insets.bottom > 0 ? insets.bottom : 16) + 68;
  const atFreeLimit = !isPro && notes.length >= FREE_NOTES_LIMIT;

  function handleAddPress() {
    if (atFreeLimit) { setPaywallVisible(true); return; }
    setEditTarget(null);
    setEditorVisible(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <PaywallModal visible={paywallVisible} feature="notesTab" onClose={() => setPaywallVisible(false)} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_H + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Free usage banner */}
        {!isPro && (
          <TouchableOpacity
            onPress={() => setPaywallVisible(true)}
            activeOpacity={0.85}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#7c3aed14", borderRadius: 12, borderWidth: 1,
              borderColor: "#7c3aed33", padding: 12, marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="crown" size={16} color="#7c3aed" />
              <Text style={{ color: "#7c3aed", fontSize: 13, fontWeight: "600" }}>
                {notes.length}/{FREE_NOTES_LIMIT} free notes used
              </Text>
            </View>
            <Text style={{ color: "#7c3aed", fontSize: 12, fontWeight: "700" }}>Upgrade →</Text>
          </TouchableOpacity>
        )}

        {/* Top bar */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" }}>
            {notes.length} {notes.length === 1 ? "note" : "notes"}
          </Text>
          {notes.length > 0 && (
            <TouchableOpacity onPress={handleExportAll}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border.default }}>
              <MaterialCommunityIcons name="export-variant" size={14} color={colors.text.secondary} />
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "600" }}>Export All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Empty state */}
        {notes.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 80, gap: 12 }}>
            <MaterialCommunityIcons name="notebook-outline" size={56} color={colors.text.tertiary} />
            <Text style={{ color: colors.text.tertiary, fontSize: 16, fontWeight: "600" }}>No notes yet</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 13, textAlign: "center", paddingHorizontal: 40, lineHeight: 19 }}>
              Tap <Text style={{ fontWeight: "700", color: colors.text.brand }}>Add</Text> in the top right to write your first note, or save notes from a session.
            </Text>
          </View>
        )}

        {/* Note cards */}
        {notes.map(entry => (
          <NoteCard
            key={entry.id}
            entry={entry}
            colors={colors}
            radius={radius}
            onEdit={() => { setEditTarget(entry); setEditorVisible(true); }}
            onDelete={() => handleDelete(entry.id)}
            onCopy={() => handleCopy(entry)}
            onExport={() => handleExport(entry)}
          />
        ))}
      </ScrollView>

      {/* Toast */}
      {toast && (
        <View style={{
          position: "absolute", bottom: TAB_BAR_H + 80, alignSelf: "center",
          backgroundColor: "rgba(0,0,0,0.78)", borderRadius: 20,
          paddingHorizontal: 18, paddingVertical: 10,
        }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{toast}</Text>
        </View>
      )}

      {/* Editor modal */}
      <NoteEditorModal
        key={editTarget?.id ?? "new"}
        visible={editorVisible}
        initial={editTarget}
        sessions={sessions}
        onClose={() => setEditorVisible(false)}
        onSaved={refresh}
        colors={colors}
        radius={radius}
        isPro={isPro}
      />
    </View>
  );
}
