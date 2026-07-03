import { usePokerTheme } from "@/hooks/use-poker-theme";
import {
  addPlayerNote, deletePlayerNote, getPlayerNotes,
  PlayerNote, updatePlayerNote,
} from "@/db/database";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";

// ─── Poker style tags ──────────────────────────────────────────────────────────

const STYLE_TAGS: { label: string; abbr: string; color: string; desc: string }[] = [
  { label: "Tight Aggressive",  abbr: "TAG",   color: "#EF4444", desc: "Plays few hands, bets strong" },
  { label: "Loose Aggressive",  abbr: "LAG",   color: "#F97316", desc: "Plays many hands, bets often" },
  { label: "Tight Passive",     abbr: "Nit",   color: "#6366F1", desc: "Plays tight, rarely bluffs" },
  { label: "Loose Passive",     abbr: "Fish",  color: "#0891B2", desc: "Calls too much, rarely raises" },
  { label: "Maniac",            abbr: "MNK",   color: "#EC4899", desc: "Hyper-aggressive, over-bluffs" },
  { label: "Calling Station",   abbr: "CS",    color: "#14B8A6", desc: "Calls everything, won't fold" },
  { label: "Reg",               abbr: "REG",   color: "#22C55E", desc: "Solid, experienced regular" },
  { label: "Short Stacker",     abbr: "SS",    color: "#8B5CF6", desc: "Plays short stack by design" },
  { label: "Stealer",           abbr: "STL",   color: "#F59E0B", desc: "Steals blinds frequently" },
  { label: "Bluffer",           abbr: "BLF",   color: "#A855F7", desc: "Bluffs more than average" },
  { label: "Slowplayer",        abbr: "SLP",   color: "#64748B", desc: "Traps with strong hands" },
  { label: "Whale",             abbr: "WHL",   color: "#06B6D4", desc: "High stakes recreational player" },
];

// ─── Form modal ────────────────────────────────────────────────────────────────

function PlayerNoteForm({
  visible, initial, onSave, onClose, colors,
}: {
  visible: boolean;
  initial: PlayerNote | null;
  onSave: () => void;
  onClose: () => void;
  colors: any;
}) {
  const insets = useSafeAreaInsets();
  const [name,          setName]          = useState(initial?.name   ?? "");
  const [selectedStyles, setSelectedStyles] = useState<string[]>(initial?.styles ?? []);
  const [notes,         setNotes]         = useState(initial?.notes  ?? "");
  const [venue,         setVenue]         = useState(initial?.venue  ?? "");

  function reset() { setName(""); setSelectedStyles([]); setNotes(""); setVenue(""); }

  function handleSave() {
    if (!name.trim()) { Alert.alert("Name required", "Enter the player's name."); return; }
    if (initial) {
      updatePlayerNote(initial.id, { name, styles: selectedStyles, notes, venue });
    } else {
      addPlayerNote({ name, styles: selectedStyles, notes, venue });
    }
    reset();
    onSave();
  }

  function toggleStyle(abbr: string) {
    setSelectedStyles((prev) => prev.includes(abbr) ? prev.filter((s) => s !== abbr) : [...prev, abbr]);
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.secondary }} behavior={Platform.OS === "ios" ? "padding" : "height"}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={32} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            {initial ? "Edit Player Note" : "New Player Note"}
          </Text>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: BRAND, fontSize: 16, fontWeight: "700" }}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>

          {/* Player name */}
          <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <Text style={[styles.fieldLabel, { color: colors.text.tertiary }]}>PLAYER NAME</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.text.primary }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. John at Crown Casino"
              placeholderTextColor={colors.text.disabled}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Venue */}
          <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <Text style={[styles.fieldLabel, { color: colors.text.tertiary }]}>VENUE / WHERE MET</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.text.primary }]}
              value={venue}
              onChangeText={setVenue}
              placeholder="e.g. Crown Poker, $2/$5 table"
              placeholderTextColor={colors.text.disabled}
              returnKeyType="next"
            />
          </View>

          {/* Style tags */}
          <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <Text style={[styles.fieldLabel, { color: colors.text.tertiary }]}>PLAYING STYLE — SELECT ALL THAT APPLY</Text>
            <View style={styles.tagsGrid}>
              {STYLE_TAGS.map((tag) => {
                const selected = selectedStyles.includes(tag.abbr);
                return (
                  <TouchableOpacity
                    key={tag.abbr}
                    onPress={() => toggleStyle(tag.abbr)}
                    activeOpacity={0.75}
                    style={[
                      styles.tagChip,
                      { borderColor: selected ? tag.color : colors.border.default,
                        backgroundColor: selected ? tag.color + "18" : colors.bg.secondary },
                    ]}
                  >
                    <Text style={[styles.tagAbbr, { color: selected ? tag.color : colors.text.secondary }]}>{tag.abbr}</Text>
                    <Text style={[styles.tagLabel, { color: selected ? tag.color : colors.text.tertiary }]}>{tag.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View style={[styles.card, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}>
            <Text style={[styles.fieldLabel, { color: colors.text.tertiary }]}>OBSERVATIONS & READS</Text>
            <TextInput
              style={[styles.fieldInput, styles.notesInput, { color: colors.text.primary }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Limps UTG with premium hands, over-bets river as bluff, folds to 3-bets OOP…"
              placeholderTextColor={colors.text.disabled}
              multiline
              textAlignVertical="top"
            />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Player Note card ──────────────────────────────────────────────────────────

function PlayerNoteCard({
  note, onEdit, onDelete, colors,
}: {
  note: PlayerNote;
  onEdit: () => void;
  onDelete: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      onPress={onEdit}
      activeOpacity={0.75}
      style={[styles.noteCard, { backgroundColor: colors.bg.primary, borderColor: colors.border.default }]}
    >
      {/* Header row */}
      <View style={styles.noteCardHeader}>
        <View style={[styles.noteAvatar, { backgroundColor: BRAND + "18" }]}>
          <Ionicons name="person-outline" size={18} color={BRAND} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.noteName, { color: colors.text.primary }]} numberOfLines={1}>{note.name}</Text>
          {note.venue ? (
            <Text style={[styles.noteVenue, { color: colors.text.tertiary }]} numberOfLines={1}>{note.venue}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => Alert.alert("Delete Note", `Remove note for "${note.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: onDelete },
          ])}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Style tags */}
      {note.styles.length > 0 && (
        <View style={styles.noteTagsRow}>
          {note.styles.map((abbr) => {
            const tag = STYLE_TAGS.find((t) => t.abbr === abbr);
            if (!tag) return null;
            return (
              <View key={abbr} style={[styles.noteTag, { backgroundColor: tag.color + "18", borderColor: tag.color + "40" }]}>
                <Text style={[styles.noteTagText, { color: tag.color }]}>{tag.abbr} · {tag.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Notes preview */}
      {note.notes ? (
        <Text style={[styles.notePreview, { color: colors.text.secondary }]} numberOfLines={2}>{note.notes}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function PlayerNotesScreen() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const [notes,   setNotes]   = useState<PlayerNote[]>([]);
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<PlayerNote | null>(null);
  const [forming, setForming] = useState(false);

  useFocusEffect(useCallback(() => { refresh(); }, []));

  function refresh() { setNotes(getPlayerNotes()); }

  const filtered = search.trim()
    ? notes.filter((n) =>
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.styles.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
        n.venue.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
        <Ionicons name="search-outline" size={16} color={colors.text.tertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text.primary }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, style or venue…"
          placeholderTextColor={colors.text.disabled}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <PlayerNoteCard
            note={item}
            colors={colors}
            onEdit={() => { setEditing(item); setForming(true); }}
            onDelete={() => { deletePlayerNote(item.id); refresh(); }}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.emptyCard, { borderColor: colors.border.default }]}>
            <Ionicons name="person-outline" size={44} color={colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No player notes yet</Text>
            <Text style={[styles.emptySub, { color: colors.text.tertiary }]}>
              Track reads and playing styles on players you encounter at the table.
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={() => { setEditing(null); setForming(true); }}
        activeOpacity={0.85}
        style={[styles.fab, { bottom: insets.bottom + 24, backgroundColor: BRAND }]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Form modal */}
      <PlayerNoteForm
        visible={forming}
        initial={editing}
        colors={colors}
        onSave={() => { setForming(false); setEditing(null); refresh(); }}
        onClose={() => { setForming(false); setEditing(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },

  // Form
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  fieldInput: { fontSize: 15, minHeight: 24 },
  notesInput: { minHeight: 100 },

  // Tags grid
  tagsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  tagAbbr:  { fontSize: 12, fontWeight: "800" },
  tagLabel: { fontSize: 12, fontWeight: "500" },

  // Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15 },

  // Note card
  noteCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  noteCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  noteAvatar: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  noteName:    { fontSize: 15, fontWeight: "700" },
  noteVenue:   { fontSize: 12, marginTop: 1 },
  noteTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  noteTag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  noteTagText: { fontSize: 11, fontWeight: "600" },
  notePreview: { fontSize: 13, lineHeight: 18 },

  // Empty
  emptyCard: {
    alignItems: "center", gap: 10, padding: 32,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  emptySub:   { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
