import { z } from 'zod';

/*
 * ── @matchcenter/api shared contract ────────────────────────────────────────
 *
 * The normalized, app-friendly DTOs the API returns and the app consumes. Each
 * shape is defined once as a zod schema; the inferred TS type is exported next
 * to it (`Foo` / `FooSchema`).
 *
 * Rules for build agents:
 *   • Upstream normalizers MUST return values that satisfy these schemas.
 *     Validate at the proxy boundary with `XSchema.parse(normalized)` so a
 *     malformed ESPN payload can never reach the client.
 *   • `z.infer<typeof XSchema>` is the OUTPUT type — consumers get every
 *     defaulted field present. Producers may omit defaulted fields (input).
 *   • Do not add fields here without updating the app's consuming types.
 *
 * `:league` everywhere is an ESPN league slug (e.g. 'eng.1', 'fifa.world',
 * 'uefa.champions') — the single key across ESPN's site/core/web APIs and the
 * Fastcast topic.
 */

// ── References / primitives ─────────────────────────────────────────────────

export const LeagueRefSchema = z.object({
  slug: z.string(),
  name: z.string(),
  abbr: z.string().optional(),
});
export type LeagueRef = z.infer<typeof LeagueRefSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string().optional(),
  abbreviation: z.string().default(''),
  logo: z.string().default(''),
  color: z.string().optional(),
  alternateColor: z.string().optional(),
});
export type Team = z.infer<typeof TeamSchema>;

/** Normalized match status — shared by scoreboard, bracket and the live stream. */
export const MatchStatusSchema = z.object({
  /** ESPN lifecycle bucket. */
  state: z.enum(['pre', 'in', 'post']),
  /** Raw ESPN status name (e.g. 'STATUS_HALFTIME') — kept for exact checks. */
  name: z.string().optional(),
  /** Short human label, e.g. "45'", 'HT', 'FT', '7:30 PM'. */
  detail: z.string().default(''),
  /** Running clock text while live, e.g. "63'". */
  clock: z.string().optional(),
  /** 1 = first half, 2 = second half, >2 = ET / penalties. */
  period: z.number().int().optional(),
  isLive: z.boolean(),
  isFinished: z.boolean(),
  /** True only while the ball is in play (drives the on-device timer). */
  clockRunning: z.boolean(),
});
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const ShootoutSchema = z.object({ home: z.number(), away: z.number() });
export type Shootout = z.infer<typeof ShootoutSchema>;

/** One side of a fixture as it appears in a list / bracket. */
export const MatchSideSchema = z.object({
  team: TeamSchema,
  score: z.string().default(''),
  shootoutScore: z.number().optional(),
  winner: z.boolean().optional(),
  record: z.string().optional(),
});
export type MatchSide = z.infer<typeof MatchSideSchema>;

// ── Scoreboard / MatchSummary ───────────────────────────────────────────────

export const MatchSummarySchema = z.object({
  id: z.string(),
  league: LeagueRefSchema,
  date: z.string(), // ISO 8601 kickoff
  round: z.string().optional(), // group / round label
  status: MatchStatusSchema,
  home: MatchSideSchema,
  away: MatchSideSchema,
  venue: z.string().optional(),
  city: z.string().optional(),
  shootout: ShootoutSchema.nullable().optional(),
  resultSuffix: z.string().optional(), // 'AET' | 'Pens' | ''
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

export const ScoreboardSchema = z.object({
  league: LeagueRefSchema,
  date: z.string().optional(), // requested date or range (e.g. '20260710')
  season: z
    .object({
      year: z.number(),
      type: z.number().optional(),
      name: z.string().optional(),
    })
    .optional(),
  matches: z.array(MatchSummarySchema),
});
export type Scoreboard = z.infer<typeof ScoreboardSchema>;

// ── Standings ───────────────────────────────────────────────────────────────

export const StandingStatSchema = z.object({
  name: z.string(),
  value: z.number(),
  displayValue: z.string(),
});
export type StandingStat = z.infer<typeof StandingStatSchema>;

export const StandingsEntrySchema = z.object({
  team: TeamSchema,
  rank: z.number().int().default(0),
  gamesPlayed: z.number().default(0),
  wins: z.number().default(0),
  draws: z.number().default(0),
  losses: z.number().default(0),
  goalsFor: z.number().default(0),
  goalsAgainst: z.number().default(0),
  goalDifference: z.string().default('0'), // signed display value
  points: z.number().default(0),
  /** Qualification highlight colour from ESPN's note (e.g. '#43a047'). */
  qualificationColor: z.string().optional(),
  qualificationNote: z.string().optional(),
  /** Raw stat passthrough for any column the UI wants beyond the above. */
  stats: z.array(StandingStatSchema).optional(),
});
export type StandingsEntry = z.infer<typeof StandingsEntrySchema>;

export const StandingsGroupSchema = z.object({
  name: z.string(),
  abbreviation: z.string().default(''),
  entries: z.array(StandingsEntrySchema),
});
export type StandingsGroup = z.infer<typeof StandingsGroupSchema>;

export const StandingsSchema = z.object({
  league: LeagueRefSchema,
  season: z.number().optional(),
  groups: z.array(StandingsGroupSchema),
});
export type Standings = z.infer<typeof StandingsSchema>;

// ── Bracket (knockout rounds) ────────────────────────────────────────────────

export const BracketRoundSchema = z.object({
  name: z.string(), // e.g. 'Round of 16'
  order: z.number().int(), // chronological order (0 = earliest round)
  matches: z.array(MatchSummarySchema),
});
export type BracketRound = z.infer<typeof BracketRoundSchema>;

export const BracketSchema = z.object({
  league: LeagueRefSchema,
  season: z.number().optional(),
  rounds: z.array(BracketRoundSchema),
});
export type Bracket = z.infer<typeof BracketSchema>;

// ── News ─────────────────────────────────────────────────────────────────────

export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  published: z.string().optional(), // ISO 8601
  byline: z.string().optional(),
  category: z.string().optional(),
  source: z.string().optional(), // 'ESPN' | 'BBC Sport' | 'Guardian' | ...
  link: z.string().optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

// ── Match detail (rich single-match payload) ─────────────────────────────────
// Flat team/status fields (rather than the nested MatchSide/MatchStatus used in
// summaries) so the app's match screen can consume this response directly.

export const MatchDetailSideSchema = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string().optional(),
  logo: z.string().default(''),
  score: z.string().default('0'),
  color: z.string().default(''),
  alternateColor: z.string().optional(),
  shootout: z.number().optional(),
});
export type MatchDetailSide = z.infer<typeof MatchDetailSideSchema>;

export const MatchEventTypeSchema = z.enum([
  'goal',
  'yellow-card',
  'red-card',
  'substitution',
  'foul',
  'var',
  'other',
]);
export type MatchEventType = z.infer<typeof MatchEventTypeSchema>;

export const MatchEventSchema = z.object({
  id: z.string(),
  clock: z.string().default(''),
  period: z.number().int().default(1),
  type: MatchEventTypeSchema,
  typeLabel: z.string().default(''),
  text: z.string().default(''),
  detail: z.string().optional(),
  teamId: z.string().optional(),
  playerName: z.string().optional(),
  /** Assist provider (goal) or player coming off (substitution). */
  secondaryName: z.string().optional(),
  scoreHome: z.number().optional(),
  scoreAway: z.number().optional(),
  isPenalty: z.boolean().optional(),
  isOwnGoal: z.boolean().optional(),
});
export type MatchEvent = z.infer<typeof MatchEventSchema>;

export const PositionGroupSchema = z.enum(['GK', 'DF', 'MF', 'FW']);
export type PositionGroup = z.infer<typeof PositionGroupSchema>;

export const LineupPlayerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  jersey: z.string().default(''),
  position: z.string().default(''),
  positionGroup: PositionGroupSchema,
  headshot: z.string().optional(),
  starter: z.boolean(),
  stats: z.record(z.string(), z.string()).default({}),
});
export type LineupPlayer = z.infer<typeof LineupPlayerSchema>;

export const TeamLineupSchema = z.object({
  team: z.object({
    id: z.string(),
    displayName: z.string(),
    logo: z.string().default(''),
    color: z.string().default(''),
  }),
  formation: z.string().optional(),
  starters: z.array(LineupPlayerSchema),
  bench: z.array(LineupPlayerSchema),
});
export type TeamLineup = z.infer<typeof TeamLineupSchema>;

export const MatchStatSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  homeValue: z.string(),
  awayValue: z.string(),
  homePercent: z.number(), // 0–100, home's share of the pair (drives the bar)
});
export type MatchStat = z.infer<typeof MatchStatSchema>;

export const MatchShotSchema = z.object({
  id: z.string(),
  minute: z.string().default(''),
  period: z.number().int().default(0),
  teamId: z.string(),
  teamSide: z.enum(['home', 'away']),
  teamName: z.string(),
  playerName: z.string(),
  title: z.string().default(''),
  text: z.string().default(''),
  outcome: z.enum(['goal', 'save', 'offTarget', 'block']),
  x: z.number(), // 0–100 pitch coordinates
  y: z.number(),
  endX: z.number().optional(),
  endY: z.number().optional(),
  xG: z.string().optional(),
  xGOT: z.string().optional(),
  distance: z.string().optional(),
});
export type MatchShot = z.infer<typeof MatchShotSchema>;

export const CommentaryPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  jersey: z.string().default(''),
  position: z.string().optional(),
  role: z.string().optional(),
  iconType: z.string().optional(),
});
export type CommentaryPlayer = z.infer<typeof CommentaryPlayerSchema>;

export const CommentaryItemSchema = z.object({
  id: z.string(),
  minute: z.string().default(''),
  text: z.string(),
  title: z.string().optional(),
  period: z.number().int().optional(),
  teamId: z.string().optional(),
  teamSide: z.enum(['home', 'away']).optional(),
  teamName: z.string().optional(),
  players: z.array(CommentaryPlayerSchema).default([]),
  isKeyEvent: z.boolean().default(false),
});
export type CommentaryItem = z.infer<typeof CommentaryItemSchema>;

export const PlayerStatsTeamSchema = z.object({
  team: z.object({
    id: z.string(),
    displayName: z.string(),
    abbreviation: z.string().default(''),
    logo: z.string().default(''),
  }),
  groups: z.array(
    z.object({
      type: z.string(),
      keys: z.array(z.string()),
      labels: z.array(z.string()),
      athletes: z.array(
        z.object({
          id: z.string(),
          jersey: z.string().default(''),
          shortName: z.string(),
          displayName: z.string(),
          stats: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type PlayerStatsTeam = z.infer<typeof PlayerStatsTeamSchema>;

export const GamecastSchema = z.object({
  cards: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        value: z.string(),
        detail: z.string().optional(),
        side: z.enum(['home', 'away', 'neutral']).optional(),
      }),
    )
    .default([]),
  // Odds/win-probability providers vary wildly across ESPN feeds; kept as loose
  // rows so the normalizer can pass them through without a rigid schema.
  odds: z.array(z.record(z.string(), z.unknown())).default([]),
  winProbability: z
    .object({
      home: z.number().optional(),
      away: z.number().optional(),
      draw: z.number().optional(),
    })
    .optional(),
});
export type Gamecast = z.infer<typeof GamecastSchema>;

export const MatchPreviewSchema = z.object({
  headToHead: z.array(z.record(z.string(), z.unknown())).default([]),
  recentForm: z.object({
    home: z.array(z.record(z.string(), z.unknown())).default([]),
    away: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  leaders: z.record(z.string(), z.unknown()),
  teamStats: z
    .array(
      z.object({
        name: z.string(),
        label: z.string(),
        homeValue: z.number(),
        awayValue: z.number(),
        format: z.enum(['decimal', 'percent', 'integer', 'signed']),
      }),
    )
    .default([]),
});
export type MatchPreview = z.infer<typeof MatchPreviewSchema>;

export const MatchDetailSchema = z.object({
  id: z.string(),
  league: LeagueRefSchema,
  homeTeam: MatchDetailSideSchema,
  awayTeam: MatchDetailSideSchema,
  status: z.string().default(''), // raw ESPN status name
  statusDetail: z.string().default(''),
  isLive: z.boolean(),
  isFinished: z.boolean(),
  clockRunning: z.boolean(),
  period: z.number().int().optional(),
  displayClock: z.string().optional(),
  resultSuffix: z.string().optional(), // 'AET' | 'Pens' | ''
  shootout: ShootoutSchema.nullable().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  date: z.string(), // ISO 8601 kickoff
  round: z.string().optional(),
  referee: z.string().optional(),
  attendance: z.number().optional(),
  lineups: z.tuple([TeamLineupSchema, TeamLineupSchema]).nullable(),
  events: z.array(MatchEventSchema),
  stats: z.array(MatchStatSchema),
  shots: z.array(MatchShotSchema).default([]),
  playerStats: z.array(PlayerStatsTeamSchema).default([]),
  commentary: z.array(CommentaryItemSchema).default([]),
  allPlays: z.array(CommentaryItemSchema).default([]),
  news: z.array(NewsItemSchema).default([]),
  gamecast: GamecastSchema,
  preview: MatchPreviewSchema.optional(),
});
export type MatchDetail = z.infer<typeof MatchDetailSchema>;

// ── Team detail (rich single-team page payload) ──────────────────────────────

export const TeamPlayerSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  jersey: z.string().optional(),
  position: z.string().default(''),
  positionGroup: PositionGroupSchema,
  age: z.number().optional(),
  headshot: z.string().optional(),
  height: z.string().optional(),
  citizenship: z.string().optional(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  appearances: z.number().optional(),
  saves: z.number().optional(),
});
export type TeamPlayer = z.infer<typeof TeamPlayerSchema>;

export const TeamFixtureSchema = z.object({
  id: z.string(),
  date: z.string(),
  roundLabel: z.string().default(''),
  completed: z.boolean(),
  statusDetail: z.string().default(''),
  isHome: z.boolean(),
  opponent: z.object({
    abbr: z.string().default(''),
    displayName: z.string().default(''),
    logo: z.string().default(''),
  }),
  teamScore: z.string().optional(),
  opponentScore: z.string().optional(),
  won: z.boolean().optional(),
});
export type TeamFixture = z.infer<typeof TeamFixtureSchema>;

export const FormResultSchema = z.object({
  result: z.enum(['W', 'D', 'L']),
  opponentAbbr: z.string(),
  score: z.string(),
  matchId: z.string(),
});
export type FormResult = z.infer<typeof FormResultSchema>;

export const NextMatchSchema = z.object({
  id: z.string(),
  date: z.string(),
  isHome: z.boolean(),
  opponent: z.object({
    displayName: z.string(),
    abbr: z.string().default(''),
    logo: z.string().default(''),
  }),
  venue: z.string().optional(),
  venueCity: z.string().optional(),
  broadcasts: z.array(z.string()).default([]),
});
export type NextMatch = z.infer<typeof NextMatchSchema>;

export const GroupRowSchema = z.object({
  teamId: z.string(),
  displayName: z.string(),
  logo: z.string().default(''),
  gp: z.number().default(0),
  w: z.number().default(0),
  d: z.number().default(0),
  l: z.number().default(0),
  gf: z.number().default(0),
  ga: z.number().default(0),
  gd: z.string().default('0'),
  points: z.number().default(0),
  rank: z.number().default(0),
  advanced: z.boolean().default(false),
  isMe: z.boolean().default(false),
});
export type GroupRow = z.infer<typeof GroupRowSchema>;

export const TeamStatsSchema = z
  .object({
    goals: z.string().optional(),
    shots: z.string().optional(),
    shotsOnTarget: z.string().optional(),
    possessionPct: z.string().optional(),
    assists: z.string().optional(),
    accuratePasses: z.string().optional(),
    cleanSheets: z.string().optional(),
    goalsConceded: z.string().optional(),
    fouls: z.string().optional(),
    yellows: z.string().optional(),
    reds: z.string().optional(),
    tackles: z.string().optional(),
    interceptions: z.string().optional(),
  })
  .partial();
export type TeamStats = z.infer<typeof TeamStatsSchema>;

export const PlayerLeaderSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  headshot: z.string().optional(),
  value: z.number(),
});
export type PlayerLeader = z.infer<typeof PlayerLeaderSchema>;

export const TeamDetailSchema = z.object({
  id: z.string(),
  league: LeagueRefSchema,
  displayName: z.string(),
  logo: z.string().default(''),
  color: z.string().default(''),
  location: z.string().optional(),
  coach: z.string().optional(),
  standingSummary: z.string().optional(),
  record: z.object({ w: z.number(), d: z.number(), l: z.number() }).nullable(),
  players: z.array(TeamPlayerSchema),
  fixtures: z.array(TeamFixtureSchema),
  recentForm: z.array(FormResultSchema),
  nextMatch: NextMatchSchema.nullable(),
  group: z
    .object({ name: z.string(), entries: z.array(GroupRowSchema) })
    .nullable(),
  stats: TeamStatsSchema.nullable(),
  leaders: z.object({
    topScorer: PlayerLeaderSchema.optional(),
    topAssist: PlayerLeaderSchema.optional(),
  }),
});
export type TeamDetail = z.infer<typeof TeamDetailSchema>;

// ── Live stream (SSE + WebSocket) ────────────────────────────────────────────
// Transport-agnostic: every frame is a `LiveMessage` — a discriminated union on
// `type`. Over SSE the `type` is ALSO the event name (`event: score\ndata: …`).
// Over WS it's the JSON `type` field. The app subscribes per match.

/** Score / status change (goal, status transition, clock anchor moved). */
export const LiveScoreUpdateSchema = z.object({
  type: z.literal('score'),
  matchId: z.string(),
  league: z.string(),
  home: z.object({ score: z.string(), shootoutScore: z.number().optional() }),
  away: z.object({ score: z.string(), shootoutScore: z.number().optional() }),
  status: MatchStatusSchema,
  updatedAt: z.string(), // ISO 8601
});
export type LiveScoreUpdate = z.infer<typeof LiveScoreUpdateSchema>;

/** A single key event (goal, card, sub, VAR) as it happens. */
export const LiveEventSchema = z.object({
  type: z.literal('event'),
  matchId: z.string(),
  league: z.string(),
  event: MatchEventSchema,
  updatedAt: z.string(),
});
export type LiveEvent = z.infer<typeof LiveEventSchema>;

/*
 * Minimal Live-Activity content-state. This is what the push worker sends to
 * APNs as the `content-state` AND what the live stream broadcasts as a full
 * snapshot. It MUST byte-match the Swift `MatchActivityContentState` struct
 * (field names + types) or APNs decoding fails silently.
 *
 * `startAt` is epoch SECONDS (Swift `Date(timeIntervalSince1970:)`) so the
 * widget renders a self-ticking clock via SwiftUI `Text(timerInterval:)` with
 * ZERO per-second pushes; `paused` freezes it (HT / ET break / penalties).
 */
export const LiveContentStateSchema = z.object({
  homeAbbr: z.string(),
  awayAbbr: z.string(),
  homeScore: z.number().int(),
  awayScore: z.number().int(),
  status: z.string(),
  isLive: z.boolean(),
  homeColor: z.string(),
  awayColor: z.string(),
  lastEvent: z.string(),
  startAt: z.number(), // epoch seconds
  paused: z.boolean(),
});
export type LiveContentState = z.infer<typeof LiveContentStateSchema>;

/** Connection ack sent immediately after (un)subscribe. */
export const LiveHelloSchema = z.object({
  type: z.literal('hello'),
  matchId: z.string().optional(),
  serverTime: z.string(),
});
export type LiveHello = z.infer<typeof LiveHelloSchema>;

/** Full content-state snapshot (sent on connect + on any change). */
export const LiveContentStateMessageSchema = z.object({
  type: z.literal('state'),
  matchId: z.string(),
  league: z.string(),
  state: LiveContentStateSchema,
  updatedAt: z.string(),
});
export type LiveContentStateMessage = z.infer<
  typeof LiveContentStateMessageSchema
>;

/** Keep-alive heartbeat (also lets clients detect a dead connection). */
export const LivePingSchema = z.object({
  type: z.literal('ping'),
  serverTime: z.string(),
});
export type LivePing = z.infer<typeof LivePingSchema>;

/** Every server → client frame on the live channel. */
export const LiveMessageSchema = z.discriminatedUnion('type', [
  LiveHelloSchema,
  LiveScoreUpdateSchema,
  LiveEventSchema,
  LiveContentStateMessageSchema,
  LivePingSchema,
]);
export type LiveMessage = z.infer<typeof LiveMessageSchema>;

/** Client → server control frame (WebSocket only; SSE subscribes via the URL). */
export const LiveSubscribeSchema = z.object({
  action: z.enum(['subscribe', 'unsubscribe']),
  league: z.string(),
  matchId: z.string(),
});
export type LiveSubscribe = z.infer<typeof LiveSubscribeSchema>;

// ── Push registry API (app → server) ─────────────────────────────────────────
// Bodies for the token-auth'd push endpoints. The push build agent owns the
// handlers + SQLite registry; these schemas fix the wire shape.

export const PushEnvSchema = z.enum(['sandbox', 'production']);
export type PushEnv = z.infer<typeof PushEnvSchema>;

export const PushPrefsSchema = z
  .object({
    goals: z.boolean().default(true),
    cards: z.boolean().default(true),
    lineups: z.boolean().default(false),
    kickoff: z.boolean().default(true),
    fulltime: z.boolean().default(true),
  })
  .partial();
export type PushPrefs = z.infer<typeof PushPrefsSchema>;

export const RegisterPushSchema = z.object({
  matchId: z.string(),
  league: z.string(),
  /** Device APNs token (for alert/banner pushes). */
  deviceToken: z.string().optional(),
  /** Live Activity push token (for content-state updates). */
  activityToken: z.string().optional(),
  /** Optional push-to-start token (iOS 18+, server-started activities). */
  pushToStartToken: z.string().optional(),
  env: PushEnvSchema,
  prefs: PushPrefsSchema.optional(),
});
export type RegisterPush = z.infer<typeof RegisterPushSchema>;

export const UnregisterPushSchema = z.object({
  matchId: z.string().optional(),
  deviceToken: z.string().optional(),
  activityToken: z.string().optional(),
});
export type UnregisterPush = z.infer<typeof UnregisterPushSchema>;

export const HeartbeatSchema = z.object({
  deviceToken: z.string(),
  matchId: z.string().optional(),
});
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
