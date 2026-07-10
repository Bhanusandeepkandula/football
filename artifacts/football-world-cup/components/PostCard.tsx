import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Heart, Repeat2, MessageCircle } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { FootballPost } from '@/hooks/useFootballPosts';
import { openInApp } from '@/lib/openInApp';
import { font } from '@/constants/typography';

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function compact(n?: number): string {
  if (!n || n < 1) return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

const SOURCE_COLOR: Record<FootballPost['source'], string> = {
  Mastodon: '#6364FF',
  Bluesky: '#1185FE',
};

export function PostCard({ post }: { post: FootballPost }) {
  const colors = useColors();
  const initial = (post.author || '?').trim().charAt(0).toUpperCase();
  const badge = SOURCE_COLOR[post.source];

  return (
    <TouchableOpacity
      activeOpacity={post.url ? 0.85 : 1}
      onPress={() => openInApp(post.url)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}
    >
      <View style={styles.head}>
        {post.avatar ? (
          <Image source={{ uri: post.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>{initial}</Text>
          </View>
        )}
        <View style={styles.identity}>
          <Text style={[styles.author, { color: colors.foreground }]} numberOfLines={1}>
            {post.author}
          </Text>
          <Text style={[styles.handle, { color: colors.mutedForeground }]} numberOfLines={1}>
            {post.handle} · {relativeTime(post.createdAt)}
          </Text>
        </View>
        <View style={[styles.sourcePill, { backgroundColor: badge + '22', borderColor: badge + '55' }]}>
          <Text style={[styles.sourceText, { color: badge }]}>{post.source}</Text>
        </View>
      </View>

      <Text style={[styles.text, { color: colors.foreground }]}>{post.text}</Text>

      {post.image ? (
        <Image source={{ uri: post.image }} style={[styles.media, { backgroundColor: colors.secondary }]} resizeMode="cover" />
      ) : null}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <MessageCircle size={14} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{compact(post.replies)}</Text>
        </View>
        <View style={styles.stat}>
          <Repeat2 size={15} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{compact(post.reshares)}</Text>
        </View>
        <View style={styles.stat}>
          <Heart size={13.5} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.statText, { color: colors.mutedForeground }]}>{compact(post.likes)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontFamily: font.extrabold },
  identity: { flex: 1, gap: 1 },
  author: { fontSize: 14.5, fontFamily: font.extrabold },
  handle: { fontSize: 12, fontFamily: font.medium },
  sourcePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  sourceText: { fontSize: 10, fontFamily: font.extrabold, letterSpacing: 0.3 },
  text: { fontSize: 14.5, fontFamily: font.medium, lineHeight: 20.5 },
  media: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
  stats: { flexDirection: 'row', gap: 22, marginTop: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontSize: 12, fontFamily: font.semibold, minWidth: 8 },
});
