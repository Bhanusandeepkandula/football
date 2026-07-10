import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { MatchEvent, MatchEventType } from '@/hooks/useMatchDetail';
import { font } from '@/constants/typography';

interface TeamRef {
  id: string;
  color: string;
}

interface EventScrubberProps {
  events: MatchEvent[];
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  activeIndex: number;
  onSeek: (index: number) => void;
  /** Continuous drag: fraction 0..1 across the track. */
  onScrub: (fraction: number) => void;
  /** Drag released — settle on the focused event. */
  onScrubEnd: () => void;
  bottomInset: number;
  onGestureActive?: (active: boolean) => void;
}

const TYPE_LABEL: Record<MatchEventType, string> = {
  goal: 'Goal',
  'yellow-card': 'Yellow card',
  'red-card': 'Red card',
  substitution: 'Substitution',
  foul: 'Foul',
  var: 'VAR',
  other: 'Event',
};

const TICK_INSET = 6;

export function EventScrubber({
  events,
  homeTeam,
  awayTeam,
  activeIndex,
  onSeek,
  onScrub,
  onScrubEnd,
  bottomInset,
  onGestureActive,
}: EventScrubberProps) {
  const colors = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  const n = events.length;

  const fractionFor = (i: number) => (n <= 1 ? 0.5 : i / (n - 1));

  // Latest callbacks reachable from the once-created gesture.
  const cb = useRef({ onScrub, onScrubEnd, onGestureActive });
  cb.current = { onScrub, onScrubEnd, onGestureActive };

  const fracFromX = (x: number) => {
    const w = widthRef.current;
    const usable = Math.max(w - TICK_INSET * 2, 1);
    return Math.min(1, Math.max(0, (x - TICK_INSET) / usable));
  };

  // Gesture-handler Pan (not PanResponder): e.x is measured against the track so
  // scrubbing tracks the finger exactly, and onFinalize ALWAYS fires so the
  // parent's scrub-lock is released reliably — otherwise page swipes stay blocked.
  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => {
          cb.current.onGestureActive?.(true);
          cb.current.onScrub(fracFromX(e.x));
        })
        .onUpdate((e) => {
          cb.current.onScrub(fracFromX(e.x));
        })
        .onFinalize(() => {
          cb.current.onGestureActive?.(false);
          cb.current.onScrubEnd();
        }),
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  };

  const active = events[activeIndex];
  const usable = Math.max(trackWidth - TICK_INSET * 2, 1);
  const step = (delta: number) => onSeek(Math.min(n - 1, Math.max(0, activeIndex + delta)));

  return (
    <View style={[styles.wrap, { paddingBottom: bottomInset + 12 }]} pointerEvents="box-none">
      {/* Floating readout */}
      {active ? (
        <View style={[styles.readout, { backgroundColor: colors.cardElevated }]}>
          <Text style={[styles.readoutMin, { color: colors.foreground }]}>{active.clock || '—'}</Text>
          <Text style={[styles.readoutType, { color: colors.mutedForeground }]} numberOfLines={1}>
            {active.typeLabel || TYPE_LABEL[active.type]}
          </Text>
        </View>
      ) : null}

      {/* Pill */}
      <View style={[styles.pill, { backgroundColor: colors.cardElevated }]}>
        <TouchableOpacity
          hitSlop={10}
          activeOpacity={0.6}
          onPress={() => step(-1)}
          disabled={activeIndex <= 0}
          style={styles.chev}
        >
          <ChevronLeft size={22} color={activeIndex <= 0 ? colors.muted : colors.foreground} strokeWidth={2.6} />
        </TouchableOpacity>

        <GestureDetector gesture={scrubGesture}>
        <View style={styles.track} onLayout={onLayout}>
          {events.map((ev, i) => {
            const isHome = ev.teamId === homeTeam.id;
            const teamColor = isHome ? `#${homeTeam.color}` : ev.teamId === awayTeam.id ? `#${awayTeam.color}` : colors.mutedForeground;
            const isActive = i === activeIndex;
            const dist = Math.abs(i - activeIndex);
            const left = TICK_INSET + fractionFor(i) * usable;
            const h = isActive ? 26 : dist === 1 ? 15 : 11;
            return (
              <View
                key={ev.id + i}
                style={[
                  styles.tick,
                  {
                    left: left - (isActive ? 1.5 : 1),
                    width: isActive ? 3 : 2,
                    height: h,
                    marginTop: -h / 2,
                    borderRadius: 2,
                    backgroundColor: isActive ? colors.primary : teamColor,
                    opacity: isActive ? 1 : dist <= 2 ? 0.55 : 0.28,
                  },
                ]}
              />
            );
          })}
        </View>
        </GestureDetector>

        <TouchableOpacity
          hitSlop={10}
          activeOpacity={0.6}
          onPress={() => step(1)}
          disabled={activeIndex >= n - 1}
          style={styles.chev}
        >
          <ChevronRight size={22} color={activeIndex >= n - 1 ? colors.muted : colors.foreground} strokeWidth={2.6} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 8,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 14px rgba(0,0,0,0.45)' } as any
      : { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }),
  },
  readoutMin: { fontSize: 13, fontFamily: font.extrabold },
  readoutType: { fontSize: 12, fontFamily: font.semibold },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 8,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 6px 20px rgba(0,0,0,0.5)' } as any
      : { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }),
  },
  chev: {
    width: 40,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 56,
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    top: '50%',
  },
});
