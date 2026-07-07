import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutList, Circle } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useBracket, BracketRound } from '@/hooks/useWorldCup';
import { MatchCard } from '@/components/MatchCard';
import { CircularBracket } from '@/components/CircularBracket';

type ViewMode = 'list' | 'circular';

export default function BracketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useBracket();
  const [activeRound, setActiveRound] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('circular');

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const rounds: BracketRound[] = data?.rounds ?? [];
  const selectedRound = activeRound ?? rounds[0]?.name ?? null;
  const events = rounds.find(r => r.name === selectedRound)?.events ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>🏆 Bracket</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            FIFA World Cup 2026
          </Text>
        </View>

        {/* View mode toggle */}
        {rounds.length > 0 && (
          <View style={[styles.toggleGroup, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setViewMode('circular')}
              style={[styles.toggleBtn, viewMode === 'circular' && { backgroundColor: colors.primary }]}
            >
              <Circle size={16} color={viewMode === 'circular' ? colors.primaryForeground : colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}
            >
              <LayoutList size={16} color={viewMode === 'list' ? colors.primaryForeground : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading bracket…</Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Could not load bracket</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : rounds.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: 52, color: colors.mutedForeground }}>🏟</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Knockout stage not started</Text>
          <Text style={[styles.emptySubtext, { color: colors.mutedForeground }]}>Check back after the group stage</Text>
        </View>
      ) : viewMode === 'circular' ? (
        // ── Circular view ──────────────────────────────────────────────────
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          <Animated.View entering={FadeIn.duration(500)} style={{ paddingHorizontal: 16, paddingTop: 8, gap: 16 }}>
            <CircularBracket rounds={rounds} />

            {/* Round legend */}
            <View style={[styles.legendBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.legendTitle, { color: colors.foreground }]}>Rounds</Text>
              {rounds.map((r, i) => (
                <View key={r.name} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary, opacity: 1 - i * 0.15 }]} />
                  <Text style={[styles.legendName, { color: colors.foreground }]}>{r.name}</Text>
                  <Text style={[styles.legendCount, { color: colors.mutedForeground }]}>
                    {r.events.length} match{r.events.length !== 1 ? 'es' : ''}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>
      ) : (
        // ── List view ──────────────────────────────────────────────────────
        <>
          {/* Round pills */}
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
                    <Text style={[styles.roundPillText, { color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.roundCount, { color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>
                      {item.events.length}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          <FlatList
            data={events}
            keyExtractor={e => e.id}
            renderItem={({ item, index }) => <MatchCard event={item} index={index} />}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 90 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No matches in this round yet</Text>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },

  toggleGroup: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  toggleBtn: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 36,
  },

  roundPills: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  roundPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, gap: 6, marginRight: 8,
  },
  roundPillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  roundCount: { fontSize: 11, fontFamily: 'Inter_700Bold', opacity: 0.7 },

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 32,
  },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 8 },
  emptyText: { fontSize: 16, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  emptySubtext: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  legendBox: {
    borderRadius: 12, borderWidth: 1, padding: 16, gap: 10,
  },
  legendTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  legendCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
