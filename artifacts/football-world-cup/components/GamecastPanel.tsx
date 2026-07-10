import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Activity,
  ArrowRightLeft,
  BadgeAlert,
  BarChart2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Flag,
  Goal,
  List,
  MapPin,
  Shield,
  Trophy,
} from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import {
  MatchCommentaryItem,
  MatchDetail,
  MatchEvent,
  MatchGamecastItem,
  MatchOdds,
  MatchPlayerStatsAthlete,
  MatchPlayerStatsGroup,
  MatchStat,
} from '@/hooks/useMatchDetail';
import { font, KICKER_SPACING } from '@/constants/typography';
import { CompareProgressBar } from '@/components/CompareProgressBar';
import { liveWinProbability } from '@/lib/winProbability';

type GamecastRoute = 'events' | 'stats' | 'players' | 'commentary';

interface GamecastPanelProps {
  data: MatchDetail;
  homeColor: string;
  awayColor: string;
  onNavigate?: (tab: GamecastRoute) => void;
}

interface Performer {
  id: string;
  name: string;
  jersey: string;
  teamName: string;
  teamLogo: string;
  score: number;
  tags: { label: string; value: string }[];
}

function tint(color: string, opacityHex = '22') {
  return color.startsWith('#') ? `${color}${opacityHex}` : 'rgba(245,166,35,0.14)';
}

function numberValue(value?: string): number {
  const parsed = parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clockLabel(clock?: string): string {
  if (!clock) return '—';
  return clock.includes("'") ? clock : `${clock}'`;
}

function minuteNumber(clock?: string): number {
  if (!clock) return 0;
  const parts = String(clock).replace(/'/g, '').split('+').map((part) => parseInt(part, 10) || 0);
  return Math.max(0, parts.reduce((sum, value) => sum + value, 0));
}

function code(name: string): string {
  return name
    .replace(/[^a-zA-Z\s-]/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || name.slice(0, 3).toUpperCase();
}

function cleanStatLabel(label: string) {
  return label
    .replace('Possession %', 'Possession')
    .replace('Shots on Target', 'On target')
    .replace('Won Corners', 'Corners')
    .replace('Fouls Committed', 'Fouls');
}

function eventAccent(event: MatchEvent, data: MatchDetail, homeColor: string, awayColor: string) {
  if (event.type === 'yellow-card') return '#E5B820';
  if (event.type === 'red-card') return '#FF453A';
  if (event.type === 'substitution') return '#5C8A66';
  if (event.type === 'var') return '#9B7BB8';
  if (event.type === 'goal') return event.teamId === data.homeTeam.id ? homeColor : awayColor;
  return '#8E8E93';
}

function sentenceLabel(label: string): string {
  const lower = label.trim().toLowerCase();
  if (!lower) return '';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

type TimelineMarker = {
  event: MatchEvent;
  leftPct: number;
  lane: number;
  clusterCount?: number;
};

function buildTimelineMarkers(events: MatchEvent[]): TimelineMarker[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => minuteNumber(a.clock) - minuteNumber(b.clock));
  const maxMin = Math.max(105, ...sorted.map((event) => minuteNumber(event.clock)));
  const clusters: { leftPct: number; items: MatchEvent[] }[] = [];

  for (const event of sorted) {
    const leftPct = Math.min(97, Math.max(3, (minuteNumber(event.clock) / maxMin) * 100));
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last.leftPct - leftPct) < 3.8) {
      last.items.push(event);
    } else {
      clusters.push({ leftPct, items: [event] });
    }
  }

  const markers: TimelineMarker[] = [];
  for (const cluster of clusters) {
    if (cluster.items.length > 3) {
      markers.push({
        event: cluster.items[cluster.items.length - 1],
        leftPct: cluster.leftPct,
        lane: 0,
        clusterCount: cluster.items.length,
      });
      continue;
    }
    cluster.items.forEach((event, lane) => {
      markers.push({ event, leftPct: cluster.leftPct, lane });
    });
  }
  return markers;
}

function PulseTimelineMarker({
  marker,
  color,
  cardBg,
}: {
  marker: TimelineMarker;
  color: string;
  cardBg: string;
}) {
  const laneLift = marker.lane * 7;
  const height = 9 + laneLift;

  if (marker.clusterCount && marker.clusterCount > 3) {
    return (
      <View
        style={[
          styles.pulseMarkerCluster,
          { left: `${marker.leftPct}%`, bottom: 2 + laneLift, borderColor: color, backgroundColor: cardBg },
        ]}
      >
        <Text style={[styles.pulseMarkerClusterText, { color }]}>×{marker.clusterCount}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.pulseMarker,
        {
          left: `${marker.leftPct}%`,
          height,
          bottom: 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

function PulseEventGlyph({ event, accent }: { event: MatchEvent; accent: string }) {
  if (event.type === 'goal') return <Goal size={12} color={accent} fill={accent} strokeWidth={2.2} />;
  if (event.type === 'substitution') return <ArrowRightLeft size={11} color={accent} strokeWidth={2.4} />;
  if (event.type === 'yellow-card' || event.type === 'red-card') {
    return <View style={[styles.pulseCardMark, { backgroundColor: accent }]} />;
  }
  if (event.type === 'var') return <BadgeAlert size={11} color={accent} strokeWidth={2.3} />;
  return <View style={[styles.pulseCardMark, { backgroundColor: accent, opacity: 0.65 }]} />;
}

function PulseEventRow({
  event,
  data,
  homeColor,
  awayColor,
  last,
}: {
  event: MatchEvent;
  data: MatchDetail;
  homeColor: string;
  awayColor: string;
  last: boolean;
}) {
  const colors = useColors();
  const accent = eventAccent(event, data, homeColor, awayColor);
  const title = event.playerName || event.text || event.typeLabel;
  const subtitle = event.playerName ? sentenceLabel(event.typeLabel) : undefined;

  return (
    <View
      style={[
        styles.pulseRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      <Text style={[styles.pulseMinute, { color: colors.mutedForeground }]}>{clockLabel(event.clock)}</Text>
      <View style={[styles.pulseAccent, { backgroundColor: accent }]} />
      <View style={styles.pulseBody}>
        <View style={styles.pulseTitleRow}>
          <PulseEventGlyph event={event} accent={accent} />
          <Text style={[styles.pulseTitle, { color: colors.foreground }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text style={[styles.pulseSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function iconFor(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes('result') || lower.includes('score')) return Trophy;
  if (lower.includes('shot') || lower.includes('goal')) return Goal;
  if (lower.includes('venue')) return MapPin;
  if (lower.includes('status')) return Clock;
  return BarChart2;
}

function SectionTitle({
  title,
  icon,
  actionLabel,
  onAction,
}: {
  title: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadLeft}>
        {icon}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      </View>
      {onAction ? (
        <TouchableOpacity activeOpacity={0.75} onPress={onAction} style={styles.sectionAction}>
          <Text style={[styles.sectionActionText, { color: colors.mutedForeground }]}>{actionLabel ?? 'Open'}</Text>
          <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={2.4} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function GamecastCard({ item, homeColor, awayColor }: { item: MatchGamecastItem; homeColor: string; awayColor: string }) {
  const colors = useColors();
  const Icon = iconFor(item.label);
  const accent = item.side === 'home' ? homeColor : item.side === 'away' ? awayColor : colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={[styles.cardIcon, { backgroundColor: tint(accent, '20') }]}>
        <Icon size={17} color={accent} strokeWidth={2.3} />
      </View>
      <Text style={[styles.cardLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{item.label}</Text>
      <Text style={[styles.cardValue, { color: colors.foreground }]} numberOfLines={2}>{item.value}</Text>
      {item.detail ? <Text style={[styles.cardDetail, { color: colors.mutedForeground }]} numberOfLines={2}>{item.detail}</Text> : null}
    </View>
  );
}

function PulsePanel({
  data,
  homeColor,
  awayColor,
  onNavigate,
}: {
  data: MatchDetail;
  homeColor: string;
  awayColor: string;
  onNavigate?: (tab: GamecastRoute) => void;
}) {
  const colors = useColors();
  const events = useMemo(
    () => [...data.events].sort((a, b) => minuteNumber(a.clock) - minuteNumber(b.clock)),
    [data.events],
  );
  const markers = useMemo(() => buildTimelineMarkers(events), [events]);
  const recent = useMemo(() => events.slice(-5).reverse(), [events]);
  const maxLane = markers.reduce((max, marker) => Math.max(max, marker.lane), 0);

  if (events.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle
        title="Match Pulse"
        actionLabel="Commentary"
        onAction={onNavigate ? () => onNavigate('commentary') : undefined}
      />
      <View style={[styles.pulseCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <View style={[styles.pulseTimeline, { height: 24 + maxLane * 7 }]}>
          <View style={[styles.pulseTrackLine, { backgroundColor: colors.separator }]} />
          <View style={[styles.pulseTick, styles.pulseTickMid, { backgroundColor: colors.hairline }]} />
          <View style={[styles.pulseTick, styles.pulseTickEnd, { backgroundColor: colors.hairline }]} />
          {markers.map((marker) => (
            <PulseTimelineMarker
              key={`${marker.event.id}-${marker.lane}-${marker.clusterCount ?? 0}`}
              marker={marker}
              color={eventAccent(marker.event, data, homeColor, awayColor)}
              cardBg={colors.card}
            />
          ))}
        </View>
        <View style={styles.pulseLabels}>
          <Text style={[styles.pulseLabel, { color: colors.mutedForeground }]}>0′</Text>
          <Text style={[styles.pulseLabel, styles.pulseLabelMid, { color: colors.mutedForeground }]}>HT</Text>
          <Text style={[styles.pulseLabel, { color: colors.mutedForeground }]}>FT</Text>
        </View>

        <View style={[styles.pulseDivider, { backgroundColor: colors.separator }]} />

        <View style={styles.pulseList}>
          {recent.map((event, index) => (
            <PulseEventRow
              key={`pulse-${event.id}`}
              event={event}
              data={data}
              homeColor={homeColor}
              awayColor={awayColor}
              last={index === recent.length - 1}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function StatPreviewRow({ stat, homeColor, awayColor }: { stat: MatchStat; homeColor: string; awayColor: string }) {
  const colors = useColors();
  const home = numberValue(stat.homeValue);
  const away = numberValue(stat.awayValue);
  const total = home + away;
  const homePct = total > 0 ? Math.max(0, Math.min(100, (home / total) * 100)) : 50;
  const awayPct = 100 - homePct;

  return (
    <View style={styles.statRow}>
      <View style={styles.statRowHead}>
        <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.homeValue}</Text>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{cleanStatLabel(stat.displayName)}</Text>
        <Text style={[styles.statValue, { color: colors.foreground, textAlign: 'right' }]}>{stat.awayValue}</Text>
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

function StatsSnapshot({
  data,
  homeColor,
  awayColor,
  onNavigate,
}: {
  data: MatchDetail;
  homeColor: string;
  awayColor: string;
  onNavigate?: (tab: GamecastRoute) => void;
}) {
  const colors = useColors();
  const names = ['expectedGoals', 'possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners', 'foulsCommitted'];
  const rows = names.flatMap((name) => {
    const stat = data.stats.find((item) => item.name === name);
    return stat ? [stat] : [];
  });
  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle
        title="Team Stats"
        icon={<BarChart2 size={15} color={colors.primary} />}
        actionLabel="Full Stats"
        onAction={onNavigate ? () => onNavigate('stats') : undefined}
      />
      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {rows.map((stat) => (
          <StatPreviewRow key={stat.name} stat={stat} homeColor={homeColor} awayColor={awayColor} />
        ))}
      </View>
    </View>
  );
}

function ShotSummary({
  data,
  onNavigate,
}: {
  data: MatchDetail;
  onNavigate?: (tab: GamecastRoute) => void;
}) {
  const colors = useColors();
  if (data.shots.length === 0) return null;
  const goals = data.shots.filter((shot) => shot.outcome === 'goal').length;
  const saves = data.shots.filter((shot) => shot.outcome === 'save').length;
  const off = data.shots.filter((shot) => shot.outcome === 'offTarget').length;
  const blocked = data.shots.filter((shot) => shot.outcome === 'block').length;
  const xg = data.shots.reduce((sum, shot) => sum + numberValue(shot.xG), 0).toFixed(2);

  const chips = [
    { label: 'Goals', value: goals, color: colors.primary },
    { label: 'Saved', value: saves, color: '#64D2FF' },
    { label: 'Off', value: off, color: colors.mutedForeground },
    { label: 'Blocked', value: blocked, color: '#AF52DE' },
  ];

  return (
    <View style={styles.section}>
      <SectionTitle
        title="Shot Map Summary"
        icon={<Goal size={15} color={colors.primary} />}
        actionLabel="Shot Map"
        onAction={onNavigate ? () => onNavigate('stats') : undefined}
      />
      <View style={[styles.shotCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <View style={styles.shotHeader}>
          <Text style={[styles.shotTotal, { color: colors.foreground }]}>{data.shots.length}</Text>
          <View style={styles.shotHeaderText}>
            <Text style={[styles.shotTitle, { color: colors.foreground }]}>Tracked Attempts</Text>
            <Text style={[styles.shotSub, { color: colors.mutedForeground }]}>Combined xG {xg}</Text>
          </View>
        </View>
        <View style={styles.shotChips}>
          {chips.map((chip) => (
            <View key={chip.label} style={[styles.shotChip, { backgroundColor: tint(chip.color, '22') }]}>
              <Text style={[styles.shotChipValue, { color: chip.color }]}>{chip.value}</Text>
              <Text style={[styles.shotChipLabel, { color: colors.mutedForeground }]}>{chip.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function athleteStat(group: MatchPlayerStatsGroup, athlete: MatchPlayerStatsAthlete, candidates: string[]) {
  const wanted = candidates.map(normalizeKey);
  const index = [...group.keys, ...group.labels].findIndex((value) => wanted.includes(normalizeKey(value)));
  if (index < 0) return undefined;
  const statIndex = index >= group.keys.length ? index - group.keys.length : index;
  return athlete.stats[statIndex];
}

function buildPerformers(data: MatchDetail): Performer[] {
  return data.playerStats.flatMap((team) => team.groups.flatMap((group) => group.athletes.map((athlete): Performer => {
    const goals = athleteStat(group, athlete, ['g', 'goals']);
    const assists = athleteStat(group, athlete, ['a', 'assists']);
    const shots = athleteStat(group, athlete, ['sh', 'shots']);
    const xg = athleteStat(group, athlete, ['xg', 'expected goals']);
    const saves = athleteStat(group, athlete, ['sv', 'saves']);
    const touches = athleteStat(group, athlete, ['tch', 'touches']);
    const tags = [
      { label: 'G', value: goals },
      { label: 'A', value: assists },
      { label: 'SH', value: shots },
      { label: 'xG', value: xg },
      { label: 'SV', value: saves },
      { label: 'TCH', value: touches },
    ].flatMap((tag) => tag.value && tag.value !== '0' && tag.value !== '0.00' ? [{ label: tag.label, value: tag.value }] : []);

    return {
      id: `${team.team.id}-${athlete.id}-${group.type}`,
      name: athlete.shortName || athlete.displayName,
      jersey: athlete.jersey,
      teamName: team.team.displayName,
      teamLogo: team.team.logo,
      score:
        numberValue(goals) * 8 +
        numberValue(assists) * 5 +
        numberValue(xg) * 3 +
        numberValue(shots) +
        numberValue(saves) * 2 +
        numberValue(touches) / 100,
      tags,
    };
  })))
    .filter((player) => player.name && player.name !== 'Player' && player.tags.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function PlayerImpact({
  data,
  onNavigate,
}: {
  data: MatchDetail;
  onNavigate?: (tab: GamecastRoute) => void;
}) {
  const colors = useColors();
  const performers = useMemo(() => buildPerformers(data), [data]);
  if (performers.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle
        title="Player Impact"
        icon={<Shield size={15} color={colors.primary} />}
        actionLabel="Players"
        onAction={onNavigate ? () => onNavigate('players') : undefined}
      />
      <View style={[styles.playersCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {performers.map((player, index) => (
          <View key={player.id} style={[styles.performerRow, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.performerAvatar, { backgroundColor: colors.secondary }]}>
              {player.teamLogo ? <Image source={{ uri: player.teamLogo }} style={styles.performerLogo} resizeMode="contain" /> : null}
            </View>
            <View style={styles.performerInfo}>
              <Text style={[styles.performerName, { color: colors.foreground }]} numberOfLines={1}>
                {player.jersey ? `#${player.jersey} ` : ''}{player.name}
              </Text>
              <Text style={[styles.performerTeam, { color: colors.mutedForeground }]} numberOfLines={1}>{player.teamName}</Text>
            </View>
            <View style={styles.performerTags}>
              {player.tags.slice(0, 3).map((tag) => (
                <View key={`${player.id}-${tag.label}`} style={[styles.performerTag, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.performerTagText, { color: colors.foreground }]}>{tag.value}</Text>
                  <Text style={[styles.performerTagLabel, { color: colors.mutedForeground }]}>{tag.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProbabilityPanel({ data, homeColor, awayColor }: { data: MatchDetail; homeColor: string; awayColor: string }) {
  const colors = useColors();
  const espn = data.gamecast.winProbability;

  // Fall back to an on-device live model when ESPN hasn't published a win
  // probability (true for most soccer fixtures), so every live/finished match
  // still gets a probability bar that updates with the score and clock.
  const model = useMemo(() => {
    if (espn) return null;
    if (!data.isLive && !data.isFinished) return null;
    const minute = parseInt(String(data.displayClock ?? '').match(/\d+/)?.[0] ?? '', 10) || (data.isFinished ? 90 : 0);
    let homeReds = 0, awayReds = 0;
    for (const e of data.events) {
      if (e.type !== 'red-card') continue;
      if (e.teamId && e.teamId === data.awayTeam.id) awayReds++;
      else if (e.teamId && e.teamId === data.homeTeam.id) homeReds++;
    }
    return liveWinProbability({
      homeScore: parseInt(data.homeTeam.score || '0', 10) || 0,
      awayScore: parseInt(data.awayTeam.score || '0', 10) || 0,
      minute,
      homeReds,
      awayReds,
      isFinished: data.isFinished,
      period: data.period,
    });
  }, [espn, data]);

  const source = espn ?? model;
  if (!source) return null;

  const home = source.home ?? 0;
  const away = source.away ?? 0;
  const draw = source.draw ?? Math.max(0, 100 - home - away);
  const isModel = !espn && !!model;

  return (
    <View style={styles.section}>
      <SectionTitle title="Win Probability" icon={<Activity size={15} color={colors.primary} />} />
      <View style={[styles.probCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <View style={styles.probTrack}>
          <View style={{ flex: Math.max(home, 0.1), backgroundColor: homeColor }} />
          {draw > 0 ? <View style={{ flex: Math.max(draw, 0.1), backgroundColor: colors.muted }} /> : null}
          <View style={{ flex: Math.max(away, 0.1), backgroundColor: awayColor }} />
        </View>
        <View style={styles.probLabels}>
          <Text style={[styles.probLabel, { color: colors.foreground }]}>{data.homeTeam.displayName} {home}%</Text>
          {draw > 0 ? <Text style={[styles.probLabel, { color: colors.mutedForeground }]}>Draw {draw}%</Text> : null}
          <Text style={[styles.probLabel, { color: colors.foreground, textAlign: 'right' }]}>{away}% {data.awayTeam.displayName}</Text>
        </View>
        {isModel ? (
          <Text style={[styles.probSource, { color: colors.mutedForeground }]}>
            Live model · updates with score & clock
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function OddsTeam({ label, team }: { label: string; team?: MatchOdds['home'] }) {
  const colors = useColors();
  if (!team) return null;
  const bits = [team.moneyLine, team.spread, team.spreadOdds].filter(Boolean);
  if (bits.length === 0 && !team.favorite) return null;

  return (
    <View style={[styles.oddsTeam, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.oddsTeamName, { color: colors.foreground }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.oddsTeamValue, { color: colors.mutedForeground }]} numberOfLines={1}>
        {bits.join(' · ') || (team.favorite ? 'Favorite' : '—')}
      </Text>
    </View>
  );
}

function OddsEntry({ odds, data, last }: { odds: MatchOdds; data: MatchDetail; last: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.oddsEntry, !last && { borderColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.oddsTop}>
        <Text style={[styles.oddsProvider, { color: colors.foreground }]} numberOfLines={1}>{odds.provider ?? 'ESPN Odds'}</Text>
        {odds.overUnder ? <Text style={[styles.oddsMeta, { color: colors.mutedForeground }]}>O/U {odds.overUnder}</Text> : null}
      </View>
      {odds.details || odds.spread ? (
        <Text style={[styles.oddsDetail, { color: colors.mutedForeground }]} numberOfLines={2}>
          {[odds.details, odds.spread ? `Spread ${odds.spread}` : undefined].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <View style={styles.oddsTeams}>
        <OddsTeam label={data.homeTeam.displayName} team={odds.home} />
        <OddsTeam label={data.awayTeam.displayName} team={odds.away} />
      </View>
    </View>
  );
}

function OddsPanel({ data }: { data: MatchDetail }) {
  const colors = useColors();
  const odds = data.gamecast.odds;

  return (
    <View style={styles.section}>
      <SectionTitle title="Odds" icon={<CircleDollarSign size={15} color={colors.primary} />} />
      <View style={[styles.oddsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {odds.length > 0 ? (
          odds.slice(0, 4).map((entry, index, arr) => (
            <OddsEntry key={`odds-${index}`} odds={entry} data={data} last={index === arr.length - 1} />
          ))
        ) : (
          <View style={styles.emptyOdds}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Odds unavailable</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>ESPN has not published betting lines for this match yet.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PlayRow({ play, last }: { play: MatchCommentaryItem; last: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.playRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.playMinute, { color: play.isKeyEvent ? colors.primary : colors.mutedForeground }]}>{play.minute || '—'}</Text>
      <View style={styles.playBody}>
        {play.title ? <Text style={[styles.playTitle, { color: colors.foreground }]} numberOfLines={1}>{play.title}</Text> : null}
        <Text style={[styles.playText, { color: colors.mutedForeground }]} numberOfLines={3}>{play.text}</Text>
      </View>
    </View>
  );
}

function PlaysPanel({ plays, onNavigate }: { plays: MatchCommentaryItem[]; onNavigate?: (tab: GamecastRoute) => void }) {
  const colors = useColors();
  const visible = plays.filter((play) => play.text).slice(0, 8);
  if (visible.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle
        title="Play By Play"
        icon={<List size={15} color={colors.primary} />}
        actionLabel="Commentary"
        onAction={onNavigate ? () => onNavigate('commentary') : undefined}
      />
      <View style={[styles.playsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {visible.map((play, index) => <PlayRow key={play.id} play={play} last={index === visible.length - 1} />)}
      </View>
    </View>
  );
}

export function GamecastPanel({ data, homeColor, awayColor, onNavigate }: GamecastPanelProps) {
  // No score hero here — the pinned score card above the tabs already shows the
  // scoreline/round/status, so the panel goes straight to the detailed gamecast.
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {data.gamecast.cards.slice(0, 4).map((item) => (
          <GamecastCard key={item.id} item={item} homeColor={homeColor} awayColor={awayColor} />
        ))}
      </View>
      <StatsSnapshot data={data} homeColor={homeColor} awayColor={awayColor} onNavigate={onNavigate} />
      <ShotSummary data={data} onNavigate={onNavigate} />
      <PlayerImpact data={data} onNavigate={onNavigate} />
      <ProbabilityPanel data={data} homeColor={homeColor} awayColor={awayColor} />
      <OddsPanel data={data} />
      <PlaysPanel plays={data.allPlays.length > 0 ? data.allPlays : data.commentary} onNavigate={onNavigate} />
      <PulsePanel data={data} homeColor={homeColor} awayColor={awayColor} onNavigate={onNavigate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 26,
    gap: 18,
  },
  section: { gap: 8 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  sectionHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: font.displaySemi,
    letterSpacing: KICKER_SPACING,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 1, paddingVertical: 2 },
  sectionActionText: { fontSize: 12, fontFamily: font.extrabold },
  heroCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 16,
    gap: 16,
  },
  heroGlowLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '58%' },
  heroGlowRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '58%' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroKicker: { fontSize: 11, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING, flex: 1 },
  heroStatusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroStatusText: { fontSize: 10, fontFamily: font.extrabold, letterSpacing: 0.7 },
  heroScoreboard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTeam: { flex: 1, gap: 5 },
  heroLogoWrap: { width: 44, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  heroLogo: { width: 34, height: 26 },
  heroTeamName: { fontSize: 14, fontFamily: font.extrabold },
  heroTeamCode: { fontSize: 11, fontFamily: font.extrabold, letterSpacing: 1 },
  heroTeamScore: { display: 'none' },
  heroCenter: { alignItems: 'center', minWidth: 104 },
  heroScore: { fontSize: 38, lineHeight: 44, fontFamily: font.displayBold, letterSpacing: -1 },
  heroSub: { fontSize: 11, fontFamily: font.semibold, textAlign: 'center' },
  goalStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  goalStripItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  goalStripText: { flex: 1, fontSize: 13, fontFamily: font.bold },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48.5%',
    minHeight: 118,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  cardLabel: {
    fontSize: 10,
    fontFamily: font.extrabold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  cardValue: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: font.extrabold,
    letterSpacing: -0.2,
  },
  cardDetail: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: font.semibold,
  },
  pulseCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  pulseTimeline: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 6,
    justifyContent: 'flex-end',
  },
  pulseTrackLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    borderRadius: 2,
  },
  pulseTick: {
    position: 'absolute',
    bottom: -1,
    width: StyleSheet.hairlineWidth,
    height: 8,
  },
  pulseTickMid: { left: '42.8%' },
  pulseTickEnd: { right: 0 },
  pulseMarker: {
    position: 'absolute',
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  pulseMarkerCluster: {
    position: 'absolute',
    minWidth: 22,
    height: 16,
    marginLeft: -11,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  pulseMarkerClusterText: {
    fontSize: 9,
    fontFamily: font.extrabold,
    letterSpacing: -0.2,
  },
  pulseLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  pulseLabel: { fontSize: 10, fontFamily: font.semibold, letterSpacing: 0.2 },
  pulseLabelMid: { position: 'absolute', left: '42.8%', marginLeft: -10 },
  pulseDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
  },
  pulseList: {},
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 10,
  },
  pulseMinute: { width: 40, fontSize: 12, fontFamily: font.bold, paddingTop: 1 },
  pulseAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, minHeight: 28 },
  pulseBody: { flex: 1, gap: 2, paddingTop: 1 },
  pulseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pulseTitle: { flex: 1, fontSize: 14, fontFamily: font.bold },
  pulseSubtitle: { fontSize: 12, fontFamily: font.medium },
  pulseCardMark: { width: 9, height: 12, borderRadius: 2 },
  statsCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  statRow: { paddingHorizontal: 14, paddingVertical: 9, gap: 7 },
  statRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statValue: { width: 58, fontSize: 15, fontFamily: font.extrabold },
  statLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: font.extrabold, letterSpacing: 0.5, textTransform: 'uppercase' },
  shotCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 14,
  },
  shotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shotTotal: { fontSize: 34, lineHeight: 38, fontFamily: font.displayBold },
  shotHeaderText: { flex: 1 },
  shotTitle: { fontSize: 15, fontFamily: font.extrabold },
  shotSub: { fontSize: 12, fontFamily: font.semibold, marginTop: 2 },
  shotChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shotChip: { flexGrow: 1, minWidth: '22%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center' },
  shotChipValue: { fontSize: 17, fontFamily: font.extrabold },
  shotChipLabel: { fontSize: 10, fontFamily: font.extrabold, marginTop: 2, textTransform: 'uppercase' },
  playersCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  performerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 11 },
  performerAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  performerLogo: { width: 26, height: 26 },
  performerInfo: { flex: 1 },
  performerName: { fontSize: 14, fontFamily: font.extrabold },
  performerTeam: { fontSize: 12, fontFamily: font.semibold, marginTop: 2 },
  performerTags: { flexDirection: 'row', gap: 5 },
  performerTag: { minWidth: 35, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5, alignItems: 'center' },
  performerTagText: { fontSize: 12, fontFamily: font.extrabold },
  performerTagLabel: { fontSize: 8, fontFamily: font.extrabold, letterSpacing: 0.5 },
  probCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 11,
  },
  probTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  probLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  probLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: font.extrabold,
  },
  probSource: {
    fontSize: 10.5,
    fontFamily: font.medium,
    marginTop: 8,
  },
  oddsCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  oddsEntry: {
    padding: 14,
    gap: 10,
  },
  oddsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  oddsProvider: { flex: 1, fontSize: 15, fontFamily: font.extrabold },
  oddsMeta: { fontSize: 12, fontFamily: font.extrabold },
  oddsDetail: { fontSize: 12, lineHeight: 16, fontFamily: font.semibold },
  oddsTeams: { flexDirection: 'row', gap: 8 },
  oddsTeam: { flex: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  oddsTeamName: { fontSize: 12, fontFamily: font.extrabold },
  oddsTeamValue: { fontSize: 12, fontFamily: font.semibold, marginTop: 2 },
  emptyOdds: { padding: 16, gap: 4 },
  emptyTitle: { fontSize: 15, fontFamily: font.extrabold },
  emptyText: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold },
  playsCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  playRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playMinute: {
    width: 54,
    fontSize: 13,
    fontFamily: font.extrabold,
  },
  playBody: { flex: 1, gap: 3 },
  playTitle: { fontSize: 14, fontFamily: font.extrabold },
  playText: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold },
});
