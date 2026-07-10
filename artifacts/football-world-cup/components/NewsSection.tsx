import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Newspaper, ArrowUpRight } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { MatchNewsArticle } from '@/hooks/useMatchDetail';
import { openInApp } from '@/lib/openInApp';
import { font, KICKER_SPACING } from '@/constants/typography';

interface NewsSectionProps {
  news: MatchNewsArticle[];
  title?: string;
  /** How many rows to show below the feature card. */
  max?: number;
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function openArticle(link?: string) {
  openInApp(link);
}

function FeatureCard({ article }: { article: MatchNewsArticle }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => openArticle(article.link)}
      style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.hairline }]}
    >
      {article.image ? (
        <Image source={{ uri: article.image }} style={styles.featureImage} resizeMode="cover" />
      ) : (
        <View style={[styles.featureImage, styles.featurePlaceholder, { backgroundColor: colors.secondary }]}>
          <Newspaper size={30} color={colors.mutedForeground} strokeWidth={1.8} />
        </View>
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.42)', 'transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.32, 0.58, 1]}
        style={styles.featureScrim}
      />
      <View style={styles.featureBody}>
        {article.category ? (
          <View style={[styles.tag, { backgroundColor: colors.primary }]}>
            <Text style={[styles.tagText, { color: colors.primaryForeground }]} numberOfLines={1}>
              {article.category.toUpperCase()}
            </Text>
          </View>
        ) : null}
        <Text style={styles.featureHeadline} numberOfLines={3}>{article.headline}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText} numberOfLines={1}>
            {[article.byline, relativeTime(article.published)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function NewsRow({ article, last }: { article: MatchNewsArticle; last: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => openArticle(article.link)}
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      {article.image ? (
        <Image source={{ uri: article.image }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.secondary }]}>
          <Newspaper size={18} color={colors.mutedForeground} strokeWidth={1.8} />
        </View>
      )}
      <View style={styles.rowCopy}>
        <Text style={[styles.rowHeadline, { color: colors.foreground }]} numberOfLines={2}>
          {article.headline}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {[article.category, relativeTime(article.published)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ArrowUpRight size={16} color={colors.mutedForeground} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

export function NewsSection({ news, title = 'LATEST NEWS', max = 6 }: NewsSectionProps) {
  const colors = useColors();
  if (!news || news.length === 0) return null;

  const [feature, ...rest] = news;
  const carousel = rest.slice(0, max);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.mutedForeground }]}>{title}</Text>
        <View style={[styles.count, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>{news.length}</Text>
        </View>
      </View>

      <View style={styles.featureWrap}>
        <FeatureCard article={feature} />
      </View>

      {carousel.length > 0 ? (
        <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
          {carousel.map((a, i) => (
            <NewsRow key={a.id} article={a} last={i === carousel.length - 1} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  kicker: {
    fontSize: 13,
    fontFamily: font.displaySemi,
    letterSpacing: KICKER_SPACING,
  },
  count: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  countText: { fontSize: 11, fontFamily: font.extrabold },

  featureWrap: { paddingHorizontal: 16, marginBottom: 12 },
  feature: {
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 200,
  },
  featureImage: { width: '100%', height: 200 },
  featurePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  featureScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  featureBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    gap: 7,
  },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 9, fontFamily: font.extrabold, letterSpacing: 0.6 },
  featureHeadline: {
    color: '#fff',
    fontSize: 18,
    fontFamily: font.displaySemi,
    lineHeight: 22,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaText: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontFamily: font.semibold },

  list: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 3 },
  rowHeadline: { fontSize: 14, fontFamily: font.bold, lineHeight: 18 },
  rowMeta: { fontSize: 11, fontFamily: font.medium },
});
