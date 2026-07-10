import { Share } from 'react-native';

// Native share sheet for a match. Text-only (plus the ESPN gamecast link when
// available) so it works before deep links are wired. No new dependency.

export interface ShareMatchInput {
  homeName: string;
  awayName: string;
  homeScore?: string | number;
  awayScore?: string | number;
  statusLabel?: string; // "FT", "67'", "19:30", etc.
  leagueName?: string;
  link?: string;
}

export async function shareMatch(m: ShareMatchInput): Promise<void> {
  const hasScore = m.homeScore != null && m.awayScore != null && String(m.homeScore) !== '';
  const scoreline = hasScore
    ? `${m.homeName} ${m.homeScore}–${m.awayScore} ${m.awayName}`
    : `${m.homeName} vs ${m.awayName}`;

  const meta = [m.statusLabel, m.leagueName].filter(Boolean).join(' · ');
  const lines = [
    scoreline,
    meta || undefined,
    m.link || undefined,
    'via Match Center',
  ].filter(Boolean) as string[];

  try {
    await Share.share({ message: lines.join('\n'), url: m.link ?? undefined });
  } catch {
    // user dismissed / share unavailable — ignore
  }
}
