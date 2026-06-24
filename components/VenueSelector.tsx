import { usePokerTheme } from "@/hooks/use-poker-theme";
import { VENUES_BY_STATE, VENUE_STATE_MAP } from "@/constants/venues";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getSetting } from "@/db/database";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "ACT"];

const REGION_TO_STATE: Record<string, string> = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "Western Australia": "WA",
  "South Australia": "SA",
  "Australian Capital Territory": "ACT",
  "Northern Territory": "WA", // fallback — no NT venues, closest list
  "Tasmania": "VIC",          // fallback — no TAS venues, closest list
};

interface Props {
  stateRegion: string;
  setStateRegion: (s: string) => void;
  venue: string;
  setVenue: (v: string) => void;
}

export function VenueSelector({ stateRegion, setStateRegion, venue, setVenue }: Props) {
  const { colors, spacing, radius, typography, inputTypo } = usePokerTheme();
  const inputRef = useRef<TextInput>(null);
  const [detecting, setDetecting] = useState(false);

  // null    = no chip selected → input disabled, user must pick from chips below
  // "Other" = free-text mode  → input editable + focused
  // string  = named venue     → input disabled, shows that venue
  const [selectedChip, setSelectedChip] = useState<string | null>(() => {
    if (!venue) return null;
    const list = VENUES_BY_STATE[stateRegion] ?? [];
    return list.includes(venue) ? venue : "Other";
  });

  const isEditable = selectedChip === "Other";
  const currentVenues = VENUES_BY_STATE[stateRegion] ?? [];

  // Show ✕ when there's something to clear: typed text or a named chip is locked in
  const showClear = venue.length > 0 || (selectedChip !== null && selectedChip !== "Other");

  const handleStatePress = (s: string) => {
    if (s === stateRegion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStateRegion(s);
    setSelectedChip(null);
    setVenue("");
  };

  const handleVenueChip = (v: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (v === "Other") {
      setSelectedChip("Other");
      setVenue("");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    setSelectedChip(v);
    setVenue(v);
    const detectedState = VENUE_STATE_MAP[v];
    if (detectedState && detectedState !== stateRegion) {
      setStateRegion(detectedState);
    }
  };

  const handleDetectLocation = async () => {
    setDetecting(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync(pos.coords);
      const detectedState = REGION_TO_STATE[geo?.region ?? ""];
      if (detectedState) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handleStatePress(detectedState);
      } else {
        Alert.alert("Location not recognised", "Couldn't match your location to an Australian state. Please select manually.");
      }
    } catch {
      Alert.alert("Could not detect location", "Please select your state manually.");
    } finally {
      setDetecting(false);
    }
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedChip("Other");
    setVenue("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const labelStyle = {
    color: colors.text.tertiary,
    ...typography.caption,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    marginBottom: spacing.sm,
  };

  return (
    <View>
      {/* ── STATE CHIPS ── */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
        <Text style={[labelStyle, { marginBottom: 0 }]}>State</Text>
        {getSetting("locationEnabled") === "true" && (
          <TouchableOpacity
            onPress={handleDetectLocation}
            disabled={detecting}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
              backgroundColor: colors.bg.brandLight,
            }}
          >
            {detecting
              ? <ActivityIndicator size="small" color={colors.text.brand} />
              : <Ionicons name="location-outline" size={13} color={colors.text.brand} />
            }
            <Text style={{ color: colors.text.brand, fontSize: 12, fontWeight: "600" }}>
              {detecting ? "Detecting…" : "Use My Location"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
        {STATES.map((s) => (
          <StateChip
            key={s}
            label={s}
            selected={stateRegion === s}
            onPress={() => handleStatePress(s)}
            colors={colors}
            spacing={spacing}
            radius={radius}
            typography={typography}
          />
        ))}
      </View>

      {/* ── VENUE INPUT ── */}
      <Text style={labelStyle}>Venue</Text>
      <View
        style={{
          height: 52,
          backgroundColor: isEditable ? colors.surface.raised : colors.bg.secondary,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: venue.length > 0 ? colors.border.brand : isEditable ? colors.border.focus : colors.border.default,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.sm,
        }}
      >
        <TextInput
          ref={inputRef}
          placeholder={isEditable ? "Enter venue name" : "Select a venue below"}
          placeholderTextColor={colors.text.disabled}
          value={venue}
          onChangeText={setVenue}
          editable={isEditable}
          returnKeyType="done"
          style={{
            flex: 1,
            height: 52,
            color: venue.length > 0 ? colors.text.primary : colors.text.disabled,
            ...inputTypo.body,
          }}
        />
        {showClear && (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: colors.bg.tertiary,
                alignItems: "center",
                justifyContent: "center",
                marginLeft: spacing.sm,
              }}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 11, lineHeight: 14 }}>
                ✕
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* ── VENUE CHIPS ── */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing["2xl"] }}>
        {currentVenues.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => handleVenueChip(v)}
            activeOpacity={0.75}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radius.full,
              backgroundColor: selectedChip === v ? colors.state.selected : colors.bg.tertiary,
              borderWidth: 1,
              borderColor: selectedChip === v ? colors.border.brand : colors.border.subtle,
            }}
          >
            <Text
              style={{
                color: selectedChip === v ? colors.text.brand : colors.text.secondary,
                ...typography.caption,
                fontWeight: selectedChip === v ? "600" : "400",
              }}
            >
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function StateChip({ label, selected, onPress, colors, spacing, radius, typography }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        backgroundColor: selected ? colors.bg.brand : colors.bg.tertiary,
        borderWidth: 1,
        borderColor: selected ? colors.border.brand : colors.border.default,
      }}
    >
      <Text
        style={{
          color: selected ? colors.text.onBrand : colors.text.primary,
          ...typography.label,
          fontWeight: selected ? "700" : "500",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
