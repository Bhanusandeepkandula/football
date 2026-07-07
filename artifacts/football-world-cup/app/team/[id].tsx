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
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronLeft, MapPin, Users, CalendarDays } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useTeamDetail, TeamPlayer, TeamFixture } from '@/hooks/useTeamDetail';

type Tab = 'squad' | 'fixtures';

const POS_ORDER: TeamPlayer['positionGroup'][] = ['GK', 'DF', 'MF', 'FW'];
const POS_LABEL: Record<TeamPlayer['positionGroup'], string> = {
  GK: 'Goalkeepers',
  DF: 'Defenders',
  MF: 'Midfielders',
  FW: 'Forwards',
};

export default function TeamDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('squad');
  const { data, isLoading, isError, refetch } = useTeamDetail(id);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const accent = `#${data?.color ?? '888888'}`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {data?.displayName ?? 'Team'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>Loading team…</Text>
        </View>
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>Failed to load team</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {/* Hero */}
          <Animated.View entering={FadeIn.duration(350)} style={[styles.hero, { backgroundColor: colors.card }]}>
            <View style={[styles.heroAccent, { backgroundColor: accent }]} />
            {data.logo ? (
              <Image source={{ uri: data.logo }} style={styles.heroLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.heroLogo, { backgroundColor: accent, borderRadius: 40 }]} />
            )}
            <Text style={[styles.heroName, { color: colors.foreground }]}>{data.displayName}</Text>
            <View style={styles.heroMetaRow}>
              {data.location ? (
                <View style={styles.metaChip}>
                  <MapPin size={12} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{data.location}</Text>
                </View>
              ) : null}
              {data.coach ? (
                <View style={styles.metaChip}>
                  <Users size={12} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{data.coach}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>

          {/* Tabs */}
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['squad', 'fixtures'] as const).map((t) => {
              const active = tab === t;
              const Icon = t === 'squad' ? Users : CalendarDays;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                >
                  <Icon size={15} color={active ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.tabText, { color: active ? colors.primary : colors.mutedForeground }]}>
                    {t === 'squad' ? `Squad (${data.players.length})` : `Fixtures (${data.fixtures.length})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tab === 'squad' ? (
            <SquadTab players={data.players} accent={accent} colors={colors} />
          ) : (
            <FixturesTab fixtures={data.fixtures} colors={colors} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SquadTab({ players, accent, colors }: {
  players: TeamPlayer[];
  accent: string;
  colors: ReturnType<typeof useColors>;
}) {
  if (players.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>Squad not announced yet</Text>
      </View>
    );
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
            </View>
            {list.map((p, i) => (
              <View key={p.id + i} style={[styles.playerRow, { borderBottomColor: colors.border }]}>
                {p.headshot ? (
                  <Image source={{ uri: p.headshot }} style={[styles.avatar, { borderColor: accent }]} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: accent + '22', borderColor: accent }]}>
                    <Text style={[styles.avatarText, { color: accent }]}>{p.jersey || p.position?.[0] || '?'}</Text>
                  </View>
                )}
                <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
                  {p.displayName}
                </Text>
                {p.age ? <Text style={[styles.playerMeta, { color: colors.mutedForeground }]}>{p.age}y</Text> : null}
                <Text style={[styles.playerPos, { color: colors.mutedForeground }]}>{p.position}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function FixturesTab({ fixtures, colors }: {
  fixtures: TeamFixture[];
  colors: ReturnType<typeof useColors>;
}) {
  if (fixtures.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>No fixtures available</Text>
      </View>
    );
  }
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 16 }}>
      {fixtures.map((f) => {
        const dateStr = new Date(f.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const resultColor = f.completed
          ? f.won ? '#2ECC71' : f.teamScore === f.opponentScore ? colors.mutedForeground : colors.live
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
                <Text style={[styles.fixtureScore, { color: resultColor }]}>
                  {f.teamScore}–{f.opponentScore}
                </Text>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Nunito_700Bold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200, paddingVertical: 40 },
  muted: { fontSize: 14, fontFamily: 'Nunito_400Regular' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },

  hero: {
    marginHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 24,
    overflow: 'hidden',
  },
  heroAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, opacity: 0.9 },
  heroLogo: { width: 80, height: 80, marginBottom: 12 },
  heroName: { fontSize: 22, fontFamily: 'Nunito_800ExtraBold', letterSpacing: -0.5 },
  heroMetaRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontFamily: 'Nunito_500Medium' },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontFamily: 'Nunito_600SemiBold' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontFamily: 'Nunito_700Bold' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5 },
  avatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  playerName: { flex: 1, fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  playerMeta: { fontSize: 12, fontFamily: 'Nunito_400Regular' },
  playerPos: { width: 34, textAlign: 'right', fontSize: 12, fontFamily: 'Nunito_500Medium' },

  fixtureCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  fixtureTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  fixtureRound: { fontSize: 11, fontFamily: 'Nunito_700Bold', flex: 1 },
  fixtureDate: { fontSize: 11, fontFamily: 'Nunito_400Regular' },
  fixtureBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fixtureLogo: { width: 28, height: 28, borderRadius: 14 },
  fixtureOpp: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  fixtureScore: { fontSize: 16, fontFamily: 'Nunito_800ExtraBold' },
});
