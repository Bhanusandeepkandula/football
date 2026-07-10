import { useQuery } from '@tanstack/react-query';
import { getActiveSlug } from '@/lib/espn';
import { useLeague } from '@/hooks/useLeague';

const v3Base = (slug: string) => `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${slug}/athletes`;

async function espnFetch(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`ESPN: ${res.status}`);
  return res.json();
}

export interface PlayerBio {
  id: string;
  displayName: string;
  fullName?: string;
  position?: string;
  positionAbbr?: string;
  jersey?: string;
  headshot?: string;
  flag?: string;
  age?: number;
  dob?: string;
  height?: string;
  weight?: string;
  citizenship?: string;
  birthPlace?: string;
  status?: string;
  club?: { id?: string; name?: string; logo?: string };
}

export interface PlayerStatLine {
  competition: string;
  leagueSlug?: string;
  stats: string[];
}

export interface PlayerStats {
  keys: string[];
  labels: string[];       // long labels ("Total Goals")
  shortLabels: string[];  // short labels ("G")
  splits: PlayerStatLine[];
  totals: string[];       // summed per column across splits
}

export interface PlayerTeamHistory {
  id: string;
  displayName: string;
  logo?: string;
  seasons?: string;
}

export interface PlayerNews {
  id: string;
  headline: string;
  description?: string;
  image?: string;
  published?: string;
  byline?: string;
  link?: string;
  isVideo?: boolean;
}

export interface PlayerDetail {
  bio: PlayerBio;
  stats: PlayerStats | null;
  teamHistory: PlayerTeamHistory[];
  news: PlayerNews[];
}

function birthPlaceStr(bp: any): string | undefined {
  if (!bp || typeof bp !== 'object') return undefined;
  const parts = [bp.city, bp.state, bp.country].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function buildStats(statistics: any): PlayerStats | null {
  if (!statistics) return null;
  const keys: string[] = statistics.names ?? [];
  const labels: string[] = statistics.displayNames ?? keys;
  const shortLabels: string[] = statistics.labels ?? labels;
  const splits: PlayerStatLine[] = (statistics.splits ?? [])
    .filter((s: any) => Array.isArray(s?.stats))
    .map((s: any) => ({ competition: s.displayName ?? '', leagueSlug: s.leagueSlug, stats: (s.stats ?? []).map(String) }));
  // No per-competition rows → the player has no recorded data. Show nothing
  // rather than fabricating a table/tiles of zeroes.
  if (splits.length === 0) return null;

  // Sum each column across competitions for a career/season total row. The
  // column count is taken from the actual data rows so the Total row always
  // aligns with the rows (and header) above it.
  const colCount = splits.reduce((m, s) => Math.max(m, s.stats.length), 0);
  const totals = Array.from({ length: colCount }, (_, col) =>
    splits.reduce((sum, s) => {
      const n = parseFloat(String(s.stats[col] ?? '').replace(/[^\d.-]/g, ''));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0),
  ).map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)));

  return { keys, labels, shortLabels, splits, totals };
}

function buildNews(raw: any): PlayerNews[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((a: any) => a?.headline)
    .slice(0, 12)
    .map((a: any, i: number) => ({
      id: String(a.id ?? a.dataSourceIdentifier ?? i),
      headline: a.headline,
      description: a.description,
      image: (a.images ?? []).find((im: any) => im?.url)?.url,
      published: a.published ?? a.lastModified,
      byline: a.byline,
      link: a.links?.web?.href ?? a.links?.mobile?.href,
      isVideo: a.type === 'Media' || !!a.video,
    }));
}

export async function fetchPlayerDetail(playerId: string, slug: string = getActiveSlug()): Promise<PlayerDetail> {
  const V3 = v3Base(slug);
  const [rootRes, overviewRes, bioRes] = await Promise.allSettled([
    espnFetch(`${V3}/${playerId}`),
    espnFetch(`${V3}/${playerId}/overview`),
    espnFetch(`${V3}/${playerId}/bio`),
  ]);

  const athlete = rootRes.status === 'fulfilled' ? (rootRes.value?.athlete ?? {}) : {};
  const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : {};
  const teamHistoryRaw = bioRes.status === 'fulfilled' ? (bioRes.value?.teamHistory ?? []) : [];

  const team = athlete.team ?? {};
  const bio: PlayerBio = {
    id: String(athlete.id ?? playerId),
    displayName: athlete.displayName ?? athlete.fullName ?? 'Player',
    fullName: athlete.fullName,
    position: athlete.position?.displayName ?? athlete.position?.name,
    positionAbbr: athlete.position?.abbreviation,
    jersey: athlete.jersey ?? athlete.displayJersey,
    headshot: athlete.headshot?.href,
    flag: athlete.flag?.href,
    age: athlete.age,
    dob: athlete.displayDOB,
    height: athlete.displayHeight,
    weight: athlete.displayWeight,
    citizenship: athlete.citizenship,
    birthPlace: birthPlaceStr(athlete.birthPlace),
    status: athlete.status?.name,
    club: team.id ? { id: String(team.id), name: team.displayName ?? team.name, logo: team.logos?.[0]?.href } : undefined,
  };

  const teamHistory: PlayerTeamHistory[] = (teamHistoryRaw ?? [])
    .map((t: any) => ({ id: String(t.id ?? ''), displayName: t.displayName ?? '', logo: t.logo, seasons: t.seasons }))
    .filter((t: PlayerTeamHistory) => t.displayName);

  // If no club logo on the athlete, borrow the matching team-history logo.
  if (bio.club && !bio.club.logo) {
    const match = teamHistory.find((t) => t.id === bio.club?.id);
    if (match?.logo) bio.club.logo = match.logo;
  }

  // Note: a missing headshot is filled lazily by PlayerAvatar/usePlayerPhoto so
  // the sheet content renders instantly instead of waiting on the photo lookup.
  return { bio, stats: buildStats(overview?.statistics), teamHistory, news: buildNews(overview?.news) };
}

export function playerDetailQueryOptions(playerId: string, slug: string = getActiveSlug()) {
  return {
    queryKey: ['playerDetail', slug, playerId] as const,
    queryFn: () => fetchPlayerDetail(playerId, slug),
    staleTime: 10 * 60 * 1000,
  };
}

export function usePlayerDetail(playerId: string) {
  const { slug } = useLeague();
  return useQuery<PlayerDetail>({
    ...playerDetailQueryOptions(playerId, slug),
    enabled: !!playerId,
  });
}
