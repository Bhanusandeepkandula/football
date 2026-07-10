import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { MatchPlayerStatsTeam, MatchPlayerStatsGroup } from '@/hooks/useMatchDetail';
import { playerDetailQueryOptions } from '@/hooks/usePlayerDetail';
import { font, KICKER_SPACING } from '@/constants/typography';

interface PlayerStatsTableProps {
  teams: MatchPlayerStatsTeam[];
  homeColor: string;
  awayColor: string;
}

const OUTFIELD_COLUMNS = ['TCH', 'G', 'A', 'xG', 'xA'];
const GK_COLUMNS = ['GA', 'SV', 'SOGA', 'xGC', 'xGOTC'];

function columnsFor(group: MatchPlayerStatsGroup): string[] {
  return group.type.toLowerCase().includes('goalkeeper') ? GK_COLUMNS : OUTFIELD_COLUMNS;
}

function statAt(group: MatchPlayerStatsGroup, stats: string[], label: string): string {
  const index = group.labels.findIndex((item) => item.toLowerCase() === label.toLowerCase());
  return index >= 0 ? stats[index] ?? '0' : '0';
}

function prettyGroup(type: string): string {
  return type.toUpperCase();
}

export function PlayerStatsTable({ teams, homeColor, awayColor }: PlayerStatsTableProps) {
  const colors = useColors();
  const qc = useQueryClient();
  const [activeTeamId, setActiveTeamId] = useState(teams[0]?.team.id ?? '');
  const active = useMemo(
    () => teams.find((team) => team.team.id === activeTeamId) ?? teams[0],
    [activeTeamId, teams],
  );

  if (!active) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>PLAYER STATS</Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No player stats available yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.switcher}>
        {teams.map((team, index) => {
          const activeTab = team.team.id === active.team.id;
          const accent = index === 0 ? homeColor : awayColor;
          return (
            <TouchableOpacity
              key={team.team.id || team.team.displayName}
              activeOpacity={0.84}
              onPress={() => setActiveTeamId(team.team.id)}
              style={[
                styles.teamPill,
                {
                  backgroundColor: activeTab ? accent : colors.secondary,
                  borderColor: activeTab ? 'transparent' : colors.hairline,
                },
              ]}
            >
              {team.team.logo ? <Image source={{ uri: team.team.logo }} style={styles.teamLogo} resizeMode="contain" /> : null}
              <Text style={[styles.teamPillText, { color: activeTab ? '#FFFFFF' : colors.mutedForeground }]} numberOfLines={1}>
                {team.team.abbreviation || team.team.displayName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
        <View style={styles.cardHeader}>
          <View style={styles.teamTitleRow}>
            {active.team.logo ? <Image source={{ uri: active.team.logo }} style={styles.headerLogo} resizeMode="contain" /> : null}
            <View>
              <Text style={[styles.kicker, { color: colors.mutedForeground }]}>PLAYER STATS</Text>
              <Text style={[styles.teamTitle, { color: colors.foreground }]}>{active.team.displayName}</Text>
            </View>
          </View>
        </View>

        {active.groups.map((group) => {
          const labels = columnsFor(group);
          return (
            <View key={`${active.team.id}-${group.type}`} style={[styles.group, { borderTopColor: colors.separator }]}>
              <View style={[styles.row, styles.groupHead]}>
                <Text style={[styles.groupTitle, { color: colors.foreground }]}>{prettyGroup(group.type)}</Text>
                <View style={styles.statCols}>
                  {labels.map((label) => (
                    <Text key={label} style={[styles.colHead, { color: colors.foreground }]}>{label}</Text>
                  ))}
                </View>
              </View>

              {group.athletes.map((athlete, index) => (
                <TouchableOpacity
                  key={athlete.id || `${athlete.displayName}-${index}`}
                  activeOpacity={athlete.id ? 0.6 : 1}
                  onPress={() => athlete.id && router.push(`/player/${athlete.id}` as any)}
                  onPressIn={() => athlete.id && qc.prefetchQuery(playerDetailQueryOptions(athlete.id))}
                  style={[
                    styles.row,
                    { backgroundColor: index % 2 === 0 ? colors.rowShade : 'transparent', borderTopColor: colors.separator },
                  ]}
                >
                  <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
                    <Text style={{ color: colors.mutedForeground }}>#{athlete.jersey} </Text>
                    {athlete.shortName}
                  </Text>
                  <View style={styles.statCols}>
                    {labels.map((label) => (
                      <Text key={label} style={[styles.statValue, { color: colors.mutedForeground }]}>
                        {statAt(group, athlete.stats, label)}
                      </Text>
                    ))}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 16, paddingBottom: 20 },
  switcher: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  teamPill: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  teamLogo: { width: 24, height: 24, borderRadius: 12 },
  teamPillText: { fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.4 },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardHeader: { padding: 14 },
  teamTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLogo: { width: 34, height: 34 },
  kicker: { fontSize: 10, fontFamily: font.extrabold, letterSpacing: KICKER_SPACING * 0.7 },
  teamTitle: { fontSize: 17, fontFamily: font.displaySemi, marginTop: 2 },
  group: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingRight: 14,
  },
  groupHead: { minHeight: 44, borderTopWidth: 0 },
  groupTitle: { flex: 1.1, paddingLeft: 14, fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.4 },
  playerName: { flex: 1.1, paddingLeft: 14, paddingRight: 6, fontSize: 13, fontFamily: font.bold },
  statCols: { flex: 1.9, flexDirection: 'row', alignItems: 'center' },
  colHead: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: font.extrabold },
  statValue: { flex: 1, textAlign: 'center', fontSize: 13, fontFamily: font.semibold },
  empty: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 6,
  },
  emptyTitle: { fontSize: 18, fontFamily: font.displaySemi },
  emptyText: { fontSize: 13, fontFamily: font.medium },
});
