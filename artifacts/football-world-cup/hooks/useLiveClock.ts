import { useEffect, useRef, useState } from 'react';

// Turns the server's snapshot clock into a locally-ticking live minute so the
// match feels live between the 15s data refetches (broadcast-style).
//
// ESPN gives `displayClock` as "MM:SS" (e.g. "63:24") plus the current
// `period`. We seed from that value and increment one second at a time while
// the match is live, re-syncing whenever the server sends a fresh clock.
function parseClockSeconds(displayClock?: string): number | null {
  if (!displayClock) return null;
  const m = /^(\d+):(\d+)/.exec(displayClock.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export interface LiveClock {
  /** Ticking "MM:SS" string, or null when not live / no clock available. */
  clock: string | null;
  /** Ticking whole-minute label like "63'" for compact display. */
  minute: string | null;
}

// `running` should be true ONLY when the ball is in play (not halftime, not the
// break between periods) so the clock never advances while play is stopped.
// `syncKey` is a composite of clock+period+status: whenever the server sends a
// new snapshot we reset to its value, even if the clock string alone is
// unchanged (e.g. it sits at "45:00" across the phase boundary).
export function useLiveClock(
  displayClock: string | undefined,
  running: boolean,
  syncKey?: string,
): LiveClock {
  const [seconds, setSeconds] = useState<number | null>(() => parseClockSeconds(displayClock));
  const key = syncKey ?? displayClock ?? '';
  const lastServer = useRef<string>(key);

  // Re-sync to the server snapshot whenever the composite key changes.
  useEffect(() => {
    if (key !== lastServer.current) {
      lastServer.current = key;
      setSeconds(parseClockSeconds(displayClock));
    }
  }, [key, displayClock]);

  // Tick every second only while play is actually running.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds((s) => (s == null ? s : s + 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running || seconds == null) {
    return { clock: null, minute: null };
  }

  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return {
    clock: `${mm}:${String(ss).padStart(2, '0')}`,
    minute: `${mm}'`,
  };
}
