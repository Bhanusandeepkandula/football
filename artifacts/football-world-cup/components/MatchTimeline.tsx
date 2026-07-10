import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MatchEvent, MatchEventType } from '@/hooks/useMatchDetail';
import { Goal, Square, RectangleVertical, ArrowLeftRight, Video, Flag, CircleDot } from 'lucide-react-native';
import { font, KICKER_SPACING } from '@/constants/typography';

interface MatchTimelineProps {
  events: MatchEvent[];
  homeTeamId?: string;
  awayTeamId?: string;
  homeColor?: string;
  awayColor?: string;
}

const EVENT_META: Record<MatchEventType, { label: string; color: string }> = {
  goal: { label: 'Goal', color: '#F5A623' },
  'yellow-card': { label: 'Yellow Card', color: '#F5A623' },
  'red-card': { label: 'Red Card', color: '#FF453A' },
  substitution: { label: 'Substitution', color: '#30D158' },
  foul: { label: 'Foul', color: '#FF9F0A' },
  var: { label: 'VAR', color: '#64D2FF' },
  other: { label: 'Event', color: '#8E8E93' },
};

function getEventIcon(type: MatchEventType, color: string) {
  const size = 16;
  switch (type) {
    case 'goal': return <Goal size={size} color={color} fill={color} />;
    case 'yellow-card': return <Square size={size - 2} color={color} fill={color} />;
    case 'red-card': return <RectangleVertical size={size - 2} color={color} fill={color} />;
    case 'substitution': return <ArrowLeftRight size={size} color={color} strokeWidth={2.4} />;
    case 'foul': return <Flag size={size} color={color} strokeWidth={2.4} />;
    case 'var': return <Video size={size} color={color} strokeWidth={2.3} />;
    default: return <CircleDot size={size} color={color} strokeWidth={2.3} />;
  }
}

function eventSummary(ev: MatchEvent): string {
  if (ev.type === 'goal' && ev.secondaryName) return `Assist: ${ev.secondaryName}`;
  if (ev.type === 'substitution' && ev.secondaryName) return `Off: ${ev.secondaryName}`;
  return ev.detail ?? '';
}

function eventName(ev: MatchEvent): string {
  return (ev.playerName || ev.text.split(' – ')[0] || ev.typeLabel || EVENT_META[ev.type].label).replace(/\.$/, '');
}

function formatClock(clock: string): string {
  if (!clock) return '—';
  return clock.includes("'") || clock.includes('′') ? clock : `${clock}'`;
}

export function MatchTimeline({ events, homeTeamId, awayTeamId, homeColor, awayColor }: MatchTimelineProps) {
  const colors = useColors();

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No key events yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((ev, idx) => {
        const isHome = ev.teamId === homeTeamId;
        const isAway = awayTeamId ? ev.teamId === awayTeamId : !isHome;
        const meta = EVENT_META[ev.type];
        const accent = isHome ? homeColor ?? meta.color : isAway ? awayColor ?? meta.color : meta.color;
        const label = ev.typeLabel || meta.label;
        const summary = eventSummary(ev);
        const score = ev.type === 'goal' && ev.scoreHome != null ? `${ev.scoreHome}-${ev.scoreAway}` : '';

        return (
          <View key={ev.id + idx} style={styles.eventRow}>
            <View style={[styles.eventSide, styles.homeSide]}>
              {isHome && (
                <View style={[styles.eventContent, styles.homeContent]}>
                  <View style={[styles.textBlock, styles.homeTextBlock]}>
                    <View style={styles.labelRow}>
                      <Text style={[styles.typeText, { color: meta.color }]} numberOfLines={1}>
                        {label}
                      </Text>
                      {score ? (
                        <Text style={[styles.scoreText, { color: colors.foreground }]}>{score}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.playerText, { color: colors.foreground }]} numberOfLines={1}>
                      {eventName(ev)}
                    </Text>
                    {summary ? (
                      <Text style={[styles.summaryText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {summary}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.iconBubble, { backgroundColor: meta.color + '22', borderColor: accent + '66' }]}>
                    {getEventIcon(ev.type, meta.color)}
                  </View>
                </View>
              )}
            </View>

            <View style={[styles.clockBubble, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
              <Text style={[styles.clockText, { color: ev.type === 'goal' ? colors.primary : colors.foreground }]}>
                {formatClock(ev.clock)}
              </Text>
            </View>

            <View style={[styles.eventSide, styles.awaySide]}>
              {!isHome && (
                <View style={[styles.eventContent, styles.awayContent]}>
                  <View style={[styles.iconBubble, { backgroundColor: meta.color + '22', borderColor: accent + '66' }]}>
                    {getEventIcon(ev.type, meta.color)}
                  </View>
                  <View style={styles.textBlock}>
                    <View style={styles.labelRow}>
                      <Text style={[styles.typeText, { color: meta.color }]} numberOfLines={1}>
                        {label}
                      </Text>
                      {score ? (
                        <Text style={[styles.scoreText, { color: colors.foreground }]}>{score}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.playerText, { color: colors.foreground }]} numberOfLines={1}>
                      {eventName(ev)}
                    </Text>
                    {summary ? (
                      <Text style={[styles.summaryText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {summary}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
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
    paddingVertical: 8,
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  eventSide: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
  },
  homeSide: {
    alignItems: 'flex-end',
  },
  awaySide: {
    alignItems: 'flex-start',
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    maxWidth: '100%',
  },
  homeContent: {
    justifyContent: 'flex-end',
  },
  awayContent: {
    flexDirection: 'row',
  },
  iconBubble: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flexShrink: 1,
    gap: 2,
  },
  homeTextBlock: {
    alignItems: 'flex-end',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    fontSize: 9,
    fontFamily: font.extrabold,
    letterSpacing: KICKER_SPACING * 0.65,
    textTransform: 'uppercase',
  },
  scoreText: {
    fontSize: 10,
    fontFamily: font.extrabold,
  },
  playerText: {
    fontSize: 13,
    fontFamily: font.bold,
    flexShrink: 1,
  },
  summaryText: {
    fontSize: 11,
    fontFamily: font.regular,
    flexShrink: 1,
  },
  clockBubble: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 54,
    alignItems: 'center',
    marginTop: 11,
  },
  clockText: {
    fontSize: 12,
    fontFamily: font.extrabold,
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
  },
});
