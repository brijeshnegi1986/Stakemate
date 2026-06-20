export const VENUES_BY_STATE: Record<string, string[]> = {
  NSW: ["Star Sydney", "APL", "NPL", "Poker Palace", "Home Games", "Other"],
  VIC: ["Crown Melbourne", "APL", "NPL", "Home Games", "Other"],
  QLD: ["Star Brisbane", "Star GoldCoast", "APL", "Home Games", "Other"],
  WA:  ["APL", "Home Games", "Other"],
  SA:  ["Adelaide Casino", "APL", "Home Games", "Other"],
  ACT: ["Canberra Casino", "APL", "Home Games", "Other"],
};

// Maps a named venue back to its state — used to auto-switch the state chip
// when the user picks a venue that belongs to a different state.
export const VENUE_STATE_MAP: Record<string, string> = {
  "Star Sydney":     "NSW",
  "Crown Melbourne": "VIC",
  "Star Brisbane":   "QLD",
  "Star GoldCoast":  "QLD",
  "Adelaide Casino": "SA",
  "Canberra Casino": "ACT",
};
