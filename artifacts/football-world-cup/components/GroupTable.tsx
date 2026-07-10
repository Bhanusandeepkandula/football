import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { EspnGroup, EspnStandingEntry } from '@/hooks/useWorldCup';
import { font, KICKER_SPACING } from '@/constants/typography';

interface GroupTableProps {
  group: EspnGroup;
}

const WIN = '#30D158';

type SortKey = 'rank' | 'team' | 'GP' | 'W' | 'D' | 'L' | 'GF' | 'GA' | 'GD' | 'PTS';
type SortDirection = 'asc' | 'desc';

const STAT_COLUMNS: { key: Exclude<SortKey, 'rank' | 'team'>; candidates: string[] }[] = [
  { key: 'GP', candidates: ['gamesplayed', 'played', 'gp'] },
  { key: 'W', candidates: ['wins', 'w'] },
  { key: 'D', candidates: ['ties', 'draws', 'draw', 'd'] },
  { key: 'L', candidates: ['losses', 'l'] },
  { key: 'GF', candidates: ['pointsfor', 'goalsfor', 'gf'] },
  { key: 'GA', candidates: ['pointsagainst', 'goalsagainst', 'ga'] },
  { key: 'GD', candidates: ['pointdifferential', 'goaldifferential', 'gd'] },
  { key: 'PTS', candidates: ['points', 'pts'] },
];

// Map ESPN stat names to our abbreviations
function findStat(entry: EspnStandingEntry, candidates: string[]): string {
  for (const c of candidates) {
    const s = entry.stats?.find(st => st.name?.toLowerCase() === c.toLowerCase());
    if (s != null) return s.displayValue ?? s.value?.toString() ?? '-';
  }
  return '-';
}

function statNumber(entry: EspnStandingEntry, key: SortKey): number {
  const col = STAT_COLUMNS.find(c => c.key === key);
  if (!col) return 0;
  const raw = findStat(entry, col.candidates);
  return Number(String(raw).replace(/[^\d.-]/g, '')) || 0;
}

// Points per game — the "performance" metric. Neutralises the fact that teams may
// have played a different number of matches.
function ppgFor(entry: EspnStandingEntry): number {
  const gp = statNumber(entry, 'GP');
  return gp > 0 ? statNumber(entry, 'PTS') / gp : 0;
}

function ppgDisplay(entry: EspnStandingEntry): string {
  const gp = statNumber(entry, 'GP');
  return gp > 0 ? (statNumber(entry, 'PTS') / gp).toFixed(2) : '–';
}

function defaultDirection(key: SortKey): SortDirection {
  return key === 'team' || key === 'rank' ? 'asc' : 'desc';
}

function SortIcon({ active, direction, color }: { active: boolean; direction: SortDirection; color: string }) {
  if (!active) return null;
  const Icon = direction === 'asc' ? ChevronUp : ChevronDown;
  return <Icon size={10} color={color} strokeWidth={3} />;
}

export function GroupTable({ group }: GroupTableProps) {
  const colors = useColors();
  const entries = group.standings?.entries ?? [];
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // Per-table view: Points (raw PTS) or Performance (points-per-game). User's choice.
  const [performance, setPerformance] = useState(false);
  const entriesWithRank = useMemo(
    () => entries.map((entry, index) => ({ entry, rank: index + 1, qualified: index < 2 })),
    [entries],
  );
  const sortedEntries = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...entriesWithRank].sort((a, b) => {
      if (sortKey === 'rank') return (a.rank - b.rank) * direction;
      if (sortKey === 'team') {
        const aName = a.entry.team?.abbreviation ?? a.entry.team?.displayName ?? '';
        const bName = b.entry.team?.abbreviation ?? b.entry.team?.displayName ?? '';
        return aName.localeCompare(bName) * direction;
      }
      // In performance mode the PTS column sorts by points-per-game instead.
      if (sortKey === 'PTS' && performance) {
        const diff = ppgFor(a.entry) - ppgFor(b.entry);
        if (diff !== 0) return diff * direction;
        return a.rank - b.rank;
      }
      const diff = statNumber(a.entry, sortKey) - statNumber(b.entry, sortKey);
      if (diff !== 0) return diff * direction;
      return a.rank - b.rank;
    });
  }, [entriesWithRank, sortDirection, sortKey, performance]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection(defaultDirection(key));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderRadius: 11, borderColor: colors.border }]}>
      {/* Group header — fixed neutral surface (NOT the accent, so changing the
          app accent never re-tints the standings header). */}
      <View style={[styles.groupHeader, { backgroundColor: colors.secondary, borderTopLeftRadius: 12, borderTopRightRadius: 12 }]}>
        <View style={styles.groupTitleWrap}>
          <Text style={[styles.groupTitle, { color: colors.foreground }]} numberOfLines={1}>
            {group.name ?? group.abbreviation ?? 'Group'}
          </Text>
          <Text style={[styles.sortHint, { color: colors.mutedForeground }]}>Tap headers to sort</Text>
        </View>

        <View style={styles.headerRight}>
          {sortKey !== 'rank' ? (
            <TouchableOpacity activeOpacity={0.82} onPress={() => setSort('rank')} style={styles.resetBtn}>
              <RotateCcw size={13} color={colors.mutedForeground} strokeWidth={2.4} />
              <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Reset</Text>
            </TouchableOpacity>
          ) : null}

          {/* Points ⇄ Performance (PPG), per table */}
          <View style={styles.metricToggle}>
            {([
              { id: false, label: 'PTS' },
              { id: true, label: 'PPG' },
            ] as const).map((m) => {
              const on = m.id === performance;
              return (
                <TouchableOpacity
                  key={m.label}
                  activeOpacity={0.82}
                  onPress={() => setPerformance(m.id)}
                  style={[styles.metricSeg, on && { backgroundColor: colors.background }]}
                >
                  <Text style={[styles.metricSegText, { color: on ? colors.foreground : colors.mutedForeground }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Column headers */}
      <View style={[styles.row, styles.headerRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity activeOpacity={0.78} onPress={() => setSort('team')} style={styles.teamCol}>
          <View style={styles.headerTap}>
            <Text style={[styles.headerText, { color: sortKey === 'team' ? colors.foreground : colors.mutedForeground }]}>Team</Text>
            <SortIcon active={sortKey === 'team'} direction={sortDirection} color={colors.foreground} />
          </View>
        </TouchableOpacity>
        {STAT_COLUMNS.map(({ key }) => (
          <TouchableOpacity key={key} activeOpacity={0.78} onPress={() => setSort(key)} style={styles.statCol}>
            <View style={styles.statHeaderTap}>
              <Text style={[styles.headerText, { color: sortKey === key || key === 'PTS' ? colors.foreground : colors.mutedForeground }]}>
                {key === 'PTS' && performance ? 'PPG' : key}
              </Text>
              <SortIcon active={sortKey === key} direction={sortDirection} color={colors.foreground} />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Entries */}
      {sortedEntries.map(({ entry, rank, qualified }, idx) => {
        return (
          <View
            key={entry.team?.id ?? idx}
            style={[
              styles.row,
              qualified && sortKey === 'rank' && { backgroundColor: WIN + '12' },
              idx < entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.teamCol}>
              <View style={styles.teamInfo}>
                <View style={[styles.rankBadge, { backgroundColor: qualified ? WIN + '2E' : colors.muted }]}>
                  <Text style={[styles.rankText, { color: qualified ? WIN : colors.mutedForeground }]}>{rank}</Text>
                </View>
                {entry.team?.logo ? (
                  <Image source={{ uri: entry.team.logo }} style={styles.flagImg} resizeMode="cover" />
                ) : null}
                <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>
                  {entry.team?.abbreviation ?? entry.team?.displayName ?? ''}
                </Text>
              </View>
            </View>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[0].candidates)}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[1].candidates)}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[2].candidates)}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[3].candidates)}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[4].candidates)}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[5].candidates)}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, STAT_COLUMNS[6].candidates)}
            </Text>
            <Text style={[styles.statCol, styles.ptsCol, { color: colors.primary }]}>
              {performance ? ppgDisplay(entry) : findStat(entry, STAT_COLUMNS[7].candidates)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  groupTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  groupTitle: {
    fontSize: 14,
    fontFamily: font.bold,
    letterSpacing: 0.5,
  },
  sortHint: {
    fontSize: 10,
    fontFamily: font.medium,
    opacity: 0.76,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  resetText: {
    fontSize: 10,
    fontFamily: font.bold,
  },
  metricToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 2,
    gap: 2,
  },
  metricSeg: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metricSegText: {
    fontSize: 10.5,
    fontFamily: font.extrabold,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  headerRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  headerText: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: KICKER_SPACING * 0.35,
    textTransform: 'uppercase',
  },
  headerTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statHeaderTap: {
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  teamCol: {
    flex: 1,
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontFamily: font.extrabold,
    textAlign: 'center',
  },
  flagImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  teamName: {
    fontSize: 12,
    fontFamily: font.medium,
    flex: 1,
  },
  statCol: {
    width: 30,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: font.regular,
  },
  ptsCol: {
    fontFamily: font.bold,
    fontSize: 13,
  },
});
