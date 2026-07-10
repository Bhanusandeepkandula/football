import * as Notifications from 'expo-notifications';

// Local (on-device) match notifications. No push server involved:
//  • Kickoff reminders are SCHEDULED ahead of time, so they fire even when the
//    app is fully closed.
//  • Live goal/HT/FT alerts are fired at runtime while the app is open (or
//    briefly backgrounded) — iOS suspends JS timers when fully closed, so those
//    are best-effort. True closed-app in-play alerts would need a push backend.
//
// Every native call is wrapped: on a binary that doesn't yet include the
// expo-notifications native module (e.g. before the rebuild) this all no-ops
// instead of crashing.

let handlerSet = false;

export function initNotifications() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // native module absent — ignore
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }
    if (settings.canAskAgain === false) return false;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

export interface KickoffMatch {
  id: string;
  homeName: string;
  awayName: string;
  kickoff: Date;
  groupLabel?: string;
}

/**
 * Schedule a 15-minutes-before warning and a kickoff alert. Returns the ids of
 * whatever actually got scheduled (fewer than 2 if a fire-time is already past).
 */
export async function scheduleKickoffReminders(m: KickoffMatch): Promise<string[]> {
  const ids: string[] = [];
  const now = Date.now();
  const kickoffMs = m.kickoff.getTime();
  if (!Number.isFinite(kickoffMs)) return ids;

  const fixture = `${m.homeName} vs ${m.awayName}`;
  const subtitle = m.groupLabel ? ` · ${m.groupLabel}` : '';

  const jobs = [
    { fireAt: kickoffMs - 15 * 60 * 1000, title: 'Kick-off in 15 min', body: `${fixture}${subtitle}` },
    { fireAt: kickoffMs, title: 'Kick-off! 🟢', body: `${fixture} is starting now` },
  ];

  for (const job of jobs) {
    if (job.fireAt <= now + 5000) continue; // skip past / near-instant fires
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: job.title, body: job.body, data: { matchId: m.id }, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(job.fireAt) },
      });
      ids.push(id);
    } catch {
      // ignore individual scheduling failures
    }
  }
  return ids;
}

export async function cancelNotifications(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // ignore
    }
  }
}

/** Fire an immediate local notification (used for live goal/HT/FT alerts). */
export async function notifyNow(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null,
    });
  } catch {
    // ignore
  }
}
