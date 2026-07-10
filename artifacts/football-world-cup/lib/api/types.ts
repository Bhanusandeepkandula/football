// ─── @matchcenter/api wire types ─────────────────────────────────────────────
// Type-only mirror of the backend contract (services/api/src/contract/schema.ts).
// These are the OUTPUT shapes the API returns — every zod-defaulted field is
// present (producers may omit defaults; consumers always receive them). Keep in
// lockstep with the backend schema; do NOT add fields here without a server change.

// ── References / primitives ─────────────────────────────────────────────────

export interface LeagueRef {
  slug: string;
  name: string;
  abbr?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName?: string;
  abbreviation: string;
  logo: string;
  color?: string;
  alternateColor?: string;
}

export interface MatchStatus {
  /** ESPN lifecycle bucket. */
  state: 'pre' | 'in' | 'post';
  /** Raw ESPN status name (e.g. 'STATUS_HALFTIME'). */
  name?: string;
  /** Short human label, e.g. "45'", 'HT', 'FT', '7:30 PM'. */
  detail: string;
  /** Running clock text while live, e.g. "63'". */
  clock?: string;
  /** 1 = first half, 2 = second half, >2 = ET / penalties. */
  period?: number;
  isLive: boolean;
  isFinished: boolean;
  /** True only while the ball is in play (drives the on-device timer). */
  clockRunning: boolean;
}

export interface Shootout {
  home: number;
  away: number;
}

/** One side of a fixture as it appears in a list / bracket. */
export interface MatchSide {
  team: Team;
  score: string;
  shootoutScore?: number;
  winner?: boolean;
  record?: string;
}

// ── Scoreboard / MatchSummary ───────────────────────────────────────────────

export interface MatchSummary {
  id: string;
  league: LeagueRef;
  date: string; // ISO 8601 kickoff
  round?: string;
  status: MatchStatus;
  home: MatchSide;
  away: MatchSide;
  venue?: string;
  city?: string;
  shootout?: Shootout | null;
  resultSuffix?: string; // 'AET' | 'Pens' | ''
}

export interface ScoreboardSeason {
  year: number;
  type?: number;
  name?: string;
}

export interface Scoreboard {
  league: LeagueRef;
  date?: string; // requested date or range (e.g. '20260710')
  season?: ScoreboardSeason;
  matches: MatchSummary[];
}

// ── Standings ───────────────────────────────────────────────────────────────

export interface StandingStat {
  name: string;
  value: number;
  displayValue: string;
}

export interface StandingsEntry {
  team: Team;
  rank: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: string; // signed display value
  points: number;
  qualificationColor?: string;
  qualificationNote?: string;
  stats?: StandingStat[];
}

export interface StandingsGroup {
  name: string;
  abbreviation: string;
  entries: StandingsEntry[];
}

export interface Standings {
  league: LeagueRef;
  season?: number;
  groups: StandingsGroup[];
}

// ── Bracket (knockout rounds) ────────────────────────────────────────────────

export interface BracketRound {
  name: string; // e.g. 'Round of 16'
  order: number; // chronological order (0 = earliest round)
  matches: MatchSummary[];
}

export interface Bracket {
  league: LeagueRef;
  season?: number;
  rounds: BracketRound[];
}

// ── News ─────────────────────────────────────────────────────────────────────

export interface NewsItem {
  id: string;
  headline: string;
  description?: string;
  image?: string;
  published?: string; // ISO 8601
  byline?: string;
  category?: string;
  source?: string; // 'ESPN' | 'BBC Sport' | 'Guardian' | ...
  link?: string;
}

// ── Match detail (rich single-match payload) ─────────────────────────────────

export interface MatchDetailSide {
  id: string;
  name: string;
  abbreviation?: string;
  logo: string;
  score: string;
  color: string;
  alternateColor?: string;
  shootout?: number;
}

export type MatchEventType =
  | 'goal'
  | 'yellow-card'
  | 'red-card'
  | 'substitution'
  | 'foul'
  | 'var'
  | 'other';

export interface MatchEvent {
  id: string;
  clock: string;
  period: number;
  type: MatchEventType;
  typeLabel: string;
  text: string;
  detail?: string;
  teamId?: string;
  playerName?: string;
  /** Assist provider (goal) or player coming off (substitution). */
  secondaryName?: string;
  scoreHome?: number;
  scoreAway?: number;
  isPenalty?: boolean;
  isOwnGoal?: boolean;
}

export type PositionGroup = 'GK' | 'DF' | 'MF' | 'FW';

export interface LineupPlayer {
  id: string;
  displayName: string;
  jersey: string;
  position: string;
  positionGroup: PositionGroup;
  headshot?: string;
  starter: boolean;
  stats: Record<string, string>;
}

export interface TeamLineup {
  team: { id: string; displayName: string; logo: string; color: string };
  formation?: string;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}

export interface MatchStat {
  name: string;
  displayName: string;
  homeValue: string;
  awayValue: string;
  homePercent: number; // 0–100, home's share of the pair
}

export type MatchShotOutcome = 'goal' | 'save' | 'offTarget' | 'block';

export interface MatchShot {
  id: string;
  minute: string;
  period: number;
  teamId: string;
  teamSide: 'home' | 'away';
  teamName: string;
  playerName: string;
  title: string;
  text: string;
  outcome: MatchShotOutcome;
  x: number; // 0–100 pitch coordinates
  y: number;
  endX?: number;
  endY?: number;
  xG?: string;
  xGOT?: string;
  distance?: string;
}

export interface CommentaryPlayer {
  id: string;
  name: string;
  shortName: string;
  jersey: string;
  position?: string;
  role?: string;
  iconType?: string;
}

export interface CommentaryItem {
  id: string;
  minute: string;
  text: string;
  title?: string;
  period?: number;
  teamId?: string;
  teamSide?: 'home' | 'away';
  teamName?: string;
  players: CommentaryPlayer[];
  isKeyEvent: boolean;
}

export interface PlayerStatsAthlete {
  id: string;
  jersey: string;
  shortName: string;
  displayName: string;
  stats: string[];
}

export interface PlayerStatsGroup {
  type: string;
  keys: string[];
  labels: string[];
  athletes: PlayerStatsAthlete[];
}

export interface PlayerStatsTeam {
  team: { id: string; displayName: string; abbreviation: string; logo: string };
  groups: PlayerStatsGroup[];
}

export interface GamecastCard {
  id: string;
  label: string;
  value: string;
  detail?: string;
  side?: 'home' | 'away' | 'neutral';
}

export interface WinProbability {
  home?: number;
  away?: number;
  draw?: number;
}

export interface Gamecast {
  cards: GamecastCard[];
  // Odds rows vary wildly across ESPN feeds — kept loose by the backend.
  odds: Record<string, unknown>[];
  winProbability?: WinProbability;
}

export type PreviewStatFormat = 'decimal' | 'percent' | 'integer' | 'signed';

export interface PreviewTeamStat {
  name: string;
  label: string;
  homeValue: number;
  awayValue: number;
  format: PreviewStatFormat;
}

export interface MatchPreview {
  headToHead: Record<string, unknown>[];
  recentForm: {
    home: Record<string, unknown>[];
    away: Record<string, unknown>[];
  };
  leaders: Record<string, unknown>;
  teamStats: PreviewTeamStat[];
}

export interface MatchDetail {
  id: string;
  league: LeagueRef;
  homeTeam: MatchDetailSide;
  awayTeam: MatchDetailSide;
  status: string; // raw ESPN status name
  statusDetail: string;
  isLive: boolean;
  isFinished: boolean;
  clockRunning: boolean;
  period?: number;
  displayClock?: string;
  resultSuffix?: string; // 'AET' | 'Pens' | ''
  shootout?: Shootout | null;
  venue?: string;
  city?: string;
  date: string; // ISO 8601 kickoff
  round?: string;
  referee?: string;
  attendance?: number;
  lineups: [TeamLineup, TeamLineup] | null;
  events: MatchEvent[];
  stats: MatchStat[];
  shots: MatchShot[];
  playerStats: PlayerStatsTeam[];
  commentary: CommentaryItem[];
  allPlays: CommentaryItem[];
  news: NewsItem[];
  gamecast: Gamecast;
  preview?: MatchPreview;
}

// ── Team detail (rich single-team page payload) ──────────────────────────────

export interface TeamPlayer {
  id: string;
  displayName: string;
  jersey?: string;
  position: string;
  positionGroup: PositionGroup;
  age?: number;
  headshot?: string;
  height?: string;
  citizenship?: string;
  goals?: number;
  assists?: number;
  appearances?: number;
  saves?: number;
}

export interface TeamFixture {
  id: string;
  date: string;
  roundLabel: string;
  completed: boolean;
  statusDetail: string;
  isHome: boolean;
  opponent: { abbr: string; displayName: string; logo: string };
  teamScore?: string;
  opponentScore?: string;
  won?: boolean;
}

export interface FormResult {
  result: 'W' | 'D' | 'L';
  opponentAbbr: string;
  score: string;
  matchId: string;
}

export interface NextMatch {
  id: string;
  date: string;
  isHome: boolean;
  opponent: { displayName: string; abbr: string; logo: string };
  venue?: string;
  venueCity?: string;
  broadcasts: string[];
}

export interface GroupRow {
  teamId: string;
  displayName: string;
  logo: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: string;
  points: number;
  rank: number;
  advanced: boolean;
  isMe: boolean;
}

export interface TeamStats {
  goals?: string;
  shots?: string;
  shotsOnTarget?: string;
  possessionPct?: string;
  assists?: string;
  accuratePasses?: string;
  cleanSheets?: string;
  goalsConceded?: string;
  fouls?: string;
  yellows?: string;
  reds?: string;
  tackles?: string;
  interceptions?: string;
}

export interface PlayerLeader {
  id: string;
  displayName: string;
  headshot?: string;
  value: number;
}

export interface TeamDetail {
  id: string;
  league: LeagueRef;
  displayName: string;
  logo: string;
  color: string;
  location?: string;
  coach?: string;
  standingSummary?: string;
  record: { w: number; d: number; l: number } | null;
  players: TeamPlayer[];
  fixtures: TeamFixture[];
  recentForm: FormResult[];
  nextMatch: NextMatch | null;
  group: { name: string; entries: GroupRow[] } | null;
  stats: TeamStats | null;
  leaders: { topScorer?: PlayerLeader; topAssist?: PlayerLeader };
}

// ── Live stream (WebSocket / SSE) ────────────────────────────────────────────
// Every server→client frame is a `LiveMessage`, a discriminated union on `type`.

/** Score / status change (goal, status transition, clock anchor moved). */
export interface LiveScoreUpdate {
  type: 'score';
  matchId: string;
  league: string;
  home: { score: string; shootoutScore?: number };
  away: { score: string; shootoutScore?: number };
  status: MatchStatus;
  updatedAt: string; // ISO 8601
}

/** A single key event (goal, card, sub, VAR) as it happens. */
export interface LiveEvent {
  type: 'event';
  matchId: string;
  league: string;
  event: MatchEvent;
  updatedAt: string;
}

/**
 * Minimal Live-Activity content-state — byte-matches the Swift
 * `MatchActivityContentState` struct. `startAt` is epoch SECONDS.
 */
export interface LiveContentState {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  status: string;
  isLive: boolean;
  homeColor: string;
  awayColor: string;
  lastEvent: string;
  startAt: number; // epoch seconds
  paused: boolean;
}

/** Connection ack sent immediately after connect / (un)subscribe. */
export interface LiveHello {
  type: 'hello';
  matchId?: string;
  serverTime: string;
}

/** Full content-state snapshot (sent on connect + on any change). */
export interface LiveContentStateMessage {
  type: 'state';
  matchId: string;
  league: string;
  state: LiveContentState;
  updatedAt: string;
}

/** Keep-alive heartbeat (also lets clients detect a dead connection). */
export interface LivePing {
  type: 'ping';
  serverTime: string;
}

/** Every server → client frame on the live channel. */
export type LiveMessage =
  | LiveHello
  | LiveScoreUpdate
  | LiveEvent
  | LiveContentStateMessage
  | LivePing;

/** Client → server control frame (WebSocket only; SSE subscribes via the URL). */
export interface LiveSubscribe {
  action: 'subscribe' | 'unsubscribe';
  league: string;
  matchId: string;
}

// ── Push registry API (app → server) ─────────────────────────────────────────

export type PushEnv = 'sandbox' | 'production';

export interface PushPrefs {
  goals?: boolean;
  cards?: boolean;
  lineups?: boolean;
  kickoff?: boolean;
  fulltime?: boolean;
}

export interface RegisterPush {
  matchId: string;
  league: string;
  deviceToken?: string;
  activityToken?: string;
  pushToStartToken?: string;
  env: PushEnv;
  prefs?: PushPrefs;
}

export interface UnregisterPush {
  matchId?: string;
  deviceToken?: string;
  activityToken?: string;
}

export interface Heartbeat {
  deviceToken: string;
  matchId?: string;
}
