import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, AlertTriangle, CalendarDays, Star } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useScoreboard, useUpcomingMatches, EspnEvent, isLive, isFinished, hasStarted } from '@/hooks/useWorldCup';
import { usePolymarketScoreboardLive, useEspnScoreboardFallback } from '@/hooks/usePolymarketScoreboardLive';
import { MatchCard, MATCH_CARD_TOTAL } from '@/components/MatchCard';
import { SettingsButton } from '@/components/SettingsButton';
import { LeagueFilterRail } from '@/components/LeagueFilterRail';
import { LeagueLogo } from '@/components/LeagueLogo';
import { MonthCalendar } from '@/components/MonthCalendar';
import { useLeague } from '@/hooks/useLeague';
import { useFavorites } from '@/hooks/useFavorites';
import { useMultiLeagueScoreboard } from '@/hooks/useMultiLeague';
import { League } from '@/config/leagues';
import { font, KICKER_SPACING } from '@/constants/typography';

const FILTERS = ['All', 'Live', 'Upcoming', 'Results'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_COPY: Record<Filter, string> = {
  All: 'All',
  Live: 'Live',
  Upcoming: 'Next',
  Results: 'Done',
};

// Build the YYYYMMDD key from the LOCAL calendar date (not toISOString, which is
// UTC and can land on the wrong day for US/behind-UTC users) so "Today" and the
// matchday query always match the device's system date.
function dateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
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

type SectionRow = { event: EspnEvent; leagueSlug: string };
type FlatItem =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'match'; key: string; event: EspnEvent; leagueSlug: string };

const HEADER_H = 40;

// A day header label from a YYYYMMDD key.
function dayLabel(key: string): string {
  const date = new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function MatchesScreen() {
  const colors = useColors();
  const { league, setLeague } = useLeague();
  const { isFavorite, isFavoriteMatch } = useFavorites();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<FlatItem>>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Home scope: 'all' aggregates every competition; a slug scopes to one league.
  const [scope, setScope] = useState<string>('all');
  const isAll = scope === 'all';

  // The feed starts at the selected date (today by default) and runs forward, so
  // the selected day is always the top section.
  const rangeStr = useMemo(() => {
    const start = new Date(selectedDate); start.setDate(start.getDate() - 21);
    const end = new Date(selectedDate); end.setDate(end.getDate() + 35);
    return `${dateStr(start)}-${dateStr(end)}`;
  }, [selectedDate]);

  const { data, isLoading: singleLoading, isError, refetch } = useScoreboard(rangeStr);
  const events = useMemo(() => data?.events ?? [], [data]);
  const { sections, allEvents, isLoading: aggLoading, isFetched: aggFetched, refetchAll } =
    useMultiLeagueScoreboard(rangeStr, isAll);

  const boardEvents = isAll ? allEvents : events;
  const isLoading = isAll ? aggLoading && !aggFetched : singleLoading;
  const liveCount = useMemo(() => boardEvents.filter(isLive).length, [boardEvents]);
  // Only today's fixtures can be live — subscribe just those to Polymarket to
  // avoid iterating the whole multi-week board on every socket message.
  const todayKey = dateStr(new Date());
  const liveEvents = useMemo(
    () => boardEvents.filter((e) => isLive(e) || dateStr(new Date(e.date)) === todayKey),
    [boardEvents, todayKey],
  );

  const isFav = useCallback((e: EspnEvent) => {
    if (isFavoriteMatch(e.id)) return true;
    const comps = e.competitions?.[0]?.competitors ?? [];
    return comps.some((c) => isFavorite(c.team?.id));
  }, [isFavoriteMatch, isFavorite]);

  const anchorKey = dateStr(selectedDate);

  // Flatten all days (chronological) into header + match rows. Fixed row heights
  // give exact getItemLayout, so initialScrollIndex lands precisely on the
  // selected day (past above → scroll up, upcoming below → scroll down) with no
  // programmatic scroll and no glitch. stickyIndices keeps the date header pinned.
  const { flatData, stickyIndices, offsets, anchorIndex } = useMemo(() => {
    const rows: SectionRow[] = isAll
      ? sections.flatMap((s) => s.events.map((e) => ({ event: e, leagueSlug: s.league.slug })))
      : events.map((e) => ({ event: e, leagueSlug: scope }));
    const byDay = new Map<string, SectionRow[]>();
    for (const r of rows) {
      const key = dateStr(new Date(r.event.date));
      const arr = byDay.get(key);
      if (arr) arr.push(r); else byDay.set(key, [r]);
    }
    const flat: FlatItem[] = [];
    const sticky: number[] = [];
    const offs: number[] = [];
    let acc = 0;
    let anchor = 0;
    let anchorSeen = false;
    for (const key of [...byDay.keys()].sort()) {
      const dayRows = byDay.get(key)!.sort((a, b) => {
        const fa = isFav(a.event) ? 0 : 1, fb = isFav(b.event) ? 0 : 1;
        return fa !== fb ? fa - fb : new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
      });
      if (!anchorSeen && key >= anchorKey) { anchor = flat.length; anchorSeen = true; }
      sticky.push(flat.length);
      offs.push(acc); acc += HEADER_H;
      flat.push({ kind: 'header', key, title: dayLabel(key), count: dayRows.length });
      for (const r of dayRows) {
        offs.push(acc); acc += MATCH_CARD_TOTAL;
        flat.push({ kind: 'match', key: `${r.event.id}@${r.leagueSlug}`, event: r.event, leagueSlug: r.leagueSlug });
      }
    }
    return { flatData: flat, stickyIndices: sticky, offsets: offs, anchorIndex: anchor };
  }, [isAll, sections, events, scope, isFav, anchorKey]);

  usePolymarketScoreboardLive(liveEvents, liveCount > 0);
  useEspnScoreboardFallback(liveEvents, liveCount > 0, isAll ? refetchAll : refetch);

  const onSelectScope = useCallback((next: string) => {
    setScope(next);
    if (next !== 'all') setLeague(next);
  }, [setLeague]);
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try { await (isAll ? refetchAll() : refetch()); } finally { setPullRefreshing(false); }
  }, [isAll, refetchAll, refetch]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<FlatItem> | null | undefined, index: number) => ({
      length: flatData[index]?.kind === 'header' ? HEADER_H : MATCH_CARD_TOTAL,
      offset: offsets[index] ?? 0,
      index,
    }),
    [flatData, offsets],
  );

  const renderFlatItem = useCallback(({ item }: { item: FlatItem }) => {
    if (item.kind === 'header') {
      return (
        <View style={[styles.dayHeader, { backgroundColor: colors.background }]}>
          <Text style={[styles.dayHeaderText, { color: item.key === todayKey ? colors.primary : colors.foreground }]} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.dayHeaderLine, { backgroundColor: colors.hairline }]} />
          <Text style={[styles.dayHeaderCount, { color: colors.mutedForeground }]}>{item.count}</Text>
        </View>
      );
    }
    return <MatchCard event={item.event} leagueSlug={item.leagueSlug} />;
  }, [colors, todayKey]);

  // Tapping "MATCHES" jumps to today: reset the date if you're on another day,
  // else smooth-scroll to today's row.
  const scrollToToday = useCallback(() => {
    if (selectedDate.toDateString() !== new Date().toDateString()) {
      setSelectedDate(new Date());
      return;
    }
    try { listRef.current?.scrollToIndex({ index: anchorIndex, animated: true, viewPosition: 0 }); } catch { /* ignore */ }
  }, [selectedDate, anchorIndex]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Masthead ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={scrollToToday} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Jump to today's matches">
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>MATCHES</Text>
          </TouchableOpacity>
          {liveCount > 0 && (
            <View style={[styles.liveTag, { backgroundColor: colors.live }]}>
              <View style={styles.livePulse} />
              <Text style={styles.liveTagText}>{liveCount} LIVE</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setCalendarOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
            style={[styles.iconBtn, { backgroundColor: colors.secondary, borderColor: colors.hairline }]}
          >
            <CalendarDays size={20} color={colors.foreground} strokeWidth={2.2} />
          </TouchableOpacity>
          <SettingsButton />
        </View>
      </View>

      {/* ── Competition filter (All / per-league, World Cup first) ─ */}
      <View style={styles.leagueRailWrap}>
        <LeagueFilterRail scope={scope} onSelect={onSelectScope} />
      </View>

      {/* ── Day-grouped feed (scroll up = upcoming, down = completed) ── */}
      {isLoading ? (
        <MatchListSkeleton colors={colors} bottomPad={insets.bottom + 100} />
      ) : isError && !isAll ? (
        <View style={styles.state}>
          <AlertTriangle size={48} color={colors.mutedForeground} strokeWidth={1.6} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Could not load matches</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : flatData.length === 0 ? (
        <View style={styles.state}>
          <CalendarDays size={48} color={colors.mutedForeground} strokeWidth={1.6} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>No matches</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            {isAll ? 'No fixtures around this date' : `No ${league.short} fixtures around this date`}
          </Text>
          <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={[styles.todayBtn, { borderColor: colors.hairline }]}>
            <Text style={[styles.todayText, { color: colors.primary }]}>Jump to today</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          // Remount on date change so initialScrollIndex re-anchors to that day.
          key={anchorKey}
          ref={listRef}
          data={flatData}
          keyExtractor={(item) => item.kind + item.key}
          renderItem={renderFlatItem}
          getItemLayout={getItemLayout}
          stickyHeaderIndices={stickyIndices}
          initialScrollIndex={anchorIndex}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={13}
        />
      )}

      <MonthCalendar
        visible={calendarOpen}
        selected={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setCalendarOpen(false)}
      />
    </View>
  );
}

// Skeleton placeholders mirror the real MatchCard layout and gently pulse, so a
// first load reads as "content arriving" rather than a jarring centred spinner.
function SkeletonCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.skCard, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
      <View style={styles.skKickerRow}>
        <View style={[styles.skBlock, { backgroundColor: colors.muted, width: 120 }]} />
        <View style={[styles.skBlock, { backgroundColor: colors.muted, width: 34 }]} />
      </View>
      {[0, 1].map((i) => (
        <View key={i} style={styles.skTeamRow}>
          <View style={[styles.skCircle, { backgroundColor: colors.muted }]} />
          <View style={[styles.skBlock, { backgroundColor: colors.muted, flex: 1, maxWidth: 150, height: 15 }]} />
          <View style={[styles.skScore, { backgroundColor: colors.muted }]} />
        </View>
      ))}
    </View>
  );
}

function MatchListSkeleton({ colors, bottomPad, count = 6 }: {
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
  count?: number;
}) {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[{ paddingTop: 12, paddingBottom: bottomPad }, pulseStyle]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} colors={colors} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Competition filter rail + day headers
  leagueRailWrap: { marginBottom: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, marginRight: 8,
  },
  dayHeader: {
    height: HEADER_H,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20,
  },
  dayHeaderText: { fontSize: 13, fontFamily: font.displayBold, letterSpacing: 0.4, textTransform: 'uppercase' },
  dayHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dayHeaderCount: { fontSize: 12, fontFamily: font.bold },
  earlierBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 6, marginBottom: 2, paddingVertical: 9,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  earlierText: { fontSize: 12.5, fontFamily: font.bold, letterSpacing: 0.2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeaderText: { flex: 1, fontSize: 13, fontFamily: font.displaySemi, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionHeaderCount: { fontSize: 12, fontFamily: font.bold },

  // Skeleton
  skCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  skKickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  skTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  skCircle: { width: 30, height: 30, borderRadius: 15 },
  skScore: { width: 22, height: 22, borderRadius: 6 },
  skBlock: { height: 10, borderRadius: 5 },

  // Masthead
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  kicker: {
    fontSize: 12,
    fontFamily: font.displayMed,
    letterSpacing: KICKER_SPACING,
    marginBottom: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: {
    fontSize: 38,
    fontFamily: font.displayBold,
    letterSpacing: 0,
    lineHeight: 44,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  livePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTagText: { color: '#fff', fontSize: 11, fontFamily: font.displaySemi, letterSpacing: 0.8 },

  // Date nav
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  dateKicker: {
    fontSize: 10,
    fontFamily: font.displaySemi,
    letterSpacing: KICKER_SPACING,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dateMain: {
    fontSize: 20,
    fontFamily: font.displaySemi,
    letterSpacing: 0,
    textTransform: 'uppercase',
    lineHeight: 24,
  },
  dateSub: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 2,
  },

  // Filters
  filterRail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    minHeight: 48,
  },
  filterTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 6,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: 0.6, textTransform: 'uppercase' },
  pillCount: { fontSize: 11, fontFamily: font.bold, minWidth: 12, textAlign: 'center' },

  // States
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  stateTitle: { fontSize: 20, fontFamily: 'Nunito_700Bold' },
  stateText: { fontSize: 15, fontFamily: 'Nunito_400Regular', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: 'Nunito_700Bold' },
  todayBtn: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  todayText: { fontSize: 13, fontFamily: font.bold },
  upcomingHeader: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upcomingCopy: { flex: 1 },
  upcomingTitle: { fontSize: 15, fontFamily: font.extrabold },
  upcomingText: { fontSize: 12, fontFamily: font.medium, marginTop: 2 },
});
