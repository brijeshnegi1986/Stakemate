import { usePokerTheme } from "@/hooks/use-poker-theme";
import { fetchOfficialTournaments, OfficialTournament } from "@/lib/tournaments";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const BRAND = "#0891B2";

export type TournamentSelection = {
  name: string;
  buyIn?: string;
  venue?: string;
};

interface Props {
  visible: boolean;
  initialValue?: string;
  onClose: () => void;
  onSelect: (selection: TournamentSelection) => void;
}

export function TournamentPickerSheet({ visible, initialValue = "", onClose, onSelect }: Props) {
  const { colors } = usePokerTheme();

  const [query, setQuery]             = useState(initialValue);
  const [results, setResults]         = useState<OfficialTournament[]>([]);
  const [loading, setLoading]         = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery(initialValue);
      setIsSearching(false);
      setLoading(true);
      fetchOfficialTournaments()
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setIsSearching(false);
      setLoading(true);
      fetchOfficialTournaments()
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
      return;
    }
    setIsSearching(true);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await fetchOfficialTournaments({ search: query.trim() });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query]);

  function handleSelectTournament(t: OfficialTournament) {
    onSelect({
      name: t.name,
      buyIn: t.buy_in != null ? String(t.buy_in) : undefined,
      venue: t.venue_info?.name ?? t.venue_name ?? undefined,
    });
    onClose();
  }

  function handleUseCustom() {
    if (!query.trim()) return;
    onSelect({ name: query.trim() });
    onClose();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  const showCustomOption = query.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>

        {/* iOS-style nav header */}
        <View style={[styles.navHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.strong }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.navSide}>
            <Text style={[styles.navCancel, { color: colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text.primary }]}>Tournament Name</Text>
          <View style={styles.navSide} />
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.bg.secondary, borderColor: query.length > 0 ? BRAND : colors.border.default }]}>
            <Ionicons name="search-outline" size={16} color={colors.text.tertiary} style={{ marginRight: 6 }} />
            <TextInput
              placeholder="Search or type a tournament name…"
              placeholderTextColor={colors.text.disabled}
              value={query}
              onChangeText={setQuery}
              returnKeyType="done"
              onSubmitEditing={handleUseCustom}
              style={[styles.searchInput, { color: colors.text.primary }]}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            <View>
              {/* Use custom name option — shown when typing */}
              {showCustomOption && (
                <TouchableOpacity
                  style={[styles.customRow, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default }]}
                  onPress={handleUseCustom}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: `${BRAND}14` }]}>
                    <Ionicons name="create-outline" size={16} color={BRAND} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.customLabel, { color: colors.text.secondary }]}>Use custom name</Text>
                    <Text style={[styles.customValue, { color: colors.text.primary }]} numberOfLines={1}>"{query.trim()}"</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
                </TouchableOpacity>
              )}
              {/* Section label */}
              {!loading && results.length > 0 && (
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary, backgroundColor: colors.bg.secondary }]}>
                  {isSearching ? "Search Results" : "Upcoming Tournaments"}
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="small" color={BRAND} />
              </View>
            ) : isSearching ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={36} color={colors.text.tertiary} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>No tournaments found</Text>
                <Text style={[styles.emptyHint, { color: colors.text.disabled }]}>Tap "Use custom name" above to continue</Text>
              </View>
            ) : null
          }
          renderItem={({ item: t, index }) => (
            <TouchableOpacity
              style={[
                styles.row,
                {
                  backgroundColor: colors.bg.primary,
                  borderBottomColor: colors.border.subtle,
                  borderBottomWidth: index < results.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
              onPress={() => handleSelectTournament(t)}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIcon, { backgroundColor: `${BRAND}14` }]}>
                <Ionicons name="trophy-outline" size={15} color={BRAND} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: colors.text.primary }]} numberOfLines={1}>{t.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                  {(t.venue_info?.name || t.venue_name) && (
                    <Text style={[styles.rowMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
                      {t.venue_info?.name ?? t.venue_name}
                    </Text>
                  )}
                  {(t.venue_info?.name || t.venue_name) && (
                    <Text style={[styles.rowMeta, { color: colors.text.disabled }]}>·</Text>
                  )}
                  <Text style={[styles.rowMeta, { color: colors.text.tertiary }]}>{formatDate(t.tournament_date)}</Text>
                  {t.buy_in != null && (
                    <>
                      <Text style={[styles.rowMeta, { color: colors.text.disabled }]}>·</Text>
                      <Text style={[styles.rowMeta, { color: colors.text.tertiary }]}>Buy-in ${t.buy_in.toLocaleString()}</Text>
                    </>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  navSide:   { width: 72 },
  navTitle:  { fontSize: 17, fontWeight: "700" },
  navCancel: { fontSize: 16 },

  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  sectionLabel: {
    fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },
  customRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  customLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  customValue: { fontSize: 14, fontWeight: "600" },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 14, fontWeight: "600" },
  rowMeta: { fontSize: 12 },

  emptyState: { paddingVertical: 48, alignItems: "center", gap: 4 },
  emptyText:  { fontSize: 14, fontWeight: "500" },
  emptyHint:  { fontSize: 12 },
});
