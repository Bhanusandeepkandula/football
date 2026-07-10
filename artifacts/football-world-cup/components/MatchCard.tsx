import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Trophy, Star } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useLeague } from '@/hooks/useLeague';
import { useFavorites } from '@/hooks/useFavorites';
import { getLeague } from '@/config/leagues';
import { LeagueLogo } from '@/components/LeagueLogo';
import { matchDetailQueryOptions } from '@/hooks/useMatchDetail';
import {
  EspnEvent,
  getStatusLabel,
  getGroupLabel,
  getResultSuffix,
  getShootoutScore,
  isLive,
  isFinished,
  hasStarted,
} from '@/hooks/useWorldCup';
import { usePolymarketLiveRead } from '@/hooks/usePolymarketLive';
import { liveScoreOverlay } from '@/lib/mergeLiveMatch';
import { isPolymarketLiveFresh, polymarketMatchRefFromEvent } from '@/lib/polymarketLiveStore';
import { font, KICKER_SPACING } from '@/constants/typography';

interface MatchCardProps {
  event: EspnEvent;
  index?: number;
  /** In the aggregated "All leagues" feed, the competition this match belongs
   *  to — so its detail fetch + label use the right league, not the active one. */
  leagueSlug?: string;
}

function MatchCardBase({ event, leagueSlug }: MatchCardProps) {
  const colors = useColors();
  const { league } = useLeague();
  const { isFavoriteMatch, toggleMatch } = useFavorites();
  const fav = isFavoriteMatch(event.id);
  const cardLeague = leagueSlug ? getLeague(leagueSlug) : league;
  // The match's own league — passed to the detail screen as a route param so it
  // fetches the right competition WITHOUT mutating the app-wide active league
  // (a tap in the aggregated "All" feed must not switch the other tabs).
  const detailLeague = leagueSlug ?? league.slug;
  const queryClient = useQueryClient();
  const polyRef = polymarketMatchRefFromEvent(event);
  const polySnap = usePolymarketLiveRead(polyRef);
  const polyFresh = polySnap && isPolymarketLiveFresh(polyRef);
  // Head-start the match-detail fetch the instant the finger lands, before the
  // navigation even commits, so the detail screen has data (or is close) by the
  // time it mounts. prefetchQuery respects staleTime, so repeat taps dedupe.
  const prefetchDetail = useCallback(() => {
    queryClient.prefetchQuery(matchDetailQueryOptions(event.id, detailLeague));
  }, [queryClient, event.id, detailLeague]);
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  const espnLive = isLive(event);
  const espnFinished = isFinished(event);
  const started = hasStarted(event);
  const espnStatusLabel = getStatusLabel(event);
  const overlay = liveScoreOverlay(event, polyFresh ? polySnap : undefined, espnStatusLabel);
  const live = polyFresh ? overlay.isLive : espnLive;
  const finished = polyFresh ? overlay.isFinished : espnFinished;
  const statusLabel = polyFresh ? overlay.statusLabel : espnStatusLabel;
  const groupLabel = getGroupLabel(event) || cardLeague.short;
  const venue = comp?.venue?.fullName ?? '';
  const suffix = getResultSuffix(event);
  const shootout = getShootoutScore(event);

  // Upcoming fixtures can span several days (the "next matches" view), so surface
  // the kickoff date right next to the kickoff time (top-right), not in the footer.
  const kickoff = new Date(event.date);
  const dateLabel = !started && !isNaN(kickoff.getTime())
    ? kickoff.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const footer = venue;

  const homeScore = Number(polyFresh ? overlay.homeScore : (home?.score ?? 0));
  const awayScore = Number(polyFresh ? overlay.awayScore : (away?.score ?? 0));
  // Winner respects a penalty shootout when regulation ended level.
  let homeWinner = false;
  let awayWinner = false;
  if (finished) {
    if (shootout) {
      homeWinner = shootout.home > shootout.away;
      awayWinner = shootout.away > shootout.home;
    } else {
      homeWinner = homeScore > awayScore;
      awayWinner = awayScore > homeScore;
    }
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/match/${event.id}?league=${detailLeague}` as any)}
      onPressIn={prefetchDetail}
      activeOpacity={0.75}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.hairline },
        Platform.OS === 'web'
          ? ({ boxShadow: '0px 2px 10px rgba(0,0,0,0.35)' } as any)
          : undefined,
      ]}
    >
      {/* ── Kicker row: competition · status ─────────────────────── */}
      <View style={styles.kickerRow}>
        <View style={styles.kickerLeft}>
          {/* Competition crest, printed on the card itself. */}
          <LeagueLogo league={cardLeague} size={15} />
          <Text style={[styles.kicker, { color: colors.mutedForeground }]} numberOfLines={1}>
            {groupLabel}
          </Text>
        </View>
        <View style={styles.kickerRight}>
          {live ? (
            <View style={[styles.livePill, { backgroundColor: colors.live }]}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>{statusLabel}</Text>
            </View>
          ) : finished ? (
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
              {suffix ? `FT · ${suffix}` : 'FT'}
            </Text>
          ) : (
            <View style={styles.upcomingStatus}>
              <Text style={[styles.statusText, { color: colors.primary }]}>{statusLabel}</Text>
              {dateLabel ? (
                <Text style={[styles.statusDate, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {dateLabel}
                </Text>
              ) : null}
            </View>
          )}
          {/* Star this fixture → pins it to the Favorites section up top. */}
          <TouchableOpacity
            onPress={() => toggleMatch(event.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={fav ? 'Remove from favourites' : 'Add match to favourites'}
          >
            <Star
              size={16}
              color={fav ? colors.primary : colors.mutedForeground}
              fill={fav ? colors.primary : 'transparent'}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Team rows (fixture-list layout) ──────────────────────── */}
      <TeamRow
        name={home?.team?.displayName ?? ''}
        logo={home?.team?.logo}
        teamId={home?.team?.id}
        leagueSlug={detailLeague}
        score={started ? (polyFresh ? overlay.homeScore : home?.score ?? '0') : undefined}
        shootout={shootout?.home}
        winner={homeWinner}
        dim={finished && !homeWinner}
        colors={colors}
      />
      <View style={[styles.rowDivider, { backgroundColor: colors.separator }]} />
      <TeamRow
        name={away?.team?.displayName ?? ''}
        logo={away?.team?.logo}
        teamId={away?.team?.id}
        leagueSlug={detailLeague}
        score={started ? (polyFresh ? overlay.awayScore : away?.score ?? '0') : undefined}
        shootout={shootout?.away}
        winner={awayWinner}
        dim={finished && !awayWinner}
        colors={colors}
      />

    </TouchableOpacity>
  );
}

// Memoised so the 30s live-score refetch only re-renders cards whose match
// actually changed (react-query's structural sharing keeps unchanged events
// referentially stable) — this is what keeps the list scroll buttery.
export const MatchCard = React.memo(MatchCardBase);

function TeamRow({
  name,
  logo,
  teamId,
  leagueSlug,
  score,
  shootout,
  winner,
  dim,
  colors,
}: {
  name: string;
  logo?: string;
  teamId?: string;
  leagueSlug?: string;
  score?: string;
  shootout?: number;
  winner: boolean;
  dim: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const nameColor = dim ? colors.mutedForeground : colors.foreground;
  const scoreColor = winner ? colors.primary : dim ? colors.mutedForeground : colors.foreground;
  return (
    <View style={styles.teamRow}>
      {/* Tapping the crest/name opens the team as a sheet (separate from the card
          tap, which opens the match). Passes the team's league so the sheet
          fetches the right competition. */}
      <TouchableOpacity
        style={styles.teamTap}
        activeOpacity={0.6}
        disabled={!teamId}
        onPress={() => teamId && router.push(`/team-sheet/${teamId}${leagueSlug ? `?league=${leagueSlug}` : ''}` as any)}
        accessibilityRole="button"
        accessibilityLabel={teamId ? `${name} team profile` : name}
      >
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logo} resizeMode="cover" />
        ) : (
          <View style={[styles.logoPlaceholder, { backgroundColor: colors.muted }]} />
        )}
        <View style={styles.teamNameWrap}>
          <Text style={[styles.teamName, { color: nameColor }]} numberOfLines={1}>
            {name}
          </Text>
          {winner ? (
            <View style={[styles.winnerBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '66' }]}>
              <Trophy size={12} color={colors.primary} fill={colors.primary} strokeWidth={2.4} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
      {score !== undefined ? (
        <View style={styles.scoreWrap}>
          <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
          {shootout !== undefined ? (
            <Text style={[styles.pens, { color: colors.mutedForeground }]}>({shootout})</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const LOGO = 30;

// Fixed card geometry so the home feed's FlatList can use getItemLayout +
// initialScrollIndex (exact, glitch-free "land on today"). height + marginBottom.
export const MATCH_CARD_HEIGHT = 132;
export const MATCH_CARD_TOTAL = MATCH_CARD_HEIGHT + 8;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    height: MATCH_CARD_HEIGHT,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },

  // Kicker
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kickerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, marginRight: 8 },
  kickerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: { width: 3, height: 12 },
  kicker: {
    fontSize: 11,
    fontFamily: font.displayMed,
    letterSpacing: KICKER_SPACING,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 11, fontFamily: font.displaySemi, letterSpacing: 0.8 },
  statusText: { fontSize: 13, fontFamily: font.displayMed, letterSpacing: 0.5 },
  upcomingStatus: { alignItems: 'flex-end' },
  statusDate: { fontSize: 11, fontFamily: font.medium, letterSpacing: 0.2, marginTop: 2 },

  // Team row
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  // Only the crest + name opens the team — it hugs its content (flexShrink, no
  // flexGrow) so the empty space out to the score is NOT part of the tap target.
  teamTap: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
  logoPlaceholder: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
  teamName: {
    flexShrink: 1,
    fontSize: 16,
    fontFamily: font.displayMed,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  teamNameWrap: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  winnerBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  scoreNum: { fontSize: 26, fontFamily: font.displayBold, letterSpacing: 0.5, minWidth: 20, textAlign: 'right' },
  pens: { fontSize: 12, fontFamily: font.semibold },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: LOGO + 12 },

  // Footer
  venueText: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 10,
  },
});
