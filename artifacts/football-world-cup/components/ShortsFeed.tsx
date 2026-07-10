import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Dimensions, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Volume2, VolumeX, ExternalLink } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useShortsVideos, FootballVideo } from '@/hooks/useFootballVideos';
import { useShortLikes } from '@/hooks/useFootballShorts';
import { font } from '@/constants/typography';

// Loaded defensively; handle both CJS interop shapes.
let YoutubePlayer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-youtube-iframe');
  YoutubePlayer = mod?.default ?? mod ?? null;
} catch { /* unavailable */ }

const SCREEN_W = Dimensions.get('window').width;
type Colors = ReturnType<typeof useColors>;

export function ShortsFeed() {
  const colors = useColors();
  const { data: videos, isLoading, isError, refetch } = useShortsVideos();
  const { isLiked, toggle } = useShortLikes();
  const [pageH, setPageH] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Start muted so clips autoplay (iOS/browsers only allow muted autoplay); the
  // Sound button unmutes.
  const [muted, setMuted] = useState(true);

  const onViewable = useRef(({ viewableItems }: any) => {
    const first = viewableItems.find((v: any) => v.isViewable);
    if (first?.item?.id) setActiveId(first.item.id);
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const renderItem = useCallback(({ item }: { item: FootballVideo }) => (
    <ShortPage
      video={item}
      height={pageH}
      active={item.id === activeId}
      muted={muted}
      liked={isLiked(item.id)}
      onLike={() => toggle(item.id)}
      onToggleMute={() => setMuted((m) => !m)}
      colors={colors}
    />
  ), [pageH, activeId, muted, isLiked, toggle, colors]);

  if (!YoutubePlayer) {
    return (
      <View style={[styles.notConfig, { backgroundColor: colors.background }]}>
        <ExternalLink size={40} color={colors.mutedForeground} strokeWidth={1.6} />
        <Text style={[styles.ncTitle, { color: colors.foreground }]}>Shorts unavailable</Text>
        <Text style={[styles.ncBody, { color: colors.mutedForeground }]}>
          The video player couldn’t load. Restart the dev server and reload.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setPageH(e.nativeEvent.layout.height)}>
      {isLoading ? (
        <Centered><ActivityIndicator color={colors.primary} /></Centered>
      ) : isError ? (
        <Centered>
          <Text style={styles.dim}>Couldn’t load clips</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retry, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </Centered>
      ) : !videos?.length ? (
        <Centered><Text style={styles.dim}>No clips right now</Text></Centered>
      ) : pageH > 0 ? (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={pageH}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          getItemLayout={(_, i) => ({ length: pageH, offset: pageH * i, index: i })}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
        />
      ) : null}
    </View>
  );
}

function ShortPage({
  video, height, active, muted, liked, onLike, onToggleMute, colors,
}: {
  video: FootballVideo; height: number; active: boolean; muted: boolean; liked: boolean;
  onLike: () => void; onToggleMute: () => void; colors: Colors;
}) {
  const playerRef = useRef<any>(null);
  // Taller player fills more of the page; taps reach it directly so YouTube's
  // play button works (autoplay is unreliable for embeds).
  const vidH = Math.min(height, Math.round(SCREEN_W * 1.15));

  const onState = useCallback((state: string) => {
    if (state === 'ended') { playerRef.current?.seekTo(0, true); }
  }, []);

  return (
    <View style={{ height, width: '100%', backgroundColor: '#000', justifyContent: 'center' }}>
      <View style={{ height: vidH, width: SCREEN_W }}>
        <YoutubePlayer
          ref={playerRef}
          height={vidH}
          width={SCREEN_W}
          play={active}
          mute={muted}
          videoId={video.id}
          onChangeState={onState}
          initialPlayerParams={{ controls: true, modestbranding: true, rel: false, preventFullScreen: true, loop: true }}
          webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
        />
      </View>

      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']} style={styles.scrim} />

      <View pointerEvents="box-none" style={styles.actions}>
        <Action onPress={onLike} label={liked ? 'Liked' : 'Like'}>
          <Heart size={30} color={liked ? '#FF375F' : '#fff'} fill={liked ? '#FF375F' : 'transparent'} strokeWidth={2} />
        </Action>
        <Action onPress={onToggleMute} label={muted ? 'Muted' : 'Sound'}>
          {muted ? <VolumeX size={27} color="#fff" strokeWidth={2} /> : <Volume2 size={27} color="#fff" strokeWidth={2} />}
        </Action>
        <Action onPress={() => Linking.openURL(video.url).catch(() => {})} label="YouTube">
          <ExternalLink size={28} color="#fff" strokeWidth={2} />
        </Action>
      </View>

      <View style={styles.info}>
        <Text style={styles.sub}>{video.channel}</Text>
        <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
      </View>
    </View>
  );
}

function Action({ children, label, onPress }: { children: React.ReactNode; label?: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.action} hitSlop={8}>
      {children}
      {label ? <Text style={styles.actionLabel}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  dim: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontFamily: font.medium },
  retry: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: font.bold },

  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 240 },
  pausedWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pausedBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },

  actions: { position: 'absolute', right: 12, bottom: 104, alignItems: 'center', gap: 22 },
  action: { alignItems: 'center', gap: 4 },
  actionLabel: { color: '#fff', fontSize: 11, fontFamily: font.bold },

  info: { position: 'absolute', left: 16, right: 78, bottom: 34 },
  sub: { color: '#fff', fontSize: 13, fontFamily: font.extrabold, marginBottom: 6, opacity: 0.92 },
  title: { color: '#fff', fontSize: 15, fontFamily: font.semibold, lineHeight: 20 },

  notConfig: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 36 },
  ncTitle: { fontSize: 18, fontFamily: font.displayBold, textAlign: 'center' },
  ncBody: { fontSize: 13.5, fontFamily: font.medium, textAlign: 'center', lineHeight: 20 },
});
