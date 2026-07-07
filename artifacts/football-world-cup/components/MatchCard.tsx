import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { EspnEvent, getStatusLabel, isLive, isFinished } from '@/hooks/useWorldCup';

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
  const statusLabel = getStatusLabel(event);
  const venue = comp?.venue?.fullName ?? '';

  const handlePress = () => {
    router.push(`/match/${event.id}` as any);
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350).springify()}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: live ? colors.live + '55' : colors.border,
            borderRadius: 14,
          },
        ]}
      >
        {/* Live glow strip */}
        {live && <View style={[styles.liveStrip, { backgroundColor: colors.live }]} />}

        {/* Status row */}
        <View style={styles.statusRow}>
          {live ? (
            <View style={[styles.liveBadge, { backgroundColor: colors.live + '22', borderColor: colors.live + '66' }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.live }]} />
              <Text style={[styles.liveText, { color: colors.live }]}>{statusLabel}</Text>
            </View>
          ) : (
            <Text style={[styles.statusText, { color: finished ? colors.mutedForeground : colors.primary }]}>
              {statusLabel}
            </Text>
          )}
          {venue ? (
            <View style={styles.venueRow}>
              <MapPin size={10} color={colors.mutedForeground} />
              <Text style={[styles.venueText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {venue}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Teams row */}
        <View style={styles.teamsRow}>
          {/* Home */}
          <View style={styles.teamSide}>
            <TeamLogo uri={home?.team?.logo} size={44} />
            <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={2}>
              {home?.team?.displayName ?? ''}
            </Text>
            {home?.winner && <Text style={[styles.winnerMark, { color: colors.primary }]}>★</Text>}
          </View>

          {/* Score / VS */}
          <View style={styles.scoreBox}>
            {finished || live ? (
              <>
                <Text style={[styles.score, { color: colors.foreground }]}>
                  {home?.score ?? '0'} – {away?.score ?? '0'}
                </Text>
                {finished && (
                  <Text style={[styles.ftLabel, { color: colors.mutedForeground }]}>Full Time</Text>
                )}
              </>
            ) : (
              <Text style={[styles.vs, { color: colors.mutedForeground }]}>VS</Text>
            )}
          </View>

          {/* Away */}
          <View style={[styles.teamSide, styles.teamSideRight]}>
            {away?.winner && <Text style={[styles.winnerMark, { color: colors.primary }]}>★</Text>}
            <Text
              style={[styles.teamName, styles.teamNameRight, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {away?.team?.displayName ?? ''}
            </Text>
            <TeamLogo uri={away?.team?.logo} size={44} />
          </View>
        </View>

        {/* Tap hint */}
        <Text style={[styles.tapHint, { color: colors.mutedForeground }]}>Tap for details →</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TeamLogo({ uri, size }: { uri?: string; size: number }) {
  const colors = useColors();
  if (!uri) {
    return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.muted }]} />;
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
    marginVertical: 5,
    padding: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  liveStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
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
    borderWidth: 1,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: 8,
  },
  venueText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    flex: 1,
    textAlign: 'right',
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
  winnerMark: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  scoreBox: {
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  ftLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  vs: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  tapHint: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 10,
    opacity: 0.6,
  },
});
