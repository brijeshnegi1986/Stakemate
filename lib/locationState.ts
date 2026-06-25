import * as Location from "expo-location";

const REGION_TO_STATE: Record<string, string> = {
  "New South Wales":              "NSW",
  "Victoria":                     "VIC",
  "Queensland":                   "QLD",
  "Western Australia":            "WA",
  "South Australia":              "SA",
  "Australian Capital Territory": "ACT",
  "Northern Territory":           "NT",
  "Tasmania":                     "TAS",
};

const KNOWN_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "ACT"];

/**
 * Returns the AU state code based on device location IF permission is already
 * granted. Never prompts. Returns null if unavailable or outside known states.
 */
export async function detectStateFromLocation(): Promise<string | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const [place] = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });

    const region = place?.region ?? "";
    const code = REGION_TO_STATE[region] ?? region.toUpperCase().slice(0, 3);
    return KNOWN_STATES.includes(code) ? code : null;
  } catch {
    return null;
  }
}
