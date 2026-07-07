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
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Wifi } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useScoreboard, EspnEvent, isLive, isFinished } from '@/hooks/useWorldCup';
import { MatchCard } from '@/components/MatchCard';

const FILTERS = ['All', 'Live', 'Results', 'Upcoming'] as const;
type Filter = (typeof FILTERS)[number];

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function friendlyDate(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function filterEvents(events: EspnEvent[], filter: Filter): EspnEvent[] {
  switch (filter) {
    case 'Live': return events.filter(isLive);
    case 'Results': return events.filter(isFinished);
    case 'Upcoming': return events.filter(e => !isLive(e) && !isFinished(e));
    default: return events;
  }
}

export default function MatchesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('All');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data, isLoading, isError, refetch, isRefetching } = useScoreboard(dateStr(selectedDate));

  const events = data?.events ?? [];
  const liveCount = events.filter(isLive).length;
  const filtered = filterEvents(events, filter);
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const shiftDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>⚽ World Cup 2026</Text>
          {liveCount > 0 && (
            <Animated.View entering={FadeIn} style={styles.liveRow}>
              <View style={[styles.livePulse, { backgroundColor: colors.live }]} />
              <Text style={[styles.liveCount, { color: colors.live }]}>
                {liveCount} LIVE
              </Text>
            </Animated.View>
          )}
        </View>
        <View style={[styles.liveIndicator, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Wifi size={12} color={colors.primary} />
          <Text style={[styles.liveIndicatorText, { color: colors.primary }]}>ESPN</Text>
        </View>
      </View>

      {/* Date navigator */}
      <View style={[styles.dateNav, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateArrow} hitSlop={8}>
          <ChevronLeft size={20} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.dateLabelBtn}>
          <Text style={[styles.dateLabel, { color: colors.foreground }]}>
            {friendlyDate(selectedDate)}
          </Text>
          <Text style={[styles.dateSub, { color: colors.mutedForeground }]}>
            {selectedDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDate(1)} style={styles.dateArrow} hitSlop={8}>
          <ChevronRight size={20} color={colors.foreground} />
        </TouchableOpacity>
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
            {f === 'Live' && liveCount > 0 && (
              <View style={[styles.pillDot, { backgroundColor: filter === f ? '#fff' : colors.live }]} />
            )}
            <Text style={[styles.pillText, { color: filter === f ? colors.primaryForeground : colors.mutedForeground }]}>
              {f}
              {f === 'Live' && liveCount > 0 ? ` · ${liveCount}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Fetching live scores…</Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Could not load matches</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyIcon, { color: colors.mutedForeground }]}>🏟</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No matches</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {filter === 'Live' ? 'No live matches right now' : `No ${filter.toLowerCase()} matches on this date`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => <MatchCard event={item} index={index} />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 90 }}
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 5 },
  livePulse: { width: 8, height: 8, borderRadius: 4 },
  liveCount: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
  },
  liveIndicatorText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Date nav
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dateArrow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  dateLabel: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  dateSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 8 },
  errorText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 32 },
});
