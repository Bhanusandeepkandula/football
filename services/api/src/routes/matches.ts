// GET /v1/:league/matches/upcoming → MatchSummary[] — next scheduled fixtures.
// GET /v1/:league/matches/:id       → MatchDetail    — full match centre payload
//   (teams, status, lineups, events, stats, shots, playerStats, commentary,
//   news, gamecast, preview). Ported from the app's useMatchDetail so the app can
//   consume this response directly. The heavy scrapes (shot map / player stats /
//   commentary) degrade gracefully; the core summary failing yields a 502.
import type { Hono } from 'hono';
import { z } from 'zod';

import type {
  CommentaryItem,
  CommentaryPlayer,
  Gamecast,
  LineupPlayer,
  MatchDetail,
  MatchEvent,
  MatchEventType,
  MatchShot,
  MatchStat,
  NewsItem,
  PlayerStatsTeam,
  PositionGroup,
  TeamLineup,
} from '../contract/schema.js';
import { MatchDetailSchema, MatchSummarySchema } from '../contract/schema.js';
import {
  LeagueParamSchema,
  IdParamSchema,
  TTL,
  cached,
  coreBase,
  defineRoute,
  espnFetch,
  espnText,
  parseParams,
  parseQuery,
  siteBase,
} from './_lib.js';
import { leagueRef } from './_leagues.js';
import { hasStarted, toMatchSummary, ymd } from './_normalize.js';

const UpcomingListSchema = z.array(MatchSummarySchema);

const UpcomingQuerySchema = z.object({
  from: z.string().regex(/^\d{8}$/, 'from must be YYYYMMDD').optional(),
});

// ESPN HTML pages keyed by gameId only (league-agnostic).
const ESPN_MATCH_PAGE = 'https://www.espn.com/soccer/match/_/gameId';
const ESPN_PLAYER_STATS_PAGE = 'https://www.espn.com/soccer/player-stats/_/gameId';
const ESPN_COMMENTARY_PAGE = 'https://www.espn.com/soccer/commentary/_/gameId';

const LIVE_DETAIL_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
  'STATUS_EXTRA_TIME_HALFTIME',
  'STATUS_SHOOTOUT',
]);

const RUNNING_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
]);

// Internal working shape for a side (carries `displayName`; mapped to the DTO's
// `name` at return time).
interface DetailSide {
  id: string;
  displayName: string;
  abbreviation?: string;
  logo: string;
  score: string;
  color: string;
  alternateColor?: string;
  shootout?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Lineups ───────────────────────────────────────────────────────────────────
function buildFormationMap(formationStr: string): Record<number, PositionGroup> {
  const map: Record<number, PositionGroup> = { 1: 'GK' };
  const lines = (formationStr ?? '')
    .split('-')
    .map((n) => parseInt(n, 10))
    .filter((n) => n > 0);
  let place = 2;
  lines.forEach((count, idx) => {
    const groupG: PositionGroup = idx === 0 ? 'DF' : idx === lines.length - 1 ? 'FW' : 'MF';
    for (let i = 0; i < count && place <= 11; i++) map[place++] = groupG;
  });
  return map;
}

const POSITION_LABEL: Record<PositionGroup, string> = { GK: 'GK', DF: 'DEF', MF: 'MID', FW: 'FWD' };

// ── Events ────────────────────────────────────────────────────────────────────
function parseEventType(text: string, typeText?: string): MatchEventType {
  const t = `${text} ${typeText ?? ''}`.toLowerCase();
  if (t.includes('goal') || t.includes('score')) return 'goal';
  if (t.includes('red card') || t.includes('second yellow')) return 'red-card';
  if (t.includes('yellow card') || t.includes('booking')) return 'yellow-card';
  if (t.includes('substitut') || t.includes('sub ') || t.includes('replaced')) return 'substitution';
  if (t.includes('foul')) return 'foul';
  if (t.includes('var')) return 'var';
  return 'other';
}

const DEFAULT_TYPE_LABEL: Record<MatchEventType, string> = {
  goal: 'Goal',
  'yellow-card': 'Yellow Card',
  'red-card': 'Red Card',
  substitution: 'Substitution',
  foul: 'Foul',
  var: 'VAR',
  other: 'Event',
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function cleanEventDetail(type: MatchEventType, text: string): string | undefined {
  if (!text) return undefined;
  if (type === 'goal') {
    const t = text
      .replace(/^Goal!.*?\.\s*/i, '')
      .replace(/\s*Assisted by[^.]*\.?/i, '')
      .replace(/^[^(]*\([^)]*\)\s*/, '')
      .trim()
      .replace(/\.$/, '');
    return t ? cap(t) : undefined;
  }
  if (type === 'yellow-card' || type === 'red-card') {
    const m = text.match(/for (.+?)\.?\s*$/i);
    if (m) return cap(`for ${m[1]}`);
    return undefined;
  }
  if (type === 'foul') {
    const m = text.match(/foul by ([^.]+)\.?/i);
    if (m) return cap(`foul by ${m[1].trim()}`);
    return undefined;
  }
  return undefined;
}

// ── News ──────────────────────────────────────────────────────────────────────
function articleIdentity(article: any, fallback: number): string {
  const apiHref = article?.links?.api?.self?.href ?? '';
  const apiId = String(apiHref).match(/news\/([^/?#]+)/)?.[1];
  return String(
    article?.id ??
      article?.dataSourceIdentifier ??
      apiId ??
      article?.links?.web?.href ??
      article?.headline ??
      fallback,
  );
}

function articleImage(article: any): string | undefined {
  const images: any[] = article?.images ?? [];
  const direct =
    images.find((im: any) => im?.type === 'header' && im?.url) ??
    images.find((im: any) => im?.url) ??
    images.flatMap((im: any) => im?.peers ?? []).find((im: any) => im?.url);
  return direct?.url ?? undefined;
}

function articleCategory(article: any, teamIds: Set<string>, eventId: string): string | undefined {
  const categories: any[] = article?.categories ?? [];
  const hasEvent = categories.some((c: any) => String(c?.eventId ?? c?.event?.id ?? '') === eventId);
  if (hasEvent) return 'Match Report';
  return (
    categories.find(
      (c: any) => c?.type === 'team' && teamIds.has(String(c?.teamId ?? c?.team?.id ?? '')),
    )?.description ??
    categories.find((c: any) => c?.description && c?.type !== 'guid')?.description ??
    article?.type ??
    undefined
  );
}

function normalizeArticle(
  article: any,
  index: number,
  teamIds: Set<string>,
  eventId: string,
): NewsItem {
  return {
    id: articleIdentity(article, index),
    headline: article.headline,
    description: article.description ?? undefined,
    image: articleImage(article),
    published: article.published ?? article.lastModified ?? undefined,
    byline: article.byline ?? undefined,
    category: articleCategory(article, teamIds, eventId),
    link: article.links?.web?.href ?? article.links?.mobile?.href ?? undefined,
  };
}

// ── Gamecast / odds ───────────────────────────────────────────────────────────
function asArray<T = any>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function displayNumber(value: any): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return value > 0 ? `+${value}` : String(value);
  return String(value);
}

function displayPct(value: any): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  return parsed <= 1 ? Math.round(parsed * 100) : Math.round(parsed);
}

function normalizeOddsTeam(raw: any, teamId?: string, teamName?: string): any | undefined {
  if (!raw) return undefined;
  const result = {
    teamId,
    teamName: teamName ?? raw.team?.displayName ?? raw.team?.shortDisplayName,
    moneyLine: displayNumber(raw.moneyLine ?? raw.moneyline ?? raw.moneylineOdds ?? raw.current?.moneyLine),
    spread: displayNumber(raw.spread ?? raw.current?.spread),
    spreadOdds: displayNumber(raw.spreadOdds ?? raw.current?.spreadOdds),
    favorite: raw.favorite ?? raw.isFavorite,
  };
  return Object.values(result).some((value) => value != null && value !== '') ? result : undefined;
}

function normalizeOddsEntry(raw: any, homeTeam: DetailSide, awayTeam: DetailSide): any | null {
  if (!raw) return null;
  const competitors = asArray(raw.competitors);
  const homeRaw =
    raw.homeTeamOdds ??
    raw.home ??
    competitors.find((item: any) => item.homeAway === 'home' || item.team?.id === homeTeam.id);
  const awayRaw =
    raw.awayTeamOdds ??
    raw.away ??
    competitors.find((item: any) => item.homeAway === 'away' || item.team?.id === awayTeam.id);
  const entry = {
    provider: raw.provider?.name ?? raw.provider?.displayName ?? raw.provider?.id ?? raw.source ?? undefined,
    details: raw.details ?? raw.summary ?? raw.line ?? undefined,
    spread: displayNumber(raw.spread ?? raw.current?.spread),
    overUnder: displayNumber(raw.overUnder ?? raw.overunder ?? raw.total ?? raw.current?.overUnder),
    home: normalizeOddsTeam(homeRaw, homeTeam.id, homeTeam.displayName),
    away: normalizeOddsTeam(awayRaw, awayTeam.id, awayTeam.displayName),
  };
  return Object.values(entry).some((value) => value != null && value !== '') ? entry : null;
}

function buildOdds(
  data: any,
  competition: any,
  homeTeam: DetailSide,
  awayTeam: DetailSide,
): Record<string, unknown>[] {
  const rawOdds = [
    ...asArray(competition?.odds),
    ...asArray(data?.odds),
    ...asArray(data?.pickcenter),
    ...asArray(data?.predictor?.odds),
  ];
  const seen = new Set<string>();
  return rawOdds.flatMap((raw) => {
    const odds = normalizeOddsEntry(raw, homeTeam, awayTeam);
    if (!odds) return [];
    const key = JSON.stringify(odds);
    if (seen.has(key)) return [];
    seen.add(key);
    return [odds];
  });
}

function buildWinProbability(data: any): Gamecast['winProbability'] {
  const row = asArray(data?.winprobability).at(-1) ?? data?.predictor;
  if (!row) return undefined;
  const winProbability = {
    home: displayPct(row.homeWinPercentage ?? row.homeWinProbability ?? row.homeChance ?? row.homeTeamPercentage),
    away: displayPct(row.awayWinPercentage ?? row.awayWinProbability ?? row.awayChance ?? row.awayTeamPercentage),
    draw: displayPct(row.tiePercentage ?? row.drawPercentage ?? row.tieProbability ?? row.drawProbability),
  };
  return Object.values(winProbability).some((value) => value != null) ? winProbability : undefined;
}

function buildGamecastCards(args: {
  data: any;
  competition: any;
  statusType: any;
  homeTeam: DetailSide;
  awayTeam: DetailSide;
  stats: MatchStat[];
  events: MatchEvent[];
  shots: MatchShot[];
}): Gamecast['cards'] {
  const { data, competition, statusType, homeTeam, awayTeam, stats, events, shots } = args;
  const cards: Gamecast['cards'] = [];
  const scoreHome = parseInt(homeTeam.score || '0', 10) || 0;
  const scoreAway = parseInt(awayTeam.score || '0', 10) || 0;
  const totalGoals = scoreHome + scoreAway;
  const totalShots = stats.find((stat) => stat.name === 'totalShots');
  const xg = stats.find((stat) => stat.name === 'expectedGoals');
  const possession = stats.find((stat) => stat.name === 'possessionPct');
  const completed = Boolean(statusType?.completed);
  const leader =
    scoreHome > scoreAway
      ? homeTeam.displayName
      : scoreAway > scoreHome
        ? awayTeam.displayName
        : completed
          ? 'Draw'
          : 'Level';

  cards.push({
    id: 'score-state',
    label: completed ? 'Result' : 'Scoreline',
    value: leader,
    detail: `${homeTeam.displayName} ${homeTeam.score || '0'}–${awayTeam.score || '0'} ${awayTeam.displayName}`,
    side: scoreHome > scoreAway ? 'home' : scoreAway > scoreHome ? 'away' : 'neutral',
  });

  cards.push({
    id: 'status',
    label: 'Status',
    value: statusType?.detail ?? statusType?.shortDetail ?? statusType?.description ?? 'Match Centre',
    detail: data?.header?.season?.name ?? undefined,
  });

  if (totalShots) {
    cards.push({
      id: 'shots',
      label: 'Shots',
      value: `${totalShots.homeValue} – ${totalShots.awayValue}`,
      detail: 'Total attempts',
    });
  }
  if (xg) {
    cards.push({
      id: 'xg',
      label: 'Expected Goals',
      value: `${xg.homeValue} – ${xg.awayValue}`,
      detail: 'Chance quality',
    });
  }
  if (possession) {
    cards.push({
      id: 'possession',
      label: 'Possession',
      value: `${possession.homeValue} – ${possession.awayValue}`,
      detail: 'Ball control',
    });
  }
  if (shots.length > 0) {
    cards.push({
      id: 'shot-map',
      label: 'Shot Map',
      value: `${shots.length} shots`,
      detail: `${shots.filter((shot) => shot.outcome === 'goal').length || totalGoals} goals tracked`,
    });
  }
  if (events.length > 0) {
    cards.push({
      id: 'key-events',
      label: 'Key Events',
      value: String(events.length),
      detail: 'Goals, cards, subs and VAR',
    });
  }
  const venue = competition?.venue?.fullName ?? data?.gameInfo?.venue?.fullName;
  if (venue) {
    cards.push({
      id: 'venue',
      label: 'Venue',
      value: venue,
      detail: competition?.venue?.address?.city ?? data?.gameInfo?.venue?.address?.city,
    });
  }
  return cards;
}

// ── HTML scrape helpers (shot map / player stats / commentary) ────────────────
function readJsonObject(html: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function readJsonArray(html: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function findShotObjectStart(html: string, markerIndex: number): number {
  let searchFrom = markerIndex;
  while (searchFrom > 0) {
    const start = html.lastIndexOf('{"id":"', searchFrom);
    if (start < 0 || markerIndex - start > 9000) return -1;
    const beforeMarker = html.slice(start, markerIndex);
    if (beforeMarker.includes('"homeAway"') && beforeMarker.includes('"title"')) return start;
    searchFrom = start - 1;
  }
  return -1;
}

type ShotOutcome = MatchShot['outcome'];

function shotOutcome(title: string, text: string, scoringPlay?: boolean): ShotOutcome {
  const haystack = `${title} ${text}`.toLowerCase();
  if (scoringPlay || (haystack.includes('goal') && !haystack.includes('goal kick'))) return 'goal';
  if (haystack.includes('saved') || haystack.includes('save')) return 'save';
  if (haystack.includes('blocked') || haystack.includes('block')) return 'block';
  return 'offTarget';
}

function attributeValue(attributes: any[] | undefined, label: string): string | undefined {
  return attributes?.find((attr: any) => String(attr?.label ?? '').toLowerCase() === label.toLowerCase())
    ?.displayValue;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isShotLike(title: string, text: string): boolean {
  const searchable = `${title} ${text}`.toLowerCase();
  if (searchable.includes('goal kick')) return false;
  return /(goal|shot|penalty|attempt|miss|saved|save|block|woodwork|post)/i.test(searchable);
}

function shotPlayerName(row: any): string {
  return (
    row.athlete?.shortName ??
    row.athlete?.name ??
    row.athlete?.displayName ??
    row.goalData?.playerName ??
    row.participants?.[0]?.athlete?.shortName ??
    row.participants?.[0]?.athlete?.displayName ??
    row.participants?.[0]?.shortName ??
    row.participants?.[0]?.name ??
    'Player'
  );
}

function parseShotMapHtml(
  html: string,
  eventId: string,
  homeTeam: DetailSide,
  awayTeam: DetailSide,
): MatchShot[] {
  const shots: MatchShot[] = [];
  const seen = new Set<string>();

  const pushShot = (row: any, mirrorAwayX: boolean) => {
    const title = String(row.title ?? row.type?.text ?? row.type?.txt ?? row.shortDescription ?? '');
    const text = String(row.text ?? '');
    if (!row.fieldStart || !row.goalPosition || !isShotLike(title, text)) return;

    const teamKey = String(row.team?.$key ?? row.participants?.[0]?.athlete?.team?.$key ?? '');
    const side: 'home' | 'away' = teamKey === awayTeam.id || row.homeAway === 'away' ? 'away' : 'home';
    const team = side === 'home' ? homeTeam : awayTeam;
    const id = String(row.id ?? row.cardId ?? `${eventId}-${shots.length}`);
    if (seen.has(id)) return;
    seen.add(id);

    const rawX = Number(row.fieldStart.x);
    const y = Number(row.fieldStart.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(y)) return;
    const x = mirrorAwayX && side === 'away' ? 100 - rawX : rawX;
    const rawEndX = Number(row.fieldEnd?.x);
    const endX = Number.isFinite(rawEndX)
      ? clampPct(mirrorAwayX && side === 'away' ? 100 - rawEndX : rawEndX)
      : undefined;

    shots.push({
      id,
      minute: String(row.timeLabel ?? row.clock?.displayValue ?? row.time?.displayValue ?? ''),
      period: Number(row.period?.number ?? 0),
      teamId: team.id,
      teamSide: side,
      teamName: team.displayName,
      playerName: shotPlayerName(row),
      title,
      text,
      outcome: shotOutcome(title, text, Boolean(row.scoringPlay)),
      x: clampPct(x),
      y: clampPct(y),
      endX,
      endY: Number.isFinite(Number(row.fieldEnd?.y)) ? clampPct(Number(row.fieldEnd.y)) : undefined,
      xG: row.goalData?.xG ?? attributeValue(row.play?.attributes ?? row.attributes, 'xG'),
      xGOT: attributeValue(row.play?.attributes ?? row.attributes, 'xGOT'),
      distance: attributeValue(row.play?.attributes ?? row.attributes, 'Distance'),
    });
  };

  let cursor = 0;
  while (cursor < html.length) {
    const marker = html.indexOf('"play":{"id":"', cursor);
    if (marker < 0) break;
    cursor = marker + 8;
    const start = html.indexOf('{"id":"', marker);
    if (start < 0) continue;
    const json = readJsonObject(html, start);
    if (!json) continue;
    try {
      pushShot(JSON.parse(json), true);
    } catch {
      continue;
    }
  }

  if (shots.length === 0) {
    cursor = 0;
    while (cursor < html.length) {
      const marker = html.indexOf('"goalPosition"', cursor);
      if (marker < 0) break;
      cursor = marker + 1;
      const start = findShotObjectStart(html, marker);
      if (start < 0) continue;
      const json = readJsonObject(html, start);
      if (!json) continue;
      try {
        pushShot(JSON.parse(json), false);
      } catch {
        continue;
      }
    }
  }

  return shots.sort((a, b) => {
    if (a.period !== b.period) return a.period - b.period;
    return (parseInt(a.minute, 10) || 0) - (parseInt(b.minute, 10) || 0);
  });
}

function parsePlayerStatsHtml(html: string): PlayerStatsTeam[] {
  const key = html.indexOf('"bxscr":[');
  if (key < 0) return [];
  const start = html.indexOf('[', key);
  if (start < 0) return [];
  const json = readJsonArray(html, start);
  if (!json) return [];

  let teams: any[];
  try {
    teams = JSON.parse(json);
  } catch {
    return [];
  }

  return teams
    .map((entry: any): PlayerStatsTeam => {
      const tm = entry.tm ?? {};
      return {
        team: {
          id: String(tm.id ?? ''),
          displayName: tm.dspNm ?? tm.nm ?? '',
          abbreviation: tm.abbrev ?? '',
          logo: tm.logo ?? '',
        },
        groups: (entry.stats ?? [])
          .map((groupRaw: any) => ({
            type: groupRaw.type ?? '',
            keys: (groupRaw.keys ?? []).map(String),
            labels: (groupRaw.lbls ?? []).map(String),
            athletes: (groupRaw.athlts ?? [])
              .map((row: any) => ({
                id: String(row.athlt?.id ?? ''),
                jersey: String(row.athlt?.jersey ?? ''),
                shortName: row.athlt?.shrtNm ?? row.athlt?.dspNm ?? 'Player',
                displayName: row.athlt?.dspNm ?? row.athlt?.shrtNm ?? 'Player',
                stats: (row.stats ?? []).map(String),
              }))
              .filter((athlete: any) => athlete.id || athlete.displayName !== 'Player'),
          }))
          .filter((groupRaw: any) => groupRaw.athletes.length > 0),
      };
    })
    .filter((entry) => entry.groups.length > 0);
}

function parseManualCommentaryHtml(
  html: string,
  eventId: string,
  homeTeam: DetailSide,
  awayTeam: DetailSide,
): CommentaryItem[] {
  const key = html.indexOf('"mnlCmntry":[');
  if (key < 0) return [];
  const start = html.indexOf('[', key);
  if (start < 0) return [];
  const json = readJsonArray(html, start);
  if (!json) return [];

  let rows: any[];
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }

  return rows
    .filter((row: any) => row?.text)
    .map((row: any, index: number): CommentaryItem => {
      const side: 'home' | 'away' | undefined =
        row.homeAway === 'home' || row.homeAway === 'away' ? row.homeAway : undefined;
      const team = side === 'home' ? homeTeam : side === 'away' ? awayTeam : undefined;
      const players: CommentaryPlayer[] = (row.participants ?? []).map((player: any) => ({
        id: String(player.id ?? ''),
        name: player.name ?? player.shortName ?? 'Player',
        shortName: player.shortName ?? player.name ?? 'Player',
        jersey: String(player.jersey ?? ''),
        position: player.description ?? undefined,
        role: player.type ?? undefined,
        iconType: player.iconType ?? undefined,
      }));

      return {
        id: String(row.id ?? row.cardId ?? `${eventId}-commentary-${index}`),
        minute: String(row.timeLabel ?? row.time?.displayValue ?? ''),
        text: String(row.text ?? ''),
        title: row.title ?? row.type?.txt ?? undefined,
        period: typeof row.period?.number === 'number' ? row.period.number : undefined,
        teamId: team?.id,
        teamSide: side,
        teamName: team?.displayName,
        players,
        isKeyEvent: Boolean(row.title || row.type || players.length > 0),
      };
    });
}

function parseSummaryCommentary(data: any, eventId: string): CommentaryItem[] {
  return (data.commentary ?? [])
    .filter((row: any) => row?.text)
    .map((row: any, index: number): CommentaryItem => ({
      id: String(row.sequence ?? `${eventId}-play-${index}`),
      minute: String(row.time?.displayValue ?? ''),
      text: String(row.text ?? ''),
      players: [],
      isKeyEvent: /(goal|penalty|yellow card|red card|substitution|half|ends|begins)/i.test(
        String(row.text ?? ''),
      ),
    }))
    .reverse();
}

// ── Match stats ───────────────────────────────────────────────────────────────
const STAT_KEYS: { key: string; label: string }[] = [
  { key: 'possessionPct', label: 'Possession %' },
  { key: 'totalShots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'Shots on Target' },
  { key: 'blockedShots', label: 'Shots Blocked' },
  { key: 'shotsOffTarget', label: 'Shots off Target' },
  { key: 'totalShotsInsideBox', label: 'Attempts Inside Box' },
  { key: 'totalShotsOutsideBox', label: 'Attempts Outside Box' },
  { key: 'hitWoodwork', label: 'Hit Woodwork' },
  { key: 'wonCorners', label: 'Corners' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'totalPasses', label: 'Passes' },
  { key: 'accuratePasses', label: 'Accurate Passes' },
  { key: 'totalCrosses', label: 'Crosses' },
  { key: 'accurateCrosses', label: 'Accurate Crosses' },
  { key: 'totalLongBalls', label: 'Long Balls' },
  { key: 'accurateLongBalls', label: 'Accurate Long Balls' },
  { key: 'saves', label: 'Saves' },
  { key: 'totalTackles', label: 'Tackles' },
  { key: 'interceptions', label: 'Interceptions' },
  { key: 'effectiveClearance', label: 'Clearances' },
  { key: 'totalClearance', label: 'Clearances' },
  { key: 'foulsCommitted', label: 'Fouls' },
  { key: 'yellowCards', label: 'Yellow Cards' },
  { key: 'redCards', label: 'Red Cards' },
];

function statIdentity(stat: any): string {
  return String(
    stat?.name ?? stat?.abbreviation ?? stat?.shortDisplayName ?? stat?.label ?? '',
  ).trim();
}

function statDisplay(stat: any): string {
  const value = stat?.displayValue ?? stat?.value;
  if (value == null || value === '') return '—';
  return String(value);
}

function statNumber(stat: any): number {
  const value = stat?.displayValue ?? stat?.value ?? '0';
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fallbackStatLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/pct/i, '%')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildMatchStats(homeStats: any[], awayStats: any[]): MatchStat[] {
  const homeByKey = new Map<string, any>();
  const awayByKey = new Map<string, any>();
  homeStats.forEach((stat) => {
    const key = statIdentity(stat);
    if (key) homeByKey.set(key, stat);
  });
  awayStats.forEach((stat) => {
    const key = statIdentity(stat);
    if (key) awayByKey.set(key, stat);
  });

  const preferred = STAT_KEYS.map((stat) => stat.key);
  const orderedKeys = [...preferred, ...homeStats.map(statIdentity), ...awayStats.map(statIdentity)].filter(
    (key, index, arr) => key && arr.indexOf(key) === index,
  );

  return orderedKeys.flatMap((key) => {
    const hs = homeByKey.get(key);
    const as_ = awayByKey.get(key);
    if (!hs && !as_) return [];
    const known = STAT_KEYS.find((item) => item.key === key);
    const label =
      hs?.label ?? as_?.label ?? hs?.displayName ?? as_?.displayName ?? known?.label ?? fallbackStatLabel(key);
    const hv = statNumber(hs);
    const av = statNumber(as_);
    const total = hv + av;
    return [
      {
        name: key,
        displayName: label,
        homeValue: statDisplay(hs),
        awayValue: statDisplay(as_),
        homePercent: total > 0 ? (hv / total) * 100 : 50,
      },
    ];
  });
}

// ── Preview ───────────────────────────────────────────────────────────────────
type PreviewStatFormat = 'decimal' | 'percent' | 'integer' | 'signed';

const PREVIEW_TEAM_STAT_DEFS: {
  key: string;
  label: string;
  format: PreviewStatFormat;
  computed?: 'savePct';
}[] = [
  { key: 'avgGoals', label: 'Average Goals', format: 'decimal' },
  { key: 'avgGoalsConceded', label: 'Average Goals Conceded', format: 'decimal' },
  { key: 'avgGoalDifferential', label: 'Average Goal Differential', format: 'signed' },
  { key: 'avgExpectedGoals', label: 'Average Expected Goals', format: 'decimal' },
  { key: 'avgExpectedGoalsConceded', label: 'Average Expected Goals Conceded', format: 'decimal' },
  { key: 'avgExpectedGoalDifferential', label: 'Average Expected Goal Differential', format: 'signed' },
  { key: 'possessionPct', label: 'Possession', format: 'percent' },
  { key: 'savePct', label: 'Save Percentage', format: 'percent', computed: 'savePct' },
  { key: 'cleanSheet', label: 'Clean Sheet', format: 'integer' },
];

function parsePreviewFormEvent(ev: any) {
  const opp = ev.opponent ?? {};
  const result = String(ev.gameResult ?? '').toUpperCase();
  return {
    id: String(ev.id ?? ''),
    date: ev.gameDate ?? '',
    atVs: ev.atVs === '@' ? '@' : 'vs',
    score: ev.score ?? '',
    result: result === 'W' || result === 'D' || result === 'L' ? result : 'D',
    competitionName: ev.competitionName ?? ev.leagueName ?? '',
    roundName: ev.roundName || undefined,
    opponent: {
      id: String(opp.id ?? ''),
      abbreviation: opp.abbreviation ?? '',
      displayName: opp.displayName ?? '',
      logo: opp.logo ?? opp.logos?.[0]?.href ?? ev.opponentLogo ?? '',
    },
  };
}

function parsePreviewH2H(raw: any[], homeTeam: { id: string; abbr: string }, awayTeam: { id: string; abbr: string }) {
  const seen = new Set<string>();
  const matches: Record<string, unknown>[] = [];
  const abbrFor = (id: string) =>
    id === homeTeam.id ? homeTeam.abbr : id === awayTeam.id ? awayTeam.abbr : '';

  for (const block of raw) {
    for (const ev of block?.events ?? []) {
      const id = String(ev.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const histHomeId = String(ev.homeTeamId ?? '');
      const homeScore =
        histHomeId === homeTeam.id ? String(ev.homeTeamScore ?? '0') : String(ev.awayTeamScore ?? '0');
      const awayScore =
        histHomeId === homeTeam.id ? String(ev.awayTeamScore ?? '0') : String(ev.homeTeamScore ?? '0');
      matches.push({
        id,
        date: ev.gameDate ?? '',
        homeScore,
        awayScore,
        competitionName: ev.competitionName ?? ev.leagueName ?? '',
        roundName: ev.roundName || undefined,
        venueAbbr: abbrFor(histHomeId) || undefined,
      });
    }
  }
  return matches.sort(
    (a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime(),
  );
}

function parsePreviewLeaderEntry(entry: any): Record<string, unknown> | null {
  const athlete = entry?.athlete;
  if (!athlete?.id) return null;
  const stats: any[] = entry?.statistics ?? [];
  const appearances =
    stats.find((s) => s.name === 'appearances')?.displayValue ??
    stats.find((s) => s.abbreviation === 'APP')?.displayValue ??
    '';
  return {
    id: String(athlete.id),
    shortName: athlete.shortName ?? athlete.displayName ?? 'Player',
    jersey: athlete.jersey ?? '',
    position: athlete.position?.abbreviation ?? '',
    value: entry?.mainStat?.value ?? stats[0]?.displayValue ?? '0',
    appearances,
    jerseyImage: athlete.jerseyImage?.[0]?.href,
  };
}

function parsePreviewLeaders(raw: any[], homeTeamId: string, awayTeamId: string) {
  const empty = { goals: [] as unknown[], assists: [] as unknown[] };
  const homeBlock = raw.find((b) => String(b?.team?.id) === homeTeamId);
  const awayBlock = raw.find((b) => String(b?.team?.id) === awayTeamId);
  const extract = (block: any) => {
    if (!block) return empty;
    const goals = (block.leaders ?? []).find((c: any) => c.name === 'goalsLeaders');
    const assists = (block.leaders ?? []).find((c: any) => c.name === 'assistsLeaders');
    return {
      goals: (goals?.leaders ?? []).map(parsePreviewLeaderEntry).filter(Boolean).slice(0, 3),
      assists: (assists?.leaders ?? []).map(parsePreviewLeaderEntry).filter(Boolean).slice(0, 3),
    };
  };
  return { home: extract(homeBlock), away: extract(awayBlock) };
}

function teamSeasonStatMap(data: any): Record<string, number> {
  const map: Record<string, number> = {};
  for (const cat of data?.splits?.categories ?? []) {
    for (const s of cat?.stats ?? []) {
      if (s?.name) {
        const val = typeof s.value === 'number' ? s.value : parseFloat(String(s.displayValue ?? '0'));
        map[s.name] = Number.isFinite(val) ? val : 0;
      }
    }
  }
  return map;
}

function computeSavePct(stats: Record<string, number>): number {
  const saves = stats.saves ?? 0;
  const conceded = stats.goalsConceded ?? 0;
  const total = saves + conceded;
  return total > 0 ? Math.round((saves / total) * 100) : 0;
}

async function fetchTeamSeasonStats(
  teamId: string,
  seasonYear: number,
  slug: string,
): Promise<Record<string, number>> {
  try {
    const data = await espnFetch<any>(
      `${coreBase(slug)}/seasons/${seasonYear}/types/1/teams/${teamId}/statistics/0?lang=en&region=us`,
    );
    return teamSeasonStatMap(data);
  } catch {
    return {};
  }
}

function buildPreviewTeamStats(
  homeStats: Record<string, number>,
  awayStats: Record<string, number>,
) {
  return PREVIEW_TEAM_STAT_DEFS.map((def) => {
    let homeValue = homeStats[def.key] ?? 0;
    let awayValue = awayStats[def.key] ?? 0;
    if (def.computed === 'savePct') {
      homeValue = computeSavePct(homeStats);
      awayValue = computeSavePct(awayStats);
    }
    return { name: def.key, label: def.label, homeValue, awayValue, format: def.format };
  }).filter((s) => s.homeValue > 0 || s.awayValue > 0);
}

async function buildMatchPreview(
  data: any,
  homeTeam: { id: string; abbr: string },
  awayTeam: { id: string; abbr: string },
  seasonYear: number,
  slug: string,
): Promise<MatchDetail['preview']> {
  const formBlocks: any[] = data?.boxscore?.form ?? [];
  const homeFormBlock = formBlocks.find((b) => String(b?.team?.id) === homeTeam.id);
  const awayFormBlock = formBlocks.find((b) => String(b?.team?.id) === awayTeam.id);

  const recentForm = {
    home: (homeFormBlock?.events ?? []).map(parsePreviewFormEvent).slice(0, 5),
    away: (awayFormBlock?.events ?? []).map(parsePreviewFormEvent).slice(0, 5),
  };
  const headToHead = parsePreviewH2H(data?.headToHeadGames ?? [], homeTeam, awayTeam);
  const leaders = parsePreviewLeaders(data?.leaders ?? [], homeTeam.id, awayTeam.id);

  const hasForm = recentForm.home.length > 0 || recentForm.away.length > 0;
  const hasLeaders =
    (leaders.home.goals as unknown[]).length > 0 || (leaders.away.goals as unknown[]).length > 0;
  if (!hasForm && headToHead.length === 0 && !hasLeaders) return undefined;

  const [homeSeason, awaySeason] = await Promise.all([
    fetchTeamSeasonStats(homeTeam.id, seasonYear, slug),
    fetchTeamSeasonStats(awayTeam.id, seasonYear, slug),
  ]);
  const teamStats = buildPreviewTeamStats(homeSeason, awaySeason);

  return { headToHead, recentForm, leaders, teamStats };
}

// ── Match detail assembly ─────────────────────────────────────────────────────
async function fetchMatchDetail(eventId: string, slug: string): Promise<MatchDetail> {
  const data = await espnFetch<any>(`${siteBase(slug)}/summary?event=${eventId}`);

  const header = data.header?.competitions?.[0];
  const competitors: any[] = header?.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
  const statusType = header?.status?.type ?? {};
  const period: number = header?.status?.period ?? 0;
  const displayClock: string = header?.status?.displayClock ?? '';

  const homeSo = typeof home?.shootoutScore === 'number' ? home.shootoutScore : undefined;
  const awaySo = typeof away?.shootoutScore === 'number' ? away.shootoutScore : undefined;
  const shootout = homeSo != null && awaySo != null ? { home: homeSo, away: awaySo } : null;
  const resultSuffix =
    shootout || statusType.name === 'STATUS_FINAL_PEN' || statusType.name === 'STATUS_SHOOTOUT'
      ? 'Pens'
      : statusType.completed && period > 2
        ? 'AET'
        : '';

  const gameInfo = data.gameInfo ?? {};
  const round =
    String(data.header?.season?.name ?? '')
      .replace(/^\d{4}(?:-\d{2,4})?\s+[^,]*,\s*/, '')
      .trim() || undefined;
  const venueName = header?.venue?.fullName ?? gameInfo.venue?.fullName;
  const cityName = header?.venue?.address?.city ?? gameInfo.venue?.address?.city;
  const referee = (gameInfo.officials ?? []).find((o: any) => o.position?.name === 'Referee')
    ?.displayName;
  const attendance = typeof gameInfo.attendance === 'number' ? gameInfo.attendance : undefined;

  const homeTeamDetail: DetailSide = {
    id: home?.team?.id ?? '',
    displayName: home?.team?.displayName ?? 'Home',
    abbreviation: home?.team?.abbreviation,
    logo: home?.team?.logos?.[0]?.href ?? home?.team?.logo ?? '',
    score: home?.score ?? '0',
    color: home?.team?.color ?? '003DA5',
    alternateColor: home?.team?.alternateColor,
    shootout: homeSo,
  };
  const awayTeamDetail: DetailSide = {
    id: away?.team?.id ?? '',
    displayName: away?.team?.displayName ?? 'Away',
    abbreviation: away?.team?.abbreviation,
    logo: away?.team?.logos?.[0]?.href ?? away?.team?.logo ?? '',
    score: away?.score ?? '0',
    color: away?.team?.color ?? 'C8102E',
    alternateColor: away?.team?.alternateColor,
    shootout: awaySo,
  };

  // Lineups (ESPN exposes them under `rosters`).
  let lineups: [TeamLineup, TeamLineup] | null = null;
  const rosters: any[] = data.rosters ?? [];
  if (rosters.length >= 2) {
    const parseLineup = (entry: any): TeamLineup => {
      const formationStr: string = entry.formation ?? '';
      const placeToGroup = buildFormationMap(formationStr);
      const players: LineupPlayer[] = (entry.roster ?? []).map((r: any) => {
        const ath = r.athlete ?? {};
        const statsMap: Record<string, string> = {};
        (r.stats ?? []).forEach((s: any) => {
          if (s.name) statsMap[s.name] = s.displayValue ?? String(s.value ?? '');
        });
        const place: number = r.formationPlace ?? 0;
        const groupG: PositionGroup = placeToGroup[place] ?? 'MF';
        return {
          id: ath.id ?? '',
          displayName: ath.shortName ?? ath.displayName ?? 'Player',
          jersey: r.jersey ?? ath.jersey ?? '',
          position: r.starter ? POSITION_LABEL[groupG] : 'SUB',
          positionGroup: groupG,
          headshot: ath.headshot?.href,
          starter: r.starter ?? false,
          stats: statsMap,
        };
      });
      const t = entry.team ?? {};
      return {
        team: {
          id: t.id ?? '',
          displayName: t.displayName ?? '',
          logo: t.logos?.[0]?.href ?? t.logo ?? '',
          color: t.color ?? '003DA5',
        },
        formation: formationStr || undefined,
        starters: players.filter((p) => p.starter),
        bench: players.filter((p) => !p.starter),
      };
    };
    const lp0 = parseLineup(rosters[0]);
    const lp1 = parseLineup(rosters[1]);
    let zeroIsHome: boolean;
    if (rosters[0].homeAway === 'home' || rosters[1].homeAway === 'away') {
      zeroIsHome = true;
    } else if (rosters[0].homeAway === 'away' || rosters[1].homeAway === 'home') {
      zeroIsHome = false;
    } else if (lp0.team.id && home?.team?.id) {
      zeroIsHome = lp0.team.id === home.team.id || lp1.team.id !== home.team.id;
    } else {
      zeroIsHome = true;
    }
    lineups = zeroIsHome ? [lp0, lp1] : [lp1, lp0];
  }

  // Events (ESPN exposes them under `keyEvents`, already chronological).
  const homeIdForEvents = home?.team?.id;
  let runningHome = 0;
  let runningAway = 0;
  const events: MatchEvent[] = (data.keyEvents ?? [])
    .filter((p: any) => Boolean(p.scoringPlay) || Boolean(p.text || p.shortText))
    .map((p: any, i: number): MatchEvent => {
      const typeText: string = p.type?.text ?? '';
      const fullText: string = p.text ?? p.shortText ?? '';
      const type = parseEventType(typeText || p.text || '', p.type?.type);
      const isOwnGoal = /own goal/i.test(fullText) || /own[-\s]?goal/i.test(typeText);
      const isPenalty = /penalt/i.test(fullText) || /penalt/i.test(typeText);

      let scoreHome: number | undefined;
      let scoreAway: number | undefined;
      if (type === 'goal' && p.team?.id) {
        if (p.team.id === homeIdForEvents) runningHome += 1;
        else runningAway += 1;
        scoreHome = runningHome;
        scoreAway = runningAway;
      }

      return {
        id: p.id ?? String(i),
        clock: p.clock?.displayValue ?? '',
        period: p.period?.number ?? 1,
        type,
        typeLabel: isOwnGoal
          ? 'Own Goal'
          : isPenalty && type === 'goal'
            ? 'Penalty'
            : typeText || DEFAULT_TYPE_LABEL[type],
        text: p.shortText ?? fullText,
        detail: cleanEventDetail(type, fullText),
        teamId: p.team?.id,
        playerName: p.participants?.[0]?.athlete?.displayName ?? '',
        secondaryName:
          type === 'goal' || type === 'substitution'
            ? p.participants?.[1]?.athlete?.displayName ?? undefined
            : undefined,
        scoreHome,
        scoreAway,
        isPenalty,
        isOwnGoal,
      };
    });

  // Stats.
  const boxTeams: any[] = data.boxscore?.teams ?? [];
  const homeStats: any[] =
    (boxTeams.find((t: any) => t.team?.id === home?.team?.id) ?? boxTeams[0])?.statistics ?? [];
  const awayStats: any[] =
    (boxTeams.find((t: any) => t.team?.id === away?.team?.id) ?? boxTeams[1])?.statistics ?? [];
  const stats: MatchStat[] = buildMatchStats(homeStats, awayStats);

  // Derived accuracy percentages.
  const rawStat = (arr: any[], key: string): number => {
    const s = arr.find((x: any) => x.name === key || x.abbreviation === key);
    return s ? parseFloat(s.displayValue ?? String(s.value ?? '0')) || 0 : 0;
  };
  const addAccuracy = (afterKey: string, name: string, label: string, madeKey: string, totalKey: string) => {
    const hMade = rawStat(homeStats, madeKey);
    const hTot = rawStat(homeStats, totalKey);
    const aMade = rawStat(awayStats, madeKey);
    const aTot = rawStat(awayStats, totalKey);
    if (hTot <= 0 || aTot <= 0) return;
    const hPct = Math.round((hMade / hTot) * 100);
    const aPct = Math.round((aMade / aTot) * 100);
    const entry: MatchStat = {
      name,
      displayName: label,
      homeValue: `${hPct}%`,
      awayValue: `${aPct}%`,
      homePercent: hPct + aPct > 0 ? (hPct / (hPct + aPct)) * 100 : 50,
    };
    const idx = stats.findIndex((s) => s.name === afterKey);
    if (idx >= 0) stats.splice(idx + 1, 0, entry);
    else stats.push(entry);
  };
  addAccuracy('shotsOnTarget', 'shotAccuracy', 'Shot Accuracy', 'shotsOnTarget', 'totalShots');
  addAccuracy('accuratePasses', 'passAccuracy', 'Pass Accuracy', 'accuratePasses', 'totalPasses');

  // Heavy HTML scrapes (parallel; each degrades to empty on failure).
  const allPlays = parseSummaryCommentary(data, eventId);
  const [shotMapHtml, playerStatsHtml, commentaryHtml] = await Promise.all([
    espnText(`${ESPN_MATCH_PAGE}/${eventId}`).catch(() => null),
    espnText(`${ESPN_PLAYER_STATS_PAGE}/${eventId}`).catch(() => null),
    espnText(`${ESPN_COMMENTARY_PAGE}/${eventId}`).catch(() => null),
  ]);

  let shots: MatchShot[] = [];
  try {
    if (shotMapHtml) shots = parseShotMapHtml(shotMapHtml, eventId, homeTeamDetail, awayTeamDetail);
  } catch {
    shots = [];
  }

  let playerStats: PlayerStatsTeam[] = [];
  try {
    if (playerStatsHtml) playerStats = parsePlayerStatsHtml(playerStatsHtml);
  } catch {
    playerStats = [];
  }

  let commentary: CommentaryItem[] = [];
  try {
    if (commentaryHtml) commentary = parseManualCommentaryHtml(commentaryHtml, eventId, homeTeamDetail, awayTeamDetail);
  } catch {
    commentary = [];
  }
  if (commentary.length === 0) commentary = allPlays;

  const gamecast: Gamecast = {
    cards: buildGamecastCards({
      data,
      competition: header,
      statusType,
      homeTeam: homeTeamDetail,
      awayTeam: awayTeamDetail,
      stats,
      events,
      shots,
    }),
    odds: buildOdds(data, header, homeTeamDetail, awayTeamDetail),
    winProbability: buildWinProbability(data),
  };

  // News.
  const teamIds = new Set<string>(
    [home?.team?.id, away?.team?.id].filter(Boolean).map((x: any) => String(x)),
  );
  const teamNames = [
    home?.team?.displayName,
    away?.team?.displayName,
    home?.team?.shortDisplayName,
    away?.team?.shortDisplayName,
    home?.team?.name,
    away?.team?.name,
  ]
    .filter((s: any): s is string => typeof s === 'string' && s.length > 2)
    .map((s) => s.toLowerCase());

  const scoreArticle = (a: any): number => {
    let score = 0;
    for (const c of a.categories ?? []) {
      const eventCategoryId = String(c?.eventId ?? c?.event?.id ?? '');
      if (eventCategoryId && eventCategoryId === eventId) score += 12;
      const cid = String(c?.teamId ?? c?.team?.id ?? '');
      if (cid && teamIds.has(cid)) score += 4;
      const desc = String(c?.description ?? '').toLowerCase();
      if (desc && teamNames.some((nm) => desc === nm)) score += 2;
    }
    const text = `${a.headline ?? ''} ${a.description ?? ''}`.toLowerCase();
    for (const nm of teamNames) if (text.includes(nm)) score += 2;
    return score;
  };

  const matchArticle = data.article?.headline ? data.article : null;
  const rawArticles: any[] = (data.news?.articles ?? []).filter((a: any) => a?.headline);
  const related = rawArticles
    .map((a) => ({ a, s: scoreArticle(a) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);

  const seenArticles = new Set<string>();
  const news: NewsItem[] = [matchArticle, ...related]
    .filter(Boolean)
    .map((a: any, i: number) => normalizeArticle(a, i, teamIds, eventId))
    .filter((a) => {
      const key = `${a.id}|${a.link ?? ''}|${a.headline}`.toLowerCase();
      if (seenArticles.has(key)) return false;
      seenArticles.add(key);
      return true;
    });

  const isFinished = statusType.completed ?? false;
  const seasonYear = Number(data.header?.season?.year) || new Date().getFullYear();
  const homeAbbr = home?.team?.abbreviation ?? homeTeamDetail.displayName.slice(0, 3).toUpperCase();
  const awayAbbr = away?.team?.abbreviation ?? awayTeamDetail.displayName.slice(0, 3).toUpperCase();

  let preview: MatchDetail['preview'];
  if (!isFinished && !(statusType.name && LIVE_DETAIL_STATUSES.has(statusType.name))) {
    preview = await buildMatchPreview(
      data,
      { id: homeTeamDetail.id, abbr: homeAbbr },
      { id: awayTeamDetail.id, abbr: awayAbbr },
      seasonYear,
      slug,
    );
  }

  return {
    id: eventId,
    league: leagueRef(slug),
    homeTeam: {
      id: homeTeamDetail.id,
      name: homeTeamDetail.displayName,
      abbreviation: homeTeamDetail.abbreviation,
      logo: homeTeamDetail.logo,
      score: homeTeamDetail.score,
      color: homeTeamDetail.color,
      alternateColor: homeTeamDetail.alternateColor,
      shootout: homeTeamDetail.shootout,
    },
    awayTeam: {
      id: awayTeamDetail.id,
      name: awayTeamDetail.displayName,
      abbreviation: awayTeamDetail.abbreviation,
      logo: awayTeamDetail.logo,
      score: awayTeamDetail.score,
      color: awayTeamDetail.color,
      alternateColor: awayTeamDetail.alternateColor,
      shootout: awayTeamDetail.shootout,
    },
    status: statusType.name ?? '',
    statusDetail: statusType.shortDetail ?? '',
    isLive: LIVE_DETAIL_STATUSES.has(statusType.name ?? ''),
    isFinished,
    clockRunning: RUNNING_STATUSES.has(statusType.name ?? ''),
    period,
    displayClock,
    resultSuffix,
    shootout,
    venue: venueName,
    city: cityName,
    date: header?.date ?? '',
    round,
    referee,
    attendance,
    lineups,
    events,
    stats,
    shots,
    playerStats,
    commentary,
    allPlays,
    news,
    gamecast,
    preview,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface EspnScoreboard {
  events?: unknown[];
  leagues?: { name?: string; abbreviation?: string }[];
}

export function registerMatches(app: Hono): void {
  // Static path first so it isn't captured by the `:id` param route.
  app.get(
    '/v1/:league/matches/upcoming',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      const { from } = parseQuery(c, UpcomingQuerySchema);
      return cached(`upcoming:${league}:${from ?? 'today'}`, TTL.upcoming, async () => {
        const start = from ?? ymd(new Date());
        const end = new Date();
        end.setDate(end.getDate() + 45);
        const endStr = ymd(end);
        const data = await espnFetch<EspnScoreboard>(
          `${siteBase(league)}/scoreboard?dates=${start}-${endStr}&limit=400`,
        );
        const ref = leagueRef(league, data?.leagues?.[0] ?? null);
        const events = (data?.events ?? [])
          .filter((e) => !hasStarted(e))
          .sort(
            (a, b) =>
              new Date((a as { date?: string }).date ?? 0).getTime() -
              new Date((b as { date?: string }).date ?? 0).getTime(),
          )
          .slice(0, 8);
        return UpcomingListSchema.parse(events.map((ev) => toMatchSummary(ev, ref)));
      });
    }),
  );

  app.get(
    '/v1/:league/matches/:id',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      const { id } = parseParams(c, IdParamSchema);
      return cached(`matchDetail:${league}:${id}`, TTL.matchDetail, async () =>
        MatchDetailSchema.parse(await fetchMatchDetail(id, league)),
      );
    }),
  );
}
