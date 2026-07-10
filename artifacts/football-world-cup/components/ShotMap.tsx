import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList, Dimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Line, Rect, Circle } from 'react-native-svg';
import { ChevronDown } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { MatchShot } from '@/hooks/useMatchDetail';
import { font } from '@/constants/typography';

const { height: SCREEN_H } = Dimensions.get('window');

interface ShotMapProps {
  shots: MatchShot[];
  homeTeam: { displayName: string };
  awayTeam: { displayName: string };
  homeColor: string;
  awayColor: string;
}

type FilterOption = {
  key: string;
  label: string;
  value: string | number;
  meta?: string;
};

const OUTCOME_LABELS: { key: MatchShot['outcome']; label: string }[] = [
  { key: 'goal', label: 'Goal' },
  { key: 'save', label: 'Save' },
  { key: 'offTarget', label: 'Off Target' },
  { key: 'block', label: 'Block' },
];

function shortCode(name: string): string {
  const words = name.replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
  return (words[0] ?? name).slice(0, 3).toUpperCase();
}

function sumXG(shots: MatchShot[]): string {
  const total = shots.reduce((sum, shot) => sum + (parseFloat(shot.xG ?? '0') || 0), 0);
  return total > 0 ? total.toFixed(2) : '—';
}

function LegendMarker({ outcome, color }: { outcome: MatchShot['outcome']; color: string }) {
  return (
    <View style={[styles.legendMarker, outcome === 'goal' && { backgroundColor: color, borderColor: color }]}>
      {outcome === 'goal' ? <Text style={styles.legendBall}>⚽</Text> : null}
      {outcome === 'save' ? <View style={[styles.legendDot, { borderColor: color }]} /> : null}
      {outcome === 'offTarget' ? <View style={[styles.legendOff, { borderColor: color }]} /> : null}
      {outcome === 'block' ? <View style={[styles.legendBlock, { backgroundColor: color }]} /> : null}
    </View>
  );
}

function periodLabel(period: number): string {
  if (period === 1) return '1st Half';
  if (period === 2) return '2nd Half';
  if (period === 3) return 'Extra Time';
  if (period === 4) return 'Extra Time';
  if (period > 4) return 'Shootout';
  return `Period ${period}`;
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.filterPill,
        {
          backgroundColor: active ? colors.foreground : colors.secondary,
          borderColor: active ? colors.foreground : colors.hairline,
        },
      ]}
    >
      <Text style={[styles.filterText, { color: active ? colors.background : colors.foreground }]} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={14} color={colors.mutedForeground} strokeWidth={2.4} />
    </TouchableOpacity>
  );
}

function FilterSheet({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  bottomInset = 0,
}: {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selectedKey: string;
  onSelect: (option: FilterOption) => void;
  onClose: () => void;
  bottomInset?: number;
}) {
  const colors = useColors();
  const translateY = useSharedValue(0);

  // Reset the drag offset each time the sheet opens so a previous drag-to-close
  // doesn't leave it pre-shifted on the next open.
  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Drag the sheet down; release past the threshold (or with a fast flick) to
  // dismiss, otherwise spring back into place.
  const dragGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 650) {
        translateY.value = withTiming(700, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 240 });
      }
    });

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.sheetRoot}>
        {/* Full-screen dim — separate sibling so the sheet can be pinned to the
            true screen bottom regardless of its content height. */}
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <Animated.View style={[styles.sheetAnchor, sheetStyle]}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.cardElevated, borderColor: colors.hairline, paddingBottom: 18 + bottomInset }]}
            onPress={() => {}}
          >
            <GestureDetector gesture={dragGesture}>
              <View style={styles.sheetGrab}>
                <View style={[styles.sheetHandle, { backgroundColor: colors.muted }]} />
                <View style={styles.sheetHead}>
                  <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={[styles.sheetDone, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.sheetDoneText, { color: colors.primary }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </GestureDetector>
            <FlatList
              data={options}
              keyExtractor={(item) => item.key}
              style={styles.sheetList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = item.key === selectedKey;
                return (
                  <TouchableOpacity
                    activeOpacity={0.84}
                    onPress={() => onSelect(item)}
                    style={[styles.sheetOption, active && { backgroundColor: colors.primary + '24' }]}
                  >
                    <View style={[styles.sheetRadio, { borderColor: active ? colors.primary : colors.hairline }]}>
                      {active ? <View style={[styles.sheetRadioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    <View style={styles.sheetOptionCopy}>
                      <Text style={[styles.sheetOptionText, { color: colors.foreground }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {item.meta ? (
                        <Text style={[styles.sheetOptionMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {item.meta}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ShotMarker({ shot, color }: { shot: MatchShot; color: string }) {
  return (
    <View
      style={[
        styles.marker,
        {
          left: `${shot.x}%`,
          top: `${shot.y}%`,
          borderColor: color,
          backgroundColor: shot.outcome === 'goal' ? color : '#F8F8FA',
          zIndex: shot.outcome === 'goal' ? 4 : 2,
        },
      ]}
    >
      {shot.outcome === 'goal' ? <Text style={styles.markerBall}>⚽</Text> : null}
      {shot.outcome === 'save' ? <View style={[styles.markerSave, { borderColor: color }]} /> : null}
      {shot.outcome === 'offTarget' ? <View style={[styles.markerOff, { borderColor: color }]} /> : null}
      {shot.outcome === 'block' ? <View style={[styles.markerBlock, { backgroundColor: color }]} /> : null}
    </View>
  );
}

export function ShotMap({ shots, homeTeam, awayTeam, homeColor, awayColor }: ShotMapProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedPeriodKey, setSelectedPeriodKey] = useState('all');
  const [selectedPlayerKey, setSelectedPlayerKey] = useState('all');
  const [selectedOutcome, setSelectedOutcome] = useState<MatchShot['outcome'] | 'all'>('all');
  const [openSheet, setOpenSheet] = useState<'period' | 'player' | null>(null);

  const periodOptions = useMemo(() => {
    const periods = Array.from(new Set(shots.map((shot) => shot.period).filter((period) => period > 0))).sort((a, b) => a - b);
    return [
      { key: 'all', value: 'all', label: 'All Periods', meta: `${shots.length} shots` },
      ...periods.map((period) => {
        const count = shots.filter((shot) => shot.period === period).length;
        return { key: String(period), value: period, label: periodLabel(period), meta: `${count} shots` };
      }),
    ];
  }, [shots]);

  const playerOptions = useMemo(() => {
    const players = Array.from(new Set(shots.map((shot) => shot.playerName).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return [
      { key: 'all', value: 'all', label: 'All Players', meta: `${players.length} players` },
      ...players.map((player) => {
        const playerShots = shots.filter((shot) => shot.playerName === player);
        const goals = playerShots.filter((shot) => shot.outcome === 'goal').length;
        return {
          key: player,
          value: player,
          label: player,
          meta: `${playerShots.length} shot${playerShots.length === 1 ? '' : 's'}${goals ? ` · ${goals} goal${goals === 1 ? '' : 's'}` : ''}`,
        };
      }),
    ];
  }, [shots]);

  const selectedPeriod = periodOptions.find((option) => option.key === selectedPeriodKey) ?? periodOptions[0];
  const selectedPlayer = playerOptions.find((option) => option.key === selectedPlayerKey) ?? playerOptions[0];
  const filteredShots = useMemo(
    () => shots.filter((shot) => {
      const periodOk = selectedPeriod.value === 'all' || shot.period === selectedPeriod.value;
      const playerOk = selectedPlayer.value === 'all' || shot.playerName === selectedPlayer.value;
      const outcomeOk = selectedOutcome === 'all' || shot.outcome === selectedOutcome;
      return periodOk && playerOk && outcomeOk;
    }),
    [shots, selectedPeriod.value, selectedPlayer.value, selectedOutcome],
  );

  const homeShots = filteredShots.filter((shot) => shot.teamSide === 'home');
  const awayShots = filteredShots.filter((shot) => shot.teamSide === 'away');
  const latestShots = [...filteredShots].reverse().slice(0, 3);
  const hasFilter = filteredShots.length !== shots.length;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>SHOT MAP</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>
            {hasFilter ? `${filteredShots.length}/${shots.length}` : shots.length}
          </Text>
        </View>
      </View>

      <View style={[styles.rule, { backgroundColor: colors.separator }]} />

      <View style={styles.filters}>
        <FilterPill
          label={selectedPeriod.label}
          active={selectedPeriod.value !== 'all'}
          onPress={() => setOpenSheet('period')}
        />
        <FilterPill
          label={selectedPlayer.label}
          active={selectedPlayer.value !== 'all'}
          onPress={() => setOpenSheet('player')}
        />
      </View>

      <View style={styles.legend}>
        {OUTCOME_LABELS.map((item) => {
          const active = selectedOutcome === 'all' || selectedOutcome === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.82}
              onPress={() => setSelectedOutcome((value) => (value === item.key ? 'all' : item.key))}
              style={[
                styles.legendPill,
                {
                  backgroundColor: active ? colors.secondary : 'rgba(255,255,255,0.035)',
                  opacity: active ? 1 : 0.52,
                },
              ]}
            >
              <LegendMarker outcome={item.key} color={colors.primary} />
              <Text style={[styles.legendText, { color: colors.foreground }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.pitch}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.pitchStripe,
              {
                left: `${(index / 6) * 100}%`,
                width: `${100 / 6}%`,
                backgroundColor: index % 2 === 0 ? '#247A45' : '#2F8C50',
              },
            ]}
          />
        ))}

        <Svg width="100%" height="100%" viewBox="0 0 100 64" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Line x1="50" y1="0" x2="50" y2="64" stroke="rgba(255,255,255,0.62)" strokeWidth="0.42" />
          <Circle cx="50" cy="32" r="9" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.42" />
          <Circle cx="50" cy="32" r="0.55" fill="rgba(255,255,255,0.82)" />

          <Rect x="0.6" y="14" width="17" height="36" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.42" />
          <Rect x="0.6" y="23" width="6.8" height="18" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.42" />
          <Rect x="0.2" y="28" width="2.6" height="8" fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="0.5" />
          <Circle cx="11.2" cy="32" r="0.55" fill="rgba(255,255,255,0.82)" />

          <Rect x="82.4" y="14" width="17" height="36" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.42" />
          <Rect x="92.6" y="23" width="6.8" height="18" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.42" />
          <Rect x="97.2" y="28" width="2.6" height="8" fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="0.5" />
          <Circle cx="88.8" cy="32" r="0.55" fill="rgba(255,255,255,0.82)" />
        </Svg>

        {filteredShots.map((shot) => (
          <ShotMarker
            key={shot.id}
            shot={shot}
            color={shot.teamSide === 'home' ? homeColor : awayColor}
          />
        ))}

        {filteredShots.length === 0 ? (
          <View style={styles.pitchEmpty}>
            <Text style={styles.pitchEmptyText}>No shots match this filter</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.summary}>
        <View style={styles.teamSummary}>
          <View style={[styles.teamDot, { backgroundColor: homeColor }]} />
          <Text style={[styles.summaryTeam, { color: colors.foreground }]}>{shortCode(homeTeam.displayName)}</Text>
          <Text style={[styles.summaryMeta, { color: colors.mutedForeground }]}>{homeShots.length} shots · xG {sumXG(homeShots)}</Text>
        </View>
        <View style={styles.teamSummary}>
          <View style={[styles.teamDot, { backgroundColor: awayColor }]} />
          <Text style={[styles.summaryTeam, { color: colors.foreground }]}>{shortCode(awayTeam.displayName)}</Text>
          <Text style={[styles.summaryMeta, { color: colors.mutedForeground }]}>{awayShots.length} shots · xG {sumXG(awayShots)}</Text>
        </View>
      </View>

      {latestShots.length > 0 ? (
        <View style={[styles.latest, { borderTopColor: colors.separator }]}>
          {latestShots.map((shot) => (
            <View key={`latest-${shot.id}`} style={styles.latestRow}>
              <Text style={[styles.latestMinute, { color: colors.mutedForeground }]}>{shot.minute || '—'}</Text>
              <View style={[styles.latestType, { backgroundColor: shot.teamSide === 'home' ? homeColor : awayColor }]} />
              <Text style={[styles.latestText, { color: colors.foreground }]} numberOfLines={1}>
                {shot.playerName} · {shot.title}
              </Text>
              {shot.xG ? <Text style={[styles.latestXg, { color: colors.mutedForeground }]}>xG {shot.xG}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <FilterSheet
        visible={openSheet === 'period'}
        title="Select Period"
        options={periodOptions}
        selectedKey={selectedPeriod.key}
        onClose={() => setOpenSheet(null)}
        bottomInset={insets.bottom}
        onSelect={(option) => {
          setSelectedPeriodKey(option.key);
          setOpenSheet(null);
        }}
      />
      <FilterSheet
        visible={openSheet === 'player'}
        title="Select Player"
        options={playerOptions}
        selectedKey={selectedPlayer.key}
        onClose={() => setOpenSheet(null)}
        bottomInset={insets.bottom}
        onSelect={(option) => {
          setSelectedPlayerKey(option.key);
          setOpenSheet(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontFamily: font.displayBold, letterSpacing: -0.2 },
  countBadge: { minWidth: 28, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontFamily: font.extrabold },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  filterPill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterText: { maxWidth: 128, fontSize: 13, fontFamily: font.bold },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  legendPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  legendText: { fontSize: 12, fontFamily: font.bold },
  legendMarker: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#F5A623', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F8FA' },
  legendBall: { fontSize: 10, lineHeight: 12 },
  legendDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 2 },
  legendOff: { width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  legendBlock: { width: 8, height: 8, borderRadius: 2 },
  pitch: {
    height: 226,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#247A45',
  },
  pitchStripe: { position: 'absolute', top: 0, bottom: 0 },
  pitchEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  pitchEmptyText: { color: '#fff', fontSize: 13, fontFamily: font.extrabold },
  marker: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep a faint shadow only — a strong drop shadow made markers read as
    // "floating" above the pitch rather than sitting on the grass.
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 1,
    elevation: 1,
  },
  markerBall: { fontSize: 10, lineHeight: 12 },
  markerSave: { width: 7, height: 7, borderRadius: 4, borderWidth: 2 },
  markerOff: { width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  markerBlock: { width: 8, height: 8, borderRadius: 2 },
  summary: { flexDirection: 'row', gap: 10, marginTop: 12 },
  teamSummary: { flex: 1, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.045)', padding: 10, gap: 4 },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  summaryTeam: { fontSize: 13, fontFamily: font.extrabold, letterSpacing: 0.4 },
  summaryMeta: { fontSize: 11, fontFamily: font.medium },
  latest: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  latestMinute: { width: 42, fontSize: 11, fontFamily: font.extrabold },
  latestType: { width: 7, height: 7, borderRadius: 4 },
  latestText: { flex: 1, fontSize: 12, fontFamily: font.semibold },
  latestXg: { fontSize: 11, fontFamily: font.extrabold },
  // absoluteFill (not flex:1) — a GestureHandlerRootView inside a Modal collapses
  // to its content height with flex:1, leaving the backdrop/sheet floating in the
  // middle. Filling the whole modal window lets the anchor pin to the true bottom.
  sheetRoot: { ...StyleSheet.absoluteFillObject },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)' },
  // Sheet pinned to the true bottom edge, above the backdrop.
  sheetAnchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetGrab: { paddingBottom: 2 },
  sheet: {
    maxHeight: SCREEN_H * 0.72,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontFamily: font.displayBold },
  sheetDone: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  sheetDoneText: { fontSize: 12, fontFamily: font.extrabold },
  sheetList: { marginHorizontal: -4, flexShrink: 1 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 },
  sheetRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sheetRadioDot: { width: 10, height: 10, borderRadius: 5 },
  sheetOptionCopy: { flex: 1 },
  sheetOptionText: { fontSize: 15, fontFamily: font.extrabold },
  sheetOptionMeta: { fontSize: 12, fontFamily: font.medium, marginTop: 2 },
});
