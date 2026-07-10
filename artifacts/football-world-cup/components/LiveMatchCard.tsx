import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useLiveClock } from '@/hooks/useLiveClock';
import { font, KICKER_SPACING } from '@/constants/typography';

interface LiveTeam {
  displayName: string;
  logo: string;
  score: string;
  shootout?: number;
}

interface LiveMatchCardProps {
  home: LiveTeam;
  away: LiveTeam;
  status: string;
  statusDetail: string;
  clockRunning: boolean;
  period?: number;
  displayClock?: string;
  shootout?: { home: number; away: number } | null;
  homeColor: string;
  awayColor: string;
}

function abbr(name: string): string {
  const words = (name ?? '').replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return (words[0] ?? name ?? '').slice(0, 3).toUpperCase();
}

// Map an ESPN status into a fan-facing phase label. The live clock only ticks in
// `running` phases; paused phases (half-time, the break between periods, cooling
// breaks and the shootout) show the phase name in place of a number.
function phaseFor(status: string, period: number, statusDetail: string): { label: string; regulation: boolean } {
  switch (status) {
    case 'STATUS_FIRST_HALF':
      return { label: '1st Half', regulation: true };
    case 'STATUS_SECOND_HALF':
      return { label: '2nd Half', regulation: true };
    case 'STATUS_IN_PROGRESS':
      return { label: period >= 2 ? '2nd Half' : '1st Half', regulation: true };
    case 'STATUS_HALFTIME':
      return { label: 'Half Time', regulation: true };
    case 'STATUS_END_PERIOD':
      return { label: 'Break', regulation: period <= 2 };
    case 'STATUS_OVERTIME':
    case 'STATUS_EXTRA_TIME':
      return { label: 'Extra Time', regulation: false };
    case 'STATUS_EXTRA_TIME_HALFTIME':
      return { label: 'ET Break', regulation: false };
    case 'STATUS_SHOOTOUT':
      return { label: 'Penalties', regulation: false };
    default:
      return { label: statusDetail || 'Live', regulation: true };
  }
}

export function LiveMatchCard(props: LiveMatchCardProps) {
  const colors = useColors();
  const { home, away, status, statusDetail, clockRunning, period = 1, displayClock, shootout, homeColor, awayColor } = props;

  const live = useLiveClock(
    displayClock,
    clockRunning,
    `${displayClock ?? ''}|${period}|${status}`,
  );
  const phase = phaseFor(status, period, statusDetail);

  // Pulsing LIVE dot.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.25, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Progress bar: minute over the phase's full duration (90' regulation, 120' with ET).
  const clockMin = live.minute ? parseInt(live.minute, 10) : (parseInt(displayClock ?? '0', 10) || 0);
  const full = phase.regulation ? 90 : 120;
  const progress = Math.max(0, Math.min(1, clockMin / full));

  // Center readout: ticking clock while play runs, phase name while paused.
  const bigReadout = clockRunning && live.clock ? live.clock : phase.label;
  const isPenalties = status === 'STATUS_SHOOTOUT' || shootout != null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.live + '55' }]}>
      {/* team-colour wash bleeding in from both edges */}
      <LinearGradient
        pointerEvents="none"
        colors={[homeColor + '2E', 'transparent', awayColor + '2E']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* header: LIVE + phase */}
      <View style={styles.header}>
        <View style={styles.liveWrap}>
          <Animated.View style={[styles.dot, { backgroundColor: colors.live }, dotStyle]} />
          <Text style={[styles.liveText, { color: colors.live }]}>LIVE</Text>
        </View>
        <Text style={[styles.phase, { color: colors.mutedForeground }]} numberOfLines={1}>
          {phase.label.toUpperCase()}
        </Text>
      </View>

      {/* scoreline */}
      <View style={styles.scoreRow}>
        <TeamSide team={home} align="left" colors={colors} />

        <View style={styles.center}>
          <View style={styles.scoreLine}>
            <Text style={[styles.score, { color: colors.foreground }]}>{home.score ?? '0'}</Text>
            <Text style={[styles.dash, { color: colors.mutedForeground }]}>–</Text>
            <Text style={[styles.score, { color: colors.foreground }]}>{away.score ?? '0'}</Text>
          </View>
          {isPenalties && shootout ? (
            <Text style={[styles.pens, { color: colors.mutedForeground }]}>
              Pens {shootout.home}–{shootout.away}
            </Text>
          ) : (
            <View style={[styles.clockPill, { backgroundColor: colors.live + '1F' }]}>
              <Text style={[styles.clockText, { color: colors.live }]}>{bigReadout}</Text>
            </View>
          )}
        </View>

        <TeamSide team={away} align="right" colors={colors} />
      </View>

      {/* progress bar (regulation / ET only) */}
      {!isPenalties ? (
        <View style={[styles.track, { backgroundColor: colors.separator }]}>
          <View style={[styles.fill, { backgroundColor: colors.live, width: `${progress * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

function TeamSide({ team, align, colors }: { team: LiveTeam; align: 'left' | 'right'; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.team, align === 'right' && { alignItems: 'flex-end' }]}>
      {team.logo ? (
        <Image source={{ uri: team.logo }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logo, { backgroundColor: colors.secondary, borderRadius: 18 }]} />
      )}
      <Text style={[styles.teamAbbr, { color: colors.foreground }]} numberOfLines={1}>
        {abbr(team.displayName)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: 'hidden',
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 12, fontFamily: font.extrabold, letterSpacing: 1.4 },
  phase: { fontSize: 11.5, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },

  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  team: { width: 74, alignItems: 'flex-start', gap: 6 },
  logo: { width: 36, height: 36 },
  teamAbbr: { fontSize: 15, fontFamily: font.displaySemi, letterSpacing: 0.6 },

  center: { flex: 1, alignItems: 'center', gap: 7 },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { fontSize: 40, fontFamily: font.displayBold, letterSpacing: 0.5, minWidth: 34, textAlign: 'center' },
  dash: { fontSize: 24, fontFamily: font.displayLight },
  clockPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  clockText: { fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.4, fontVariant: ['tabular-nums'] },
  pens: { fontSize: 13, fontFamily: font.bold },

  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
