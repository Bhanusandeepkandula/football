import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_LEAGUE_SLUG, getLeague, League } from '@/config/leagues';
import { getLeagueSeason, setActiveSlug } from '@/lib/espn';

const STORAGE_KEY = 'competition.slug';

interface LeagueContextValue {
  /** The currently selected competition (never null; falls back to the default). */
  league: League;
  /** The raw slug — convenient for query keys and URL building. */
  slug: string;
  /** Switch competitions. Persists across launches. */
  setLeague: (slug: string) => void;
  /** True once the persisted choice has loaded (avoids a flash of the default). */
  ready: boolean;
}

const LeagueContext = createContext<LeagueContextValue>({
  league: getLeague(DEFAULT_LEAGUE_SLUG),
  slug: DEFAULT_LEAGUE_SLUG,
  setLeague: () => {},
  ready: false,
});

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [slug, setSlug] = useState<string>(DEFAULT_LEAGUE_SLUG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => { if (stored) setSlug(stored); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Mirror the selection into the module-level active slug so out-of-React
  // prefetch call sites build query options for the right competition.
  useEffect(() => { setActiveSlug(slug); }, [slug]);

  const setLeague = useCallback((next: string) => {
    setSlug(next);
    setActiveSlug(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return (
    <LeagueContext.Provider value={{ league: getLeague(slug), slug, setLeague, ready }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague(): LeagueContextValue {
  return useContext(LeagueContext);
}

/**
 * The current season year for a league, read live from ESPN and cached hard
 * (competitions change season a couple of times a year at most). Falls back to
 * the selected league when no slug is passed.
 */
export function useLeagueSeason(slugArg?: string): number | undefined {
  const { slug } = useLeague();
  const s = slugArg ?? slug;
  const { data } = useQuery({
    queryKey: ['league-season', s],
    queryFn: () => getLeagueSeason(s),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: false,
  });
  return data;
}
