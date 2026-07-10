import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  FlatList,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Network, Circle, Trophy, LayoutGrid } from 'lucide-react-native';
import { makeSlideIn } from '@/lib/transitions';
import { useColors } from '@/hooks/useColors';
import { useLeague } from '@/hooks/useLeague';
import { LeagueSwitcher } from '@/components/LeagueSwitcher';
import { hasBracket as leagueHasBracket, hasGroups as leagueHasGroups } from '@/config/leagues';
import { useBracket, useStandings, BracketRound, EspnGroup } from '@/hooks/useWorldCup';
import { CircularBracket } from '@/components/CircularBracket';
import { BracketTree } from '@/components/BracketTree';
import { GroupTable } from '@/components/GroupTable';
import { Skeleton, SkeletonBox } from '@/components/Skeleton';

type ViewMode = 'list' | 'circular';
type Section = 'bracket' | 'groups';

export default function BracketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { league } = useLeague();

  // Which sections make sense for this competition: cups have a knockout
  // bracket; leagues/tournaments have a standings table. A pure knockout cup has
  // only a bracket; a plain league has only a table.
  const isLeagueTable = league.format === 'league' || league.format === 'friendlies';
  const groupsLabel = isLeagueTable ? 'Table' : 'Groups';
  const sections = useMemo<Section[]>(() => {
    const s: Section[] = [];
    if (leagueHasBracket(league)) s.push('bracket');
    if (leagueHasGroups(league)) s.push('groups');
    return s.length ? s : ['groups'];
  }, [league]);

  const { data, isLoading, isError, refetch, isRefetching } = useBracket();
  const { data: standings, isLoading: standingsLoading, refetch: refetchStandings, isRefetching: standingsRefetching } = useStandings();
  const [section, setSection] = useState<Section>(sections[0]);
  const [dir, setDir] = useState(1);
  // Full bracket tree (round tabs + group stage + knockouts) is the default view.
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // If the competition changes and the current section no longer applies, snap
  // to the first available one.
  useEffect(() => {
    setSection((cur) => (sections.includes(cur) ? cur : sections[0]));
  }, [sections]);

  // Switch section with a directional slide; also swipeable left/right.
  const changeSection = useCallback((next: Section) => {
    setSection((cur) => {
      if (next === cur) return cur;
      setDir(sections.indexOf(next) > sections.indexOf(cur) ? 1 : -1);
      return next;
    });
  }, [sections]);

  const swipe = useMemo(() => {
    const goNext = Gesture.Fling().direction(Directions.LEFT).onEnd(() => {
      const i = sections.indexOf(section);
      if (i < sections.length - 1) changeSection(sections[i + 1]);
    }).runOnJS(true);
    const goPrev = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => {
      const i = sections.indexOf(section);
      if (i > 0) changeSection(sections[i - 1]);
    }).runOnJS(true);
    return Gesture.Race(goNext, goPrev);
  }, [section, sections, changeSection]);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const rounds: BracketRound[] = data?.rounds ?? [];
  const groups: EspnGroup[] = standings?.children ?? [];

  const showBracket = section === 'bracket';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flex: 1 }}>
          <LeagueSwitcher />
          <Text style={[styles.title, { color: colors.foreground }]}>
            {showBracket ? 'Bracket' : isLeagueTable ? 'Table' : 'Group Stage'}
          </Text>
        </View>

        {/* View mode toggle (bracket only) */}
        {showBracket && rounds.length > 0 && (
          <View style={[styles.toggleGroup, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setViewMode('circular')}
              style={[styles.toggleBtn, viewMode === 'circular' && { backgroundColor: colors.primary }]}
            >
              <Circle size={16} color={viewMode === 'circular' ? colors.primaryForeground : colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}
            >
              <Network size={16} color={viewMode === 'list' ? colors.primaryForeground : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Section switcher: Bracket | Table/Groups — only when both apply. */}
      {sections.length > 1 && (
        <View style={styles.sectionRow}>
          <View style={[styles.sectionTrack, { backgroundColor: colors.secondary }]}>
            {sections.map((id) => {
              const meta = id === 'bracket'
                ? { label: 'Bracket', Icon: Trophy }
                : { label: groupsLabel, Icon: LayoutGrid };
              const on = id === section;
              return (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => changeSection(id)}
                  style={[styles.sectionBtn, on && { backgroundColor: colors.primary }]}
                >
                  <meta.Icon size={15} color={on ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2.4} />
                  <Text style={[styles.sectionBtnText, { color: on ? colors.primaryForeground : colors.mutedForeground }]}>
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Swipeable section content (Bracket ⇄ Groups) with a directional slide. */}
      <GestureDetector gesture={swipe}>
        <Animated.View key={section} entering={makeSlideIn(dir)} style={{ flex: 1 }}>
      {/* ── GROUPS ─────────────────────────────────────────────── */}
      {section === 'groups' ? (
        standingsLoading ? (
          <Skeleton style={{ paddingTop: 4 }}>
            {[0, 1, 2, 3].map((g) => (
              <View key={g} style={{ marginHorizontal: 16, marginVertical: 8, borderRadius: 12, overflow: 'hidden' }}>
                <SkeletonBox style={{ height: 42, borderRadius: 0 }} />
                {[0, 1, 2, 3].map((r) => (
                  <SkeletonBox key={r} style={{ height: 40, marginTop: StyleSheet.hairlineWidth, borderRadius: 0 }} />
                ))}
              </View>
            ))}
          </Skeleton>
        ) : groups.length === 0 ? (
          <View style={styles.centered}>
            <LayoutGrid size={44} color={colors.mutedForeground} strokeWidth={1.6} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {isLeagueTable ? 'Standings not available yet' : 'Group standings not available yet'}
            </Text>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
            <FlatList
              data={groups}
              keyExtractor={(item, idx) => item.abbreviation ?? item.name ?? String(idx)}
              renderItem={({ item }) => <GroupTable group={item} />}
              contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 90 }}
              refreshControl={
                <RefreshControl refreshing={standingsRefetching} onRefresh={refetchStandings} tintColor={colors.primary} colors={[colors.primary]} />
              }
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
            />
          </Animated.View>
        )
      ) : /* ── BRACKET ─────────────────────────────────────────── */
      isLoading ? (
        <Skeleton style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
          <SkeletonBox style={{ height: 56, borderRadius: 14 }} />
          <SkeletonBox style={{ height: 320, borderRadius: 20 }} />
          <SkeletonBox style={{ height: 120, borderRadius: 14 }} />
        </Skeleton>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Could not load bracket</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : rounds.length === 0 ? (
        <View style={styles.centered}>
          <Trophy size={48} color={colors.mutedForeground} strokeWidth={1.6} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Knockout stage not started</Text>
          <Text style={[styles.emptySubtext, { color: colors.mutedForeground }]}>Check back after the group stage</Text>
        </View>
      ) : viewMode === 'circular' ? (
        // ── Circular view ──────────────────────────────────────────────────
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          <Animated.View entering={FadeIn.duration(500)} style={{ paddingHorizontal: 16, paddingTop: 8, gap: 16 }}>
            <CircularBracket rounds={rounds} />

            {/* Round legend */}
            <View style={[styles.legendBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.legendTitle, { color: colors.foreground }]}>Rounds</Text>
              {rounds.map((r, i) => (
                <View key={r.name} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary, opacity: 1 - i * 0.15 }]} />
                  <Text style={[styles.legendName, { color: colors.foreground }]}>{r.name}</Text>
                  <Text style={[styles.legendCount, { color: colors.mutedForeground }]}>
                    {r.events.length} match{r.events.length !== 1 ? 'es' : ''}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>
      ) : (
        // ── Bracket-tree view (Apple Sports style, free pan) ────────────────
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{ flex: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: insets.bottom + 90 }}
        >
          <BracketTree rounds={rounds} groups={groups} />
        </Animated.View>
      )}
        </Animated.View>
      </GestureDetector>
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
  title: { fontSize: 26, fontFamily: 'Nunito_700Bold', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontFamily: 'Nunito_400Regular', marginTop: 2 },

  sectionRow: { paddingHorizontal: 16, paddingBottom: 12 },
  sectionTrack: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  sectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  sectionBtnText: { fontSize: 14, fontFamily: 'Nunito_700Bold', letterSpacing: 0.1 },

  toggleGroup: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  toggleBtn: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 36,
  },

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 32,
  },
  emptyText: { fontSize: 16, fontFamily: 'Nunito_500Medium', textAlign: 'center' },
  emptySubtext: { fontSize: 13, fontFamily: 'Nunito_400Regular', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },

  legendBox: {
    borderRadius: 11, borderWidth: 1, padding: 16, gap: 10,
  },
  legendTitle: { fontSize: 14, fontFamily: 'Nunito_700Bold', marginBottom: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 13, fontFamily: 'Nunito_500Medium' },
  legendCount: { fontSize: 12, fontFamily: 'Nunito_400Regular' },
});
