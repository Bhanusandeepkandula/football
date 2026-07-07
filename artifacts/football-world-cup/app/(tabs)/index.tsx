import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useScoreboard, EspnEvent, isLive, isFinished } from '@/hooks/useWorldCup';
import { MatchCard } from '@/components/MatchCard';

const FILTERS = ['All', 'Live', 'Today', 'Upcoming', 'Results'] as const;
type Filter = (typeof FILTERS)[number];

function filterEvents(events: EspnEvent[], filter: Filter): EspnEvent[] {
  const now = new Date();
  switch (filter) {
    case 'Live':
      return events.filter(isLive);
    case 'Today': {
      const todayStr = now.toISOString().slice(0, 10);
      return events.filter(e => e.date?.slice(0, 10) === todayStr);
    }
    case 'Upcoming':
      return events.filter(e => !isLive(e) && !isFinished(e));
    case 'Results':
      return events.filter(isFinished);
    default:
      return events;
  }
}

export default function MatchesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('All');

  const { data, isLoading, isError, refetch, isRefetching } = useScoreboard();

  const events = data?.events ?? [];
  const liveCount = events.filter(isLive).length;
  const filtered = filterEvents(events, filter);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            ⚽ World Cup 2026
          </Text>
          {liveCount > 0 && (
            <View style={styles.liveRow}>
              <View style={[styles.livePulse, { backgroundColor: colors.live }]} />
              <Text style={[styles.liveCount, { color: colors.live }]}>
                {liveCount} match{liveCount > 1 ? 'es' : ''} live
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.pill,
              {
                backgroundColor: filter === f ? colors.primary : colors.secondary,
                borderColor: filter === f ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: filter === f ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Fetching live scores…
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            Could not load matches
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>🏟</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No matches found
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <MatchCard event={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveCount: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
});
