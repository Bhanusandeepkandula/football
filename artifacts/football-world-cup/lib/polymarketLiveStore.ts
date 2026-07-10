import type { PolymarketMatchRef, PolymarketSportResult } from '@/lib/polymarketSports';
import { matchOrientation } from '@/lib/polymarketMatch';

export interface PolymarketLiveSnapshot {
  homeScore: string;
  awayScore: string;
  statusDetail: string;
  isLive: boolean;
  isFinished: boolean;
  clockRunning: boolean;
  displayClock?: string;
  period?: string;
  updatedAt: number;
}

const STALE_MS = 25_000;

const snapshots = new Map<string, PolymarketLiveSnapshot>();
const listeners = new Set<() => void>();
let wsConnected = false;

function normKeyPart(raw?: string): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Stable lookup key from ESPN team abbreviations + match date. */
export function polymarketMatchKey(ref: PolymarketMatchRef): string {
  const d = new Date(ref.date);
  const dateKey = Number.isNaN(d.getTime())
    ? ''
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const a = normKeyPart(ref.homeAbbr) || normKeyPart(ref.homeName.slice(0, 3));
  const b = normKeyPart(ref.awayAbbr) || normKeyPart(ref.awayName.slice(0, 3));
  const [t1, t2] = [a, b].sort();
  return `${t1}|${t2}|${dateKey}`;
}

function parseScores(msg: PolymarketSportResult, ref: PolymarketMatchRef): { home: string; away: string } {
  const parts = (msg.score ?? '0-0').split('-').map((s) => s.trim());
  const left = parts[0] ?? '0';
  const right = parts[1] ?? '0';
  // Orientation decides which side of "L-R" is the ESPN home team. This is only
  // reached after matchesPolymarketEvent confirmed the fixture, so orientation
  // is 'same' or 'swapped'; default straight-through if somehow ambiguous.
  const swapped = matchOrientation(msg, ref) === 'swapped';
  return swapped ? { home: right, away: left } : { home: left, away: right };
}

function parseDisplayClock(elapsed?: string): string | undefined {
  if (!elapsed) return undefined;
  const m = /^(\d+):(\d+)/.exec(elapsed.trim());
  if (!m) return undefined;
  return `${m[1]}:${m[2].padStart(2, '0')}`;
}

function parseMinute(elapsed?: string): string | undefined {
  if (!elapsed) return undefined;
  const m = /^(\d+):(\d+)/.exec(elapsed.trim());
  if (!m) return undefined;
  return `${m[1]}'`;
}

function parseStatusDetail(msg: PolymarketSportResult): string {
  if (msg.ended || msg.status === 'Final' || msg.status === 'Awarded') return 'FT';
  if (msg.status === 'PenaltyShootout') return 'Pens';
  if (msg.period === 'HT' || msg.status === 'Break') return 'HT';
  const minute = parseMinute(msg.elapsed);
  if (minute) return minute;
  if (msg.period === '1H') return '1st half';
  if (msg.period === '2H') return '2nd half';
  if (msg.live || msg.status === 'InProgress') return 'LIVE';
  return msg.status ?? 'LIVE';
}

export function parsePolymarketSnapshot(
  msg: PolymarketSportResult,
  ref: PolymarketMatchRef,
): PolymarketLiveSnapshot {
  const scores = parseScores(msg, ref);
  const isFinished = !!msg.ended || msg.status === 'Final' || msg.status === 'Awarded';
  const isLive = !isFinished && (!!msg.live || msg.status === 'InProgress' || msg.status === 'Break' || msg.status === 'PenaltyShootout');
  const clockRunning = msg.status === 'InProgress' && (msg.period === '1H' || msg.period === '2H');

  return {
    homeScore: scores.home,
    awayScore: scores.away,
    statusDetail: parseStatusDetail(msg),
    isLive,
    isFinished,
    clockRunning,
    displayClock: parseDisplayClock(msg.elapsed),
    period: msg.period,
    updatedAt: Date.now(),
  };
}

function notify() {
  for (const fn of listeners) fn();
}

export function setPolymarketWsConnected(connected: boolean) {
  if (wsConnected === connected) return;
  wsConnected = connected;
  notify();
}

export function isPolymarketWsConnected(): boolean {
  return wsConnected;
}

export function applyPolymarketUpdate(msg: PolymarketSportResult, ref: PolymarketMatchRef) {
  snapshots.set(polymarketMatchKey(ref), parsePolymarketSnapshot(msg, ref));
  notify();
}

export function getPolymarketLive(ref: PolymarketMatchRef): PolymarketLiveSnapshot | undefined {
  return snapshots.get(polymarketMatchKey(ref));
}

export function isPolymarketLiveFresh(ref: PolymarketMatchRef): boolean {
  const snap = getPolymarketLive(ref);
  if (!snap) return false;
  return Date.now() - snap.updatedAt < STALE_MS;
}

export function subscribePolymarketLive(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function polymarketMatchRefFromEvent(ev: {
  date: string;
  competitions?: { competitors?: { homeAway?: string; team?: { abbreviation?: string; displayName?: string } }[] }[];
}): PolymarketMatchRef {
  const comps = ev.competitions?.[0]?.competitors ?? [];
  const home = comps.find((c) => c.homeAway === 'home') ?? comps[0];
  const away = comps.find((c) => c.homeAway === 'away') ?? comps[1];
  return {
    homeAbbr: home?.team?.abbreviation,
    awayAbbr: away?.team?.abbreviation,
    homeName: home?.team?.displayName ?? '',
    awayName: away?.team?.displayName ?? '',
    date: ev.date,
  };
}
