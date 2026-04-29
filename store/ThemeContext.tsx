import { PokerFinderColors, type ThemeKey } from "@/constants/theme";
import { getSetting, setSetting } from "../db/database";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { createContext, useContext, useState, type ReactNode } from "react";

export type ThemePreference = "dark" | "light" | "auto";

type Colors = typeof PokerFinderColors.dark;

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: Colors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveColors(preference: ThemePreference, systemScheme: "light" | "dark"): Colors {
  if (preference === "auto") {
    return PokerFinderColors[systemScheme] as Colors;
  }
  const key: ThemeKey = preference === "light" ? "light" : "dark";
  return PokerFinderColors[key];
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = (useColorScheme() ?? "dark") as "light" | "dark";

  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    try {
      const saved = getSetting("themePreference") as ThemePreference | null;
      if (saved && (["dark", "light", "auto"] as string[]).includes(saved)) {
        return saved;
      }
    } catch (_) {}
    return "dark";
  });

  const handleSet = (p: ThemePreference) => {
    setPreferenceState(p);
    setSetting("themePreference", p);
  };

  const colors = resolveColors(preference, systemScheme);
  const isDark = preference === "dark" || (preference === "auto" && systemScheme === "dark");

  return (
    <ThemeContext.Provider value={{ preference, setPreference: handleSet, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("Wrap your app in <AppThemeProvider>");
  return ctx;
}
