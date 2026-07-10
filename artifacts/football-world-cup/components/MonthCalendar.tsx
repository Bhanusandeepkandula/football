import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { font, KICKER_SPACING } from '@/constants/typography';

// Lightweight month calendar for jumping to a specific date.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function MonthCalendar({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = new Date();

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Grid cells: leading blanks + each day.
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => setView(new Date(year, month + delta, 1));

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.cardElevated, borderColor: colors.hairline, paddingBottom: 18 + insets.bottom }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: colors.muted }]} />

          <View style={styles.head}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={12} style={[styles.navBtn, { backgroundColor: colors.secondary }]}>
              <ChevronLeft size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={12} style={[styles.navBtn, { backgroundColor: colors.secondary }]}>
              <ChevronRight size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: colors.mutedForeground }]}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cell} />;
              const isSel = sameDay(d, selected);
              const isToday = sameDay(d, today);
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => { onSelect(d); onClose(); }}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                >
                  <View style={[styles.dayWrap, isSel && { backgroundColor: colors.primary }, !isSel && isToday && { borderColor: colors.primary, borderWidth: 1.5 }]}>
                    <Text style={[styles.dayText, { color: isSel ? colors.primaryForeground : colors.foreground }]}>{d.getDate()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { onSelect(new Date()); onClose(); }}
            style={[styles.todayBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.todayText, { color: colors.primaryForeground }]}>Jump to Today</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 25, borderTopRightRadius: 25, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 17, fontFamily: font.displayBold, letterSpacing: 0.2 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: font.extrabold, letterSpacing: KICKER_SPACING },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 3 },
  dayWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, fontFamily: font.semibold },
  todayBtn: { marginTop: 14, borderRadius: 14, alignItems: 'center', paddingVertical: 13 },
  todayText: { fontSize: 15, fontFamily: font.extrabold },
});
