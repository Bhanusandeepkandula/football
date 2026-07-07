import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { EspnGroup, EspnStandingEntry } from '@/hooks/useWorldCup';

interface GroupTableProps {
  group: EspnGroup;
}

const STAT_KEYS = ['GP', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PTS'];

function getStat(entry: EspnStandingEntry, abbrev: string): string {
  const s = entry.stats?.find(
    st =>
      st.name?.toLowerCase() === abbrev.toLowerCase() ||
      st.name?.toLowerCase().includes(abbrev.toLowerCase())
  );
  return s?.displayValue ?? s?.value?.toString() ?? '-';
}

// Map ESPN stat names to our abbreviations
function findStat(entry: EspnStandingEntry, candidates: string[]): string {
  for (const c of candidates) {
    const s = entry.stats?.find(st => st.name?.toLowerCase() === c.toLowerCase());
    if (s != null) return s.displayValue ?? s.value?.toString() ?? '-';
  }
  return '-';
}

export function GroupTable({ group }: GroupTableProps) {
  const colors = useColors();
  const entries = group.standings?.entries ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderRadius: 12, borderColor: colors.border }]}>
      {/* Group header */}
      <View style={[styles.groupHeader, { backgroundColor: colors.primary, borderTopLeftRadius: 12, borderTopRightRadius: 12 }]}>
        <Text style={[styles.groupTitle, { color: colors.primaryForeground }]}>
          {group.name ?? group.abbreviation ?? 'Group'}
        </Text>
      </View>

      {/* Column headers */}
      <View style={[styles.row, styles.headerRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.teamCol, styles.headerText, { color: colors.mutedForeground }]}>Team</Text>
        {['GP', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PTS'].map(h => (
          <Text key={h} style={[styles.statCol, styles.headerText, { color: h === 'PTS' ? colors.primary : colors.mutedForeground }]}>
            {h}
          </Text>
        ))}
      </View>

      {/* Entries */}
      {entries.map((entry, idx) => {
        const isTop2 = idx < 2;
        return (
          <View
            key={entry.team?.id ?? idx}
            style={[
              styles.row,
              idx < entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.teamCol}>
              <View style={styles.teamInfo}>
                <Text style={[styles.rankText, { color: isTop2 ? colors.primary : colors.mutedForeground }]}>
                  {idx + 1}
                </Text>
                {entry.team?.logo ? (
                  <Image source={{ uri: entry.team.logo }} style={styles.flagImg} resizeMode="contain" />
                ) : null}
                <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>
                  {entry.team?.abbreviation ?? entry.team?.displayName ?? ''}
                </Text>
              </View>
            </View>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['gamesplayed', 'played', 'gp'])}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['wins', 'w'])}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['ties', 'draws', 'draw', 'd'])}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['losses', 'l'])}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['pointsfor', 'goalsfor', 'gf'])}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['pointsagainst', 'goalsagainst', 'ga'])}
            </Text>
            <Text style={[styles.statCol, { color: colors.mutedForeground }]}>
              {findStat(entry, ['pointdifferential', 'goaldifferential', 'gd'])}
            </Text>
            <Text style={[styles.statCol, styles.ptsCol, { color: colors.primary }]}>
              {findStat(entry, ['points', 'pts'])}
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
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  groupTitle: {
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.5,
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
    fontFamily: 'Nunito_600SemiBold',
    textTransform: 'uppercase',
  },
  teamCol: {
    flex: 1,
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankText: {
    fontSize: 12,
    fontFamily: 'Nunito_600SemiBold',
    width: 14,
    textAlign: 'center',
  },
  flagImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  teamName: {
    fontSize: 12,
    fontFamily: 'Nunito_500Medium',
    flex: 1,
  },
  statCol: {
    width: 28,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
  },
  ptsCol: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
  },
});
