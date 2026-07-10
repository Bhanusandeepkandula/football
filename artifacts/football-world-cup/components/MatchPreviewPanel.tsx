import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import {
  MatchDetail,
  MatchPreview,
  PreviewFormMatch,
  PreviewH2HMatch,
  PreviewLeader,
  PreviewStatFormat,
  PreviewTeamStat,
} from '@/hooks/useMatchDetail';
import { font, KICKER_SPACING } from '@/constants/typography';
import { CompareProgressBar } from '@/components/CompareProgressBar';

interface MatchPreviewPanelProps {
  data: MatchDetail;
  preview: MatchPreview;
  homeColor: string;
  awayColor: string;
}

function teamCode(name: string): string {
  const words = name.replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return (words[0] ?? name).slice(0, 3).toUpperCase();
}

function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function formatStatValue(value: number, format: PreviewStatFormat): string {
  if (format === 'percent') return `${Math.round(value)}%`;
  if (format === 'integer') return String(Math.round(value));
  if (format === 'signed') {
    const rounded = Math.round(value * 10) / 10;
    return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
  }
  return value.toFixed(2);
}

function SectionTitle({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
  );
}

function HeadToHeadSection({
  matches,
  homeTeam,
  awayTeam,
}: {
  matches: PreviewH2HMatch[];
  homeTeam: MatchDetail['homeTeam'];
  awayTeam: MatchDetail['awayTeam'];
}) {
  const colors = useColors();
  if (matches.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title="Head-to-Head" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <View style={[styles.h2hHeader, { borderBottomColor: colors.separator }]}>
          <Text style={[styles.h2hSub, { color: colors.mutedForeground }]}>
            Last {matches.length} Matchup{matches.length === 1 ? '' : 's'}
          </Text>
          <View style={styles.h2hTeams}>
            <View style={styles.h2hTeamChip}>
              {homeTeam.logo ? (
                <Image source={{ uri: homeTeam.logo }} style={styles.h2hLogo} resizeMode="contain" />
              ) : null}
              <Text style={[styles.h2hAbbr, { color: colors.foreground }]}>{teamCode(homeTeam.displayName)}</Text>
            </View>
            <View style={styles.h2hTeamChip}>
              {awayTeam.logo ? (
                <Image source={{ uri: awayTeam.logo }} style={styles.h2hLogo} resizeMode="contain" />
              ) : null}
              <Text style={[styles.h2hAbbr, { color: colors.foreground }]}>{teamCode(awayTeam.displayName)}</Text>
            </View>
          </View>
        </View>
        {matches.map((match, i) => (
          <View
            key={match.id}
            style={[
              styles.h2hRow,
              i < matches.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
            ]}
          >
            <Text style={[styles.h2hScore, { color: colors.foreground }]}>{match.homeScore}</Text>
            <View style={styles.h2hCenter}>
              <Text style={[styles.h2hComp, { color: colors.foreground }]} numberOfLines={2}>
                {[match.competitionName, match.roundName].filter(Boolean).join(', ')}
              </Text>
              <Text style={[styles.h2hMeta, { color: colors.mutedForeground }]}>
                FT · {formatShortDate(match.date)}{match.venueAbbr ? ` @ ${match.venueAbbr}` : ''}
              </Text>
            </View>
            <Text style={[styles.h2hScore, styles.h2hScoreRight, { color: colors.foreground }]}>{match.awayScore}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FormRow({ match, colors }: { match: PreviewFormMatch; colors: ReturnType<typeof useColors> }) {
  const resultColor = match.result === 'W' ? '#30D158' : match.result === 'L' ? '#FF453A' : colors.mutedForeground;
  const comp = [match.competitionName, match.roundName].filter(Boolean).join(', ');

  return (
    <View style={[styles.formTableRow, styles.formDataRow, { borderBottomColor: colors.separator }]}>
      <Text style={[styles.formCell, styles.formColDate, { color: colors.foreground }]}>{formatShortDate(match.date)}</Text>
      <View style={[styles.formColOpp, styles.formOppInner]}>
        <Text style={[styles.formAtVs, { color: colors.mutedForeground }]}>{match.atVs}</Text>
        {match.opponent.logo ? (
          <Image source={{ uri: match.opponent.logo }} style={styles.formOppLogo} resizeMode="contain" />
        ) : null}
        <Text style={[styles.formOppAbbr, { color: colors.foreground }]} numberOfLines={1}>
          {match.opponent.abbreviation}
        </Text>
      </View>
      <Text style={[styles.formCell, styles.formColResult, styles.formResultText, { color: resultColor }]}>
        {match.result} {match.score}
      </Text>
      <Text style={[styles.formCell, styles.formColComp, styles.formCompText, { color: colors.mutedForeground }]} numberOfLines={2}>
        {comp}
      </Text>
    </View>
  );
}

function RecentFormSection({
  preview,
  homeTeam,
  awayTeam,
}: {
  preview: MatchPreview;
  homeTeam: MatchDetail['homeTeam'];
  awayTeam: MatchDetail['awayTeam'];
}) {
  const colors = useColors();
  const [side, setSide] = useState<'home' | 'away'>('home');
  const rows = side === 'home' ? preview.recentForm.home : preview.recentForm.away;
  const activeTeam = side === 'home' ? homeTeam : awayTeam;

  if (preview.recentForm.home.length === 0 && preview.recentForm.away.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title="Last Five Matches" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <View style={styles.teamSwitch}>
          {(['home', 'away'] as const).map((s) => {
            const team = s === 'home' ? homeTeam : awayTeam;
            const active = side === s;
            return (
              <TouchableOpacity
                key={s}
                activeOpacity={0.85}
                onPress={() => setSide(s)}
                style={[styles.teamTab, { backgroundColor: active ? colors.cardElevated : 'transparent' }]}
              >
                {team.logo ? (
                  <Image source={{ uri: team.logo }} style={styles.teamTabLogo} resizeMode="contain" />
                ) : null}
                <Text style={[styles.teamTabAbbr, { color: active ? colors.foreground : colors.mutedForeground }]}>
                  {teamCode(team.displayName)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.formTableRow, styles.formHeaderRow, { borderBottomColor: colors.separator }]}>
          <Text style={[styles.formHeadCell, styles.formColDate, { color: colors.mutedForeground }]}>DATE</Text>
          <Text style={[styles.formHeadCell, styles.formColOpp, { color: colors.mutedForeground }]}>OPP</Text>
          <Text style={[styles.formHeadCell, styles.formColResult, { color: colors.mutedForeground }]}>RESULT</Text>
          <Text style={[styles.formHeadCell, styles.formColComp, { color: colors.mutedForeground }]}>COMPETITION</Text>
        </View>

        {rows.map((match) => (
          <FormRow key={match.id} match={match} colors={colors} />
        ))}

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => router.push(`/team-sheet/${activeTeam.id}` as any)}
          style={styles.fullSchedule}
        >
          <Text style={[styles.fullScheduleText, { color: colors.primary }]}>Full Schedule</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LeaderSide({ leader, color, align }: { leader?: PreviewLeader; color: string; align: 'left' | 'right' }) {
  const colors = useColors();
  const isRight = align === 'right';

  if (!leader) {
    return <View style={[styles.leaderSide, isRight && styles.leaderSideRight]} />;
  }

  const jersey = leader.jerseyImage ? (
    <Image source={{ uri: leader.jerseyImage }} style={styles.jerseyImg} resizeMode="contain" />
  ) : (
    <View style={[styles.jerseyFallback, { backgroundColor: color + '33' }]}>
      <Text style={[styles.jerseyNum, { color }]}>{leader.jersey || '—'}</Text>
    </View>
  );

  const copy = (
    <View style={[styles.leaderCopy, isRight && styles.leaderCopyRight]}>
      <View style={[styles.leaderMain, isRight && styles.leaderMainRight]}>
        {!isRight ? (
          <Text style={[styles.leaderValue, { color: colors.foreground }]}>{leader.value}</Text>
        ) : null}
        <Text style={[styles.leaderName, { color: colors.foreground }]} numberOfLines={1}>
          {leader.shortName} {leader.position}
        </Text>
        {isRight ? (
          <Text style={[styles.leaderValue, { color: colors.foreground }]}>{leader.value}</Text>
        ) : null}
      </View>
      <Text style={[styles.leaderApp, { color: colors.mutedForeground }]}>
        {leader.appearances} APP
      </Text>
    </View>
  );

  return (
    <View style={[styles.leaderSide, isRight && styles.leaderSideRight]}>
      {!isRight ? jersey : null}
      {copy}
      {isRight ? jersey : null}
    </View>
  );
}

function LeadersComparison({
  title,
  statLabel,
  homeLeaders,
  awayLeaders,
  homeTeam,
  awayTeam,
  homeColor,
  awayColor,
}: {
  title: string;
  statLabel: string;
  homeLeaders: PreviewLeader[];
  awayLeaders: PreviewLeader[];
  homeTeam: MatchDetail['homeTeam'];
  awayTeam: MatchDetail['awayTeam'];
  homeColor: string;
  awayColor: string;
}) {
  const colors = useColors();
  const count = Math.max(homeLeaders.length, awayLeaders.length, 1);
  if (homeLeaders.length === 0 && awayLeaders.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title={title} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <View style={[styles.leadersHead, { borderBottomColor: colors.separator }]}>
          <View style={styles.leadersHeadTeam}>
            {homeTeam.logo ? (
              <Image source={{ uri: homeTeam.logo }} style={styles.leadersHeadLogo} resizeMode="contain" />
            ) : null}
            <Text style={[styles.leadersHeadAbbr, { color: colors.foreground }]}>{teamCode(homeTeam.displayName)}</Text>
          </View>
          <Text style={[styles.leadersHeadStat, { color: colors.mutedForeground }]}>{statLabel}</Text>
          <View style={[styles.leadersHeadTeam, { justifyContent: 'flex-end' }]}>
            <Text style={[styles.leadersHeadAbbr, { color: colors.foreground }]}>{teamCode(awayTeam.displayName)}</Text>
            {awayTeam.logo ? (
              <Image source={{ uri: awayTeam.logo }} style={styles.leadersHeadLogo} resizeMode="contain" />
            ) : null}
          </View>
        </View>
        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
          <View
            key={i}
            style={[
              styles.leaderRow,
              i < Math.min(count, 3) - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
            ]}
          >
            <LeaderSide leader={homeLeaders[i]} color={homeColor} align="left" />
            <LeaderSide leader={awayLeaders[i]} color={awayColor} align="right" />
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamStatRow({
  stat,
  homeColor,
  awayColor,
  shaded,
}: {
  stat: PreviewTeamStat;
  homeColor: string;
  awayColor: string;
  shaded: boolean;
}) {
  const colors = useColors();
  const total = stat.homeValue + stat.awayValue;
  const homePct = total > 0 ? (stat.homeValue / total) * 100 : 50;
  const awayPct = total > 0 ? (stat.awayValue / total) * 100 : 50;
  const homeLeads = stat.homeValue > stat.awayValue;
  const awayLeads = stat.awayValue > stat.homeValue;

  return (
    <View style={[styles.teamStatRow, shaded && { backgroundColor: colors.rowShade }]}>
      <View style={styles.teamStatHead}>
        <Text style={[styles.teamStatValue, { color: colors.foreground, fontFamily: homeLeads ? font.extrabold : font.semibold }]}>
          {formatStatValue(stat.homeValue, stat.format)}
        </Text>
        <Text style={[styles.teamStatLabel, { color: colors.mutedForeground }]} numberOfLines={2}>{stat.label}</Text>
        <Text style={[styles.teamStatValue, styles.teamStatValueRight, { color: colors.foreground, fontFamily: awayLeads ? font.extrabold : font.semibold }]}>
          {formatStatValue(stat.awayValue, stat.format)}
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

function TeamStatsSection({
  stats,
  homeColor,
  awayColor,
}: {
  stats: PreviewTeamStat[];
  homeColor: string;
  awayColor: string;
}) {
  const colors = useColors();
  if (stats.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title="Team Stats" />
      <View style={[styles.card, styles.teamStatsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {stats.map((stat, i) => (
          <TeamStatRow key={stat.name} stat={stat} homeColor={homeColor} awayColor={awayColor} shaded={i % 2 === 1} />
        ))}
      </View>
    </View>
  );
}

export function MatchPreviewPanel({ data, preview, homeColor, awayColor }: MatchPreviewPanelProps) {
  const hasContent =
    preview.headToHead.length > 0
    || preview.recentForm.home.length > 0
    || preview.recentForm.away.length > 0
    || preview.leaders.home.goals.length > 0
    || preview.teamStats.length > 0;

  if (!hasContent) return null;

  return (
    <View style={styles.container}>
      <HeadToHeadSection matches={preview.headToHead} homeTeam={data.homeTeam} awayTeam={data.awayTeam} />
      <RecentFormSection preview={preview} homeTeam={data.homeTeam} awayTeam={data.awayTeam} />
      <LeadersComparison
        title="Top Scorers"
        statLabel="Goals"
        homeLeaders={preview.leaders.home.goals}
        awayLeaders={preview.leaders.away.goals}
        homeTeam={data.homeTeam}
        awayTeam={data.awayTeam}
        homeColor={homeColor}
        awayColor={awayColor}
      />
      <LeadersComparison
        title="Most Assists"
        statLabel="Assists"
        homeLeaders={preview.leaders.home.assists}
        awayLeaders={preview.leaders.away.assists}
        homeTeam={data.homeTeam}
        awayTeam={data.awayTeam}
        homeColor={homeColor}
        awayColor={awayColor}
      />
      <TeamStatsSection stats={preview.teamStats} homeColor={homeColor} awayColor={awayColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.displaySemi,
    letterSpacing: KICKER_SPACING,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  h2hHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  h2hSub: { fontSize: 12, fontFamily: font.semibold },
  h2hTeams: { flexDirection: 'row', justifyContent: 'space-between' },
  h2hTeamChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  h2hLogo: { width: 20, height: 20 },
  h2hAbbr: { fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.5 },
  h2hRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
  h2hScore: { width: 28, fontSize: 22, fontFamily: font.extrabold, textAlign: 'left' },
  h2hScoreRight: { textAlign: 'right' },
  h2hCenter: { flex: 1, alignItems: 'center', gap: 3 },
  h2hComp: { fontSize: 12, fontFamily: font.bold, textAlign: 'center' },
  h2hMeta: { fontSize: 11, fontFamily: font.semibold, textAlign: 'center' },

  teamSwitch: {
    flexDirection: 'row',
    gap: 4,
    margin: 10,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(118,118,128,0.16)',
  },
  teamTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    borderRadius: 9,
  },
  teamTabLogo: { width: 22, height: 22 },
  teamTabAbbr: { fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.5 },

  formTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  formHeaderRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  formDataRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  formHeadCell: { fontSize: 10, fontFamily: font.extrabold, letterSpacing: 0.5 },
  formCell: { fontSize: 11, fontFamily: font.semibold },
  formColDate: { width: 54 },
  formColOpp: { width: 80 },
  formColResult: { width: 58 },
  formColComp: { flex: 1, minWidth: 0 },
  formOppInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formAtVs: { width: 14, fontSize: 10, fontFamily: font.bold },
  formOppLogo: { width: 16, height: 16 },
  formOppAbbr: { flex: 1, fontSize: 11, fontFamily: font.extrabold },
  formResultText: { fontFamily: font.extrabold },
  formCompText: { fontSize: 10, fontFamily: font.medium, lineHeight: 13 },
  fullSchedule: { alignItems: 'center', paddingVertical: 14 },
  fullScheduleText: { fontSize: 14, fontFamily: font.bold },

  leadersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadersHeadTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  leadersHeadLogo: { width: 20, height: 20 },
  leadersHeadAbbr: { fontSize: 12, fontFamily: font.extrabold },
  leadersHeadStat: { fontSize: 11, fontFamily: font.extrabold, letterSpacing: 0.6 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  leaderSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, minWidth: 0 },
  leaderSideRight: { justifyContent: 'flex-end' },
  leaderCopy: { flex: 1, minWidth: 0, gap: 1 },
  leaderCopyRight: { alignItems: 'flex-end' },
  leaderMain: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'nowrap' },
  leaderMainRight: { justifyContent: 'flex-end' },
  jerseyImg: { width: 38, height: 44 },
  jerseyFallback: {
    width: 38,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jerseyNum: { fontSize: 14, fontFamily: font.extrabold },
  leaderValue: { fontSize: 22, fontFamily: font.displayBold, letterSpacing: -0.5 },
  leaderName: { flexShrink: 1, fontSize: 12, fontFamily: font.bold },
  leaderApp: { fontSize: 10, fontFamily: font.semibold },

  teamStatsCard: { paddingVertical: 4 },
  teamStatRow: { paddingVertical: 11, paddingHorizontal: 16, gap: 8 },
  teamStatHead: { flexDirection: 'row', alignItems: 'center' },
  teamStatValue: { width: 52, fontSize: 15, textAlign: 'left' },
  teamStatValueRight: { textAlign: 'right' },
  teamStatLabel: { flex: 1, fontSize: 12, fontFamily: font.semibold, textAlign: 'center', paddingHorizontal: 4 },
});
