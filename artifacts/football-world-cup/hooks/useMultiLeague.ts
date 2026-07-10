import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { siteBase, espnFetch } from '@/lib/espn';
import { LEAGUES, League } from '@/config/leagues';
import { EspnEvent } from '@/hooks/useWorldCup';
import { getScoreboard } from '@/lib/api/client';
import { matchSummaryToEspnEvent } from '@/lib/api/adapters';

// Priority order for the aggregated home feed + the league filter rail. The
// World Cup leads (it's the marquee competition), then the biggest club
// competitions, then everything else in the registry order.
export const HOME_LEAGUE_ORDER = [
  'fifa.world', 'fifa.cwc', 'uefa.champions',
  'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
  'uefa.europa', 'uefa.euro', 'conmebol.america', 'uefa.nations',
  'usa.1', 'mex.1', 'ned.1', 'por.1', 'uefa.europa.conf',
  'eng.2', 'eng.fa', 'eng.league_cup', 'esp.copa_del_rey',
  'ita.coppa_italia', 'ger.dfb_pokal', 'bra.1', 'arg.1', 'sau.1', 'fifa.friendly',
];

export function homeLeagueOrderIndex(slug: string): number {
  const i = HOME_LEAGUE_ORDER.indexOf(slug);
  return i < 0 ? 999 : i;
}

/** LEAGUES sorted into the home priority order (World Cup first). */
export const ORDERED_LEAGUES: League[] = [...LEAGUES].sort(
  (a, b) => homeLeagueOrderIndex(a.slug) - homeLeagueOrderIndex(b.slug),
);

export interface LeagueSection {
  league: League;
  events: EspnEvent[];
}

/**
 * Fetch one date's fixtures across EVERY competition in parallel and group the
 * non-empty ones into league sections (World Cup first). Shares React-Query
 * cache keys with `useScoreboard`, so the active league isn't fetched twice.
 */
export function useMultiLeagueScoreboard(dateStr: string, enabled = true) {
  const results = useQueries({
    queries: ORDERED_LEAGUES.map((l) => ({
      queryKey: ['scoreboard', l.slug, dateStr] as const,
      // Fan out over the backend's per-league scoreboard and adapt each
      // MatchSummary back into the app's EspnEvent contract. Shares the cache
      // key + adapter with `useScoreboard`, so the active league resolves to a
      // byte-identical payload whether it's fetched here or on its own tab.
      queryFn: async ({ signal }): Promise<{ events: EspnEvent[]; leagues: any[] }> => {
        try {
          const scoreboard = await getScoreboard(l.slug, dateStr, { signal });
          return { events: scoreboard.matches.map(matchSummaryToEspnEvent), leagues: [] };
        } catch {
          // Backend unreachable → fall back to hitting ESPN's public scoreboard
          // directly (the app's original data path) so the home feed still fills.
          return espnFetch(`${siteBase(l.slug)}/scoreboard?dates=${dateStr}`);
        }
      },
      enabled,
      staleTime: 20_000,
      // Poll the whole board while anything is in play; the per-card Polymarket
      // socket still delivers instant score bumps between refetches.
      refetchInterval: 90_000,
    })),
  });

  const isLoading = results.length > 0 && results.every((r) => r.isLoading);
  const isFetched = results.some((r) => r.isFetched);

  // Recompute (and change identity) only when some league's data actually
  // updates — not on every parent render — so `allEvents`/`sections` stay stable
  // and don't churn the live-refresh effects that depend on them downstream.
  const dataSignal = results.map((r) => r.dataUpdatedAt ?? 0).join(',');
  const { sections, allEvents } = useMemo(() => {
    const sections: LeagueSection[] = [];
    const allEvents: EspnEvent[] = [];
    results.forEach((r, i) => {
      const events: EspnEvent[] = ((r.data as any)?.events ?? []) as EspnEvent[];
      if (events.length) {
        sections.push({ league: ORDERED_LEAGUES[i], events });
        allEvents.push(...events);
      }
    });
    // ORDERED_LEAGUES is already in priority order, so sections inherit it.
    return { sections, allEvents };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignal]);

  const refetchAll = () => Promise.all(results.map((r) => r.refetch()));

  return { sections, allEvents, isLoading, isFetched, refetchAll };
}
