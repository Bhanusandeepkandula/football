import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBracket, BracketRound } from '@/hooks/useWorldCup';
import { MatchCard } from '@/components/MatchCard';

export default function BracketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useBracket();
  const [activeRound, setActiveRound] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const rounds: BracketRound[] = data?.rounds ?? [];
  const selectedRound = activeRound ?? rounds[0]?.name ?? null;
  const events = rounds.find(r => r.name === selectedRound)?.events ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>🏆 Knockout Bracket</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          FIFA World Cup 2026
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading bracket…
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load bracket
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : rounds.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, color: colors.mutedForeground }}>🏟</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Knockout stage not started yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.mutedForeground }]}>
            Check back after the group stage
          </Text>
        </View>
      ) : (
        <>
          {/* Round selector */}
          <View>
            <FlatList
              data={rounds}
              keyExtractor={r => r.name}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roundPills}
              renderItem={({ item }) => {
                const isActive = item.name === selectedRound;
                return (
                  <TouchableOpacity
                    onPress={() => setActiveRound(item.name)}
                    style={[
                      styles.roundPill,
                      {
                        backgroundColor: isActive ? colors.primary : colors.secondary,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roundPillText,
                        { color: isActive ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[
                        styles.roundCount,
                        { color: isActive ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      {item.events.length}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* Matches for selected round */}
          <FlatList
            data={events}
            keyExtractor={e => e.id}
            renderItem={({ item }) => <MatchCard event={item} />}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 90 }}
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
                  No matches in this round yet
                </Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  roundPills: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  roundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    marginRight: 8,
  },
  roundPillText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  roundCount: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    opacity: 0.7,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
