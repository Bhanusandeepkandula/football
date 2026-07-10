import React from 'react';
import { View, Text, StyleSheet, Image, LayoutChangeEvent } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MatchEvent, MatchEventType } from '@/hooks/useMatchDetail';
import { font, KICKER_SPACING } from '@/constants/typography';
import {
  Goal,
  Square,
  RectangleVertical,
  ArrowLeftRight,
  Video,
  Flag,
  CircleDot,
} from 'lucide-react-native';

interface TeamRef {
  id: string;
  displayName: string;
  logo: string;
  color: string;
}

interface EventsTimelineProps {
  events: MatchEvent[];
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  /** Index of the event currently focused by the scrubber (for highlight). */
  activeIndex?: number;
  /** Reports the y-offset of each event row within this component's container. */
  onRowLayout?: (index: number, y: number) => void;
  /** Reports the container's own y-offset within its parent. */
  onContainerLayout?: (y: number) => void;
}

const EVENT_TONE: Record<MatchEventType, { accent: string; surface: string }> = {
  goal: { accent: '#F5A623', surface: 'rgba(245,166,35,0.14)' },
  'yellow-card': { accent: '#F5A623', surface: 'rgba(245,166,35,0.14)' },
  'red-card': { accent: '#FF453A', surface: 'rgba(255,69,58,0.14)' },
  substitution: { accent: '#30D158', surface: 'rgba(48,209,88,0.12)' },
  foul: { accent: '#FF9F0A', surface: 'rgba(255,159,10,0.12)' },
  var: { accent: '#64D2FF', surface: 'rgba(100,210,255,0.12)' },
  other: { accent: '#8E8E93', surface: 'rgba(142,142,147,0.12)' },
};

function EventIcon({ type, color }: { type: MatchEventType; color: string }) {
  const size = 16;
  switch (type) {
    case 'goal':
      return <Goal size={size} color={color} strokeWidth={2.4} />;
    case 'yellow-card':
      return <Square size={13} color={color} fill={color} />;
    case 'red-card':
      return <RectangleVertical size={13} color={color} fill={color} />;
    case 'substitution':
      return <ArrowLeftRight size={size} color={color} strokeWidth={2.5} />;
    case 'foul':
      return <Flag size={size} color={color} strokeWidth={2.4} />;
    case 'var':
      return <Video size={size} color={color} strokeWidth={2.3} />;
    default:
      return <CircleDot size={size} color={color} strokeWidth={2.3} />;
  }
}

function periodLabel(p: number): string {
  switch (p) {
    case 1:
      return '1st half';
    case 2:
      return '2nd half';
    case 3:
    case 4:
      return 'Extra time';
    case 5:
      return 'Penalties';
    default:
      return '';
  }
}

function normalizeColor(value?: string, fallback = '#8E8E93'): string {
  if (!value) return fallback;
  return value.startsWith('#') ? value : `#${value}`;
}

function secondaryLabel(type: MatchEventType): string {
  if (type === 'goal') return 'Assist';
  if (type === 'substitution') return 'Off';
  return '';
}

function detailLabel(type: MatchEventType): string {
  if (type === 'goal') return 'Where';
  if (type === 'yellow-card' || type === 'red-card' || type === 'foul') return 'Reason';
  if (type === 'substitution') return 'Change';
  return 'Detail';
}

export function EventsTimeline({
  events,
  homeTeam,
  awayTeam,
  activeIndex,
  onRowLayout,
  onContainerLayout,
}: EventsTimelineProps) {
  const colors = useColors();

  if (events.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
          <Flag size={22} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={[styles.emptyText, { color: colors.foreground }]}>No key events yet</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Goals, cards and subs will appear here</Text>
      </View>
    );
  }

  let lastPeriod = -1;

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) => onContainerLayout?.(e.nativeEvent.layout.y)}
    >
      {events.map((ev, idx) => {
        const isHome = ev.teamId === homeTeam.id;
        const team = isHome ? homeTeam : awayTeam;
        const tone = EVENT_TONE[ev.type];
        const teamColor = normalizeColor(team.color, tone.accent);
        const showPeriod = ev.period !== lastPeriod;
        lastPeriod = ev.period;
        const label = periodLabel(ev.period);
        const score = ev.type === 'goal' && ev.scoreHome != null ? `${ev.scoreHome}–${ev.scoreAway}` : '';
        const secondary = secondaryLabel(ev.type);
        const context = `${team.displayName} · ${label || 'Match'} · ${ev.clock || '—'}`;
        const isActive = idx === activeIndex;

        return (
          <View
            key={ev.id + idx}
            onLayout={(e: LayoutChangeEvent) => onRowLayout?.(idx, e.nativeEvent.layout.y)}
          >
            {showPeriod && label ? (
              <View style={styles.periodRow}>
                <Text style={[styles.periodText, { color: colors.mutedForeground }]}>{label}</Text>
                <View style={[styles.periodLine, { backgroundColor: colors.separator }]} />
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.timeCol}>
                <Text style={[styles.minute, { color: isActive ? tone.accent : colors.foreground }]}>{ev.clock || '—'}</Text>
                <View style={[styles.minuteDot, { backgroundColor: teamColor }]} />
              </View>

              <View
                style={[
                  styles.card,
                  { backgroundColor: isActive ? colors.cardElevated : colors.card },
                ]}
              >
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconBox}>
                      <EventIcon type={ev.type} color={tone.accent} />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={[styles.typeLabel, { color: tone.accent }]} numberOfLines={1}>
                        {ev.typeLabel}
                      </Text>
                      <View style={styles.contextRow}>
                        <View style={[styles.contextDot, { backgroundColor: teamColor }]} />
                        <Text style={[styles.contextText, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {context}
                        </Text>
                      </View>
                      <View style={styles.playerRow}>
                        {team.logo ? (
                          <Image source={{ uri: team.logo }} style={styles.flag} resizeMode="contain" />
                        ) : (
                          <View style={[styles.flagPlaceholder, { backgroundColor: teamColor }]} />
                        )}
                        <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
                          {ev.playerName || ev.text}
                        </Text>
                      </View>
                    </View>
                    {score ? (
                      <View style={[styles.scorePill, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.scorePillText, { color: colors.foreground }]}>{score}</Text>
                      </View>
                    ) : null}
                  </View>

                  {ev.secondaryName ? (
                    <Text style={[styles.secondaryText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {secondary ? `${secondary}: ` : ''}{ev.secondaryName}
                    </Text>
                  ) : null}

                  {ev.detail ? (
                    <Text style={[styles.detail, { color: colors.mutedForeground }]} numberOfLines={2}>
                      <Text style={[styles.detailPrefix, { color: colors.foreground }]}>{detailLabel(ev.type)}: </Text>
                      {ev.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },

  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 8,
    paddingLeft: 54,
  },
  periodLine: { flex: 1, height: StyleSheet.hairlineWidth },
  periodText: {
    fontSize: 12,
    fontFamily: font.displayMed,
    letterSpacing: KICKER_SPACING,
    textTransform: 'uppercase',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  timeCol: {
    width: 44,
    alignItems: 'flex-end',
    paddingTop: 13,
    minHeight: 48,
  },
  minute: {
    fontSize: 12,
    fontFamily: font.extrabold,
  },
  minuteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: 2,
  },

  card: {
    flex: 1,
    borderRadius: 13,
    overflow: 'hidden',
  },
  activeRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 11 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  typeLabel: {
    fontSize: 11,
    fontFamily: font.extrabold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  contextDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  contextText: {
    flex: 1,
    fontSize: 11,
    fontFamily: font.medium,
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  flag: { width: 18, height: 13, borderRadius: 2 },
  flagPlaceholder: { width: 18, height: 13, borderRadius: 2 },
  playerName: { flex: 1, fontSize: 14, fontFamily: font.bold, lineHeight: 18 },
  scorePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  scorePillText: { fontSize: 12, fontFamily: font.extrabold },

  secondaryText: { fontSize: 12, fontFamily: font.medium, marginTop: 7, lineHeight: 16 },

  detail: { fontSize: 12, fontFamily: font.regular, marginTop: 4, lineHeight: 17 },
  detailPrefix: { fontFamily: font.bold },

  empty: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyText: { fontSize: 15, fontFamily: font.bold, marginTop: 2 },
  emptySub: { fontSize: 13, fontFamily: font.regular, textAlign: 'center' },
});
