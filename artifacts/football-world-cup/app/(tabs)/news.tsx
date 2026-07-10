import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Newspaper, PlaySquare, MessageSquareText, Clapperboard } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useFootballNews } from '@/hooks/useFootballNews';
import { useFootballVideos } from '@/hooks/useFootballVideos';
import { useFootballPosts } from '@/hooks/useFootballPosts';
import { NewsSection } from '@/components/NewsSection';
import { VideoCard } from '@/components/VideoCard';
import { PostCard } from '@/components/PostCard';
import { ShortsFeed } from '@/components/ShortsFeed';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SettingsButton } from '@/components/SettingsButton';
import { LeagueSwitcher } from '@/components/LeagueSwitcher';
import { Skeleton, SkeletonBox } from '@/components/Skeleton';
import { font, KICKER_SPACING } from '@/constants/typography';

type Tab = 'shorts' | 'posts' | 'articles' | 'videos';

// Shorts is hidden for now — flip to true to bring the swipeable clips tab back
// once a working autoplay video source is wired up.
const SHORTS_ENABLED = false;

const ALL_TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'shorts', label: 'Shorts', Icon: Clapperboard },
  { id: 'posts', label: 'Posts', Icon: MessageSquareText },
  { id: 'articles', label: 'Articles', Icon: Newspaper },
  { id: 'videos', label: 'Videos', Icon: PlaySquare },
];
const TABS = ALL_TABS.filter((t) => SHORTS_ENABLED || t.id !== 'shorts');

export default function NewsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Default to Posts so News is useful in Expo Go; Shorts (native video) is one
  // tap away and shows a "needs dev build" hint until the rebuild.
  const [tab, setTab] = useState<Tab>('posts');
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = insets.bottom + 90;

  const articles = useFootballNews();
  const videos = useFootballVideos();
  const posts = useFootballPosts();

  const active = tab === 'articles' ? articles : tab === 'videos' ? videos : posts;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Masthead */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <LeagueSwitcher />
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>NEWS</Text>
          <View style={{ flex: 1 }} />
          <SettingsButton />
        </View>
      </View>

      {/* Section switcher */}
      <View style={[styles.segmentRow, { borderBottomColor: colors.separator }]}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <TouchableOpacity key={t.id} activeOpacity={0.8} onPress={() => setTab(t.id)} style={styles.segTab}>
              <View style={styles.segInner}>
                <t.Icon size={15} color={on ? colors.primary : colors.mutedForeground} strokeWidth={2.3} />
                <Text style={[styles.segLabel, { color: on ? colors.foreground : colors.mutedForeground }]}>
                  {t.label}
                </Text>
              </View>
              {on ? <View style={[styles.segUnderline, { backgroundColor: colors.primary }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'shorts' ? (
        <ErrorBoundary FallbackComponent={ShortsFallback}>
          <ShortsFeed />
        </ErrorBoundary>
      ) : active.isLoading ? (
        <FeedSkeleton kind={tab} />
      ) : active.isError && !active.data?.length ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Couldn’t load {tab}</Text>
          <TouchableOpacity onPress={() => active.refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : tab === 'articles' ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
            refreshControl={
              <RefreshControl refreshing={articles.isRefetching} onRefresh={articles.refetch} tintColor={colors.primary} />
            }
          >
            <NewsSection news={articles.data ?? []} title="LATEST" max={100} />
          </ScrollView>
        </Animated.View>
      ) : tab === 'videos' ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
          <FlatList
            data={videos.data ?? []}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => <VideoCard video={item} />}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 14 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={videos.isRefetching} onRefresh={videos.refetch} tintColor={colors.primary} />
            }
            ListEmptyComponent={<EmptyFeed label="No videos right now" />}
          />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
          <FlatList
            data={posts.data ?? []}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => <PostCard post={item} />}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, gap: 12 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={posts.isRefetching} onRefresh={posts.refetch} tintColor={colors.primary} />
            }
            ListEmptyComponent={<EmptyFeed label="No posts right now" />}
          />
        </Animated.View>
      )}
    </View>
  );
}

function EmptyFeed({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.centered}>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// Shown if the native video module isn't present (Expo Go before a dev build) —
// keeps the News tab alive instead of the whole app hitting the error boundary.
function ShortsFallback() {
  const colors = useColors();
  return (
    <View style={styles.centered}>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        Shorts needs a dev build (native video). Run “expo run:ios” to enable it.
      </Text>
    </View>
  );
}

function FeedSkeleton({ kind }: { kind: Tab }) {
  if (kind === 'articles') {
    return (
      <Skeleton style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <SkeletonBox style={{ height: 200, borderRadius: 16 }} />
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox key={i} style={{ height: 68, borderRadius: 12 }} />
        ))}
      </Skeleton>
    );
  }
  if (kind === 'videos') {
    return (
      <Skeleton style={{ paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <SkeletonBox key={i} style={{ height: 250, borderRadius: 16 }} />
        ))}
      </Skeleton>
    );
  }
  return (
    <Skeleton style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} style={{ height: 140, borderRadius: 16 }} />
      ))}
    </Skeleton>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  kicker: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  title: { fontSize: 32, fontFamily: font.displayBold, letterSpacing: 0.5 },

  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segTab: { flex: 1, alignItems: 'center' },
  segInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11 },
  segLabel: { fontSize: 13.5, fontFamily: font.bold },
  segUnderline: { height: 2.5, width: '55%', borderRadius: 2, marginTop: -1 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { fontSize: 15, fontFamily: font.medium, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: font.semibold },
});
