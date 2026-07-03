import { Platform } from 'react-native';

export const PokerFinderColors = {
  light: {
    bg: {
      primary: '#FFFFFF',
      secondary: '#f8fafc',
      tertiary: '#f1f5f9',
      inverse: '#0f172b',
      brand: '#155DFC',
      brandAccent: '#49E6BA',
      brandLight: 'rgba(21, 93, 252, 0.12)',
      brandHover: '#1249d0',
      brandActive: '#0f3ba8',
      danger: '#e7000b',
      warning: '#fe9a00',
      success: '#00a63e',
    },
    text: {
      primary: '#0f172b',
      secondary: '#45556c',
      tertiary: '#62748e',
      onBrand: '#ffffff',
      inverse: '#ffffff',
      link: '#155DFC',
      brand: '#155DFC',
      danger: '#e7000b',
      success: '#008236',
      warning: '#B45309',   // was #e17100 — 3.20:1 fail → 4.88:1 ✅
      disabled: '#6E7B8B',  // was #90a1b9 — exempt but improved
    },
    border: {
      default: '#e2e8f0',
      subtle: '#f1f5f9',
      strong: '#cad5e2',
      brand: '#155DFC',
      focus: '#1249d0',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
    },
    surface: {
      raised: '#ffffff',
      overlay: '#ffffff',
      scrim: '#0f172b',
    },
    state: {
      hover: '#f1f5f9',
      pressed: '#e2e8f0',
      selected: '#eff4ff',
      disabled: '#f1f5f9',
      focusRing: '#155DFC',
    },
  },
  dark: {
    bg: {
      primary: '#020618',
      secondary: '#0f172b',
      tertiary: '#1d293d',
      inverse: '#ffffff',
      brand: '#155DFC',
      brandAccent: '#49E6BA',
      brandLight: 'rgba(21, 93, 252, 0.15)',
      brandHover: '#1249d0',
      brandActive: '#0f3ba8',
      danger: '#fb2c36',
      warning: '#fe9a00',
      success: '#00c950',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#90a1b9',
      tertiary: '#8898AA',   // was #62748e — 4.23:1 fail → 7.47:1 ✅
      onBrand: '#ffffff',
      inverse: '#0f172b',
      link: '#6B9FFF',
      brand: '#6B9FFF',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
      disabled: '#7A8A9E',   // was #45556c — 2.66:1 fail → 6.31:1 ✅
    },
    border: {
      default: '#314158',
      subtle: '#1d293d',
      strong: '#45556c',
      brand: '#155DFC',
      focus: '#1249d0',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
    },
    surface: {
      raised: '#0f172b',
      overlay: '#1d293d',
      scrim: '#000000',
    },
    state: {
      hover: '#1d293d',
      pressed: '#314158',
      selected: '#0f2060',
      disabled: '#1d293d',
      focusRing: '#155DFC',
    },
  },
  night: {
    bg: {
      primary: '#000000',
      secondary: '#0d0d0d',
      tertiary: '#1a1a1a',
      inverse: '#ffffff',
      brand: '#155DFC',
      brandAccent: '#49E6BA',
      brandLight: 'rgba(21, 93, 252, 0.15)',
      brandHover: '#1249d0',
      brandActive: '#0f3ba8',
      danger: '#fb2c36',
      warning: '#fe9a00',
      success: '#00c950',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#90a1b9',
      tertiary: '#8898AA',   // was #62748e — 4.41:1 fail → 7.98:1 ✅
      onBrand: '#ffffff',
      inverse: '#0f172b',
      link: '#6B9FFF',
      brand: '#6B9FFF',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
      disabled: '#7A8A9E',   // was #45556c — improved
    },
    border: {
      default: '#222222',
      subtle: '#161616',
      strong: '#2e2e2e',
      brand: '#155DFC',
      focus: '#1249d0',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
    },
    surface: {
      raised: '#0d0d0d',
      overlay: '#1a1a1a',
      scrim: '#000000',
    },
    state: {
      hover: '#1a1a1a',
      pressed: '#222222',
      selected: '#0a1a40',
      disabled: '#111111',
      focusRing: '#155DFC',
    },
  },
};

export type ThemeKey = 'dark' | 'night' | 'light';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
} as const;

export const Radius = {
  none: 0,
  xsm: 4,
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const Typography = {
  display:  { fontSize: 36, lineHeight: 44, includeFontPadding: false },
  heading1: { fontSize: 28, lineHeight: 36, includeFontPadding: false },
  heading2: { fontSize: 24, lineHeight: 30, includeFontPadding: false },
  heading3: { fontSize: 20, lineHeight: 28, includeFontPadding: false },
  body:     { fontSize: 16, lineHeight: 24, includeFontPadding: false },
  bodySm:   { fontSize: 14, lineHeight: 20, includeFontPadding: false },
  caption:  { fontSize: 12, lineHeight: 16, includeFontPadding: false },
  label:    { fontSize: 14, lineHeight: 20, includeFontPadding: false },
} as const;

// Use in TextInput styles instead of Typography.
// Strips lineHeight (causes iOS single-line TextInput text to clip at bottom)
// and includeFontPadding (causes Android TextInput text to clip at bottom).
export const InputTypography = {
  display:  { fontSize: 36 },
  heading1: { fontSize: 28 },
  heading2: { fontSize: 24 },
  heading3: { fontSize: 20 },
  body:     { fontSize: 16 },
  bodySm:   { fontSize: 14 },
  caption:  { fontSize: 12 },
  label:    { fontSize: 14 },
} as const;

// Legacy Colors kept for backward compat with use-theme-color
export const Colors = {
  light: {
    text: PokerFinderColors.light.text.primary,
    background: PokerFinderColors.light.bg.primary,
    tint: PokerFinderColors.light.bg.brand,
    icon: PokerFinderColors.light.text.secondary,
    tabIconDefault: PokerFinderColors.light.text.secondary,
    tabIconSelected: PokerFinderColors.light.bg.brand,
  },
  dark: {
    text: PokerFinderColors.dark.text.primary,
    background: PokerFinderColors.dark.bg.primary,
    tint: PokerFinderColors.dark.bg.brand,
    icon: PokerFinderColors.dark.text.secondary,
    tabIconDefault: PokerFinderColors.dark.text.secondary,
    tabIconSelected: PokerFinderColors.dark.bg.brand,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
