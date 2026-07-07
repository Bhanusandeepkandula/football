import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import {
  EspnEvent,
  getStatusLabel,
  getGroupLabel,
  getResultSuffix,
  getShootoutScore,
  isLive,
  isFinished,
  hasStarted,
} from '@/hooks/useWorldCup';
import { font, KICKER_SPACING } from '@/constants/typography';

interface MatchCardProps {
  event: EspnEvent;
  index?: number;
}

export function MatchCard({ event }: MatchCardProps) {
  const colors = useColors();
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  const live = isLive(event);
  const finished = isFinished(event);
  const started = hasStarted(event);
  const statusLabel = getStatusLabel(event);
  const groupLabel = getGroupLabel(event) || 'FIFA World Cup';
  const venue = comp?.venue?.fullName ?? '';
  const suffix = getResultSuffix(event);
  const shootout = getShootoutScore(event);

  const homeScore = Number(home?.score ?? 0);
  const awayScore = Number(away?.score ?? 0);
  // Winner respects a penalty shootout when regulation ended level.
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

  return (
    <TouchableOpacity
      onPress={() => router.push(`/match/${event.id}` as any)}
      activeOpacity={0.75}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.hairline },
        Platform.OS === 'web'
          ? ({ boxShadow: '0px 2px 10px rgba(0,0,0,0.35)' } as any)
          : undefined,
      ]}
    >
      {live && <View style={[styles.liveSpine, { backgroundColor: colors.live }]} />}

      {/* ── Kicker row: competition · status ─────────────────────── */}
      <View style={styles.kickerRow}>
        <View style={styles.kickerLeft}>
          <View style={[styles.tick, { backgroundColor: live ? colors.live : colors.primary }]} />
          <Text style={[styles.kicker, { color: colors.mutedForeground }]} numberOfLines={1}>
            {groupLabel}
          </Text>
        </View>
        {live ? (
          <View style={[styles.livePill, { backgroundColor: colors.live }]}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>{statusLabel}</Text>
          </View>
        ) : finished ? (
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {suffix ? `FT · ${suffix}` : 'FT'}
          </Text>
        ) : (
          <Text style={[styles.statusText, { color: colors.primary }]}>{statusLabel}</Text>
        )}
      </View>

      {/* ── Team rows (fixture-list layout) ──────────────────────── */}
      <TeamRow
        name={home?.team?.displayName ?? ''}
        logo={home?.team?.logo}
        score={started ? home?.score ?? '0' : undefined}
        shootout={shootout?.home}
        winner={homeWinner}
        dim={finished && !homeWinner}
        colors={colors}
      />
      <View style={[styles.rowDivider, { backgroundColor: colors.separator }]} />
      <TeamRow
        name={away?.team?.displayName ?? ''}
        logo={away?.team?.logo}
        score={started ? away?.score ?? '0' : undefined}
        shootout={shootout?.away}
        winner={awayWinner}
        dim={finished && !awayWinner}
        colors={colors}
      />

      {/* ── Footer: venue ────────────────────────────────────────── */}
      {venue ? (
        <Text style={[styles.venueText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {venue}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function TeamRow({
  name,
  logo,
  score,
  shootout,
  winner,
  dim,
  colors,
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
    <View style={styles.teamRow}>
      {logo ? (
        <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logoPlaceholder, { backgroundColor: colors.muted }]} />
      )}
      <Text style={[styles.teamName, { color: nameColor }]} numberOfLines={1}>
        {name}
      </Text>
      {score !== undefined ? (
        <View style={styles.scoreWrap}>
          <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
          {shootout !== undefined ? (
            <Text style={[styles.pens, { color: colors.mutedForeground }]}>({shootout})</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const LOGO = 30;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  liveSpine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3 },

  // Kicker
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  kickerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, marginRight: 8 },
  tick: { width: 3, height: 12 },
  kicker: {
    fontSize: 11,
    fontFamily: font.displayMed,
    letterSpacing: KICKER_SPACING,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 11, fontFamily: font.displaySemi, letterSpacing: 0.8 },
  statusText: { fontSize: 13, fontFamily: font.displayMed, letterSpacing: 0.5 },

  // Team row
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  logo: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
  logoPlaceholder: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
  teamName: {
    flex: 1,
    fontSize: 17,
    fontFamily: font.displaySemi,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  scoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  scoreNum: { fontSize: 26, fontFamily: font.displayBold, letterSpacing: 0.5, minWidth: 20, textAlign: 'right' },
  pens: { fontSize: 12, fontFamily: font.semibold },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: LOGO + 12 },

  // Footer
  venueText: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 10,
  },
});
