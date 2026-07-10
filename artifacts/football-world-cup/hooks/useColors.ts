import { useMemo } from 'react';
import colors from '@/constants/colors';
import { useAccent, accentForeground } from '@/hooks/useAccent';
import { useTheme } from '@/hooks/useTheme';

/**
 * Returns the design tokens for the active user theme plus accent overrides.
 *
 * Memoised on [palette, accent] so the returned object keeps a STABLE identity
 * across re-renders (it only changes when the theme or accent changes). This is
 * what lets React.memo'd components that take `colors` as a prop actually skip
 * re-rendering — without it every 1s live-clock tick re-renders the whole tree.
 */
export function useColors() {
  const { theme } = useTheme();
  const { accent } = useAccent();
  const palette = colors.themes[theme];

  return useMemo(
    () => ({
      ...palette,
      radius: colors.radius,
      primary: accent,
      kicker: accent,
      tint: accent,
      primaryForeground: accentForeground(accent),
    }),
    [palette, accent],
  );
}
