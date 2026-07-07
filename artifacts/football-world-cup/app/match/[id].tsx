import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  ChevronLeft,
  MapPin,
  Users,
  BarChart2,
  List,
  Layers,
  Trophy,
  Clock,
  Building2,
  Flag,
  Goal,
  LayoutGrid,
} from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useMatchDetail, MatchPlayer, MatchEvent } from '@/hooks/useMatchDetail';
import { FormationPitch } from '@/components/FormationPitch';
import { MatchTimeline } from '@/components/MatchTimeline';
import { EventsTimeline } from '@/components/EventsTimeline';
import { StatsBar } from '@/components/StatsBar';
import { SegmentedControl } from '@/components/SegmentedControl';

type Tab = 'overview' | 'lineups' | 'stats' | 'events';

const TABS = [
  { id: 'overview', label: 'Overview', Icon: Layers },
  { id: 'lineups', label: 'Lineups', Icon: Users },
  { id: 'stats', label: 'Stats', Icon: BarChart2 },
  { id: 'events', label: 'Events', Icon: List },
];

function formatKickoff(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export default function MatchDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { data, isLoading, isError, refetch } = useMatchDetail(id);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const homeColor = `#${data?.homeTeam?.color ?? '003DA5'}`;
  const awayColor = `#${data?.awayTeam?.color ?? 'C8102E'}`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header bar */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={26} color={colors.foreground} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Match Centre</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading match…</Text>
        </View>
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Failed to load match</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {/* Score hero */}
          <Animated.View entering={FadeIn.duration(400)} style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            {data.round ? (
              <Text style={[styles.roundText, { color: colors.mutedForeground }]}>{data.round.toUpperCase()}</Text>
            ) : null}

            {/* Status */}
            <View style={styles.heroStatus}>
              {data.isLive ? (
                <View style={[styles.livePill, { backgroundColor: colors.live }]}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>{data.statusDetail}</Text>
                </View>
              ) : (
                <Text style={[styles.statusText, { color: data.isFinished ? colors.mutedForeground : colors.primary }]}>
                  {data.isFinished ? 'Full Time' : data.statusDetail}
                </Text>
              )}
            </View>

            {/* Teams + score */}
            <View style={styles.scoreRow}>
              <TeamHero
                name={data.homeTeam.displayName}
                logo={data.homeTeam.logo}
                color={homeColor}
                winner={data.isFinished && Number(data.homeTeam.score) > Number(data.awayTeam.score)}
              />
              <View style={styles.scoreCenter}>
                <Text style={[styles.scoreBig, { color: colors.foreground }]}>{data.homeTeam.score}</Text>
                <Text style={[styles.scoreSep, { color: colors.mutedForeground }]}>–</Text>
                <Text style={[styles.scoreBig, { color: colors.foreground }]}>{data.awayTeam.score}</Text>
              </View>
              <TeamHero
                name={data.awayTeam.displayName}
                logo={data.awayTeam.logo}
                color={awayColor}
                winner={data.isFinished && Number(data.awayTeam.score) > Number(data.homeTeam.score)}
              />
            </View>

            {/* Color bar */}
            <View style={styles.colorBar}>
              <View style={[styles.colorBarSeg, { backgroundColor: homeColor }]} />
              <View style={[styles.colorBarSeg, { backgroundColor: awayColor }]} />
            </View>
          </Animated.View>

          {/* Tab selector (iOS segmented control) */}
          <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.tabBarWrap}>
            <SegmentedControl
              segments={TABS}
              value={activeTab}
              onChange={(t) => setActiveTab(t as Tab)}
            />
          </Animated.View>

          {/* Tab content */}
          <Animated.View key={activeTab} entering={FadeInDown.delay(40).duration(300)}>
            {activeTab === 'overview' && (
              <OverviewTab data={data} homeColor={homeColor} awayColor={awayColor} colors={colors} />
            )}
            {activeTab === 'lineups' && (
              <LineupsTab lineups={data.lineups} homeColor={homeColor} awayColor={awayColor} colors={colors} />
            )}
            {activeTab === 'stats' && (
              <StatsBar stats={data.stats} homeColor={homeColor} awayColor={awayColor} />
            )}
            {activeTab === 'events' && (
              <View style={{ paddingTop: 14 }}>
                <EventsTimeline
                  events={data.events}
                  homeTeam={data.homeTeam}
                  awayTeam={data.awayTeam}
                />
              </View>
            )}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Team hero block ──────────────────────────────────────────────────────────

function TeamHero({ name, logo, color, winner }: {
  name: string; logo: string; color: string; winner?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.teamHero}>
      {logo ? (
        <Image source={{ uri: logo }} style={styles.teamHeroLogo} resizeMode="contain" />
      ) : (
        <View style={[styles.teamHeroLogoPlaceholder, { backgroundColor: color }]} />
      )}
      <Text style={[styles.teamHeroName, { color: colors.foreground }]} numberOfLines={2}>
        {name}
      </Text>
      {winner ? (
        <View style={styles.winnerRow}>
          <Trophy size={11} color={colors.primary} fill={colors.primary} />
          <Text style={[styles.winnerText, { color: colors.primary }]}>WINNER</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, homeColor, awayColor, colors }: {
  data: ReturnType<typeof useMatchDetail>['data'] & {};
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  if (!data) return null;
  const goals = data.events.filter((e) => e.type === 'goal');
  const cards = data.events.filter((e) => e.type === 'yellow-card' || e.type === 'red-card');
  const homeGoals = goals.filter((g) => g.teamId === data.homeTeam.id);
  const awayGoals = goals.filter((g) => g.teamId === data.awayTeam.id);

  const info: { Icon: any; label: string; value: string }[] = [];
  if (data.round) info.push({ Icon: Trophy, label: 'Competition', value: data.round });
  const kickoff = formatKickoff(data.date);
  if (kickoff) info.push({ Icon: Clock, label: 'Kick-off', value: kickoff });
  if (data.venue) info.push({ Icon: MapPin, label: 'Stadium', value: data.venue });
  if (data.city) info.push({ Icon: Building2, label: 'City', value: data.city });
  if (data.referee) info.push({ Icon: Flag, label: 'Referee', value: data.referee });
  if (data.attendance) info.push({ Icon: Users, label: 'Attendance', value: data.attendance.toLocaleString('en-US') });

  return (
    <View style={{ paddingTop: 12 }}>
      {/* Goals summary */}
      {goals.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Goals" colors={colors} />
          <View style={[styles.goalsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <View style={styles.goalsCol}>
              {homeGoals.map((g, i) => (
                <ScorerRow key={g.id + i} event={g} colors={colors} tint={homeColor} align="left" />
              ))}
              {homeGoals.length === 0 ? <Text style={[styles.noScorer, { color: colors.mutedForeground }]}>—</Text> : null}
            </View>
            <View style={[styles.goalsDivider, { backgroundColor: colors.separator }]} />
            <View style={styles.goalsCol}>
              {awayGoals.map((g, i) => (
                <ScorerRow key={g.id + i} event={g} colors={colors} tint={awayColor} align="right" />
              ))}
              {awayGoals.length === 0 ? <Text style={[styles.noScorer, { color: colors.mutedForeground, textAlign: 'right' }]}>—</Text> : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* Match info grouped list */}
      {info.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Match Info" colors={colors} />
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            {info.map((row, i) => (
              <View
                key={row.label}
                style={[
                  styles.infoRow,
                  i < info.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                ]}
              >
                <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
                  <row.Icon size={15} color={colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Key events */}
      <View style={styles.section}>
        <SectionHeader title="Key Events" colors={colors} />
        <MatchTimeline
          events={[...goals, ...cards].sort((a, b) => (parseInt(a.clock) || 0) - (parseInt(b.clock) || 0))}
          homeTeamId={data.homeTeam.id}
        />
      </View>
    </View>
  );
}

function ScorerRow({ event, colors, tint, align }: {
  event: MatchEvent; colors: ReturnType<typeof useColors>; tint: string; align: 'left' | 'right';
}) {
  const name = event.playerName || event.text.split(' – ')[0];
  return (
    <View style={[styles.scorerRow, align === 'right' && { flexDirection: 'row-reverse' }]}>
      <Goal size={13} color={colors.primary} fill={colors.primary} />
      <Text style={[styles.scorerName, { color: colors.foreground }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.scorerMin, { color: colors.mutedForeground }]}>{event.clock}′</Text>
    </View>
  );
}

// ─── Lineups tab ──────────────────────────────────────────────────────────────

function LineupsTab({ lineups, homeColor, awayColor, colors }: {
  lineups: any;
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  const [view, setView] = useState<'pitch' | 'list'>('pitch');

  if (!lineups) {
    return (
      <View style={styles.centered}>
        <Users size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Lineups not announced yet
        </Text>
      </View>
    );
  }

  const [home, away] = lineups;

  return (
    <View style={{ paddingTop: 14 }}>
      {/* View toggle */}
      <View style={styles.toggleRow}>
        <SegmentedControl
          compact
          segments={[
            { id: 'pitch', label: 'Formation', Icon: LayoutGrid },
            { id: 'list', label: 'List', Icon: List },
          ]}
          value={view}
          onChange={(v) => setView(v as 'pitch' | 'list')}
        />
      </View>

      {view === 'pitch' ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <FormationPitch home={home} away={away} />
        </View>
      ) : (
        <View style={{ paddingTop: 10 }}>
          <PlayerListSection title={`${home.team.displayName} · Starting XI`} players={home.starters} color={homeColor} colors={colors} />
          <PlayerListSection title={`${away.team.displayName} · Starting XI`} players={away.starters} color={awayColor} colors={colors} />
          <PlayerListSection title={`${home.team.displayName} · Bench`} players={home.bench} color={homeColor} colors={colors} isBench />
          <PlayerListSection title={`${away.team.displayName} · Bench`} players={away.bench} color={awayColor} colors={colors} isBench />
        </View>
      )}
    </View>
  );
}

function PlayerListSection({ title, players, color, colors, isBench }: {
  title: string;
  players: MatchPlayer[];
  color: string;
  colors: ReturnType<typeof useColors>;
  isBench?: boolean;
}) {
  if (players.length === 0) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.playerSectionHeader}>
        <View style={[styles.playerSectionDot, { backgroundColor: color }]} />
        <Text style={[styles.playerSectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      </View>
      <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {players.map((p, i) => (
          <View
            key={p.id + i}
            style={[
              styles.playerRow,
              i < players.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
            ]}
          >
            {p.headshot ? (
              <Image source={{ uri: p.headshot }} style={[styles.playerAvatar, { borderColor: color }]} resizeMode="cover" />
            ) : (
              <View style={[styles.playerAvatarPlaceholder, { backgroundColor: isBench ? colors.muted : color + '33', borderColor: color }]}>
                <Text style={[styles.playerAvatarText, { color: isBench ? colors.mutedForeground : color }]}>
                  {p.jersey || p.positionGroup[0]}
                </Text>
              </View>
            )}
            <View style={styles.playerInfo}>
              <Text style={[styles.nameCell, { color: colors.foreground }]} numberOfLines={1}>{p.displayName}</Text>
              <Text style={[styles.posCell, { color: colors.mutedForeground }]}>{p.position}</Text>
            </View>
            {p.stats['goals'] && p.stats['goals'] !== '0' ? (
              <View style={styles.playerBadgeRow}>
                <Goal size={13} color={colors.primary} fill={colors.primary} />
                {Number(p.stats['goals']) > 1 ? (
                  <Text style={[styles.statBadge, { color: colors.primary }]}>{p.stats['goals']}</Text>
                ) : null}
              </View>
            ) : null}
            {p.stats['yellowCards'] && p.stats['yellowCards'] !== '0' ? (
              <View style={[styles.cardIndicator, { backgroundColor: '#F5A623' }]} />
            ) : null}
            {p.stats['redCards'] && p.stats['redCards'] !== '0' ? (
              <View style={[styles.cardIndicator, { backgroundColor: '#E74C3C' }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Nunito_700Bold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200, paddingVertical: 40 },
  loadingText: { fontSize: 14, fontFamily: 'Nunito_400Regular', marginTop: 8 },
  errorText: { fontSize: 15, fontFamily: 'Nunito_400Regular' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Nunito_400Regular', textAlign: 'center', marginTop: 8 },

  // Hero
  hero: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  roundText: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 1.2,
    paddingTop: 14,
  },
  heroStatus: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  livePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 12, fontFamily: 'Nunito_700Bold' },
  statusText: { fontSize: 13, fontFamily: 'Nunito_600SemiBold' },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8 },
  teamHero: { flex: 1, alignItems: 'center', gap: 8 },
  teamHeroLogo: { width: 60, height: 60, borderRadius: 30 },
  teamHeroLogoPlaceholder: { width: 60, height: 60, borderRadius: 30 },
  teamHeroName: { fontSize: 14, fontFamily: 'Nunito_700Bold', textAlign: 'center' },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  winnerText: { fontSize: 10, fontFamily: 'Nunito_700Bold', letterSpacing: 0.5 },
  scoreCenter: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 8 },
  scoreBig: { fontSize: 44, fontFamily: 'Nunito_800ExtraBold', lineHeight: 50 },
  scoreSep: { fontSize: 26, fontFamily: 'Nunito_400Regular', paddingHorizontal: 2 },

  colorBar: { flexDirection: 'row', height: 4 },
  colorBarSeg: { flex: 1 },

  // Tabs
  tabBarWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.6,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  // Goals card
  goalsCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  goalsCol: { flex: 1, gap: 8, justifyContent: 'center' },
  goalsDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  scorerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scorerName: { flexShrink: 1, fontSize: 13, fontFamily: 'Nunito_600SemiBold' },
  scorerMin: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  noScorer: { fontSize: 14, fontFamily: 'Nunito_400Regular' },

  // Info card
  infoCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  infoIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 14, fontFamily: 'Nunito_500Medium' },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: 'Nunito_600SemiBold' },

  // Toggle
  toggleRow: { paddingHorizontal: 16 },

  // Player list
  playerSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  playerSectionDot: { width: 8, height: 8, borderRadius: 4 },
  playerSectionTitle: { fontSize: 12, fontFamily: 'Nunito_700Bold', letterSpacing: 0.6, flexShrink: 1 },
  playerCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  playerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5 },
  playerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  playerAvatarText: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  playerInfo: { flex: 1 },
  posCell: { fontSize: 11, fontFamily: 'Nunito_400Regular', marginTop: 1 },
  nameCell: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  playerBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statBadge: { fontSize: 13, fontFamily: 'Nunito_700Bold' },
  cardIndicator: { width: 11, height: 15, borderRadius: 2, marginLeft: 2 },
});
