import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { EspnEvent, getStatusLabel, isLive, isFinished } from '@/hooks/useWorldCup';

interface MatchCardProps {
  event: EspnEvent;
  compact?: boolean;
}

export function MatchCard({ event, compact = false }: MatchCardProps) {
  const colors = useColors();
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === 'home');
  const away = comp?.competitors?.find(c => c.homeAway === 'away');
  const live = isLive(event);
  const finished = isFinished(event);
  const statusLabel = getStatusLabel(event);

  const venue = comp?.venue?.fullName ?? '';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius ?? 12 }]}>
      {/* Status row */}
      <View style={styles.statusRow}>
        {live ? (
          <View style={[styles.liveBadge, { backgroundColor: colors.live }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{statusLabel}</Text>
          </View>
        ) : (
          <Text style={[styles.statusText, { color: finished ? colors.mutedForeground : colors.primary }]}>
            {statusLabel}
          </Text>
        )}
        {venue ? <Text style={[styles.venueText, { color: colors.mutedForeground }]} numberOfLines={1}>{venue}</Text> : null}
      </View>

      {/* Teams row */}
      <View style={styles.teamsRow}>
        {/* Home */}
        <View style={styles.teamSide}>
          <TeamLogo uri={home?.team?.logo} size={compact ? 36 : 44} />
          <Text
            style={[styles.teamName, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {home?.team?.displayName ?? ''}
          </Text>
          {home?.winner && <Text style={[styles.winnerDot, { color: colors.primary }]}>●</Text>}
        </View>

        {/* Score / VS */}
        <View style={styles.scoreBox}>
          {finished || live ? (
            <Text style={[styles.score, { color: colors.foreground }]}>
              {home?.score ?? '0'} – {away?.score ?? '0'}
            </Text>
          ) : (
            <Text style={[styles.vs, { color: colors.mutedForeground }]}>VS</Text>
          )}
        </View>

        {/* Away */}
        <View style={[styles.teamSide, styles.teamSideRight]}>
          {away?.winner && <Text style={[styles.winnerDot, { color: colors.primary }]}>●</Text>}
          <Text
            style={[styles.teamName, styles.teamNameRight, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {away?.team?.displayName ?? ''}
          </Text>
          <TeamLogo uri={away?.team?.logo} size={compact ? 36 : 44} />
        </View>
      </View>
    </View>
  );
}

function TeamLogo({ uri, size }: { uri?: string; size: number }) {
  const colors = useColors();
  if (!uri) {
    return (
      <View style={[styles.logoPlaceholder, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.muted }]} />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  venueText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamSide: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  teamSideRight: {
    alignItems: 'flex-end',
  },
  teamName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 17,
  },
  teamNameRight: {
    textAlign: 'right',
  },
  winnerDot: {
    fontSize: 10,
  },
  scoreBox: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  vs: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  logoPlaceholder: {},
});
