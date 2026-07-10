import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { makeSlideIn } from '@/lib/transitions';
import {
  ChevronLeft, MapPin, Users, CalendarDays, Layers, BarChart2,
  Tv, Goal, Star,
} from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/hooks/useTheme';
import { useFavorites } from '@/hooks/useFavorites';
import {
  useTeamDetail, TeamPlayer, TeamFixture, TeamDetail, GroupRow, FormResult, NextMatch, TeamStats, PlayerLeader,
} from '@/hooks/useTeamDetail';
import { playerDetailQueryOptions } from '@/hooks/usePlayerDetail';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { font, KICKER_SPACING } from '@/constants/typography';

type Colors = ReturnType<typeof useColors>;
type Tab = 'overview' | 'squad' | 'fixtures' | 'stats';
export type TeamViewVariant = 'page' | 'sheet';

const POS_ORDER: TeamPlayer['positionGroup'][] = ['GK', 'DF', 'MF', 'FW'];
const POS_LABEL: Record<TeamPlayer['positionGroup'], string> = {
  GK: 'Goalkeepers', DF: 'Defenders', MF: 'Midfielders', FW: 'Forwards',
};

const WIN = '#30D158';
const LOSS = '#FF453A';

export function TeamDetailView({
  id,
  teamLeague,
  variant = 'page',
}: {
  id: string;
  // Optional league (from an aggregated-feed tap) so the view fetches the right
  // competition without touching the app's active league.
  teamLeague?: string;
  variant?: TeamViewVariant;
}) {
  const colors = useColors();
  const { theme } = useTheme();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const isLight = theme === 'white';
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('overview');
  const { data, isLoading, isError, refetch } = useTeamDetail(id, teamLeague);

  const isSheet = variant === 'sheet';
  // A sheet sits below the status bar (the OS grabber lives up top), so it needs
  // only a small top inset to clear the grabber — the full page pushes under the
  // status bar.
  const topPad = isSheet ? 40 : (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top);
  const accent = `#${data?.color ?? '888888'}`;

  const tabs: { id: Tab; label: string; Icon: any }[] = useMemo(() => {
    const base: { id: Tab; label: string; Icon: any }[] = [
      { id: 'overview', label: 'Overview', Icon: Layers },
      { id: 'squad', label: 'Squad', Icon: Users },
      { id: 'fixtures', label: 'Fixtures', Icon: CalendarDays },
    ];
    if (data?.stats) base.push({ id: 'stats', label: 'Stats', Icon: BarChart2 });
    return base;
  }, [data?.stats]);

  // Swipe left/right to move between tabs (Overview ⇄ Squad ⇄ Fixtures ⇄ Stats),
  // with the incoming tab sliding in from the direction of travel.
  const [dir, setDir] = useState(1);
  const changeTab = useCallback((next: Tab) => {
    if (next === tab) return;
    const ids = tabs.map((t) => t.id);
    setDir(ids.indexOf(next) > ids.indexOf(tab) ? 1 : -1);
    setTab(next);
  }, [tab, tabs]);

  const goRelative = useCallback((step: number) => {
    const ids = tabs.map((t) => t.id);
    const i = ids.indexOf(tab);
    const ni = i + step;
    if (ni >= 0 && ni < ids.length) changeTab(ids[ni]);
  }, [tabs, tab, changeTab]);

  const swipe = useMemo(() => {
    const next = Gesture.Fling().direction(Directions.LEFT).onEnd(() => goRelative(1)).runOnJS(true);
    const prev = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => goRelative(-1)).runOnJS(true);
    return Gesture.Race(next, prev);
  }, [goRelative]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Full-bleed team-colour wash bleeding straight into the page background. */}
      {data ? (
        <LinearGradient
          pointerEvents="none"
          colors={isLight
            ? [accent + '2E', accent + '12', 'transparent']
            : [accent + '5A', accent + '1F', 'transparent']}
          style={[styles.topWash, { height: topPad + 190 }]}
        />
      ) : null}

      {isSheet ? (
        // Sheet: no title bar — the hero row below carries flag + name + star in a
        // single line. Just reserve space so it clears the OS grabber.
        <View style={{ height: topPad }} />
      ) : (
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <ChevronLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {data?.displayName ?? 'Team'}
          </Text>
          <TouchableOpacity
            onPress={() => id && toggleFavorite(id)}
            style={styles.backBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isFavorite(id) ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Star
              size={22}
              color={isFavorite(id) ? colors.primary : colors.mutedForeground}
              fill={isFavorite(id) ? colors.primary : 'transparent'}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <TeamSkeleton colors={colors} />
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>Failed to load team</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {/* Compact, full-bleed hero — logo + identity in a tight horizontal band
              sitting directly on the team-colour wash (no boxed card). */}
          <Animated.View entering={FadeIn.duration(300)} style={[styles.hero, isSheet && styles.heroSheet]}>
            <View style={[styles.heroLogoWrap, { backgroundColor: accent + '1E', borderColor: accent + '55' }]}>
              {data.logo ? (
                <Image source={{ uri: data.logo }} style={styles.heroLogo} resizeMode="contain" />
              ) : (
                <View style={[styles.heroLogo, { backgroundColor: accent, borderRadius: 30 }]} />
              )}
            </View>
            <View style={styles.heroInfo}>
              <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={2}>{data.displayName}</Text>
              {(data.record || data.standingSummary) ? (
                <View style={styles.heroRecordRow}>
                  {data.record ? (
                    <View style={[styles.recordBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
                      <Text style={[styles.recordText, { color: colors.primary }]}>
                        {data.record.w}-{data.record.d}-{data.record.l}
                      </Text>
                    </View>
                  ) : null}
                  {data.standingSummary ? (
                    <Text style={[styles.standingText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {data.standingSummary}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {(data.location || data.coach) ? (
                <View style={styles.heroMetaRow}>
                  {data.location ? (
                    <View style={styles.metaChip}>
                      <MapPin size={12} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{data.location}</Text>
                    </View>
                  ) : null}
                  {data.coach ? (
                    <View style={styles.metaChip}>
                      <Users size={12} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{data.coach}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            {/* Sheet keeps the favourite toggle inline at the row's right edge —
                flag · name · star, all on one line. The page shows it up top. */}
            {isSheet ? (
              <TouchableOpacity
                onPress={() => id && toggleFavorite(id)}
                hitSlop={12}
                style={styles.heroStar}
                accessibilityRole="button"
                accessibilityLabel={isFavorite(id) ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Star
                  size={24}
                  color={isFavorite(id) ? colors.primary : colors.mutedForeground}
                  fill={isFavorite(id) ? colors.primary : 'transparent'}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
            ) : null}
          </Animated.View>

          {/* Tabs */}
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => changeTab(t.id)}
                  style={[styles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                >
                  <t.Icon size={15} color={active ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.tabText, { color: active ? colors.primary : colors.mutedForeground }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <GestureDetector gesture={swipe}>
            <Animated.View key={tab} entering={makeSlideIn(dir)}>
              {tab === 'overview' ? <OverviewTab data={data} accent={accent} colors={colors} />
                : tab === 'squad' ? <SquadTab players={data.players} accent={accent} colors={colors} />
                : tab === 'fixtures' ? <FixturesTab fixtures={data.fixtures} colors={colors} />
                : <StatsTab stats={data.stats} colors={colors} />}
            </Animated.View>
          </GestureDetector>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────
function OverviewTab({ data, accent, colors }: { data: TeamDetail; accent: string; colors: Colors }) {
  return (
    <View style={{ paddingTop: 12, gap: 18 }}>
      {data.recentForm.length > 0 ? <FormStrip form={data.recentForm} colors={colors} /> : null}
      {data.nextMatch ? <NextMatchCard match={data.nextMatch} colors={colors} /> : null}
      {data.stats ? <QuickStats stats={data.stats} colors={colors} /> : null}
      {data.group ? <GroupSnippet group={data.group} accent={accent} colors={colors} /> : null}
      <Leaders leaders={data.leaders} accent={accent} colors={colors} />
    </View>
  );
}

function SectionTitle({ title, colors }: { title: string; colors: Colors }) {
  return <Text style={[styles.sectionKicker, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>;
}

function FormStrip({ form, colors }: { form: FormResult[]; colors: Colors }) {
  return (
    <View style={styles.block}>
      <SectionTitle title="Recent Form" colors={colors} />
      <View style={styles.formRow}>
        {form.map((f) => {
          const bg = f.result === 'W' ? WIN : f.result === 'L' ? LOSS : colors.muted;
          const fg = f.result === 'D' ? colors.foreground : '#fff';
          return (
            <TouchableOpacity
              key={f.matchId}
              activeOpacity={0.8}
              onPress={() => router.push(`/match/${f.matchId}` as any)}
              style={styles.formPill}
            >
              <View style={[styles.formBadge, { backgroundColor: bg }]}>
                <Text style={[styles.formBadgeText, { color: fg }]}>{f.result}</Text>
              </View>
              <Text style={[styles.formOpp, { color: colors.mutedForeground }]} numberOfLines={1}>
                {f.opponentAbbr}
              </Text>
              <Text style={[styles.formScore, { color: colors.foreground }]}>{f.score}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function NextMatchCard({ match, colors }: { match: NextMatch; colors: Colors }) {
  const d = new Date(match.date);
  const dateLabel = isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={styles.block}>
      <SectionTitle title="Next Match" colors={colors} />
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/match/${match.id}` as any)}
        style={[styles.nextCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.nextTop}>
          {match.opponent.logo ? (
            <Image source={{ uri: match.opponent.logo }} style={styles.nextLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.nextLogo, { backgroundColor: colors.muted, borderRadius: 18 }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.nextVs, { color: colors.mutedForeground }]}>{match.isHome ? 'vs' : 'away to'}</Text>
            <Text style={[styles.nextOpp, { color: colors.foreground }]} numberOfLines={1}>{match.opponent.displayName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.nextDate, { color: colors.foreground }]}>{dateLabel}</Text>
            <Text style={[styles.nextTime, { color: colors.primary }]}>{timeLabel}</Text>
          </View>
        </View>
        {(match.venue || match.broadcasts.length > 0) ? (
          <View style={[styles.nextMeta, { borderTopColor: colors.separator }]}>
            {match.venue ? (
              <View style={styles.nextMetaItem}>
                <MapPin size={12} color={colors.mutedForeground} />
                <Text style={[styles.nextMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {[match.venue, match.venueCity].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}
            {match.broadcasts.length > 0 ? (
              <View style={styles.nextMetaItem}>
                <Tv size={12} color={colors.mutedForeground} />
                <Text style={[styles.nextMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {match.broadcasts.join(' / ')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function QuickStats({ stats, colors }: { stats: TeamStats; colors: Colors }) {
  const tiles = [
    { label: 'Goals', value: stats.goals },
    { label: 'On Target', value: stats.shotsOnTarget },
    { label: 'Possession', value: stats.possessionPct ? `${Math.round(Number(stats.possessionPct))}%` : undefined },
    { label: 'Clean Sheets', value: stats.cleanSheets },
  ].filter((t) => t.value != null && t.value !== '');
  if (tiles.length === 0) return null;
  return (
    <View style={styles.block}>
      <SectionTitle title="Quick Stats" colors={colors} />
      <View style={styles.tileRow}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.tileValue, { color: colors.foreground }]}>{t.value}</Text>
            <Text style={[styles.tileLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GroupSnippet({ group, accent, colors }: { group: { name: string; entries: GroupRow[] }; accent: string; colors: Colors }) {
  return (
    <View style={styles.block}>
      <SectionTitle title={group.name} colors={colors} />
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.groupHead, { borderBottomColor: colors.separator }]}>
          <Text style={[styles.groupTeamHead, { color: colors.mutedForeground }]}>TEAM</Text>
          {['GP', 'W', 'D', 'L', 'GD', 'P'].map((h) => (
            <Text key={h} style={[styles.groupCol, { color: colors.mutedForeground }]}>{h}</Text>
          ))}
        </View>
        {group.entries.map((e, i) => (
          <View
            key={e.teamId + i}
            style={[
              styles.groupRow,
              e.isMe && { backgroundColor: accent + '18' },
              i < group.entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
            ]}
          >
            <View style={styles.groupTeamCell}>
              <View style={[styles.groupRank, { backgroundColor: e.advanced ? WIN + '33' : colors.muted }]}>
                <Text style={[styles.groupRankText, { color: e.advanced ? WIN : colors.mutedForeground }]}>{e.rank || i + 1}</Text>
              </View>
              {e.logo ? <Image source={{ uri: e.logo }} style={styles.groupLogo} resizeMode="cover" /> : null}
              <Text style={[styles.groupTeam, { color: colors.foreground, fontFamily: e.isMe ? font.extrabold : font.semibold }]} numberOfLines={1}>
                {e.displayName}
              </Text>
            </View>
            <Text style={[styles.groupCol, { color: colors.mutedForeground }]}>{e.gp}</Text>
            <Text style={[styles.groupCol, { color: colors.mutedForeground }]}>{e.w}</Text>
            <Text style={[styles.groupCol, { color: colors.mutedForeground }]}>{e.d}</Text>
            <Text style={[styles.groupCol, { color: colors.mutedForeground }]}>{e.l}</Text>
            <Text style={[styles.groupCol, { color: colors.mutedForeground }]}>{e.gd}</Text>
            <Text style={[styles.groupCol, { color: colors.foreground, fontFamily: font.extrabold }]}>{e.points}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Leaders({ leaders, accent, colors }: { leaders: TeamDetail['leaders']; accent: string; colors: Colors }) {
  const qc = useQueryClient();
  const cards: { title: string; leader: PlayerLeader; unit: string }[] = [];
  if (leaders.topScorer) cards.push({ title: 'Top Scorer', leader: leaders.topScorer, unit: leaders.topScorer.value === 1 ? 'goal' : 'goals' });
  if (leaders.topAssist) cards.push({ title: 'Most Assists', leader: leaders.topAssist, unit: leaders.topAssist.value === 1 ? 'assist' : 'assists' });
  if (cards.length === 0) return null;
  return (
    <View style={styles.block}>
      <SectionTitle title="Team Leaders" colors={colors} />
      <View style={styles.leaderRow}>
        {cards.map((c) => (
          <TouchableOpacity
            key={c.title}
            activeOpacity={0.75}
            onPress={() => c.leader.id && router.push(`/player/${c.leader.id}` as any)}
            onPressIn={() => c.leader.id && qc.prefetchQuery(playerDetailQueryOptions(c.leader.id))}
            style={[styles.leaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.leaderTitle, { color: colors.mutedForeground }]}>{c.title.toUpperCase()}</Text>
            <View style={styles.leaderBody}>
              <PlayerAvatar
                id={c.leader.id}
                name={c.leader.displayName}
                headshot={c.leader.headshot}
                size={42}
                fallback={c.leader.displayName?.[0]?.toUpperCase() ?? '?'}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.leaderName, { color: colors.foreground }]} numberOfLines={1}>{c.leader.displayName}</Text>
                <Text style={[styles.leaderValue, { color: colors.primary }]}>{c.leader.value} {c.unit}</Text>
              </View>
              <Goal size={18} color={accent} fill={accent} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Squad ──────────────────────────────────────────────────────────────────
function SquadTab({ players, accent, colors }: { players: TeamPlayer[]; accent: string; colors: Colors }) {
  const qc = useQueryClient();
  if (players.length === 0) {
    return <View style={styles.centered}><Text style={[styles.muted, { color: colors.mutedForeground }]}>Squad not announced yet</Text></View>;
  }
  return (
    <View style={{ paddingTop: 4 }}>
      {POS_ORDER.map((group) => {
        const list = players.filter((p) => p.positionGroup === group);
        if (list.length === 0) return null;
        return (
          <View key={group} style={{ marginBottom: 8 }}>
            <View style={[styles.sectionHeader, { backgroundColor: colors.secondary }]}>
              <View style={[styles.sectionDot, { backgroundColor: accent }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{POS_LABEL[group]}</Text>
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{list.length}</Text>
            </View>
            {list.map((p, i) => (
              <TouchableOpacity
                key={p.id + i}
                activeOpacity={0.65}
                onPress={() => p.id && router.push(`/player/${p.id}` as any)}
                onPressIn={() => p.id && qc.prefetchQuery(playerDetailQueryOptions(p.id))}
                style={[styles.playerRow, { borderBottomColor: colors.border }]}
              >
                <PlayerAvatar
                  id={p.id}
                  name={p.displayName}
                  headshot={p.headshot}
                  size={38}
                  fallback={p.jersey || p.position?.[0] || '?'}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>{p.displayName}</Text>
                  <View style={styles.playerChips}>
                    <Text style={[styles.playerMeta, { color: colors.mutedForeground }]}>
                      {[p.position, p.age ? `${p.age}y` : null, p.height, p.citizenship].filter(Boolean).join(' · ')}
                    </Text>
                    {p.goals ? <StatChip label="G" value={p.goals} colors={colors} /> : null}
                    {p.assists ? <StatChip label="A" value={p.assists} colors={colors} /> : null}
                    {p.saves ? <StatChip label="SV" value={p.saves} colors={colors} /> : null}
                  </View>
                </View>
                {p.jersey ? <Text style={[styles.jersey, { color: colors.mutedForeground }]}>#{p.jersey}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function StatChip({ label, value, colors }: { label: string; value: number; colors: Colors }) {
  return (
    <Text style={[styles.statChip, { color: colors.mutedForeground }]}>
      <Text style={{ color: colors.foreground, fontFamily: font.extrabold }}>{value}</Text> {label}
    </Text>
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function FixturesTab({ fixtures, colors }: { fixtures: TeamFixture[]; colors: Colors }) {
  if (fixtures.length === 0) {
    return <View style={styles.centered}><Text style={[styles.muted, { color: colors.mutedForeground }]}>No fixtures available</Text></View>;
  }
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 16 }}>
      {fixtures.map((f) => {
        const dateStr = new Date(f.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const resultColor = f.completed
          ? f.won ? WIN : f.teamScore === f.opponentScore ? colors.mutedForeground : LOSS
          : colors.mutedForeground;
        return (
          <TouchableOpacity
            key={f.id}
            activeOpacity={0.7}
            onPress={() => router.push(`/match/${f.id}` as any)}
            style={[styles.fixtureCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.fixtureTop}>
              <Text style={[styles.fixtureRound, { color: colors.primary }]} numberOfLines={1}>
                {f.roundLabel || (f.isHome ? 'Home' : 'Away')}
              </Text>
              <Text style={[styles.fixtureDate, { color: colors.mutedForeground }]}>{dateStr}</Text>
            </View>
            <View style={styles.fixtureBody}>
              {f.opponent.logo ? (
                <Image source={{ uri: f.opponent.logo }} style={styles.fixtureLogo} resizeMode="contain" />
              ) : (
                <View style={[styles.fixtureLogo, { backgroundColor: colors.muted, borderRadius: 14 }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.fixtureOpp, { color: colors.foreground }]} numberOfLines={1}>
                  {f.isHome ? 'vs ' : '@ '}{f.opponent.displayName || f.opponent.abbr}
                </Text>
              </View>
              {f.completed ? (
                <Text style={[styles.fixtureScore, { color: resultColor }]}>{f.teamScore}–{f.opponentScore}</Text>
              ) : (
                <Text style={[styles.fixtureScore, { color: colors.mutedForeground }]}>{f.statusDetail}</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function StatsTab({ stats, colors }: { stats: TeamStats | null; colors: Colors }) {
  if (!stats) {
    return <View style={styles.centered}><Text style={[styles.muted, { color: colors.mutedForeground }]}>Stats not available</Text></View>;
  }
  const sections: { title: string; rows: { label: string; value?: string }[] }[] = [
    { title: 'Attack', rows: [
      { label: 'Goals', value: stats.goals },
      { label: 'Shots', value: stats.shots },
      { label: 'Shots on Target', value: stats.shotsOnTarget },
      { label: 'Assists', value: stats.assists },
    ] },
    { title: 'Possession', rows: [
      { label: 'Possession', value: stats.possessionPct ? `${Math.round(Number(stats.possessionPct))}%` : undefined },
      { label: 'Accurate Passes', value: stats.accuratePasses },
    ] },
    { title: 'Defense', rows: [
      { label: 'Clean Sheets', value: stats.cleanSheets },
      { label: 'Goals Conceded', value: stats.goalsConceded },
      { label: 'Tackles', value: stats.tackles },
      { label: 'Interceptions', value: stats.interceptions },
    ] },
    { title: 'Discipline', rows: [
      { label: 'Fouls', value: stats.fouls },
      { label: 'Yellow Cards', value: stats.yellows },
      { label: 'Red Cards', value: stats.reds },
    ] },
  ];
  return (
    <View style={{ paddingTop: 12, gap: 18 }}>
      {sections.map((sec) => {
        const rows = sec.rows.filter((r) => r.value != null && r.value !== '');
        if (rows.length === 0) return null;
        return (
          <View key={sec.title} style={styles.block}>
            <SectionTitle title={sec.title} colors={colors} />
            <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {rows.map((r, i) => (
                <View
                  key={r.label}
                  style={[styles.statsRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}
                >
                  <Text style={[styles.statsLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                  <Text style={[styles.statsValue, { color: colors.foreground }]}>{r.value}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function TeamSkeleton({ colors }: { colors: Colors }) {
  return (
    <View style={{ paddingTop: 8 }}>
      <View style={styles.hero}>
        <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.card }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 22, width: '70%', borderRadius: 7, backgroundColor: colors.card }} />
          <View style={{ height: 14, width: '45%', borderRadius: 6, backgroundColor: colors.card }} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ height: 60, borderRadius: 14, backgroundColor: colors.card }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heroStar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: font.displaySemi, letterSpacing: 0.4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200, paddingVertical: 40 },
  muted: { fontSize: 14, fontFamily: 'Nunito_400Regular' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },

  topWash: { position: 'absolute', top: 0, left: 0, right: 0 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  heroSheet: { paddingTop: 30 },
  heroLogoWrap: { width: 68, height: 68, borderRadius: 34, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  heroLogo: { width: 48, height: 48 },
  heroInfo: { flex: 1, minWidth: 0, gap: 7 },
  heroName: { fontSize: 24, fontFamily: font.displayBold, letterSpacing: 0, lineHeight: 27 },
  heroRecordRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recordBadge: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 3 },
  recordText: { fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.5 },
  standingText: { fontSize: 12, fontFamily: font.semibold, flexShrink: 1 },
  heroMetaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { fontSize: 12, fontFamily: 'Nunito_500Medium', flexShrink: 1 },

  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginTop: 6, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontFamily: font.semibold },

  block: { paddingHorizontal: 16 },
  sectionKicker: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING, marginBottom: 8, paddingLeft: 2 },

  // Form
  formRow: { flexDirection: 'row', gap: 8 },
  formPill: { flex: 1, alignItems: 'center', gap: 4 },
  formBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formBadgeText: { fontSize: 13, fontFamily: font.extrabold },
  formOpp: { fontSize: 10, fontFamily: font.bold, letterSpacing: 0.3 },
  formScore: { fontSize: 11, fontFamily: font.semibold },

  // Next match
  nextCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  nextTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextLogo: { width: 40, height: 40 },
  nextVs: { fontSize: 11, fontFamily: font.semibold },
  nextOpp: { fontSize: 17, fontFamily: font.extrabold, marginTop: 1 },
  nextDate: { fontSize: 13, fontFamily: font.bold },
  nextTime: { fontSize: 13, fontFamily: font.extrabold, marginTop: 1 },
  nextMeta: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  nextMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nextMetaText: { fontSize: 12, fontFamily: font.medium, flex: 1 },

  // Quick stats
  tileRow: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12, alignItems: 'center', gap: 3 },
  tileValue: { fontSize: 20, fontFamily: font.displayBold },
  tileLabel: { fontSize: 10, fontFamily: font.bold, letterSpacing: 0.3, textTransform: 'uppercase' },

  // Group table
  groupCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  groupTeamHead: { flex: 1, fontSize: 10, fontFamily: font.bold, letterSpacing: 0.5 },
  groupRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  groupTeamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  groupRank: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  groupRankText: { fontSize: 11, fontFamily: font.extrabold },
  groupLogo: { width: 20, height: 20, borderRadius: 10 },
  groupTeam: { flex: 1, fontSize: 13 },
  groupCol: { width: 26, textAlign: 'center', fontSize: 12, fontFamily: font.semibold },

  // Leaders
  leaderRow: { gap: 8 },
  leaderCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 13, gap: 8 },
  leaderTitle: { fontSize: 10, fontFamily: font.bold, letterSpacing: 0.6 },
  leaderBody: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  leaderAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5 },
  leaderName: { fontSize: 15, fontFamily: font.bold },
  leaderValue: { fontSize: 13, fontFamily: font.extrabold, marginTop: 1 },

  // Squad
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { flex: 1, fontSize: 13, fontFamily: font.bold },
  sectionCount: { fontSize: 12, fontFamily: font.extrabold },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5 },
  avatarPlaceholder: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontFamily: font.bold },
  playerName: { fontSize: 14, fontFamily: font.bold },
  playerChips: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' },
  playerMeta: { fontSize: 12, fontFamily: 'Nunito_500Medium' },
  statChip: { fontSize: 11, fontFamily: font.semibold },
  jersey: { fontSize: 13, fontFamily: font.extrabold },

  // Fixtures
  fixtureCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 8 },
  fixtureTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  fixtureRound: { fontSize: 11, fontFamily: font.bold, flex: 1 },
  fixtureDate: { fontSize: 11, fontFamily: 'Nunito_400Regular' },
  fixtureBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fixtureLogo: { width: 28, height: 28, borderRadius: 14 },
  fixtureOpp: { fontSize: 14, fontFamily: font.semibold },
  fixtureScore: { fontSize: 16, fontFamily: font.extrabold },

  // Stats
  statsCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  statsLabel: { fontSize: 14, fontFamily: font.medium },
  statsValue: { fontSize: 15, fontFamily: font.extrabold },
});
