import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { FootballVideo } from '@/hooks/useFootballVideos';
import { openInApp } from '@/lib/openInApp';
import { font } from '@/constants/typography';

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function VideoCard({ video }: { video: FootballVideo }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => openInApp(video.url)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}
    >
      <View style={styles.thumbWrap}>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.secondary }]} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.playBadge}>
          <Play size={20} color="#fff" fill="#fff" strokeWidth={0} style={{ marginLeft: 2 }} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {[video.channel, relativeTime(video.published)].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  thumbWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  thumb: { width: '100%', height: '100%' },
  playBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  body: { padding: 12, gap: 4 },
  title: { fontSize: 14.5, fontFamily: font.bold, lineHeight: 19 },
  meta: { fontSize: 11.5, fontFamily: font.semibold },
});
