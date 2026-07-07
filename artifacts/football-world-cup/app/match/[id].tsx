import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  FlatList,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ChevronLeft, MapPin, Calendar, Users, BarChart2, List, Layers } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useMatchDetail, MatchPlayer } from '@/hooks/useMatchDetail';
import { FormationPitch } from '@/components/FormationPitch';
import { MatchTimeline } from '@/components/MatchTimeline';
import { StatsBar } from '@/components/StatsBar';

type Tab = 'overview' | 'lineups' | 'stats' | 'events';

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'overview', label: 'Overview', Icon: Layers },
  { id: 'lineups', label: 'Lineups', Icon: Users },
  { id: 'stats', label: 'Stats', Icon: BarChart2 },
  { id: 'events', label: 'Events', Icon: List },
];

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { data, isLoading, isError, refetch } = useMatchDetail(id ?? '');

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const homeColor = `#${data?.homeTeam?.color ?? '003DA5'}`;
  const awayColor = `#${data?.awayTeam?.color ?? 'C8102E'}`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header bar */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={24} color={colors.foreground} />
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
          <Animated.View entering={FadeIn.duration(400)} style={[styles.hero, { backgroundColor: colors.card }]}>
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
                <Text style={[styles.scoreBig, { color: colors.foreground }]}>
                  {data.homeTeam.score}
                </Text>
                <Text style={[styles.scoreSep, { color: colors.mutedForeground }]}>–</Text>
                <Text style={[styles.scoreBig, { color: colors.foreground }]}>
                  {data.awayTeam.score}
                </Text>
              </View>
              <TeamHero
                name={data.awayTeam.displayName}
                logo={data.awayTeam.logo}
                color={awayColor}
                winner={data.isFinished && Number(data.awayTeam.score) > Number(data.homeTeam.score)}
                right
              />
            </View>

            {/* Venue */}
            {data.venue ? (
              <View style={styles.venueRow}>
                <MapPin size={12} color={colors.mutedForeground} />
                <Text style={[styles.venueText, { color: colors.mutedForeground }]}>
                  {data.venue}{data.city ? `, ${data.city}` : ''}
                </Text>
              </View>
            ) : null}

            {/* Color bar */}
            <View style={styles.colorBar}>
              <View style={[styles.colorBarHome, { backgroundColor: homeColor }]} />
              <View style={[styles.colorBarAway, { backgroundColor: awayColor }]} />
            </View>
          </Animated.View>

          {/* Tab selector */}
          <Animated.View entering={FadeInDown.delay(100).duration(350)} style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {TABS.map(({ id: tabId, label, Icon }) => {
              const isActive = activeTab === tabId;
              return (
                <TouchableOpacity
                  key={tabId}
                  onPress={() => setActiveTab(tabId)}
                  style={[styles.tab, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                >
                  <Icon size={14} color={isActive ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.tabText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Tab content */}
          <Animated.View key={activeTab} entering={FadeInDown.delay(50).duration(300)}>
            {activeTab === 'overview' && (
              <OverviewTab
                events={data.events}
                homeTeamId={data.homeTeam.id}
                homeColor={homeColor}
                awayColor={awayColor}
                colors={colors}
              />
            )}
            {activeTab === 'lineups' && (
              <LineupsTab
                lineups={data.lineups}
                homeColor={homeColor}
                awayColor={awayColor}
                colors={colors}
              />
            )}
            {activeTab === 'stats' && (
              <StatsBar
                stats={data.stats}
                homeColor={homeColor}
                awayColor={awayColor}
              />
            )}
            {activeTab === 'events' && (
              <MatchTimeline
                events={data.events}
                homeTeamId={data.homeTeam.id}
                awayTeamId={data.awayTeam.id}
              />
            )}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Team hero block ──────────────────────────────────────────────────────────

function TeamHero({ name, logo, color, winner, right }: {
  name: string; logo: string; color: string; winner?: boolean; right?: boolean;
}) {
  return (
    <View style={[styles.teamHero, right && styles.teamHeroRight]}>
      {logo ? (
        <Image source={{ uri: logo }} style={styles.teamHeroLogo} resizeMode="contain" />
      ) : (
        <View style={[styles.teamHeroLogoPlaceholder, { backgroundColor: color }]} />
      )}
      <Text style={[styles.teamHeroName, { color: '#fff' }]} numberOfLines={2}>
        {name}
      </Text>
      {winner && <Text style={{ color: '#F5A623', fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 2 }}>WINNER ★</Text>}
    </View>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ events, homeTeamId, homeColor, awayColor, colors }: {
  events: any[];
  homeTeamId: string;
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  const goals = events.filter(e => e.type === 'goal');
  const cards = events.filter(e => e.type === 'yellow-card' || e.type === 'red-card');

  return (
    <View style={{ paddingTop: 8 }}>
      <SectionHeader title="Key Events" colors={colors} />
      <MatchTimeline events={[...goals, ...cards].sort((a, b) => {
        const ac = parseInt(a.clock) || 0;
        const bc = parseInt(b.clock) || 0;
        return ac - bc;
      })} homeTeamId={homeTeamId} />
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
    <View style={{ paddingTop: 8 }}>
      {/* View toggle */}
      <View style={[styles.toggleRow]}>
        {(['pitch', 'list'] as const).map(v => (
          <TouchableOpacity
            key={v}
            onPress={() => setView(v)}
            style={[styles.togglePill, {
              backgroundColor: view === v ? colors.primary : colors.secondary,
              borderColor: view === v ? colors.primary : colors.border,
            }]}
          >
            <Text style={[styles.toggleText, { color: view === v ? colors.primaryForeground : colors.mutedForeground }]}>
              {v === 'pitch' ? '⚽ Formation' : '📋 List'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'pitch' ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <FormationPitch home={home} away={away} />
        </View>
      ) : (
        <View style={{ paddingTop: 8 }}>
          <PlayerListSection title={`${home.team.displayName} Starting XI`} players={home.starters} color={homeColor} colors={colors} />
          <PlayerListSection title={`${away.team.displayName} Starting XI`} players={away.starters} color={awayColor} colors={colors} />
          <PlayerListSection title={`${home.team.displayName} Bench`} players={home.bench} color={homeColor} colors={colors} isBench />
          <PlayerListSection title={`${away.team.displayName} Bench`} players={away.bench} color={awayColor} colors={colors} isBench />
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
    <View style={{ marginBottom: 12 }}>
      <View style={[styles.playerSectionHeader, { backgroundColor: colors.secondary }]}>
        <View style={[styles.playerSectionDot, { backgroundColor: color }]} />
        <Text style={[styles.playerSectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {players.map((p, i) => (
        <View key={p.id + i} style={[styles.playerRow, { borderBottomColor: colors.border }]}>
          {/* Headshot or jersey-colored avatar */}
          {p.headshot ? (
            <Image
              source={{ uri: p.headshot }}
              style={[styles.playerAvatar, { borderColor: color }]}
              resizeMode="cover"
            />
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
            <Text style={[styles.statBadge, { color: colors.primary }]}>⚽ {p.stats['goals']}</Text>
          ) : null}
          {p.stats['yellowCards'] && p.stats['yellowCards'] !== '0' ? (
            <View style={styles.cardBadge}>
              <View style={[styles.cardIndicator, { backgroundColor: '#F5A623' }]} />
            </View>
          ) : null}
          {p.stats['redCards'] && p.stats['redCards'] !== '0' ? (
            <View style={styles.cardBadge}>
              <View style={[styles.cardIndicator, { backgroundColor: '#E74C3C' }]} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 200,
    paddingVertical: 40,
  },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 8 },
  errorText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8 },

  // Hero
  hero: {
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 16,
    overflow: 'hidden',
    paddingBottom: 0,
  },
  heroStatus: { alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_700Bold' },
  statusText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  teamHero: { flex: 1, alignItems: 'center', gap: 6 },
  teamHeroRight: { alignItems: 'center' },
  teamHeroLogo: { width: 56, height: 56, borderRadius: 28 },
  teamHeroLogoPlaceholder: { width: 56, height: 56, borderRadius: 28 },
  teamHeroName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  scoreCenter: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 8 },
  scoreBig: { fontSize: 40, fontFamily: 'Inter_700Bold', lineHeight: 48 },
  scoreSep: { fontSize: 28, fontFamily: 'Inter_400Regular', paddingHorizontal: 4 },

  venueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingBottom: 12 },
  venueText: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  colorBar: { flexDirection: 'row', height: 4 },
  colorBarHome: { flex: 1 },
  colorBarAway: { flex: 1 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Toggle
  toggleRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  togglePill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  toggleText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // Player list
  playerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  playerSectionDot: { width: 8, height: 8, borderRadius: 4 },
  playerSectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  playerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  playerInfo: { flex: 1 },
  jerseyCell: { width: 26, fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  posCell: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  nameCell: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  statBadge: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardBadge: { marginLeft: 2 },
  cardIndicator: { width: 10, height: 14, borderRadius: 2 },

  // Section header
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
});
