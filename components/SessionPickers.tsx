import { usePokerTheme } from "@/hooks/use-poker-theme";
import { fetchVenues, VenueInfo } from "@/lib/tournaments";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND  = "#155DFC";
const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "ACT"];
const STAKES_OPTIONS   = ["1/1", "1/2", "2/3", "5/5", "10/10", "25/25", "50/100"];
const QUICK_BUYINS     = [100, 200, 300, 500, 1000, 2000, 5000];
const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8];

// ─── Shared field row ─────────────────────────────────────────────────────────

export function FieldRow({
  icon, label, value, placeholder = "Not set", onPress, colors, isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  colors: any;
  isLast?: boolean;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.fieldRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
      ]}
    >
      <View style={[styles.fieldIconWrap, { backgroundColor: BRAND + "12" }]}>
        <Ionicons name={icon} size={16} color={BRAND} />
      </View>
      <Text style={[styles.fieldLabel, { color: colors.text.tertiary }]}>{label}</Text>
      <Text
        style={[styles.fieldValue, { color: hasValue ? colors.text.primary : colors.text.disabled }]}
        numberOfLines={1}
      >
        {hasValue ? value : placeholder}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={colors.text.tertiary} />
    </TouchableOpacity>
  );
}

// ─── Page sheet wrapper ───────────────────────────────────────────────────────

function PageSheet({
  visible, title, onClose, children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = usePokerTheme();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
        {/* Navigation bar */}
        <View style={[styles.navBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default, paddingTop: 12 }]}>
          <View style={{ width: 60 }} />
          <Text style={[styles.navTitle, { color: colors.text.primary }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ width: 60, alignItems: "flex-end", paddingRight: 4 }}>
            <Text style={[styles.navCancel, { color: BRAND }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </Modal>
  );
}

// ─── Shared list row ──────────────────────────────────────────────────────────

function ListRow({
  label, sublabel, selected, onPress, colors, isLast = false,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
  colors: any;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.listRow,
        { backgroundColor: colors.bg.primary },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.listRowLabel, { color: colors.text.primary }]}>{label}</Text>
        {sublabel ? <Text style={[styles.listRowSub, { color: colors.text.tertiary }]}>{sublabel}</Text> : null}
      </View>
      {selected && <Ionicons name="checkmark" size={20} color={BRAND} />}
    </TouchableOpacity>
  );
}

// ─── Buy-in sheet ─────────────────────────────────────────────────────────────

export function BuyInSheet({
  visible, value, onChange, onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft]           = useState(value);
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      const isPreset = QUICK_BUYINS.some((q) => String(q) === value);
      setShowCustom(!isPreset && value.length > 0);
    }
  }, [visible]);

  function confirm(v: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(v);
    onClose();
  }

  const isCustomSelected = showCustom && draft.length > 0 && !QUICK_BUYINS.some((q) => String(q) === draft);

  return (
    <PageSheet visible={visible} title="Buy-in" onClose={onClose}>
      <ScrollView
        contentContainerStyle={{ paddingVertical: 24, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Preset amounts */}
        <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>Quick select</Text>
        <View style={[styles.listGroup, { borderColor: colors.border.default }]}>
          {QUICK_BUYINS.map((amount, i) => {
            const s = String(amount);
            const selected = value === s && !isCustomSelected;
            const label = amount >= 1000 ? `$${amount / 1000},000` : `$${amount}`;
            return (
              <ListRow
                key={amount}
                label={label}
                selected={selected}
                onPress={() => { setShowCustom(false); confirm(s); }}
                colors={colors}
                isLast={i === QUICK_BUYINS.length - 1}
              />
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>Custom amount</Text>
        <View style={[styles.listGroup, { borderColor: colors.border.default }]}>
          <TouchableOpacity
            onPress={() => { setShowCustom(true); setDraft(""); setTimeout(() => inputRef.current?.focus(), 80); }}
            activeOpacity={0.6}
            style={[styles.listRow, { backgroundColor: colors.bg.primary }]}
          >
            <Text style={[styles.buyInCurrency, { color: colors.text.tertiary }]}>$</Text>
            <TextInput
              ref={inputRef}
              value={showCustom ? draft : ""}
              onChangeText={(t) => { setShowCustom(true); setDraft(t); }}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor={colors.text.disabled}
              style={[styles.buyInInput, { color: colors.text.primary, flex: 1 }]}
              returnKeyType="done"
              onSubmitEditing={() => draft && parseFloat(draft) > 0 && confirm(draft)}
              onFocus={() => setShowCustom(true)}
            />
            {isCustomSelected && <Ionicons name="checkmark" size={20} color={BRAND} />}
          </TouchableOpacity>
        </View>

        {/* Confirm button for custom */}
        {showCustom && draft.length > 0 && parseFloat(draft) > 0 && (
          <TouchableOpacity
            onPress={() => confirm(draft)}
            activeOpacity={0.85}
            style={[styles.confirmBtn, { backgroundColor: BRAND, marginHorizontal: 16, marginTop: 8 }]}
          >
            <Text style={styles.confirmBtnText}>Set buy-in to ${parseFloat(draft).toLocaleString()}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </PageSheet>
  );
}

// ─── Stakes sheet ─────────────────────────────────────────────────────────────

export function StakesSheet({
  visible, value, onChange, onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [custom, setCustom]         = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      const isPreset = STAKES_OPTIONS.includes(value);
      setShowCustom(!isPreset && value.length > 0);
      setCustom(isPreset ? "" : value);
    }
  }, [visible]);

  function pick(v: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(v);
    onClose();
  }

  const isCustomSelected = showCustom && custom.length > 0 && !STAKES_OPTIONS.includes(value);

  return (
    <PageSheet visible={visible} title="Stakes" onClose={onClose}>
      <ScrollView
        contentContainerStyle={{ paddingVertical: 24, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>NL Hold'em</Text>
        <View style={[styles.listGroup, { borderColor: colors.border.default }]}>
          {STAKES_OPTIONS.map((s, i) => (
            <ListRow
              key={s}
              label={`$${s}`}
              sublabel={`$${s.split("/")[0]}/$${s.split("/")[1]} blinds`}
              selected={value === s && !isCustomSelected}
              onPress={() => { setShowCustom(false); pick(s); }}
              colors={colors}
              isLast={i === STAKES_OPTIONS.length - 1}
            />
          ))}
        </View>

        <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>Custom</Text>
        <View style={[styles.listGroup, { borderColor: colors.border.default }]}>
          <TouchableOpacity
            onPress={() => { setShowCustom(true); setCustom(""); setTimeout(() => inputRef.current?.focus(), 80); }}
            activeOpacity={0.6}
            style={[styles.listRow, { backgroundColor: colors.bg.primary }]}
          >
            <TextInput
              ref={inputRef}
              value={showCustom ? custom : ""}
              onChangeText={(t) => { setShowCustom(true); setCustom(t); }}
              placeholder="e.g. 2/5 or 5/10"
              placeholderTextColor={colors.text.disabled}
              style={[styles.buyInInput, { color: colors.text.primary, flex: 1, fontSize: 16 }]}
              returnKeyType="done"
              onSubmitEditing={() => custom.trim() && pick(custom.trim())}
              onFocus={() => setShowCustom(true)}
            />
            {isCustomSelected && <Ionicons name="checkmark" size={20} color={BRAND} />}
          </TouchableOpacity>
        </View>

        {showCustom && custom.trim().length > 0 && (
          <TouchableOpacity
            onPress={() => pick(custom.trim())}
            activeOpacity={0.85}
            style={[styles.confirmBtn, { backgroundColor: BRAND, marginHorizontal: 16, marginTop: 8 }]}
          >
            <Text style={styles.confirmBtnText}>Set stakes to {custom.trim()}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </PageSheet>
  );
}

// ─── Duration sheet ───────────────────────────────────────────────────────────

export function DurationSheet({
  visible, value, onChange, onClose,
}: {
  visible: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
  onClose: () => void;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  function pick(h: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(value === h ? null : h);
    onClose();
  }

  return (
    <PageSheet visible={visible} title="Duration" onClose={onClose}>
      <ScrollView
        contentContainerStyle={{ paddingVertical: 24, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>Session length</Text>
        <View style={[styles.listGroup, { borderColor: colors.border.default }]}>
          {DURATION_OPTIONS.map((h, i) => (
            <ListRow
              key={h}
              label={h === 8 ? "8 hours or more" : `${h} hour${h > 1 ? "s" : ""}`}
              selected={value === h}
              onPress={() => pick(h)}
              colors={colors}
              isLast={i === DURATION_OPTIONS.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    </PageSheet>
  );
}

// ─── State sheet ──────────────────────────────────────────────────────────────

export function StateSheet({
  visible, value, onChange, onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (s: string) => void;
  onClose: () => void;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  const STATE_NAMES: Record<string, string> = {
    NSW: "New South Wales",
    VIC: "Victoria",
    QLD: "Queensland",
    WA:  "Western Australia",
    SA:  "South Australia",
    ACT: "Australian Capital Territory",
  };

  function pick(s: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(s);
    onClose();
  }

  return (
    <PageSheet visible={visible} title="State" onClose={onClose}>
      <ScrollView
        contentContainerStyle={{ paddingVertical: 24, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>Australia</Text>
        <View style={[styles.listGroup, { borderColor: colors.border.default }]}>
          {STATES.map((s, i) => (
            <ListRow
              key={s}
              label={STATE_NAMES[s] ?? s}
              sublabel={s}
              selected={value === s}
              onPress={() => pick(s)}
              colors={colors}
              isLast={i === STATES.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    </PageSheet>
  );
}

// ─── Venue sheet ──────────────────────────────────────────────────────────────

export function VenueSheet({
  visible, venue, state, onChangeVenue, onChangeState, onClose, hideStateChips = false,
}: {
  visible: boolean;
  venue: string;
  state: string;
  onChangeVenue: (v: string) => void;
  onChangeState: (s: string) => void;
  onClose: () => void;
  hideStateChips?: boolean;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch]               = useState("");
  const [supabaseVenues, setSupabaseVenues] = useState<VenueInfo[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [selectedState, setSelectedState] = useState(state);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherVenue, setOtherVenue]       = useState("");
  const searchRef  = useRef<TextInput>(null);
  const otherRef   = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setShowOtherInput(false);
    setOtherVenue("");
    setSelectedState(state);
    loadVenues(state);
  }, [visible, state]);

  useEffect(() => {
    if (!visible) return;
    loadVenues(selectedState);
  }, [selectedState]);

  function loadVenues(s: string) {
    setLoadingVenues(true);
    fetchVenues(s)
      .then(setSupabaseVenues)
      .catch(() => setSupabaseVenues([]))
      .finally(() => setLoadingVenues(false));
  }

  function pickVenue(v: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChangeVenue(v);
    onChangeState(selectedState);
    onClose();
  }

  function pickState(s: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedState(s);
    onChangeState(s);
    setSearch("");
    setShowOtherInput(false);
  }

  const filtered = search.trim()
    ? supabaseVenues.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))
    : supabaseVenues;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.secondary }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* Nav bar */}
        <View style={[styles.navBar, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border.default, paddingTop: 12 }]}>
          <View style={{ width: 60 }} />
          <Text style={[styles.navTitle, { color: colors.text.primary }]}>Venue</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ width: 60, alignItems: "flex-end", paddingRight: 4 }}>
            <Text style={[styles.navCancel, { color: BRAND }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* State filter (when not hidden) */}
        {!hideStateChips && (
          <>
            <Text style={[styles.listSectionHeader, { color: colors.text.tertiary, marginTop: 20 }]}>State</Text>
            <View style={[styles.listGroup, { borderColor: colors.border.default, marginBottom: 0 }]}>
              {STATES.map((s, i) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => pickState(s)}
                  activeOpacity={0.6}
                  style={[
                    styles.listRow,
                    { backgroundColor: colors.bg.primary },
                    i < STATES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border.subtle },
                  ]}
                >
                  <Text style={[styles.listRowLabel, { color: colors.text.primary }]}>{s}</Text>
                  {selectedState === s && <Ionicons name="checkmark" size={20} color={BRAND} />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.listSectionHeader, { color: colors.text.tertiary }]}>Venues in {selectedState}</Text>
          </>
        )}

        {/* Search bar */}
        {!hideStateChips
          ? null
          : <View style={{ height: 20 }} />
        }
        <View style={[styles.venueSearch, { backgroundColor: colors.bg.primary, borderColor: search ? BRAND : colors.border.default }]}>
          <Ionicons name="search-outline" size={16} color={colors.text.tertiary} style={{ marginRight: 8 }} />
          <TextInput
            ref={searchRef}
            value={search}
            onChangeText={setSearch}
            placeholder={`Search venues in ${selectedState}…`}
            placeholderTextColor={colors.text.disabled}
            style={[styles.venueSearchInput, { color: colors.text.primary }]}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Venue list */}
        {loadingVenues ? (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={BRAND} />
            <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 10 }}>Loading venues…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => item.name + i}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle }} />}
            style={{ backgroundColor: colors.bg.primary }}
            renderItem={({ item }) => {
              const isSelected = venue === item.name;
              const subtitle = [item.suburb, item.city].filter(Boolean).join(", ");
              return (
                <TouchableOpacity
                  onPress={() => pickVenue(item.name)}
                  activeOpacity={0.6}
                  style={[styles.listRow, { backgroundColor: colors.bg.primary }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowLabel, { color: isSelected ? BRAND : colors.text.primary, fontWeight: isSelected ? "700" : "500" }]}>
                      {item.name}
                    </Text>
                    {!!subtitle && <Text style={[styles.listRowSub, { color: colors.text.tertiary }]}>{subtitle}</Text>}
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={20} color={BRAND} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>No venues found in {selectedState}.</Text>
              </View>
            }
            ListFooterComponent={
              <>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle }} />
                {showOtherInput ? (
                  <View style={{ backgroundColor: colors.bg.primary, padding: 16, gap: 10 }}>
                    <View style={[styles.venueSearch, { backgroundColor: colors.bg.secondary, borderColor: otherVenue ? BRAND : colors.border.default, marginHorizontal: 0 }]}>
                      <Ionicons name="create-outline" size={16} color={colors.text.tertiary} style={{ marginRight: 8 }} />
                      <TextInput
                        ref={otherRef}
                        value={otherVenue}
                        onChangeText={setOtherVenue}
                        placeholder="Type venue name…"
                        placeholderTextColor={colors.text.disabled}
                        style={[styles.venueSearchInput, { color: colors.text.primary }]}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => otherVenue.trim() && pickVenue(otherVenue.trim())}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => otherVenue.trim() && pickVenue(otherVenue.trim())}
                      disabled={!otherVenue.trim()}
                      activeOpacity={0.85}
                      style={[styles.confirmBtn, { backgroundColor: otherVenue.trim() ? BRAND : colors.bg.secondary }]}
                    >
                      <Text style={[styles.confirmBtnText, { color: otherVenue.trim() ? "#fff" : colors.text.disabled }]}>
                        {otherVenue.trim() ? `Use "${otherVenue.trim()}"` : "Type a venue name"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { setShowOtherInput(true); setTimeout(() => otherRef.current?.focus(), 100); }}
                    activeOpacity={0.6}
                    style={[styles.listRow, { backgroundColor: colors.bg.primary }]}
                  >
                    <Text style={[styles.listRowLabel, { color: colors.text.tertiary }]}>Other / Not in list</Text>
                    <Ionicons name="add-circle-outline" size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                )}
              </>
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Field row (on the form card)
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  fieldIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel:  { fontSize: 14, fontWeight: "500", width: 70 },
  fieldValue:  { flex: 1, fontSize: 14, fontWeight: "600", textAlign: "right", marginRight: 4 },

  // Page sheet nav bar
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle:  { fontSize: 17, fontWeight: "700" },
  navCancel: { fontSize: 16, fontWeight: "500" },

  // iOS-style grouped list
  listSectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginHorizontal: 16,
    marginBottom: 6,
    marginTop: 20,
  },
  listGroup: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 52,
  },
  listRowLabel: { fontSize: 16, fontWeight: "500" },
  listRowSub:   { fontSize: 12, marginTop: 2 },

  // Buy-in custom input
  buyInCurrency: { fontSize: 20, fontWeight: "600" },
  buyInInput:    { fontSize: 20, fontWeight: "600" },

  // Confirm button
  confirmBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
  },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Venue search bar
  venueSearch: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 11 : 6,
  },
  venueSearchInput: { flex: 1, fontSize: 15 },
});
