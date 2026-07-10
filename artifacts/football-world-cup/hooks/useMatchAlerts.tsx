import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KickoffMatch,
  scheduleKickoffReminders,
  cancelNotifications,
  ensureNotificationPermission,
  initNotifications,
} from '@/lib/notifications';

const STORAGE_KEY = 'alerts.matches';
const ENABLED_KEY = 'alerts.enabled';

// matchId -> the local notification ids scheduled for it (so we can cancel).
type SubMap = Record<string, string[]>;

interface MatchAlertsContextValue {
  ready: boolean;
  /** Master switch: fire live goal/red-card/penalty/HT/FT alerts. */
  enabled: boolean;
  /** Toggle the master switch. Turning on requests permission; resolves to the NEW state. */
  setEnabled: (on: boolean) => Promise<boolean>;
  isSubscribed: (matchId: string) => boolean;
  /** Toggle kickoff reminders for a match. Resolves to the NEW subscribed state. */
  toggle: (match: KickoffMatch) => Promise<boolean>;
}

const MatchAlertsContext = createContext<MatchAlertsContextValue>({
  ready: false,
  enabled: false,
  setEnabled: async () => false,
  isSubscribed: () => false,
  toggle: async () => false,
});

export function MatchAlertsProvider({ children }: { children: React.ReactNode }) {
  const [subs, setSubs] = useState<SubMap>({});
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initNotifications();
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(ENABLED_KEY)])
      .then(([rawSubs, rawEnabled]) => {
        if (rawSubs) {
          try {
            const parsed = JSON.parse(rawSubs);
            if (parsed && typeof parsed === 'object') setSubs(parsed);
          } catch {
            // ignore corrupt store
          }
        }
        if (rawEnabled === 'true') setEnabledState(true);
      })
      .finally(() => setReady(true));
  }, []);

  const setEnabled = useCallback(async (on: boolean): Promise<boolean> => {
    if (!on) {
      setEnabledState(false);
      AsyncStorage.setItem(ENABLED_KEY, 'false').catch(() => {});
      return false;
    }
    const granted = await ensureNotificationPermission();
    setEnabledState(granted);
    AsyncStorage.setItem(ENABLED_KEY, granted ? 'true' : 'false').catch(() => {});
    return granted;
  }, []);

  const persist = useCallback((next: SubMap) => {
    setSubs(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const isSubscribed = useCallback((matchId: string) => !!subs[matchId], [subs]);

  const toggle = useCallback(
    async (match: KickoffMatch): Promise<boolean> => {
      const existing = subs[match.id];
      if (existing) {
        await cancelNotifications(existing);
        const next = { ...subs };
        delete next[match.id];
        persist(next);
        return false;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) return false;
      const ids = await scheduleKickoffReminders(match);
      // Even with 0 scheduled ids (kickoff already passed) we mark it subscribed
      // so live goal/HT/FT foreground alerts still fire for this match.
      persist({ ...subs, [match.id]: ids });
      return true;
    },
    [subs, persist],
  );

  return (
    <MatchAlertsContext.Provider value={{ ready, enabled, setEnabled, isSubscribed, toggle }}>
      {children}
    </MatchAlertsContext.Provider>
  );
}

export function useMatchAlerts(): MatchAlertsContextValue {
  return useContext(MatchAlertsContext);
}
