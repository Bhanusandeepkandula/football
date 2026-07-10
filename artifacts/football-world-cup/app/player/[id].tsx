import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Shirt } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/hooks/useTheme';
import { usePlayerDetail, PlayerBio, PlayerStats } from '@/hooks/usePlayerDetail';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { font, KICKER_SPACING } from '@/constants/typography';

// Which totals to surface as headline tiles (only those present in the stat set
// render). Ordered by general interest; goalkeeper stats appear for keepers.
const HEADLINE_STATS = [
  { key: 'totalGoals', label: 'Goals' },
  { key: 'goalAssists', label: 'Assists' },
  { key: 'totalShots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'On Target' },
  { key: 'starts', label: 'Starts' },
  { key: 'saves', label: 'Saves' },
  { key: 'cleanSheet', label: 'Clean Sheets' },
  { key: 'goalsConceded', label: 'Conceded' },
  { key: 'yellowCards', label: 'Yellows' },
  { key: 'redCards', label: 'Reds' },
  { key: 'foulsCommitted', label: 'Fouls' },
  { key: 'offsides', label: 'Offsides' },
];

export default function PlayerSheet() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const colors = useColors();
  const { theme } = useTheme();
  const isLight = theme === 'white';
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = usePlayerDetail(id);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Accent gradient bleeding in from the top — matches the other pages. */}
      <LinearGradient
        pointerEvents="none"
        colors={isLight
          ? [colors.primary + '2A', colors.primary + '0C', 'transparent']
          : [colors.primary + '40', colors.primary + '14', 'transparent']}
        style={styles.topWash}
      />

      {/* Grabber sits above (native sheet); a Done button for clarity. */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={[styles.closeBtn, { backgroundColor: colors.scrim }]}>
          <X size={18} color={colors.foreground} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>Couldn’t load player</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 28 }}>
          <Hero bio={data.bio} colors={colors} />
          {data.bio.club ? <ClubCard club={data.bio.club} colors={colors} /> : null}
          <BioGrid bio={data.bio} colors={colors} />
          {data.stats ? <StatsBlock stats={data.stats} colors={colors} /> : null}
          {data.teamHistory.length > 0 ? <CareerBlock history={data.teamHistory} colors={colors} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

function Hero({ bio, colors }: { bio: PlayerBio; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.hero}>
      <View style={styles.avatarWrap}>
        <PlayerAvatar
          id={bio.id}
          name={bio.fullName ?? bio.displayName}
          headshot={bio.headshot}
          club={bio.club?.name}
          size={96}
          fallback={bio.jersey ? `#${bio.jersey}` : '—'}
          borderColor={colors.hairline}
        />
        {bio.flag ? <Image source={{ uri: bio.flag }} style={[styles.flagBadge, { borderColor: colors.background }]} /> : null}
      </View>
      <Text style={[styles.name, { color: colors.foreground }]}>{bio.displayName}</Text>
      <View style={styles.subRow}>
        {bio.position ? (
          <View style={[styles.posPill, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
            <Text style={[styles.posText, { color: colors.primary }]}>{bio.position.toUpperCase()}</Text>
          </View>
        ) : null}
        {bio.jersey ? <Text style={[styles.subMeta, { color: colors.mutedForeground }]}>#{bio.jersey}</Text> : null}
        {bio.citizenship ? <Text style={[styles.subMeta, { color: colors.mutedForeground }]}>{bio.citizenship}</Text> : null}
      </View>
    </View>
  );
}

function ClubCard({ club, colors }: { club: NonNullable<PlayerBio['club']>; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <SectionKicker title="Club" colors={colors} />
      <View style={[styles.clubCard, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
        {club.logo ? (
          <Image source={{ uri: club.logo }} style={styles.clubLogo} resizeMode="contain" />
        ) : (
          <View style={[styles.clubLogo, styles.clubLogoFallback, { backgroundColor: colors.secondary }]}>
            <Shirt size={20} color={colors.mutedForeground} strokeWidth={2} />
          </View>
        )}
        <Text style={[styles.clubName, { color: colors.foreground }]} numberOfLines={1}>{club.name}</Text>
      </View>
    </View>
  );
}

function BioGrid({ bio, colors }: { bio: PlayerBio; colors: ReturnType<typeof useColors> }) {
  const rows: { label: string; value?: string }[] = [
    { label: 'Age', value: bio.age != null ? String(bio.age) : undefined },
    { label: 'Born', value: bio.dob },
    { label: 'Height', value: bio.height },
    { label: 'Weight', value: bio.weight },
    { label: 'Nationality', value: bio.citizenship },
    { label: 'Birthplace', value: bio.birthPlace },
    { label: 'Status', value: bio.status },
  ].filter((r) => r.value);
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionKicker title="Profile" colors={colors} />
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={[styles.infoRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}
          >
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatsBlock({ stats, colors }: { stats: PlayerStats; colors: ReturnType<typeof useColors> }) {
  const tiles = HEADLINE_STATS
    .map((h) => {
      const idx = stats.keys.indexOf(h.key);
      return idx >= 0 ? { label: h.label, value: stats.totals[idx] ?? '0' } : null;
    })
    .filter(Boolean) as { label: string; value: string }[];

  return (
    <View style={styles.section}>
      <SectionKicker title="Statistics" colors={colors} />

      {tiles.length > 0 ? (
        <View style={styles.tileRow}>
          {tiles.slice(0, 6).map((t) => (
            <View key={t.label} style={[styles.tile, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '2E' }]}>
              <Text style={[styles.tileValue, { color: colors.primary }]}>{t.value}</Text>
              <Text style={[styles.tileLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{t.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Per-competition breakdown (horizontal scroll for the full stat set). */}
      {stats.splits.length > 0 ? (
        <View style={[styles.tableWrap, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.tRow, styles.tHeadRow, { borderBottomColor: colors.separator }]}>
                <Text style={[styles.tComp, styles.tHead, { color: colors.mutedForeground }]}>COMPETITION</Text>
                {stats.shortLabels.map((l, i) => (
                  <Text key={i} style={[styles.tStat, styles.tHead, { color: colors.mutedForeground }]}>{l}</Text>
                ))}
              </View>
              {stats.splits.map((s, ri) => (
                <View key={ri} style={[styles.tRow, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.tComp, { color: colors.foreground }]} numberOfLines={1}>{s.competition}</Text>
                  {s.stats.map((v, ci) => (
                    <Text key={ci} style={[styles.tStat, { color: colors.mutedForeground }]}>{v}</Text>
                  ))}
                </View>
              ))}
              <View style={[styles.tRow, { backgroundColor: colors.rowShade }]}>
                <Text style={[styles.tComp, { color: colors.foreground, fontFamily: font.extrabold }]}>Total</Text>
                {stats.totals.map((v, ci) => (
                  <Text key={ci} style={[styles.tStat, { color: colors.foreground, fontFamily: font.extrabold }]}>{v}</Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function CareerBlock({ history, colors }: { history: { id: string; displayName: string; logo?: string; seasons?: string }[]; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <SectionKicker title="Career" colors={colors} />
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
        {history.map((t, i) => (
          <View
            key={t.id + i}
            style={[styles.careerRow, i < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}
          >
            {t.logo ? (
              <Image source={{ uri: t.logo }} style={styles.careerLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.careerLogo, { backgroundColor: colors.secondary, borderRadius: 11 }]} />
            )}
            <Text style={[styles.careerName, { color: colors.foreground }]} numberOfLines={1}>{t.displayName}</Text>
            {t.seasons ? <Text style={[styles.careerSeasons, { color: colors.mutedForeground }]} numberOfLines={1}>{t.seasons}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function SectionKicker({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  return <Text style={[styles.kicker, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 230 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40, minHeight: 240 },
  muted: { fontSize: 15, fontFamily: font.medium },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: font.semibold },

  // Hero
  hero: { alignItems: 'center', paddingTop: 18, paddingBottom: 14, paddingHorizontal: 20 },
  avatarWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  flagBadge: { position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  name: { fontSize: 24, fontFamily: font.displayBold, letterSpacing: 0.2, marginTop: 12, textAlign: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  posPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  posText: { fontSize: 11, fontFamily: font.extrabold, letterSpacing: 0.6 },
  subMeta: { fontSize: 13, fontFamily: font.semibold },

  section: { paddingHorizontal: 16, marginTop: 16 },
  kicker: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING, marginBottom: 8, paddingLeft: 2 },

  // Club
  clubCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  clubLogo: { width: 34, height: 34 },
  clubLogoFallback: { alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  clubName: { flex: 1, fontSize: 16, fontFamily: font.bold },

  // Info / profile
  infoCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  infoLabel: { flex: 1, fontSize: 13.5, fontFamily: font.medium },
  infoValue: { fontSize: 14, fontFamily: font.bold, maxWidth: '62%' },

  // Stat tiles (wrapping grid — 3 per row)
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginBottom: 10 },
  tile: { width: '31.5%', borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', gap: 3 },
  tileValue: { fontSize: 22, fontFamily: font.displayBold },
  tileLabel: { fontSize: 9, fontFamily: font.extrabold, letterSpacing: 0.3 },

  // Stat table
  tableWrap: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  tHeadRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  tHead: { fontFamily: font.bold, fontSize: 10.5, letterSpacing: 0.3 },
  tComp: { width: 168, fontSize: 12.5, fontFamily: font.semibold },
  tStat: { width: 40, textAlign: 'center', fontSize: 12.5, fontFamily: font.medium },

  // Career
  careerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 11 },
  careerLogo: { width: 22, height: 22 },
  careerName: { flex: 1, fontSize: 14.5, fontFamily: font.bold },
  careerSeasons: { fontSize: 12, fontFamily: font.medium },
});
