import { useEffect, useMemo, useState } from 'react';
import {
  distinctTeamPair,
  extractFlagAccent,
  mergeFlagAccent,
  readableTeamColor,
  resolveTeamBrandColor,
  softenTeamColor,
} from '@/lib/teamColors';
import { useTheme } from '@/hooks/useTheme';

type TeamColorSource = {
  color?: string | null;
  alternateColor?: string | null;
  logo?: string | null;
};

function useFlagAccent(logo?: string | null) {
  const [flagAccent, setFlagAccent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFlagAccent(null);
    if (!logo) return () => { cancelled = true; };

    extractFlagAccent(logo).then((color) => {
      if (!cancelled) setFlagAccent(color);
    });

    return () => {
      cancelled = true;
    };
  }, [logo]);

  return flagAccent;
}

export function useTeamAccentColors(
  home?: TeamColorSource,
  away?: TeamColorSource,
): { homeColor: string; awayColor: string; vizHome: string; vizAway: string } {
  const homeFlag = useFlagAccent(home?.logo);
  const awayFlag = useFlagAccent(away?.logo);

  const homeBrand = useMemo(
    () => mergeFlagAccent(resolveTeamBrandColor(home?.color, home?.alternateColor, '#003DA5'), homeFlag),
    [home?.color, home?.alternateColor, homeFlag],
  );
  const awayBrand = useMemo(
    () => mergeFlagAccent(resolveTeamBrandColor(away?.color, away?.alternateColor, '#C8102E'), awayFlag),
    [away?.color, away?.alternateColor, awayFlag],
  );

  // Theme-aware: a dark navy must be brightened to show on a black screen, but
  // darkened to read on a white one — so the same team looks vivid in any theme.
  const { theme } = useTheme();
  const isDark = theme !== 'white';

  const [homeColor, awayColor] = useMemo(() => {
    const [h, a] = distinctTeamPair(homeBrand, awayBrand);
    return [readableTeamColor(h, isDark), readableTeamColor(a, isDark)];
  }, [homeBrand, awayBrand, isDark]);

  const vizHome = useMemo(() => softenTeamColor(homeColor), [homeColor]);
  const vizAway = useMemo(() => softenTeamColor(awayColor), [awayColor]);

  return { homeColor, awayColor, vizHome, vizAway };
}
