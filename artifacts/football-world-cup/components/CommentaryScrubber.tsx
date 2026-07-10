import React, { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { MatchCommentaryItem } from '@/hooks/useMatchDetail';
import { font } from '@/constants/typography';

interface CommentaryScrubberProps {
  rows: MatchCommentaryItem[];
  activeIndex: number;
  onSeek: (index: number) => void;
  onScrub: (fraction: number) => void;
  onScrubEnd: () => void;
  bottomInset: number;
  homeColor: string;
  awayColor: string;
  /** True while the user is dragging the scrub track — blocks parent tab swipes. */
  onGestureActive?: (active: boolean) => void;
}

const TICK_INSET = 6;

function rowColor(row: MatchCommentaryItem, homeColor: string, awayColor: string, fallback: string) {
  const text = `${row.title ?? ''} ${row.text}`.toLowerCase();
  if (text.includes('yellow')) return '#FFD60A';
  if (text.includes('red')) return '#FF453A';
  if (text.includes('substitution')) return '#30D158';
  if (row.teamSide === 'away') return awayColor;
  if (row.teamSide === 'home') return homeColor;
  return fallback;
}

export function CommentaryScrubber({
  rows,
  activeIndex,
  onSeek,
  onScrub,
  onScrubEnd,
  bottomInset,
  homeColor,
  awayColor,
  onGestureActive,
}: CommentaryScrubberProps) {
  const colors = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  const count = rows.length;
  const active = rows[activeIndex];
  const usable = Math.max(trackWidth - TICK_INSET * 2, 1);
  const fractionFor = (index: number) => (count <= 1 ? 0.5 : index / (count - 1));

  const callbacks = useRef({ onScrub, onScrubEnd, onGestureActive });
  callbacks.current = { onScrub, onScrubEnd, onGestureActive };

  const fractionFromX = (x: number) => {
    const width = widthRef.current;
    const activeWidth = Math.max(width - TICK_INSET * 2, 1);
    return Math.min(1, Math.max(0, (x - TICK_INSET) / activeWidth));
  };

  // Gesture-handler Pan (not PanResponder): e.x is measured against the track so
  // scrubbing tracks the finger exactly, and onFinalize ALWAYS fires so the
  // parent's scrub-lock is released reliably — otherwise page swipes stay blocked.
  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((event) => {
          callbacks.current.onGestureActive?.(true);
          callbacks.current.onScrub(fractionFromX(event.x));
        })
        .onUpdate((event) => {
          callbacks.current.onScrub(fractionFromX(event.x));
        })
        .onFinalize(() => {
          callbacks.current.onGestureActive?.(false);
          callbacks.current.onScrubEnd();
        }),
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    widthRef.current = width;
    setTrackWidth(width);
  };

  const step = (delta: number) => onSeek(Math.min(count - 1, Math.max(0, activeIndex + delta)));

  if (count < 2 || !active) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: bottomInset + 12 }]} pointerEvents="box-none">
      <View style={[styles.readout, { backgroundColor: colors.cardElevated }]}>
        <Text style={[styles.readoutMin, { color: colors.foreground }]}>{active.minute || '—'}</Text>
        <Text style={[styles.readoutType, { color: colors.mutedForeground }]} numberOfLines={1}>
          {active.title || active.text}
        </Text>
      </View>

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
          {rows.map((row, index) => {
            const isActive = index === activeIndex;
            const distance = Math.abs(index - activeIndex);
            const left = TICK_INSET + fractionFor(index) * usable;
            const height = isActive ? 26 : distance === 1 ? 15 : 11;
            return (
              <View
                key={`${row.id}-${index}-commentary-scrub`}
                style={[
                  styles.tick,
                  {
                    left: left - (isActive ? 1.5 : 1),
                    width: isActive ? 3 : 2,
                    height,
                    marginTop: -height / 2,
                    borderRadius: 2,
                    backgroundColor: isActive ? colors.primary : rowColor(row, homeColor, awayColor, colors.mutedForeground),
                    opacity: isActive ? 1 : distance <= 2 ? 0.55 : 0.28,
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
          disabled={activeIndex >= count - 1}
          style={styles.chev}
        >
          <ChevronRight size={22} color={activeIndex >= count - 1 ? colors.muted : colors.foreground} strokeWidth={2.6} />
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
  readoutType: { maxWidth: 230, fontSize: 12, fontFamily: font.semibold },
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
