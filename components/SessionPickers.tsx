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

// ─── Sheet wrapper ────────────────────────────────────────────────────────────

function Sheet({
  visible, title, onClose, children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.sheet, { backgroundColor: colors.bg.primary, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border.default }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

  return (
    <Sheet visible={visible} title="Buy-in" onClose={onClose}>
      <View style={[styles.sheetBody, { borderColor: colors.border.default }]}>
        {/* Quick-select chips */}
        <View style={styles.chipGrid}>
          {QUICK_BUYINS.map((amount) => {
            const s = String(amount);
            const selected = draft === s && !showCustom;
            return (
              <TouchableOpacity
                key={amount}
                onPress={() => { setShowCustom(false); confirm(s); }}
                activeOpacity={0.75}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? BRAND : colors.bg.secondary, borderColor: selected ? BRAND : colors.border.default },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? "#fff" : colors.text.primary }]}>
                  ${amount >= 1000 ? `${amount / 1000}k` : amount}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => { setShowCustom(true); setDraft(""); setTimeout(() => inputRef.current?.focus(), 50); }}
            activeOpacity={0.75}
            style={[
              styles.chip,
              { backgroundColor: showCustom ? BRAND + "15" : colors.bg.secondary, borderColor: showCustom ? BRAND : colors.border.default },
            ]}
          >
            <Text style={[styles.chipText, { color: showCustom ? BRAND : colors.text.secondary }]}>Custom</Text>
          </TouchableOpacity>
        </View>

        {/* Custom amount input — revealed only when Custom is tapped */}
        {showCustom && (
          <View style={[styles.buyInInputRow, { backgroundColor: colors.bg.secondary, borderColor: draft ? BRAND : colors.border.default, marginTop: 14 }]}>
            <Text style={[styles.buyInCurrency, { color: colors.text.tertiary }]}>$</Text>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor={colors.text.disabled}
              style={[styles.buyInInput, { color: colors.text.primary }]}
              returnKeyType="done"
              onSubmitEditing={() => draft && parseFloat(draft) > 0 && confirm(draft)}
            />
            {draft.length > 0 && (
              <TouchableOpacity onPress={() => { setDraft(""); inputRef.current?.focus(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {showCustom && (
        <TouchableOpacity
          onPress={() => draft && parseFloat(draft) > 0 && confirm(draft)}
          disabled={!draft || parseFloat(draft) <= 0}
          activeOpacity={0.85}
          style={[
            styles.sheetConfirmBtn,
            { backgroundColor: draft && parseFloat(draft) > 0 ? BRAND : colors.bg.secondary, marginHorizontal: 16 },
          ]}
        >
          <Text style={[styles.sheetConfirmText, { color: draft && parseFloat(draft) > 0 ? "#fff" : colors.text.disabled }]}>
            {draft && parseFloat(draft) > 0 ? `Set buy-in to $${parseFloat(draft).toLocaleString()}` : "Enter an amount"}
          </Text>
        </TouchableOpacity>
      )}
    </Sheet>
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
  const [custom, setCustom]         = useState("");
  const [showCustom, setShowCustom] = useState(false);

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

  return (
    <Sheet visible={visible} title="Stakes" onClose={onClose}>
      <View style={[styles.sheetBody, { borderColor: colors.border.default }]}>
        <View style={styles.chipGrid}>
          {STAKES_OPTIONS.map((s) => {
            const selected = value === s && !showCustom;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => { setShowCustom(false); pick(s); }}
                activeOpacity={0.75}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? BRAND : colors.bg.secondary, borderColor: selected ? BRAND : colors.border.default },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? "#fff" : colors.text.primary }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => { setShowCustom(true); setCustom(""); }}
            activeOpacity={0.75}
            style={[
              styles.chip,
              { backgroundColor: showCustom ? BRAND + "15" : colors.bg.secondary, borderColor: showCustom ? BRAND : colors.border.default },
            ]}
          >
            <Text style={[styles.chipText, { color: showCustom ? BRAND : colors.text.secondary }]}>Custom</Text>
          </TouchableOpacity>
        </View>

        {showCustom && (
          <View style={[styles.buyInInputRow, { backgroundColor: colors.bg.secondary, borderColor: custom ? BRAND : colors.border.default, marginTop: 14 }]}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="e.g. 2/5 or 5/10"
              placeholderTextColor={colors.text.disabled}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => custom.trim() && pick(custom.trim())}
              style={[styles.buyInInput, { color: colors.text.primary, flex: 1 }]}
            />
          </View>
        )}
      </View>

      {showCustom && (
        <TouchableOpacity
          onPress={() => custom.trim() && pick(custom.trim())}
          disabled={!custom.trim()}
          activeOpacity={0.85}
          style={[
            styles.sheetConfirmBtn,
            { backgroundColor: custom.trim() ? BRAND : colors.bg.secondary, marginHorizontal: 16 },
          ]}
        >
          <Text style={[styles.sheetConfirmText, { color: custom.trim() ? "#fff" : colors.text.disabled }]}>
            {custom.trim() ? `Set stakes to ${custom.trim()}` : "Enter stakes"}
          </Text>
        </TouchableOpacity>
      )}
    </Sheet>
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

  function pick(h: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(value === h ? null : h);
    onClose();
  }

  return (
    <Sheet visible={visible} title="Duration" onClose={onClose}>
      <View style={[styles.sheetBody, { borderColor: colors.border.default }]}>
        <View style={styles.chipGrid}>
          {DURATION_OPTIONS.map((h) => {
            const selected = value === h;
            const label = h === 8 ? "8h+" : `${h}h`;
            return (
              <TouchableOpacity
                key={h}
                onPress={() => pick(h)}
                activeOpacity={0.75}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? BRAND : colors.bg.secondary, borderColor: selected ? BRAND : colors.border.default },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? "#fff" : colors.text.primary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Sheet>
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

  function pick(s: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(s);
    onClose();
  }

  return (
    <Sheet visible={visible} title="State" onClose={onClose}>
      <View style={[styles.sheetBody, { borderColor: colors.border.default }]}>
        <View style={styles.chipGrid}>
          {STATES.map((s) => {
            const selected = value === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => pick(s)}
                activeOpacity={0.75}
                style={[
                  styles.chip,
                  styles.chipWide,
                  { backgroundColor: selected ? BRAND : colors.bg.secondary, borderColor: selected ? BRAND : colors.border.default },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? "#fff" : colors.text.primary }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

// ─── Venue sheet ──────────────────────────────────────────────────────────────

export function VenueSheet({
  visible, venue, state, onChangeVenue, onChangeState, onClose,
}: {
  visible: boolean;
  venue: string;
  state: string;
  onChangeVenue: (v: string) => void;
  onChangeState: (s: string) => void;
  onClose: () => void;
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.venueSheet, { backgroundColor: colors.bg.primary, paddingBottom: insets.bottom + 8 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border.default }]} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Venue</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* State chips */}
          <View style={styles.statechips}>
            {STATES.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => pickState(s)}
                activeOpacity={0.75}
                style={[
                  styles.stateChip,
                  { backgroundColor: selectedState === s ? BRAND : colors.bg.secondary, borderColor: selectedState === s ? BRAND : colors.border.default },
                ]}
              >
                <Text style={[styles.stateChipText, { color: selectedState === s ? "#fff" : colors.text.secondary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search */}
          <View style={[styles.venueSearch, { backgroundColor: colors.bg.secondary, borderColor: search ? BRAND : colors.border.default }]}>
            <Ionicons name="search-outline" size={16} color={colors.text.tertiary} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchRef}
              value={search}
              onChangeText={setSearch}
              placeholder="Search venues…"
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
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <ActivityIndicator color={BRAND} />
              <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 8 }}>Loading venues…</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item, i) => item.name + i}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 280 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}
              ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle }} />}
              renderItem={({ item }) => {
                const isSelected = venue === item.name;
                const subtitle = [item.suburb, item.city].filter(Boolean).join(", ");
                return (
                  <TouchableOpacity
                    onPress={() => pickVenue(item.name)}
                    activeOpacity={0.7}
                    style={[styles.venueRow, isSelected && { backgroundColor: BRAND + "08" }]}
                  >
                    <View style={[styles.venueIconWrap, { backgroundColor: isSelected ? BRAND + "18" : colors.bg.secondary }]}>
                      <Ionicons name="business-outline" size={15} color={isSelected ? BRAND : colors.text.tertiary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.venueName, { color: isSelected ? BRAND : colors.text.primary, fontWeight: isSelected ? "700" : "500" }]}>
                        {item.name}
                      </Text>
                      {!!subtitle && (
                        <Text style={[styles.venueSub, { color: colors.text.tertiary }]}>{subtitle}</Text>
                      )}
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={18} color={BRAND} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>No venues found for {selectedState}.</Text>
                </View>
              }
              ListFooterComponent={
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle }} />
                  {/* Other / custom venue */}
                  {showOtherInput ? (
                    <View style={{ paddingVertical: 10 }}>
                      <View style={[styles.buyInInputRow, { backgroundColor: colors.bg.secondary, borderColor: otherVenue ? BRAND : colors.border.default }]}>
                        <Ionicons name="create-outline" size={16} color={colors.text.tertiary} />
                        <TextInput
                          ref={otherRef}
                          value={otherVenue}
                          onChangeText={setOtherVenue}
                          placeholder="Type venue name…"
                          placeholderTextColor={colors.text.disabled}
                          style={[styles.buyInInput, { color: colors.text.primary, flex: 1, fontSize: 15 }]}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => otherVenue.trim() && pickVenue(otherVenue.trim())}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => otherVenue.trim() && pickVenue(otherVenue.trim())}
                        disabled={!otherVenue.trim()}
                        activeOpacity={0.85}
                        style={[styles.sheetConfirmBtn, { backgroundColor: otherVenue.trim() ? BRAND : colors.bg.secondary, marginHorizontal: 0, marginTop: 8 }]}
                      >
                        <Text style={[styles.sheetConfirmText, { color: otherVenue.trim() ? "#fff" : colors.text.disabled }]}>
                          {otherVenue.trim() ? `Use "${otherVenue.trim()}"` : "Type a venue name"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { setShowOtherInput(true); setTimeout(() => otherRef.current?.focus(), 100); }}
                      activeOpacity={0.7}
                      style={styles.venueRow}
                    >
                      <View style={[styles.venueIconWrap, { backgroundColor: colors.bg.secondary }]}>
                        <Ionicons name="add-outline" size={15} color={colors.text.tertiary} />
                      </View>
                      <Text style={[styles.venueName, { color: colors.text.secondary }]}>Other / Not in list</Text>
                    </TouchableOpacity>
                  )}
                </>
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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

  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  venueSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center",
    marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetTitle:  { fontSize: 17, fontWeight: "800" },
  sheetBody:   { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 16 },

  buyInInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 8,
    gap: 8,
  },
  buyInCurrency: { fontSize: 18, fontWeight: "600" },
  buyInInput:    { flex: 1, fontSize: 22, fontWeight: "700" },

  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  chipWide: {
    minWidth: 70,
    alignItems: "center",
  },
  chipText: { fontSize: 14, fontWeight: "600" },

  sheetConfirmBtn: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  sheetConfirmText: { fontSize: 15, fontWeight: "700" },

  statechips: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  stateChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  stateChipText: { fontSize: 12, fontWeight: "700" },

  venueSearch: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 11 : 6,
  },
  venueSearchInput: { flex: 1, fontSize: 15 },

  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 12,
  },
  venueIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  venueName: { fontSize: 14 },
  venueSub:  { fontSize: 12, marginTop: 1 },
});
