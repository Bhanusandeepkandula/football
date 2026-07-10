import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useLeague } from '@/hooks/useLeague';
import { LeagueSwitcher } from '@/components/LeagueSwitcher';
import { useTeams, EspnFullTeam } from '@/hooks/useWorldCup';
import { teamDetailQueryOptions } from '@/hooks/useTeamDetail';
import { Skeleton, SkeletonBox } from '@/components/Skeleton';
import { Feather } from '@expo/vector-icons';

export default function TeamsScreen() {
  const colors = useColors();
  const { league } = useLeague();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useTeams();
  const [search, setSearch] = useState('');
  const teamNoun = league.region === 'International' ? 'nations' : 'clubs';

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const allTeams: EspnFullTeam[] = (data?.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
    (t: { team: EspnFullTeam }) => t.team
  );

  const filtered = search.trim()
    ? allTeams.filter(t =>
        t.displayName?.toLowerCase().includes(search.toLowerCase()) ||
        t.abbreviation?.toLowerCase().includes(search.toLowerCase())
      )
    : allTeams;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <LeagueSwitcher />
        <Text style={[styles.title, { color: colors.foreground }]}>Teams</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {allTeams.length} {teamNoun}
        </Text>
      </View>

      {/* Search */}
      <View style={[styles.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search teams…"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <Skeleton style={{ padding: 12 }}>
          {[0, 1, 2, 3, 4].map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <SkeletonBox style={{ flex: 1, height: 130, borderRadius: 11 }} />
              <SkeletonBox style={{ flex: 1, height: 130, borderRadius: 11 }} />
            </View>
          ))}
        </Skeleton>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load teams
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          numColumns={4}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => <TeamCard team={item} colors={colors} />}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No teams found
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function TeamCard({ team, colors }: { team: EspnFullTeam; colors: ReturnType<typeof useColors> }) {
  const logo = team.logos?.[0]?.href;
  const queryClient = useQueryClient();

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push(`/team/${team.id}` as any)}
      onPressIn={() => queryClient.prefetchQuery(teamDetailQueryOptions(team.id))}
      style={styles.teamCard}
    >
      {/* Soft shadow gives the circle edge definition without a border. */}
      <View style={styles.flagShadow}>
        <View style={[styles.flagRing, { backgroundColor: colors.card }]}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.flag} resizeMode="cover" />
          ) : (
            <View style={[styles.flag, { backgroundColor: colors.muted }]} />
          )}
        </View>
      </View>
      <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={2}>
        {team.displayName}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
  },
  row: {
    gap: 6,
    marginBottom: 14,
  },
  teamCard: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
    paddingVertical: 4,
  },
  flagShadow: {
    borderRadius: 31,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 2px 6px rgba(0,0,0,0.20)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 5,
          elevation: 3,
        }),
  },
  flagRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ESPN flag PNGs are square with transparent padding around a 3:2 flag. Scale
  // up enough that the flag OVER-fills the circle (padding fully cropped, no flat
  // top/bottom edge) so it reads as a true circular flag.
  flag: { width: '100%', height: '100%', transform: [{ scale: 1.72 }] },
  teamName: {
    fontSize: 11.5,
    fontFamily: 'Nunito_600SemiBold',
    textAlign: 'center',
    lineHeight: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    minHeight: 200,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Nunito_500Medium',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Nunito_600SemiBold',
  },
});
