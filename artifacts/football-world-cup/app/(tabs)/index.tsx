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
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useScoreboard, EspnEvent, isLive, isFinished, hasStarted } from '@/hooks/useWorldCup';
import { MatchCard } from '@/components/MatchCard';

const FILTERS = ['All', 'Live', 'Upcoming', 'Results'] as const;
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
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function filterEvents(events: EspnEvent[], filter: Filter): EspnEvent[] {
  switch (filter) {
    case 'Live':     return events.filter(isLive);
    case 'Results':  return events.filter(isFinished);
    case 'Upcoming': return events.filter(e => !hasStarted(e));
    default:         return events;
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ───────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Matches</Text>
          {liveCount > 0 && (
            <View style={styles.liveRow}>
              <View style={[styles.livePulse, { backgroundColor: colors.live }]} />
              <Text style={[styles.liveLabel, { color: colors.live }]}>{liveCount} Live Now</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Date nav ─────────────────────────────────────────── */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={16} style={styles.dateArrow}>
          <ChevronLeft size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.dateCenter}>
          <Text style={[styles.dateMain, { color: colors.foreground }]}>{friendlyDate(selectedDate)}</Text>
          <Text style={[styles.dateSub, { color: colors.mutedForeground }]}>
            {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDate(1)} hitSlop={16} style={styles.dateArrow}>
          <ChevronRight size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* ── Filter pills ─────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map(f => {
          const active = filter === f;
          const isLiveFilter = f === 'Live';
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.pill,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  ...(Platform.OS === 'web'
                    ? { boxShadow: active ? `0 4px 10px ${colors.primary}55` : '0 2px 6px rgba(0,0,0,0.20)' } as any
                    : {
                        shadowColor: active ? colors.primary : '#000',
                        shadowOpacity: active ? 0.35 : 0.2,
                        shadowRadius: active ? 10 : 6,
                        shadowOffset: { width: 0, height: active ? 4 : 2 },
                        elevation: active ? 6 : 2,
                      }),
                },
              ]}
            >
              {isLiveFilter && liveCount > 0 && (
                <View style={[styles.pillDot, { backgroundColor: active ? '#000' : colors.live }]} />
              )}
              <Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {f}{isLiveFilter && liveCount > 0 ? ` · ${liveCount}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ──────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading matches…</Text>
        </View>
      ) : isError ? (
        <View style={styles.state}>
          <Text style={[styles.stateIcon, { color: colors.mutedForeground }]}>⚠️</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Could not load matches</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.state}>
          <Text style={styles.stateIcon}>🏟</Text>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>No matches</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            {filter === 'Live' ? 'No matches in progress' : `No ${filter.toLowerCase()} matches today`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => <MatchCard event={item} index={index} />}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: insets.bottom + 100 }}
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
  root: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 34,
    fontFamily: 'Nunito_900Black',
    letterSpacing: -0.5,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  livePulse: { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel: { fontSize: 13, fontFamily: 'Nunito_700Bold' },

  // Date nav
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 4,
  },
  dateArrow: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dateMain: {
    fontSize: 17,
    fontFamily: 'Nunito_800ExtraBold',
    letterSpacing: -0.2,
  },
  dateSub: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    marginTop: 1,
  },

  // Filters
  filters: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    marginRight: 8,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 14, fontFamily: 'Nunito_700Bold' },

  // States
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  stateIcon: { fontSize: 52 },
  stateTitle: { fontSize: 20, fontFamily: 'Nunito_700Bold' },
  stateText: { fontSize: 15, fontFamily: 'Nunito_400Regular', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: 'Nunito_700Bold' },
});
