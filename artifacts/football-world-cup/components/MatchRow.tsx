import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { matchDetailQueryOptions } from '@/hooks/useMatchDetail';
import {
  EspnEvent,
  getStatusLabel,
  getResultSuffix,
  getShootoutScore,
  isLive,
  isFinished,
  hasStarted,
} from '@/hooks/useWorldCup';
import { font } from '@/constants/typography';

interface MatchRowProps {
  event: EspnEvent;
  /** No bottom hairline when it's the last row in its group card. */
  last?: boolean;
}

function MatchRowBase({ event, last }: MatchRowProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const prefetchDetail = useCallback(() => {
    queryClient.prefetchQuery(matchDetailQueryOptions(event.id));
  }, [queryClient, event.id]);

  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  const live = isLive(event);
  const finished = isFinished(event);
  const started = hasStarted(event);
  const suffix = getResultSuffix(event);
  const shootout = getShootoutScore(event);
  const statusLabel = getStatusLabel(event);

  const homeScore = Number(home?.score ?? 0);
  const awayScore = Number(away?.score ?? 0);
  let homeWinner = false;
  let awayWinner = false;
  if (finished) {
    if (shootout) {
      homeWinner = shootout.home > shootout.away;
      awayWinner = shootout.away > shootout.home;
    } else {
      homeWinner = homeScore > awayScore;
      awayWinner = awayScore > homeScore;
    }
  }
  // Only dim the losing side — a draw leaves both teams at full emphasis.
  const decided = homeWinner || awayWinner;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/match/${event.id}` as any)}
      onPressIn={prefetchDetail}
      activeOpacity={0.7}
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      <View style={styles.teams}>
        <TeamLine
          name={home?.team?.displayName ?? ''}
          logo={home?.team?.logo}
          score={started ? home?.score ?? '0' : undefined}
          shootout={shootout?.home}
          winner={homeWinner}
          dim={decided && !homeWinner}
          colors={colors}
        />
        <TeamLine
          name={away?.team?.displayName ?? ''}
          logo={away?.team?.logo}
          score={started ? away?.score ?? '0' : undefined}
          shootout={shootout?.away}
          winner={awayWinner}
          dim={decided && !awayWinner}
          colors={colors}
        />
      </View>

      <View style={[styles.statusWrap, { borderLeftColor: colors.separator }]}>
        {live ? (
          <View style={[styles.chip, { backgroundColor: colors.live }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveChipText} numberOfLines={1}>{statusLabel}</Text>
          </View>
        ) : finished ? (
          <View style={[styles.chip, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.ftChipText, { color: colors.mutedForeground }]}>
              {suffix ? `FT · ${suffix}` : 'FT'}
            </Text>
          </View>
        ) : (
          <View style={[styles.chip, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.timeChipText, { color: colors.foreground }]} numberOfLines={1}>{statusLabel}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Memoised: the 30s scoreboard refetch keeps unchanged events referentially
// stable (react-query structural sharing), so only rows that changed re-render.
export const MatchRow = React.memo(MatchRowBase);

function TeamLine({
  name, logo, score, shootout, winner, dim, colors,
}: {
  name: string;
  logo?: string;
  score?: string;
  shootout?: number;
  winner: boolean;
  dim: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const nameColor = dim ? colors.mutedForeground : colors.foreground;
  const scoreColor = winner ? colors.primary : dim ? colors.mutedForeground : colors.foreground;
  return (
    <View style={styles.teamLine}>
      <View style={styles.flagWrap}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.flagImg} resizeMode="cover" />
        ) : (
          <View style={[styles.flagImg, { backgroundColor: colors.muted }]} />
        )}
      </View>
      <Text
        style={[styles.teamName, { color: nameColor, fontFamily: winner ? font.extrabold : dim ? font.semibold : font.bold }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      {score !== undefined ? (
        <View style={styles.scoreWrap}>
          {shootout !== undefined ? (
            <Text style={[styles.pens, { color: colors.mutedForeground }]}>({shootout})</Text>
          ) : null}
          <Text style={[styles.score, { color: scoreColor }]}>{score}</Text>
        </View>
      ) : null}
    </View>
  );
}

const FLAG = 26;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 12, paddingVertical: 12 },
  teams: { flex: 1, gap: 9, paddingRight: 12 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },

  // Circular, edge-to-edge flag (ESPN PNGs carry transparent padding, so the
  // image is over-scaled inside the clipped circle to fill it fully).
  flagWrap: { width: FLAG, height: FLAG, borderRadius: FLAG / 2, overflow: 'hidden' },
  flagImg: { width: '100%', height: '100%', transform: [{ scale: 1.7 }] },

  teamName: { flex: 1, fontSize: 15.5, letterSpacing: 0.1 },
  scoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 5, minWidth: 20, justifyContent: 'flex-end' },
  score: { fontSize: 19, fontFamily: font.displayBold, letterSpacing: 0.4, minWidth: 14, textAlign: 'right' },
  pens: { fontSize: 11, fontFamily: font.semibold },

  statusWrap: {
    minWidth: 62,
    paddingLeft: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  liveChipText: { color: '#fff', fontSize: 12, fontFamily: font.displaySemi, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  ftChipText: { fontSize: 11.5, fontFamily: font.extrabold, letterSpacing: 0.4 },
  timeChipText: { fontSize: 12.5, fontFamily: font.bold, letterSpacing: 0.2 },
});
