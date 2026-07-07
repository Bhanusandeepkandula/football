import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { EspnEvent, getStatusLabel, getGroupLabel, isLive, isFinished, hasStarted } from '@/hooks/useWorldCup';

interface MatchCardProps {
  event: EspnEvent;
  index?: number;
}

export function MatchCard({ event, index = 0 }: MatchCardProps) {
  const colors = useColors();
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === 'home');
  const away = comp?.competitors?.find(c => c.homeAway === 'away');
  const live = isLive(event);
  const finished = isFinished(event);
  const started = hasStarted(event);
  const statusLabel = getStatusLabel(event);
  const groupLabel = getGroupLabel(event);
  const venue = comp?.venue?.fullName ?? '';

  const homeScore = Number(home?.score ?? 0);
  const awayScore = Number(away?.score ?? 0);
  const homeWinner = finished && homeScore > awayScore;
  const awayWinner = finished && awayScore > homeScore;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/match/${event.id}` as any)}
      activeOpacity={0.7}
      style={[
          styles.card,
          { backgroundColor: colors.card },
          Platform.OS === 'web'
            ? ({ boxShadow: '0px 6px 20px rgba(0,0,0,0.28)' } as any)
            : undefined,
        ]}
    >
      {/* Live accent bar */}
      {live && <View style={[styles.liveBar, { backgroundColor: colors.live }]} />}

      {/* ── Row 1: group · status ───────────────────────────────── */}
      <View style={styles.row1}>
        <Text style={[styles.groupText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {groupLabel || 'FIFA World Cup 2026'}
        </Text>
        {live ? (
          <View style={[styles.livePill, { backgroundColor: colors.live }]}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>{statusLabel}</Text>
          </View>
        ) : finished ? (
          <Text style={[styles.ftText, { color: colors.mutedForeground }]}>FT</Text>
        ) : (
          <Text style={[styles.timeText, { color: colors.primary }]}>{statusLabel}</Text>
        )}
      </View>

      {/* ── Row 2: team · score · team ──────────────────────────── */}
      <View style={styles.row2}>
        {/* Home */}
        <View style={styles.teamSide}>
          <TeamLogo uri={home?.team?.logo} />
          <Text style={[styles.teamName, { color: homeWinner ? '#fff' : colors.mutedForeground, fontFamily: homeWinner ? 'Nunito_700Bold' : 'Nunito_500Medium' }]} numberOfLines={2}>
            {home?.team?.displayName ?? ''}
          </Text>
        </View>

        {/* Score */}
        <View style={styles.scoreCenter}>
          {started ? (
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreNum, { color: homeWinner ? '#fff' : colors.mutedForeground }]}>
                {home?.score ?? '0'}
              </Text>
              <Text style={[styles.scoreSep, { color: colors.muted }]}>–</Text>
              <Text style={[styles.scoreNum, { color: awayWinner ? '#fff' : colors.mutedForeground }]}>
                {away?.score ?? '0'}
              </Text>
            </View>
          ) : (
            <View style={styles.vsBox}>
              <Text style={[styles.vsText, { color: colors.mutedForeground }]}>VS</Text>
            </View>
          )}
        </View>

        {/* Away */}
        <View style={[styles.teamSide, styles.teamSideRight]}>
          <TeamLogo uri={away?.team?.logo} />
          <Text style={[styles.teamName, styles.teamNameRight, { color: awayWinner ? '#fff' : colors.mutedForeground, fontFamily: awayWinner ? 'Nunito_700Bold' : 'Nunito_500Medium' }]} numberOfLines={2}>
            {away?.team?.displayName ?? ''}
          </Text>
        </View>
      </View>

      {/* ── Row 3: venue ────────────────────────────────────────── */}
      {venue ? (
        <Text style={[styles.venueText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {venue}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function TeamLogo({ uri }: { uri?: string }) {
  const colors = useColors();
  if (!uri) return <View style={[styles.logoPlaceholder, { backgroundColor: colors.muted }]} />;
  return <Image source={{ uri }} style={styles.logo} resizeMode="contain" />;
}

const LOGO = 54;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    // Android
    elevation: 10,
    overflow: 'visible',
  },
  liveBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // Row 1
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  groupText: {
    fontSize: 12,
    fontFamily: 'Nunito_600SemiBold',
    letterSpacing: 0.3,
    flex: 1,
    textTransform: 'uppercase',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 11, fontFamily: 'Nunito_800ExtraBold', letterSpacing: 0.5 },
  ftText: { fontSize: 12, fontFamily: 'Nunito_600SemiBold' },
  timeText: { fontSize: 14, fontFamily: 'Nunito_700Bold' },

  // Row 2
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamSide: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 8,
  },
  teamSideRight: { alignItems: 'flex-end' },
  logo: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
  logoPlaceholder: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
  teamName: {
    fontSize: 13,
    lineHeight: 17,
  },
  teamNameRight: { textAlign: 'right' },

  // Score center
  scoreCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 96,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreNum: {
    fontSize: 36,
    fontFamily: 'Nunito_900Black',
    lineHeight: 42,
  },
  scoreSep: {
    fontSize: 24,
    fontFamily: 'Nunito_400Regular',
    paddingBottom: 2,
  },
  vsBox: { alignItems: 'center' },
  vsText: { fontSize: 18, fontFamily: 'Nunito_600SemiBold' },

  // Row 3
  venueText: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
  },
});
