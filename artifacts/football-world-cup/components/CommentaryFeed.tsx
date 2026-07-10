import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, LayoutChangeEvent } from 'react-native';
import { CircleDot, Goal, Square, ArrowDown, ArrowUp } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { MatchCommentaryItem, MatchCommentaryPlayer } from '@/hooks/useMatchDetail';
import { getActiveSlug } from '@/lib/espn';
import { font } from '@/constants/typography';

interface CommentaryFeedProps {
  eventId: string;
  /** The match's competition slug (for jersey image URLs), if known. */
  leagueSlug?: string;
  commentary: MatchCommentaryItem[];
  allPlays: MatchCommentaryItem[];
  homeLogo?: string;
  awayLogo?: string;
  homeColor: string;
  awayColor: string;
  mode: CommentaryMode;
  activeIndex: number;
  onModeChange: (mode: CommentaryMode) => void;
  onActiveIndexChange: (index: number) => void;
  onContainerLayout?: (y: number) => void;
  onRowLayout?: (index: number, y: number) => void;
}

export type CommentaryMode = 'commentary' | 'all' | 'key';

export const COMMENTARY_MODES: { id: CommentaryMode; label: string }[] = [
  { id: 'commentary', label: 'Commentary' },
  { id: 'all', label: 'All Plays' },
  { id: 'key', label: 'Key Events' },
];

export function commentaryRowsForMode(
  commentary: MatchCommentaryItem[],
  allPlays: MatchCommentaryItem[],
  mode: CommentaryMode,
): { recap?: MatchCommentaryItem; rows: MatchCommentaryItem[] } {
  const keyEvents = commentary.filter((item) => item.isKeyEvent && (item.title || item.players.length > 0));
  const selected = mode === 'all' ? allPlays : mode === 'key' ? keyEvents : commentary;
  const recap = mode === 'commentary' && selected[0] && !selected[0].minute && !selected[0].title && selected[0].text.length > 120
    ? selected[0]
    : undefined;
  return { recap, rows: recap ? selected.slice(1) : selected };
}

function playerIcon(player: MatchCommentaryPlayer, color: string) {
  const icon = `${player.iconType ?? ''} ${player.role ?? ''}`.toLowerCase();
  if (icon.includes('subin') || icon.includes('subbed-in')) return <ArrowUp size={13} color="#fff" strokeWidth={3} />;
  if (icon.includes('subout') || icon.includes('subbed-out')) return <ArrowDown size={13} color="#fff" strokeWidth={3} />;
  if (icon.includes('yellow')) return <Square size={13} color="#FFD60A" fill="#FFD60A" strokeWidth={2} />;
  if (icon.includes('goal') || icon.includes('scorer')) return <Goal size={13} color={color} fill={color} strokeWidth={2.2} />;
  return <CircleDot size={12} color={color} strokeWidth={2.2} />;
}

function PlayerChip({
  player,
  eventId,
  leagueSlug,
  accent,
}: {
  player: MatchCommentaryPlayer;
  eventId: string;
  leagueSlug?: string;
  accent: string;
}) {
  const colors = useColors();
  const jersey = player.id
    ? `https://stitcher.espn.com/sports/soccer/leagues/${leagueSlug ?? getActiveSlug()}/events/${eventId}/athletes/${player.id}/jersey.png?darkMode=true`
    : undefined;

  return (
    <View style={[styles.playerChip, { backgroundColor: colors.secondary }]}>
      <View style={styles.jerseyWrap}>
        {jersey ? <Image source={{ uri: jersey }} style={styles.jersey} resizeMode="contain" /> : null}
        <View style={[styles.playerBadge, { backgroundColor: colors.background, borderColor: colors.hairline }]}>
          {playerIcon(player, accent)}
        </View>
      </View>
      <View style={styles.playerCopy}>
        <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
          {player.shortName}
        </Text>
        {player.position ? (
          <Text style={[styles.playerPosition, { color: colors.mutedForeground }]} numberOfLines={1}>
            {player.position}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EventIcon({ item, color }: { item: MatchCommentaryItem; color: string }) {
  const title = `${item.title ?? ''} ${item.text}`.toLowerCase();
  if (title.includes('goal')) return <Goal size={18} color={color} fill={color} strokeWidth={2.2} />;
  if (title.includes('yellow')) return <Square size={17} color="#FFD60A" fill="#FFD60A" strokeWidth={2} />;
  if (title.includes('red')) return <Square size={17} color="#FF453A" fill="#FF453A" strokeWidth={2} />;
  if (title.includes('substitution')) return <ArrowUp size={18} color="#30D158" strokeWidth={2.8} />;
  return <CircleDot size={16} color={color} strokeWidth={2.4} />;
}

function CommentaryRowBase({
  item,
  eventId,
  leagueSlug,
  homeLogo,
  awayLogo,
  homeColor,
  awayColor,
  active,
  onLayout,
}: {
  item: MatchCommentaryItem;
  eventId: string;
  leagueSlug?: string;
  homeLogo?: string;
  awayLogo?: string;
  homeColor: string;
  awayColor: string;
  active?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const colors = useColors();
  const accent = item.teamSide === 'away' ? awayColor : homeColor;
  const logo = item.teamSide === 'away' ? awayLogo : item.teamSide === 'home' ? homeLogo : undefined;

  return (
    <View
      onLayout={onLayout}
      style={[styles.feedRow, { borderTopColor: colors.separator }, active && { backgroundColor: colors.secondary }]}
    >
      <View style={styles.rowHead}>
        {item.minute ? (
          <View style={[styles.minutePill, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.minuteText, { color: colors.foreground }]}>{item.minute}</Text>
          </View>
        ) : null}
        {item.title ? (
          <View style={[styles.typeIcon, { backgroundColor: accent + '18' }]}>
            <EventIcon item={item} color={accent} />
          </View>
        ) : null}
        {logo ? <Image source={{ uri: logo }} style={styles.flag} resizeMode="contain" /> : null}
        {item.title ? (
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.rowText, { color: colors.mutedForeground }]}>{item.text}</Text>

      {item.players.length > 0 ? (
        <View style={styles.playerGrid}>
          {item.players.slice(0, 2).map((player) => (
            <PlayerChip key={`${item.id}-${player.id}-${player.role}`} player={player} eventId={eventId} leagueSlug={leagueSlug} accent={accent} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Memoised so scrubbing (which flips one row's `active`) only re-renders the two
// affected rows, not the whole list of image-bearing rows. Effective now that
// `colors` has a stable identity (see useColors).
const CommentaryRow = React.memo(CommentaryRowBase);

export function CommentaryFeed({
  eventId,
  leagueSlug,
  commentary,
  allPlays,
  homeLogo,
  awayLogo,
  homeColor,
  awayColor,
  mode,
  activeIndex,
  onModeChange,
  onActiveIndexChange,
  onContainerLayout,
  onRowLayout,
}: CommentaryFeedProps) {
  const colors = useColors();
  const { recap, rows } = useMemo(
    () => commentaryRowsForMode(commentary, allPlays, mode),
    [commentary, allPlays, mode],
  );
  const safeActiveIndex = rows.length > 0 ? Math.min(activeIndex, rows.length - 1) : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>PLAY BY PLAY</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>{rows.length}</Text>
        </View>
      </View>
      <View style={[styles.rule, { backgroundColor: colors.separator }]} />

      <View style={[styles.segment, { backgroundColor: colors.secondary }]}>
        {COMMENTARY_MODES.map((item) => {
          const active = item.id === mode;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.86}
              onPress={() => {
                onModeChange(item.id);
                onActiveIndexChange(0);
              }}
              style={[styles.segmentBtn, active && { backgroundColor: colors.cardElevated }]}
            >
              <Text style={[styles.segmentText, { color: active ? colors.foreground : colors.mutedForeground }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {recap ? <Text style={[styles.recap, { color: colors.mutedForeground }]}>{recap.text}</Text> : null}

      {rows.length > 0 ? (
        <View
          style={styles.feed}
          onLayout={(event) => onContainerLayout?.(event.nativeEvent.layout.y)}
        >
          {rows.map((item, index) => (
            <CommentaryRow
              key={item.id}
              item={item}
              eventId={eventId}
              leagueSlug={leagueSlug}
              homeLogo={homeLogo}
              awayLogo={awayLogo}
              homeColor={homeColor}
              awayColor={awayColor}
              active={item.id === rows[safeActiveIndex]?.id}
              onLayout={(event) => onRowLayout?.(index, event.nativeEvent.layout.y)}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>No commentary available yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontFamily: font.displayBold },
  countBadge: { minWidth: 28, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontFamily: font.extrabold },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 14 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 16 },
  segmentBtn: { flex: 1, borderRadius: 999, alignItems: 'center', paddingVertical: 9 },
  segmentText: { fontSize: 12, fontFamily: font.extrabold },
  recap: { fontSize: 14, lineHeight: 21, fontFamily: font.medium, marginBottom: 6 },
  feed: { marginTop: 2 },
  feedRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 13, gap: 9 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  minutePill: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  minuteText: { fontSize: 12, fontFamily: font.extrabold },
  typeIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flag: { width: 22, height: 16, borderRadius: 3 },
  rowTitle: { flex: 1, fontSize: 15, fontFamily: font.extrabold },
  rowText: { fontSize: 14, lineHeight: 20, fontFamily: font.medium },
  playerGrid: { flexDirection: 'row', gap: 10 },
  playerChip: { flex: 1, minHeight: 78, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 10 },
  jerseyWrap: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  jersey: { width: 56, height: 56 },
  playerBadge: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerCopy: { flex: 1 },
  playerName: { fontSize: 14, fontFamily: font.extrabold },
  playerPosition: { fontSize: 12, fontFamily: font.medium, marginTop: 2 },
  empty: { textAlign: 'center', paddingVertical: 22, fontSize: 13, fontFamily: font.medium },
});
