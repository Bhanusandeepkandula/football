import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDecay,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Svg, Path } from 'react-native-svg';
import { List, AlignJustify, Minus, Trophy } from 'lucide-react-native';
import { BracketRound, EspnCompetitor, EspnGroup, EspnStandingEntry } from '@/hooks/useWorldCup';
import { useColors } from '@/hooks/useColors';
import { font, KICKER_SPACING } from '@/constants/typography';

// ── Geometry ──────────────────────────────────────────────────────────────────
const PAD = 16;
const HEADER_H = 46;
const GROUP_W = 162;
const GROUP_HEAD = 22;
const GROUP_ROW_H = 24;
const GROUP_GAP = 12;
const KO_CARD_W = 150;
const KO_CARD_H = 56;
const COL_GAP = 48;
const KO_COL = KO_CARD_W + COL_GAP;
const KO_PITCH = KO_CARD_H + 16;
const CHIP = 17;

const KO_ORDER = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
const KO_KEYS = ['R32', 'R16', 'QF', 'SF', 'F'];
const TAB_DEFS = [
  { key: 'GS', Icon: List },
  { key: 'R32', Icon: AlignJustify },
  { key: 'R16', Icon: AlignJustify },
  { key: 'QF', Icon: AlignJustify },
  { key: 'SF', Icon: Minus },
  { key: 'F', Icon: Trophy },
];

function getCompetitors(event: BracketRound['events'][number]) {
  const cs = event.competitions?.[0]?.competitors ?? [];
  return { home: cs.find((c: EspnCompetitor) => c.homeAway === 'home'), away: cs.find((c: EspnCompetitor) => c.homeAway === 'away') };
}
function isPlaceholder(c?: EspnCompetitor): boolean {
  if (!c?.team) return true;
  const a = c.team.abbreviation?.trim().toUpperCase() ?? '';
  const n = c.team.displayName?.trim().toLowerCase() ?? '';
  return ['TBD', 'R32', 'R16', 'QF', 'SF'].includes(a) || n.includes('winner') || n.includes('round of') || n.includes('final');
}
function abbr(name?: string): string {
  if (!name) return 'TBD';
  return name.replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || name.slice(0, 3).toUpperCase();
}
function winnerOf(home?: EspnCompetitor, away?: EspnCompetitor) {
  const w = [home, away].find((c) => c?.winner);
  return isPlaceholder(w) ? undefined : w;
}
function groupStat(entry: EspnStandingEntry, name: string): string {
  const s = entry.stats?.find((st) => st.name?.toLowerCase() === name);
  return s?.displayValue ?? (s?.value != null ? String(s.value) : '');
}

interface KoNode {
  event: BracketRound['events'][number];
  r: number;
  i: number;
  x: number;
  centerY: number;
  home?: EspnCompetitor;
  away?: EspnCompetitor;
}

type Colors = ReturnType<typeof useColors>;

function TeamChip({ logo, color, colors }: { logo?: string; color?: string; colors: Colors }) {
  if (logo) return <Image source={{ uri: logo }} style={styles.chip} resizeMode="cover" />;
  return <View style={[styles.chip, { backgroundColor: color ? `#${color}` : colors.muted }]} />;
}

function KoLine({ competitor, colors }: { competitor?: EspnCompetitor; colors: Colors }) {
  const placeholder = isPlaceholder(competitor);
  const code = placeholder ? 'TBD' : competitor!.team.abbreviation || abbr(competitor!.team.displayName);
  const win = competitor?.winner === true;
  const score = !placeholder && competitor?.score != null && competitor.score !== '' ? String(competitor.score) : '';
  return (
    <View style={styles.koRow}>
      <TeamChip logo={placeholder ? undefined : competitor?.team?.logo} color={competitor?.team?.color} colors={colors} />
      <Text
        style={[styles.koCode, { color: placeholder ? colors.mutedForeground : colors.foreground, fontFamily: win ? font.extrabold : font.semibold }]}
        numberOfLines={1}
      >
        {code}
      </Text>
      <Text style={[styles.koScore, { color: win ? colors.primary : colors.mutedForeground }]}>{score}</Text>
    </View>
  );
}

function KoCard({ node, colors }: { node: KoNode; colors: Colors }) {
  const win = winnerOf(node.home, node.away);
  return (
    <View
      style={[
        styles.koCard,
        { left: node.x, top: node.centerY - KO_CARD_H / 2, backgroundColor: colors.cardElevated, borderColor: win ? colors.primary + '44' : colors.separator },
      ]}
    >
      <KoLine competitor={node.home} colors={colors} />
      <View style={[styles.koDivider, { backgroundColor: colors.separator }]} />
      <KoLine competitor={node.away} colors={colors} />
    </View>
  );
}

function GroupBox({ group, x, y, colors }: { group: EspnGroup; x: number; y: number; colors: Colors }) {
  const entries = (group.standings?.entries ?? []).slice(0, 4);
  return (
    <View style={[styles.groupBox, { left: x, top: y, width: GROUP_W, backgroundColor: colors.cardElevated, borderColor: colors.separator }]}>
      <Text style={[styles.groupName, { color: colors.mutedForeground }]} numberOfLines={1}>{group.name?.toUpperCase() ?? 'GROUP'}</Text>
      {entries.map((e, i) => {
        const qualified = i < 2;
        return (
          <View key={e.team?.id ?? i} style={styles.grpRow}>
            <Text style={[styles.grpRank, { color: qualified ? colors.primary : colors.mutedForeground }]}>{i + 1}</Text>
            <TeamChip logo={e.team?.logo} color={(e.team as any)?.color} colors={colors} />
            <Text style={[styles.grpCode, { color: colors.foreground }]} numberOfLines={1}>
              {e.team?.abbreviation || abbr(e.team?.displayName)}
            </Text>
            <Text style={[styles.grpPts, { color: colors.mutedForeground }]}>{groupStat(e, 'points')}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function BracketTree({ rounds, groups = [] }: { rounds: BracketRound[]; groups?: EspnGroup[] }) {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState('GS');

  const model = useMemo(() => {
    const ko = KO_ORDER.map((name) => rounds.find((r) => r.name === name)).filter(Boolean) as BracketRound[];
    const koX = (r: number) => PAD + GROUP_W + COL_GAP + r * KO_COL;

    const nodes: KoNode[][] = ko.map((round, r) =>
      round.events.map((event, i) => {
        const { home, away } = getCompetitors(event);
        return { event, r, i, x: koX(r), centerY: PAD + HEADER_H + (i + 0.5) * KO_PITCH * Math.pow(2, r), home, away };
      }),
    );

    const conns: { d: string; gold: boolean }[] = [];
    for (let r = 1; r < nodes.length; r++) {
      nodes[r].forEach((parent, pi) => {
        [2 * pi, 2 * pi + 1].forEach((ci) => {
          const child = nodes[r - 1]?.[ci];
          if (!child) return;
          const cr = child.x + KO_CARD_W;
          const pl = parent.x;
          const mid = (cr + pl) / 2;
          conns.push({ d: `M ${cr} ${child.centerY} H ${mid} V ${parent.centerY} H ${pl}`, gold: !!winnerOf(child.home, child.away) });
        });
      });
    }

    // Group boxes (left column)
    const boxH = GROUP_HEAD + 4 * GROUP_ROW_H + 12;
    const groupPos = groups.map((g, i) => ({ g, x: PAD, y: PAD + HEADER_H + i * (boxH + GROUP_GAP) }));

    const flat = nodes.flat();
    const koBottom = flat.reduce((m, n) => Math.max(m, n.centerY + KO_CARD_H / 2), 0);
    const groupBottom = groupPos.length ? groupPos[groupPos.length - 1].y + boxH : 0;
    const lastX = ko.length ? koX(ko.length - 1) + KO_CARD_W : PAD + GROUP_W;

    // Tab → target x (align that column near the left edge under the header)
    const tabX: Record<string, number> = { GS: PAD };
    ko.forEach((_, r) => { tabX[KO_KEYS[r]] = koX(r); });

    return {
      nodes, conns, groupPos,
      contentW: lastX + PAD,
      contentH: Math.max(koBottom, groupBottom) + PAD,
      tabX,
    };
  }, [rounds, groups]);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const minX = Math.min(0, viewport.w - model.contentW);
  const minY = Math.min(0, viewport.h - model.contentH);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => { 'worklet'; cancelAnimation(tx); cancelAnimation(ty); sx.value = tx.value; sy.value = ty.value; })
        .onUpdate((e) => {
          'worklet';
          tx.value = Math.min(0, Math.max(minX, sx.value + e.translationX));
          ty.value = Math.min(0, Math.max(minY, sy.value + e.translationY));
        })
        .onEnd((e) => {
          'worklet';
          tx.value = withDecay({ velocity: e.velocityX, clamp: [minX, 0] });
          ty.value = withDecay({ velocity: e.velocityY, clamp: [minY, 0] });
        }),
    [minX, minY, sx, sy, tx, ty],
  );

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }] }));

  const goToTab = (key: string) => {
    setActiveTab(key);
    const target = model.tabX[key];
    if (target == null) return;
    cancelAnimation(tx);
    const dest = Math.min(0, Math.max(minX, -(target - PAD)));
    tx.value = withTiming(dest, { duration: 320, easing: Easing.out(Easing.cubic) });
  };

  return (
    <View
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.hairline }]}
      onLayout={(e) => setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ width: model.contentW, height: model.contentH }, contentStyle]}>
          <Svg width={model.contentW} height={model.contentH} style={StyleSheet.absoluteFill}>
            {model.conns.map((c, i) => (
              <Path key={i} d={c.d} fill="none" stroke={c.gold ? colors.primary + '66' : colors.separator} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
          {model.groupPos.map(({ g, x, y }, i) => (
            <GroupBox key={g.name ?? i} group={g} x={x} y={y} colors={colors} />
          ))}
          {model.nodes.flat().map((n) => (
            <KoCard key={`${n.r}-${n.i}-${n.event.id}`} node={n} colors={colors} />
          ))}
        </Animated.View>
      </GestureDetector>

      {/* Round tab bar (fixed) */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.separator }]}>
        {TAB_DEFS.map((t) => {
          const active = t.key === activeTab;
          return (
            <TouchableOpacity key={t.key} activeOpacity={0.8} onPress={() => goToTab(t.key)} style={[styles.tab, active && { backgroundColor: colors.primary }]}>
              <t.Icon size={13} color={active ? colors.primaryForeground : colors.mutedForeground} strokeWidth={2.4} />
              <Text style={[styles.tabText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{t.key}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.hint, { backgroundColor: colors.secondary }]} pointerEvents="none">
        <Text style={[styles.hintText, { color: colors.mutedForeground }]}>Drag to explore</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', position: 'relative' },

  tabBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_H,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 30, borderRadius: 15 },
  tabText: { fontSize: 12, fontFamily: font.extrabold, letterSpacing: 0.3 },

  koCard: { position: 'absolute', width: KO_CARD_W, height: KO_CARD_H, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, justifyContent: 'center' },
  koDivider: { height: StyleSheet.hairlineWidth, marginVertical: 3 },
  koRow: { flexDirection: 'row', alignItems: 'center', gap: 7, height: (KO_CARD_H - 12) / 2 },
  koCode: { flex: 1, fontSize: 12.5, letterSpacing: 0.3 },
  koScore: { fontSize: 13, fontFamily: font.extrabold, minWidth: 12, textAlign: 'right' },

  groupBox: { position: 'absolute', borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 6 },
  groupName: { fontSize: 10, fontFamily: font.extrabold, letterSpacing: KICKER_SPACING * 0.5, height: GROUP_HEAD - 6, marginBottom: 2 },
  grpRow: { flexDirection: 'row', alignItems: 'center', gap: 7, height: GROUP_ROW_H },
  grpRank: { width: 12, fontSize: 11, fontFamily: font.extrabold, textAlign: 'center' },
  grpCode: { flex: 1, fontSize: 12, fontFamily: font.semibold },
  grpPts: { fontSize: 12, fontFamily: font.extrabold },

  chip: { width: CHIP, height: CHIP, borderRadius: CHIP / 2 },

  hint: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  hintText: { fontSize: 10, fontFamily: font.bold, letterSpacing: 0.4 },
});
