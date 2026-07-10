import { useEffect, useRef } from 'react';
import { notifyNow } from '@/lib/notifications';
import { useMatchAlerts } from '@/hooks/useMatchAlerts';
import { MatchEvent } from '@/hooks/useMatchDetail';

interface AlertMatch {
  id: string;
  isLive: boolean;
  isFinished: boolean;
  status: string;
  homeTeam: { id: string; displayName: string; score: string };
  awayTeam: { id: string; displayName: string; score: string };
  events?: MatchEvent[];
}

// A native-sports-app style notification for a single key event (or null to
// skip — delays and period markers are handled by the status transition below).
function describeEvent(e: MatchEvent, team: string, scoreLine: string): { title: string; body: string } | null {
  const who = e.playerName ? (team ? `${e.playerName} (${team})` : e.playerName) : team;
  switch (e.type) {
    case 'goal':
      return {
        title: e.isOwnGoal ? '⚽ OWN GOAL' : e.isPenalty ? '⚽ PENALTY GOAL' : '⚽ GOAL',
        body: `${who} · ${scoreLine}`,
      };
    case 'yellow-card':
      return { title: '🟨 Yellow Card', body: `${who} · ${scoreLine}` };
    case 'red-card':
      return { title: '🟥 RED CARD', body: `${who} · ${scoreLine}` };
    case 'substitution': {
      const on = e.playerName ? `${e.playerName} on` : '';
      const off = e.secondaryName ? `${e.secondaryName} off` : '';
      const detail = [on, off].filter(Boolean).join(', ');
      return { title: '🔄 Substitution', body: team ? `${team}${detail ? ` — ${detail}` : ''}` : detail || scoreLine };
    }
    case 'var':
      return { title: '📺 VAR', body: (e.detail || e.text || team).toString().trim() || scoreLine };
    default: {
      if (e.isPenalty) return { title: '🎯 Penalty', body: `${who} · ${scoreLine}` };
      const label = (e.typeLabel || '').toLowerCase();
      if (label.includes('kick')) return { title: '🟢 Kick-off', body: scoreLine };
      return null; // half-time / full-time via status; delays skipped
    }
  }
}

/**
 * Rings a local notification for EVERY key event of a subscribed live match
 * while its screen is open — goals, cards, subs, penalties, VAR and kickoff,
 * plus half-time / full-time — the way a native sports app does. Foreground /
 * brief-background only (iOS suspends JS when the app is fully closed).
 */
export function useLiveEventAlerts(data?: AlertMatch) {
  const { enabled } = useMatchAlerts();
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const prevStatus = useRef<string>('');

  useEffect(() => {
    if (!data) return;
    const events = data.events ?? [];
    const h = parseInt(data.homeTeam.score || '0', 10) || 0;
    const a = parseInt(data.awayTeam.score || '0', 10) || 0;
    const scoreLine = `${data.homeTeam.displayName} ${h}–${a} ${data.awayTeam.displayName}`;
    const teamName = (id?: string) =>
      id === data.homeTeam.id ? data.homeTeam.displayName : id === data.awayTeam.id ? data.awayTeam.displayName : '';

    // Seed on first sight so pre-existing events don't all fire at once.
    if (!seeded.current) {
      events.forEach((e) => seen.current.add(e.id));
      prevStatus.current = data.status;
      seeded.current = true;
      return;
    }

    const fresh: MatchEvent[] = [];
    for (const e of events) {
      if (!seen.current.has(e.id)) {
        seen.current.add(e.id);
        fresh.push(e);
      }
    }
    const prevS = prevStatus.current;
    prevStatus.current = data.status;

    if (!enabled) return;

    // One notification per new key event.
    for (const e of fresh) {
      const n = describeEvent(e, teamName(e.teamId), scoreLine);
      if (n) notifyNow(n.title, n.body, { matchId: data.id });
    }

    // Period transitions (not always emitted as key events).
    if (data.status !== prevS) {
      if (data.isFinished) notifyNow('⏱️ Full Time', scoreLine, { matchId: data.id });
      else if (data.status === 'STATUS_HALFTIME') notifyNow('⏸️ Half Time', scoreLine, { matchId: data.id });
      else if (data.status === 'STATUS_EXTRA_TIME_HALFTIME') notifyNow('⏸️ ET Half-Time', scoreLine, { matchId: data.id });
    }
  }, [data, enabled]);
}
