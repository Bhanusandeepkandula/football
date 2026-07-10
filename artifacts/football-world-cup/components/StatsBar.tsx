import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CompareProgressBar, comparePct } from '@/components/CompareProgressBar';
import { useColors } from '@/hooks/useColors';
import { MatchStat } from '@/hooks/useMatchDetail';
import { font, KICKER_SPACING } from '@/constants/typography';

interface StatsBarProps {
  stats: MatchStat[];
  homeColor: string;
  awayColor: string;
}

const GROUPS = [
  {
    title: 'Attacking',
    names: [
      'expectedGoals',
      'totalShots',
      'shotsOnTarget',
      'shotsOffTarget',
      'blockedShots',
      'shotAccuracy',
      'totalShotsInsideBox',
      'totalShotsOutsideBox',
      'hitWoodwork',
      'wonCorners',
      'offsides',
      'throwIns',
    ],
  },
  {
    title: 'Passing',
    names: [
      'totalPasses',
      'accuratePasses',
      'passAccuracy',
      'totalCrosses',
      'accurateCrosses',
      'totalLongBalls',
      'accurateLongBalls',
      'totalThroughBalls',
      'accurateThroughBalls',
    ],
  },
  {
    title: 'Defence',
    names: [
      'saves',
      'goalKicks',
      'totalTackles',
      'wonTackles',
      'interceptions',
      'effectiveClearance',
      'totalClearance',
      'duelsWon',
      'aerialsWon',
    ],
  },
  {
    title: 'Discipline',
    names: ['foulsCommitted', 'yellowCards', 'redCards'],
  },
];

function numericValue(value: string): number {
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanLabel(label: string): string {
  return label
    .replace('Possession %', 'Possession')
    .replace('Shots On Target', 'Shots on target')
    .replace('Shots on Target', 'Shots on target')
    .replace('Won Corners', 'Corners')
    .replace('Fouls Committed', 'Fouls');
}

// ─── Possession summary ─────────────────────────────────────────────────────

function PossessionCard({
  possession,
  homeColor,
  awayColor,
}: {
  possession: MatchStat;
  homeColor: string;
  awayColor: string;
}) {
  const colors = useColors();
  const homePct = Math.round(possession.homePercent);
  const awayPct = 100 - homePct;

  return (
    <View style={styles.possWrap}>
      <View style={styles.possHead}>
        <Text style={[styles.possValue, { color: colors.foreground }]}>{homePct}%</Text>
        <Text style={[styles.possKicker, { color: colors.mutedForeground }]}>POSSESSION</Text>
        <Text style={[styles.possValue, { color: colors.foreground }]}>{awayPct}%</Text>
      </View>
      <CompareProgressBar
        homePct={homePct}
        awayPct={awayPct}
        homeColor={homeColor}
        awayColor={awayColor}
      />
    </View>
  );
}

// ─── One stat row (minimal, ESPN-style) ─────────────────────────────────────

function StatRow({
  stat,
  homeColor,
  awayColor,
  shaded,
}: {
  stat: MatchStat;
  homeColor: string;
  awayColor: string;
  shaded: boolean;
}) {
  const colors = useColors();
  const h = numericValue(stat.homeValue);
  const a = numericValue(stat.awayValue);
  const homeLeads = h > a;
  const awayLeads = a > h;
  const total = h + a;
  const { homePct, awayPct } = comparePct(h, a);

  return (
    <View style={[styles.row, shaded && { backgroundColor: colors.rowShade }]}>
      <View style={styles.rowHead}>
        <Text style={[styles.value, { color: colors.foreground, fontFamily: homeLeads ? font.extrabold : font.semibold }]}>
          {stat.homeValue}
        </Text>
        <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
          {cleanLabel(stat.displayName)}
        </Text>
        <Text style={[styles.value, styles.valueRight, { color: colors.foreground, fontFamily: awayLeads ? font.extrabold : font.semibold }]}>
          {stat.awayValue}
        </Text>
      </View>
      <CompareProgressBar
        homePct={homePct}
        awayPct={awayPct}
        homeColor={homeColor}
        awayColor={awayColor}
      />
    </View>
  );
}

function StatSection({
  title,
  stats,
  homeColor,
  awayColor,
}: {
  title: string;
  stats: MatchStat[];
  homeColor: string;
  awayColor: string;
}) {
  const colors = useColors();
  if (stats.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
        {stats.map((stat, index) => (
          <StatRow
            key={`${title}-${stat.name}-${index}`}
            stat={stat}
            homeColor={homeColor}
            awayColor={awayColor}
            shaded={index % 2 === 1}
          />
        ))}
      </View>
    </View>
  );
}

export function StatsBar({ stats, homeColor, awayColor }: StatsBarProps) {
  const colors = useColors();

  if (stats.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Stats not available yet</Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Team numbers will appear after kickoff</Text>
      </View>
    );
  }

  const possession = stats.find((s) => s.name === 'possessionPct');
  const seen = new Set<string>();

  return (
    <View style={styles.container}>
      {possession ? <PossessionCard possession={possession} homeColor={homeColor} awayColor={awayColor} /> : null}
      {GROUPS.map(group => {
        const groupStats = group.names.flatMap(name => {
          if (seen.has(name)) return [];
          const s = stats.find(stat => stat.name === name);
          if (!s) return [];
          seen.add(name);
          return [s];
        });
        return (
          <StatSection
            key={group.title}
            title={group.title}
            stats={groupStats}
            homeColor={homeColor}
            awayColor={awayColor}
          />
        );
      })}
      <StatSection
        title="More Team Stats"
        stats={stats.filter((stat) => stat.name !== 'possessionPct' && !seen.has(stat.name))}
        homeColor={homeColor}
        awayColor={awayColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 22,
  },

  // Possession
  possWrap: { gap: 10, paddingTop: 6 },
  possHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  possValue: { fontSize: 24, fontFamily: font.displayBold, letterSpacing: -0.4 },
  possKicker: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  // Section
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: font.extrabold,
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 9,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center' },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 3 },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },
  value: {
    width: 52,
    fontSize: 17,
    textAlign: 'left',
  },
  valueRight: { textAlign: 'right' },
  label: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: font.semibold,
    textAlign: 'center',
  },

  emptyWrap: {
    marginHorizontal: 16,
    marginTop: 40,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontFamily: font.bold },
  emptyText: { fontSize: 13, fontFamily: font.regular, textAlign: 'center' },
});
