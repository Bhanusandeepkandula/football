import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { font } from '@/constants/typography';

// A compact, scrollable day picker (weekday + date pills) like FotMob / ESPN /
// Apple Sports — replaces the tall date card and lets you jump days at a glance.

const ITEM_W = 50;
const GAP = 8;
const H_PAD = 16;
const PAST_DAYS = 7;
const FUTURE_DAYS = 21;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateStrip({ selected, onSelect }: { selected: Date; onSelect: (d: Date) => void }) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  const { days, selectedIndex } = useMemo(() => {
    const today = startOfDay(new Date());
    const list = Array.from({ length: PAST_DAYS + FUTURE_DAYS + 1 }, (_, i) => addDays(today, i - PAST_DAYS));
    const idx = list.findIndex((d) => sameDay(d, selected));
    return { days: list, selectedIndex: idx };
    // Recompute only when the selected calendar day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.toDateString()]);

  // Keep the selected pill centred.
  useEffect(() => {
    if (selectedIndex < 0) return;
    const screen = Dimensions.get('window').width;
    const x = Math.max(0, H_PAD + selectedIndex * (ITEM_W + GAP) - (screen - ITEM_W) / 2);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ x, animated: true }), 60);
    return () => clearTimeout(t);
  }, [selectedIndex]);

  const today = startOfDay(new Date());

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {days.map((d) => {
        const isSel = sameDay(d, selected);
        const isToday = sameDay(d, today);
        return (
          <TouchableOpacity
            key={d.getTime()}
            activeOpacity={0.85}
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            style={[
              styles.pill,
              { borderColor: isSel ? colors.primary : colors.hairline, backgroundColor: isSel ? colors.primary : colors.card },
            ]}
          >
            <Text
              style={[styles.dow, { color: isSel ? colors.primaryForeground : isToday ? colors.primary : colors.mutedForeground }]}
              numberOfLines={1}
            >
              {isToday ? 'TODAY' : d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
            </Text>
            <Text style={[styles.day, { color: isSel ? colors.primaryForeground : colors.foreground }]}>
              {d.getDate()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: H_PAD, gap: GAP, paddingVertical: 2 },
  pill: {
    width: ITEM_W,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dow: { fontSize: 9.5, fontFamily: font.extrabold, letterSpacing: 0.3 },
  day: { fontSize: 17, fontFamily: font.displayBold },
});
