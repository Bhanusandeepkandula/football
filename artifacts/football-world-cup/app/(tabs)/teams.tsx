import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTeams, EspnFullTeam } from '@/hooks/useWorldCup';
import { Feather } from '@expo/vector-icons';

export default function TeamsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useTeams();
  const [search, setSearch] = useState('');

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
        <Text style={[styles.title, { color: colors.foreground }]}>🌍 Teams</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {allTeams.length} qualified nations
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
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading teams…
          </Text>
        </View>
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
          numColumns={2}
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
  const accent = team.color ? `#${team.color}` : colors.secondary;

  return (
    <View
      style={[
        styles.teamCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: 12,
        },
      ]}
    >
      <View style={[styles.teamCardAccent, { backgroundColor: accent, opacity: 0.15, borderRadius: 12 }]} />
      {logo ? (
        <Image source={{ uri: logo }} style={styles.teamLogo} resizeMode="contain" />
      ) : (
        <View style={[styles.teamLogoPlaceholder, { backgroundColor: colors.muted }]} />
      )}
      <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={2}>
        {team.displayName}
      </Text>
      <Text style={[styles.teamAbbr, { color: colors.mutedForeground }]}>
        {team.abbreviation}
      </Text>
    </View>
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
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
  },
  row: {
    gap: 8,
    marginBottom: 8,
  },
  teamCard: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 130,
  },
  teamCardAccent: {
    ...StyleSheet.absoluteFillObject,
  },
  teamLogo: {
    width: 52,
    height: 52,
    marginBottom: 8,
  },
  teamLogoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    textAlign: 'center',
    lineHeight: 17,
  },
  teamAbbr: {
    fontSize: 11,
    fontFamily: 'Nunito_400Regular',
    marginTop: 2,
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
