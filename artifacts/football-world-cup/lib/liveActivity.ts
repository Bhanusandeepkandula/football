import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Serializable snapshot the widget renders. Keep this in sync with the Swift
// `MatchActivityContentState` in modules/live-activity/ios/MatchActivityAttributes.swift.
export interface MatchActivityState {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  /** Short status line, e.g. "45'", "HT", "LIVE". */
  status: string;
  /** True while the match clock is running (drives the pulsing dot). */
  isLive: boolean;
  homeColor: string;
  awayColor: string;
  /** Latest key moment, e.g. "⚽ Messi", "🟥 Ramos", "🎯 PEN" — empty when none. */
  lastEvent: string;
}

// Static attributes fixed for the life of the activity (team identity).
export interface MatchActivityAttributes {
  matchId: string;
  homeName: string;
  awayName: string;
}

interface LiveActivityNativeModule {
  areActivitiesEnabled(): boolean;
  startActivity(attributes: MatchActivityAttributes, state: MatchActivityState): Promise<string>;
  updateActivity(activityId: string, state: MatchActivityState): Promise<void>;
  endActivity(activityId: string, state: MatchActivityState): Promise<void>;
}

// requireOptionalNativeModule returns null when the native module isn't part of
// the current binary (Expo Go, web, or a dev build without the module) — so the
// whole feature degrades to no-ops instead of crashing.
const Native = requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivity');

export function areLiveActivitiesSupported(): boolean {
  if (Platform.OS !== 'ios' || !Native) return false;
  try {
    return Native.areActivitiesEnabled();
  } catch {
    return false;
  }
}

export async function startMatchActivity(
  attributes: MatchActivityAttributes,
  state: MatchActivityState,
): Promise<string | null> {
  if (!areLiveActivitiesSupported()) return null;
  try {
    return await Native!.startActivity(attributes, state);
  } catch (e) {
    console.warn('[LiveActivity] start failed', e);
    return null;
  }
}

export async function updateMatchActivity(activityId: string, state: MatchActivityState): Promise<void> {
  if (!Native) return;
  try {
    await Native.updateActivity(activityId, state);
  } catch (e) {
    console.warn('[LiveActivity] update failed', e);
  }
}

export async function endMatchActivity(activityId: string, state: MatchActivityState): Promise<void> {
  if (!Native) return;
  try {
    await Native.endActivity(activityId, state);
  } catch (e) {
    console.warn('[LiveActivity] end failed', e);
  }
}
