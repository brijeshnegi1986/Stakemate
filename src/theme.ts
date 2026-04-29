import { PokerFinderColors } from '@/constants/theme';

// Legacy export — components should migrate to usePokerTheme() hook
export const colors = {
  bg: PokerFinderColors.dark.bg.primary,
  card: PokerFinderColors.dark.surface.raised,
  card2: PokerFinderColors.dark.bg.tertiary,
  text: PokerFinderColors.dark.text.primary,
  subtext: PokerFinderColors.dark.text.secondary,
  profit: PokerFinderColors.dark.text.success,
  loss: PokerFinderColors.dark.text.danger,
};
