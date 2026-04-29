import { Platform } from 'react-native';

export const PokerFinderColors = {
  light: {
    bg: {
      primary: '#FFFFFF',
      secondary: '#f8fafc',
      tertiary: '#f1f5f9',
      inverse: '#0f172b',
      brand: '#7ccf00',
       brandLight: 'rgba(127, 207, 0, 0.2)',
      brandHover: '#5ea500',
      brandActive: '#497d00',
      danger: '#e7000b',
      warning: '#fe9a00',
      success: '#00a63e',
    },
    text: {
      primary: '#0f172b',
      secondary: '#45556c',
      tertiary: '#62748e',
      onBrand: '#020618',
      inverse: '#ffffff',
      link: '#497d00',
      brand: '#7ccf00',
      danger: '#e7000b',
      success: '#008236',
      warning: '#e17100',
      disabled: '#90a1b9',
    },
    border: {
      default: '#e2e8f0',
      subtle: '#f1f5f9',
      strong: '#cad5e2',
      brand: '#7ccf00',
      focus: '#5ea500',
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
      selected: '#ecfccb',
      disabled: '#f1f5f9',
      focusRing: '#7ccf00',
    },
  },
  dark: {
    bg: {
      primary: '#020618',
      secondary: '#0f172b',
      tertiary: '#1d293d',
      inverse: '#ffffff',
      brand: '#9ae600',
      brandLight: 'rgba(127, 207, 0, 0.2)',
      brandHover: '#7ccf00',
      brandActive: '#5ea500',
      danger: '#fb2c36',
      warning: '#fe9a00',
      success: '#00c950',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#90a1b9',
      tertiary: '#62748e',
      onBrand: '#020618',
      inverse: '#0f172b',
      link: '#9ae600',
      brand: '#9ae600',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
      disabled: '#45556c',
    },
    border: {
      default: '#314158',
      subtle: '#1d293d',
      strong: '#45556c',
      brand: '#9ae600',
      focus: '#7ccf00',
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
      selected: '#35530e',
      disabled: '#1d293d',
      focusRing: '#9ae600',
    },
  },
  night: {
    bg: {
      primary: '#000000',
      secondary: '#0d0d0d',
      tertiary: '#1a1a1a',
      inverse: '#ffffff',
      brand: '#9ae600',
       brandLight: 'rgba(127, 207, 0, 0.2)',
      brandHover: '#7ccf00',
      brandActive: '#5ea500',
      danger: '#fb2c36',
      warning: '#fe9a00',
      success: '#00c950',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#90a1b9',
      tertiary: '#62748e',
      onBrand: '#020618',
      inverse: '#0f172b',
      link: '#9ae600',
      brand: '#9ae600',
      danger: '#fb2c36',
      success: '#00c950',
      warning: '#fe9a00',
      disabled: '#45556c',
    },
    border: {
      default: '#222222',
      subtle: '#161616',
      strong: '#2e2e2e',
      brand: '#9ae600',
      focus: '#7ccf00',
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
      selected: '#1a2e00',
      disabled: '#111111',
      focusRing: '#9ae600',
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
  display: { fontSize: 36, lineHeight: 44 },
  heading1: { fontSize: 28, lineHeight: 36 },
  heading2: { fontSize: 24, lineHeight: 30 },
  heading3: { fontSize: 20, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 24 },
  bodySm: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 14, lineHeight: 20 },
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
