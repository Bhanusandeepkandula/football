import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router, useSegments } from 'expo-router';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
  runOnJS,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  BarChart2,
  List,
  Layers,
  Trophy,
  Clock,
  Building2,
  Flag,
  Goal,
  Newspaper,
} from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/hooks/useTheme';
import { useMatchDetail, MatchPlayer, MatchEvent, MatchStat, MatchTeamLineup, MatchCommentaryItem, MatchNewsArticle } from '@/hooks/useMatchDetail';
import { useLiveClock } from '@/hooks/useLiveClock';
import { useMatchLiveActivity } from '@/hooks/useMatchLiveActivity';
import { useLiveEventAlerts } from '@/hooks/useLiveEventAlerts';
import { usePolymarketLive } from '@/hooks/usePolymarketLive';
import { useEspnLiveFallback } from '@/hooks/useEspnLiveFallback';
import { mergeMatchDetail } from '@/lib/mergeLiveMatch';
import { PenaltyShootoutCard } from '@/components/PenaltyShootoutCard';
import { MatchAlertBell } from '@/components/MatchAlertBell';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { playerDetailQueryOptions } from '@/hooks/usePlayerDetail';
import { useQueryClient } from '@tanstack/react-query';
import { useFootballNews } from '@/hooks/useFootballNews';
import { font, KICKER_SPACING } from '@/constants/typography';
import { FormationPitch } from '@/components/FormationPitch';
import { EventsTimeline } from '@/components/EventsTimeline';
import { EventScrubber } from '@/components/EventScrubber';
import { StatsBar } from '@/components/StatsBar';
import { ShotMap } from '@/components/ShotMap';
import { XGFlowChart } from '@/components/XGFlowChart';
import { PlayerStatsTable } from '@/components/PlayerStatsTable';
import { CommentaryFeed, commentaryRowsForMode, CommentaryMode } from '@/components/CommentaryFeed';
import { CommentaryScrubber } from '@/components/CommentaryScrubber';
import { NewsSection } from '@/components/NewsSection';
import { GamecastPanel } from '@/components/GamecastPanel';
import { MatchPreviewPanel } from '@/components/MatchPreviewPanel';
import { WinProbabilityBar } from '@/components/WinProbabilityBar';
import { liveWinProbability, preMatchWinProbability, hasSeasonRates } from '@/lib/winProbability';
import { CompareProgressBar } from '@/components/CompareProgressBar';
import { FloatingMatchNav } from '@/components/FloatingMatchNav';
import { MatchDetailSkeleton } from '@/components/MatchDetailSkeleton';
import { useMatchNavStyle } from '@/hooks/useMatchNavStyle';
import { useTeamAccentColors } from '@/hooks/useTeamAccentColors';

type Tab = 'overview' | 'gamecast' | 'lineups' | 'stats' | 'players' | 'commentary' | 'events' | 'news';
type MatchData = NonNullable<ReturnType<typeof useMatchDetail>['data']>;

const TABS = [
  { id: 'overview', label: 'Overview', Icon: Layers },
  { id: 'gamecast', label: 'Gamecast', Icon: Trophy },
  { id: 'lineups', label: 'Lineups', Icon: Users },
  { id: 'stats', label: 'Stats', Icon: BarChart2 },
  { id: 'players', label: 'Players', Icon: Users },
  { id: 'commentary', label: 'Commentary', Icon: List },
  // 'events' tab hidden for now — key events now live in the Overview tab.
  { id: 'news', label: 'News', Icon: Newspaper },
];

const SCRUB_GAP = 8;
// Upper bound on tab count (used for fixed-size layout arrays in the tab bar).
// The *visible* count is dynamic — see `visibleTabs` / `tabCount`.
const TAB_COUNT = TABS.length;

// Which tabs actually have something to show. For an upcoming match most feeds
// are empty (no lineups/stats/commentary yet), so those tabs are hidden and only
// the ones carrying real info are shown. Overview + News are always available.
function tabHasContent(tab: Tab, d: MatchData): boolean {
  switch (tab) {
    case 'overview': return true;
    case 'gamecast':  return d.isLive || d.isFinished || d.events.length > 0 || d.allPlays.length > 0;
    case 'lineups':   return !!d.lineups;
    case 'stats':     return !!d.preview || (d.stats?.length ?? 0) > 0 || d.shots.length > 0;
    case 'players':   return d.playerStats.length > 0;
    case 'commentary':return d.commentary.length > 0 || d.allPlays.length > 0;
    case 'events':    return d.events.length > 0;
    case 'news':      return true;
    default:          return true;
  }
}

function formatKickoff(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

// How long a finished match ran + a knockout indicator, so the score card shows
// duration (90'/120') and AET/PENS rather than a bare "FULL TIME".
function finishedDuration(period: number | undefined, hasShootout: boolean, resultSuffix?: string): { time: string; tag?: string } {
  const suffix = (resultSuffix ?? '').toLowerCase();
  const et = (period ?? 0) >= 3 || hasShootout || /aet|a\.e\.t|extra/.test(suffix);
  return { time: et ? "120′" : "90′", tag: hasShootout ? 'PENS' : et ? 'AET' : undefined };
}

function teamCode(name: string): string {
  const words = name.replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return (words[0] ?? name).slice(0, 3).toUpperCase();
}

export default function MatchDetailScreen() {
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  // The competition this match belongs to (passed by MatchCard, esp. from the
  // aggregated feed) so we fetch the right league without touching global state.
  const matchLeague = typeof params.league === 'string' ? params.league : undefined;
  const colors = useColors();
  const { theme } = useTheme();
  const isLight = theme === 'white';
  const insets = useSafeAreaInsets();
  const { floatingNav } = useMatchNavStyle();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const activeTabRef = useRef<Tab>('overview');
  activeTabRef.current = activeTab;
  const offset = useSharedValue(0);
  const contentWidth = useSharedValue(0);
  const contentWidthRef = useRef(0);
  const activeTabIndex = useSharedValue(0);
  const scrubGestureLock = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const [stripHeight, setStripHeight] = useState(0);
  const [pageW, setPageW] = useState(0);
  const tabHeights = useRef<Record<string, number>>({});
  // Continuous page position (0..N-1). The strip and the tab-bar indicator both
  // read this, so the pill tracks the pages 1:1 through drags and settles.
  const pagePosition = useDerivedValue(() => {
    const w = contentWidth.value;
    return w > 0 ? offset.value / w : activeTabIndex.value;
  });
  const { data: espnData, isLoading, isError, refetch } = useMatchDetail(id, matchLeague);

  const polymarketRef = useMemo(
    () => (espnData
      ? {
          homeAbbr: espnData.homeTeam.abbreviation,
          awayAbbr: espnData.awayTeam.abbreviation,
          homeName: espnData.homeTeam.displayName,
          awayName: espnData.awayTeam.displayName,
          date: espnData.date,
        }
      : undefined),
    [espnData?.homeTeam.abbreviation, espnData?.awayTeam.abbreviation, espnData?.homeTeam.displayName, espnData?.awayTeam.displayName, espnData?.date],
  );

  // Polymarket = primary instant feed; ESPN fills stats / play-by-play in background.
  const { live: polyLive, fresh: polyFresh } = usePolymarketLive(
    polymarketRef && espnData && !espnData.isFinished ? polymarketRef : undefined,
  );
  const data = useMemo(
    () => (espnData && polyLive && polyFresh ? mergeMatchDetail(espnData, polyLive) : espnData),
    [espnData, polyLive, polyFresh],
  );

  useEspnLiveFallback(
    id,
    polymarketRef,
    !!(espnData?.isLive || (polyFresh && polyLive?.isLive)),
    refetch,
    matchLeague,
  );

  const live = useLiveClock(
    data?.displayClock,
    data?.clockRunning ?? false,
    `${data?.displayClock ?? ''}|${data?.period ?? ''}|${data?.status ?? ''}`,
  );

  // This screen is reused for the full-page match/[id] route AND the
  // match-sheet/[id] formSheet. In a sheet there's no status bar to clear (the
  // OS grabber sits up top), and the safe-area top inset can leak the full-screen
  // value — so use a small fixed top pad in the sheet, real inset on the page.
  const segments = useSegments();
  const isSheet = segments[0] === 'match-sheet';
  const topPad = isSheet
    ? 8
    : Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const { homeColor, awayColor, vizHome, vizAway } = useTeamAccentColors(data?.homeTeam, data?.awayTeam);

  // Mirror a live match into the iOS Dynamic Island / Live Activity (no-op unless
  // running a native build with the LiveActivity module).
  useMatchLiveActivity(data, live.minute, homeColor, awayColor);
  // Fire local goal/HT/FT alerts for this match if the user subscribed.
  useLiveEventAlerts(data);
  const [commentaryMode, setCommentaryMode] = useState<CommentaryMode>('commentary');
  // Memoised: this screen re-renders every second for live matches (the clock),
  // so don't re-run the commentary parse unless the underlying data/mode changes.
  const commentaryRows = useMemo(
    () => (data ? commentaryRowsForMode(data.commentary ?? [], data.allPlays ?? [], commentaryMode).rows : []),
    [data, commentaryMode],
  );

  // Only surface tabs that actually carry data (upcoming matches hide the empty
  // feeds). Falls back to the full set until the match data has loaded.
  const visibleTabs = useMemo(
    () => (data ? TABS.filter((t) => tabHasContent(t.id as Tab, data)) : TABS),
    [data],
  );
  const tabCount = visibleTabs.length;

  // ── Scroll + collapsing header ─────────────────────────────────────────────
  const scrollRef = useRef<any>(null);
  const [heroHeight, setHeroHeight] = useState(220);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const compactHeaderRef = useRef(false);

  // ── Events scrubber wiring ─────────────────────────────────────────────────
  const eventOffsets = useRef<{ containerY: number; rows: number[] }>({ containerY: 0, rows: [] });
  const [activeEvent, setActiveEvent] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = activeEvent;
  const commentaryOffsets = useRef<{ containerY: number; rows: number[] }>({ containerY: 0, rows: [] });
  const [activeCommentary, setActiveCommentary] = useState(0);
  const activeCommentaryRef = useRef(0);
  activeCommentaryRef.current = activeCommentary;
  const lastSync = useRef(0);
  const seeking = useRef(false);

  const targetForRow = useCallback((idx: number) => {
    const rows = eventOffsets.current.rows;
    if (rows[idx] == null) return 0;
    return Math.max(0, heroHeight + eventOffsets.current.containerY + rows[idx] - SCRUB_GAP);
  }, [heroHeight]);

  const targetForCommentaryRow = useCallback((idx: number) => {
    const rows = commentaryOffsets.current.rows;
    if (rows[idx] == null) return 0;
    return Math.max(0, heroHeight + commentaryOffsets.current.containerY + rows[idx] - SCRUB_GAP);
  }, [heroHeight]);

  const seekToEvent = useCallback((idx: number) => {
    seeking.current = true;
    setActiveEvent(idx);
    scrollRef.current?.scrollTo?.({ y: targetForRow(idx), animated: true });
    setTimeout(() => { seeking.current = false; }, 350);
  }, [targetForRow]);

  const seekToCommentary = useCallback((idx: number) => {
    seeking.current = true;
    setActiveCommentary(idx);
    scrollRef.current?.scrollTo?.({ y: targetForCommentaryRow(idx), animated: true });
    setTimeout(() => { seeking.current = false; }, 350);
  }, [targetForCommentaryRow]);

  // Continuous drag: scroll 1:1 with the thumb, interpolating between the
  // measured y-offset of each event so the timeline tracks the finger smoothly.
  const scrubTo = useCallback((fraction: number) => {
    const rows = eventOffsets.current.rows;
    const count = rows.length;
    if (count === 0) return;
    seeking.current = true;
    const pos = Math.min(count - 1, Math.max(0, fraction * (count - 1)));
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, count - 1);
    const f = pos - i0;
    const y = targetForRow(i0) * (1 - f) + targetForRow(i1) * f;
    scrollRef.current?.scrollTo?.({ y: Math.max(0, y), animated: false });
    const idx = Math.round(pos);
    setActiveEvent((prev) => (prev === idx ? prev : idx));
  }, [targetForRow]);

  const scrubCommentaryTo = useCallback((fraction: number) => {
    const rows = commentaryOffsets.current.rows;
    const count = rows.length;
    if (count === 0) return;
    seeking.current = true;
    const pos = Math.min(count - 1, Math.max(0, fraction * (count - 1)));
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, count - 1);
    const f = pos - i0;
    const y = targetForCommentaryRow(i0) * (1 - f) + targetForCommentaryRow(i1) * f;
    scrollRef.current?.scrollTo?.({ y: Math.max(0, y), animated: false });
    const idx = Math.round(pos);
    setActiveCommentary((prev) => (prev === idx ? prev : idx));
  }, [targetForCommentaryRow]);

  const scrubEnd = useCallback(() => {
    scrollRef.current?.scrollTo?.({ y: targetForRow(activeRef.current), animated: true });
    setTimeout(() => { seeking.current = false; }, 280);
  }, [targetForRow]);

  const scrubCommentaryEnd = useCallback(() => {
    scrollRef.current?.scrollTo?.({ y: targetForCommentaryRow(activeCommentaryRef.current), animated: true });
    setTimeout(() => { seeking.current = false; }, 280);
  }, [targetForCommentaryRow]);

  const syncActiveFromScroll = useCallback((y: number) => {
    if ((activeTab !== 'events' && activeTab !== 'commentary') || seeking.current) return;
    const now = Date.now();
    if (now - lastSync.current < 90) return;
    lastSync.current = now;
    const isCommentary = activeTab === 'commentary';
    const rows = isCommentary ? commentaryOffsets.current.rows : eventOffsets.current.rows;
    if (rows.length === 0) return;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs((isCommentary ? targetForCommentaryRow(i) : targetForRow(i)) - y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (isCommentary) {
      setActiveCommentary((prev) => (prev === best ? prev : best));
    } else {
      setActiveEvent((prev) => (prev === best ? prev : best));
    }
  }, [activeTab, targetForCommentaryRow, targetForRow]);

  const syncHeaderFromScroll = useCallback((y: number) => {
    // Hysteresis: compact score only after the hero scrolls away; restore the
    // title header once the scorecard is back on screen (fixes stuck compact).
    const showAt = Math.max(heroHeight - 64, 80);
    const hideAt = Math.max(heroHeight * 0.38, 56);

    if (compactHeaderRef.current) {
      if (y <= hideAt) {
        compactHeaderRef.current = false;
        setShowCompactHeader(false);
      }
    } else if (y >= showAt) {
      compactHeaderRef.current = true;
      setShowCompactHeader(true);
    }
  }, [heroHeight]);

  const lastScrollY = useRef(0);
  const syncFromScroll = useCallback((y: number) => {
    lastScrollY.current = y;
    syncHeaderFromScroll(y);
    syncActiveFromScroll(y);
  }, [syncHeaderFromScroll, syncActiveFromScroll]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(syncFromScroll)(e.contentOffset.y);
    },
  }, [syncFromScroll]);

  // Fade the top team-colour wash out as the hero scrolls away, so scrolled
  // content sits on a clean background (the header keeps its own colour).
  const topWashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, Math.max(heroHeight * 0.75, 120)],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const resetMatchScroll = useCallback((animated = false) => {
    compactHeaderRef.current = false;
    setShowCompactHeader(false);
    scrollRef.current?.scrollTo?.({ y: 0, animated });
  }, []);

  // When changing tabs, if we're scrolled past the hero, snap up to exactly the
  // "hero hidden" point. That keeps the header collapsed/minimal AND lands the
  // incoming tab at its own content-top instead of the previous tab's deep
  // scroll offset (all tabs share one scroll). No-op when already above the hero.
  const snapToContentTop = useCallback(() => {
    if (lastScrollY.current > heroHeight) {
      lastScrollY.current = heroHeight;
      scrollRef.current?.scrollTo?.({ y: heroHeight, animated: false });
    }
  }, [heroHeight]);

  const resetTabOffsets = useCallback(() => {
    // Only reset the active index on a tab change — do NOT wipe the measured row
    // offsets. The pager pre-mounts the events/commentary pages as neighbours, so
    // their rows are already laid out; clearing the offsets here left the scrubber
    // with nothing to seek to (it only worked again after a mode switch forced a
    // re-layout). Stale offsets are cleared on match change (id effect) and when
    // the commentary mode changes (onModeChange) — both of which re-measure.
    setActiveEvent(0);
    setActiveCommentary(0);
  }, []);

  // Land on a new tab. Pages are pinned by index so a commit only shifts which
  // neighbours are mounted — nothing moves on screen. We DON'T reset the
  // vertical scroll: the collapsed score header + scroll depth carry across tabs.
  const commitPagerTab = useCallback((targetIndex: number) => {
    resetTabOffsets();
    const tab = visibleTabs[targetIndex]?.id as Tab | undefined;
    if (tab) setActiveTab(tab);
    activeTabIndex.value = targetIndex;
  }, [resetTabOffsets, activeTabIndex, visibleTabs]);

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === activeTabRef.current) {
      resetMatchScroll(true);
      return;
    }
    const cur = visibleTabs.findIndex((t) => t.id === activeTabRef.current);
    const target = visibleTabs.findIndex((t) => t.id === tab);
    if (target < 0) return;
    snapToContentTop();
    resetTabOffsets();
    setActiveTab(tab);
    activeTabIndex.value = target;
    const w = contentWidthRef.current;
    cancelAnimation(offset);
    if (w > 0) {
      if (Math.abs(target - cur) === 1) {
        // Adjacent → glide (the page we came from is still mounted in the window).
        offset.value = withTiming(target * w, { duration: 300, easing: Easing.out(Easing.cubic) });
      } else {
        // Far → snap (intermediate pages aren't mounted, a slide would blank).
        offset.value = target * w;
      }
    }
  }, [snapToContentTop, resetTabOffsets, resetMatchScroll, activeTabIndex, offset, visibleTabs]);

  useEffect(() => {
    activeTabIndex.value = visibleTabs.findIndex((t) => t.id === activeTab);
  }, [activeTab, activeTabIndex, visibleTabs]);

  const setScrubGestureActive = useCallback((active: boolean) => {
    scrubGestureLock.value = active;
  }, [scrubGestureLock]);

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -offset.value }],
  }));

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-14, 14])
        // Grab the strip out of any in-flight settle so a swipe is never blocked,
        // and snap up to content-top so the incoming page slides in from ITS top
        // (not the previous tab's deep scroll) while the header stays collapsed.
        .onStart(() => {
          'worklet';
          cancelAnimation(offset);
          if (!scrubGestureLock.value) runOnJS(snapToContentTop)();
        })
        .onUpdate((e) => {
          'worklet';
          if (scrubGestureLock.value) return;
          const w = contentWidth.value;
          const i = activeTabIndex.value;
          let tx = e.translationX;
          // Rubber-band at the first / last tab so the strip resists past the edge.
          if (i <= 0 && tx > 0) tx *= 0.25;
          if (i >= tabCount - 1 && tx < 0) tx *= 0.25;
          offset.value = i * w - tx;
        })
        .onEnd((e) => {
          'worklet';
          if (scrubGestureLock.value) return;
          const w = contentWidth.value;
          const i = activeTabIndex.value;
          if (w <= 0) return;
          const tx = e.translationX;
          const vx = e.velocityX;
          const goNext = i < tabCount - 1 && (tx < -w * 0.2 || vx < -400);
          const goPrev = i > 0 && (tx > w * 0.2 || vx > 400);
          const target = goNext ? i + 1 : goPrev ? i - 1 : i;
          if (target !== i) {
            // Commit immediately (the page we're leaving stays mounted because it
            // is adjacent to the target), then just glide the strip into place.
            activeTabIndex.value = target;
            runOnJS(commitPagerTab)(target);
          }
          offset.value = withTiming(target * w, { duration: 300, easing: Easing.out(Easing.cubic) });
        }),
    [activeTabIndex, contentWidth, offset, scrubGestureLock, commitPagerTab, snapToContentTop, tabCount],
  );

  useEffect(() => {
    eventOffsets.current = { containerY: 0, rows: [] };
    commentaryOffsets.current = { containerY: 0, rows: [] };
    setActiveTab('overview');
    setActiveEvent(0);
    setActiveCommentary(0);
    setCommentaryMode('commentary');
    cancelAnimation(offset);
    offset.value = 0;
    activeTabIndex.value = 0;
    setTimeout(() => resetMatchScroll(false), 0);
  }, [id, resetMatchScroll, offset, activeTabIndex]);

  const isEventsTab = activeTab === 'events';
  const isCommentaryTab = activeTab === 'commentary';
  const hasBottomScrubber = isEventsTab || isCommentaryTab;
  const floatNavPad = floatingNav ? (hasBottomScrubber ? 132 : 70) : 0;
  const bottomPad = insets.bottom + (hasBottomScrubber ? 150 : 40) + floatNavPad;

  // Each mounted page reports its height; the strip takes the active page's
  // height so the shared vertical ScrollView extends to the right length.
  const setPageHeight = useCallback((tab: Tab, h: number) => {
    if (h <= 0 || tabHeights.current[tab] === h) return;
    tabHeights.current[tab] = h;
    if (tab === activeTabRef.current) setStripHeight(h);
  }, []);
  useEffect(() => {
    const h = tabHeights.current[activeTab];
    if (h) setStripHeight(h);
  }, [activeTab]);

  // Pager window: only the active tab and its immediate neighbours are mounted,
  // each pinned to its own column (left = index * pageWidth) so a swipe reveals
  // the adjacent page 1:1 and committing never re-mounts / shifts anything.
  const activeIndex = visibleTabs.findIndex((t) => t.id === activeTab);
  const windowIndices = Array.from(
    new Set([activeIndex - 1, activeIndex, activeIndex + 1].filter((x) => x >= 0 && x < tabCount)),
  );

  const renderTab = (tab: Tab) => {
    if (!data) return null;
    switch (tab) {
      case 'overview':
        return <OverviewTab data={data} homeColor={vizHome} awayColor={vizAway} colors={colors} onNavigate={handleTabChange} />;
      case 'gamecast':
        return <GamecastPanel data={data} homeColor={vizHome} awayColor={vizAway} onNavigate={handleTabChange} />;
      case 'lineups':
        return <LineupsTab lineups={data.lineups} homeColor={vizHome} awayColor={vizAway} colors={colors} />;
      case 'stats':
        return data.preview ? (
          <MatchPreviewPanel data={data} preview={data.preview} homeColor={vizHome} awayColor={vizAway} />
        ) : (
          <>
            <XGFlowChart shots={data.shots ?? []} homeTeam={data.homeTeam} awayTeam={data.awayTeam} homeColor={vizHome} awayColor={vizAway} />
            <ShotMap shots={data.shots ?? []} homeTeam={data.homeTeam} awayTeam={data.awayTeam} homeColor={vizHome} awayColor={vizAway} />
            <StatsBar stats={data.stats} homeColor={vizHome} awayColor={vizAway} />
          </>
        );
      case 'players':
        return <PlayerStatsTable teams={data.playerStats ?? []} homeColor={vizHome} awayColor={vizAway} />;
      case 'commentary':
        return (
          <CommentaryFeed
            eventId={data.id}
            leagueSlug={matchLeague}
            commentary={data.commentary ?? []}
            allPlays={data.allPlays ?? []}
            homeLogo={data.homeTeam.logo}
            awayLogo={data.awayTeam.logo}
            homeColor={vizHome}
            awayColor={vizAway}
            mode={commentaryMode}
            activeIndex={activeCommentary}
            onModeChange={(mode) => {
              commentaryOffsets.current = { containerY: 0, rows: [] };
              setCommentaryMode(mode);
            }}
            onActiveIndexChange={setActiveCommentary}
            onContainerLayout={(y) => { commentaryOffsets.current.containerY = y; }}
            onRowLayout={(idx, y) => { commentaryOffsets.current.rows[idx] = y; }}
          />
        );
      case 'events':
        return (
          <View style={{ paddingTop: 14 }}>
            <EventsTimeline
              events={data.events}
              homeTeam={data.homeTeam}
              awayTeam={data.awayTeam}
              activeIndex={activeEvent}
              onContainerLayout={(y) => { eventOffsets.current.containerY = y; }}
              onRowLayout={(idx, y) => { eventOffsets.current.rows[idx] = y; }}
            />
          </View>
        );
      case 'news':
        return <NewsTab matchNews={data.news} colors={colors} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Subtle two-team colour wash at the very top, fading into the page bg
          and fading OUT entirely as you scroll past the hero. */}
      <Animated.View pointerEvents="none" style={[styles.topWash, topWashStyle]}>
        <LinearGradient
          // Lighter tint on the white theme — the full-alpha wash reads as muddy
          // over a white page, so soften it in light mode.
          colors={
            isLight
              ? [homeColor + '10', 'transparent', 'transparent', awayColor + '10']
              : [homeColor + '2E', homeColor + '18', awayColor + '18', awayColor + '2E']
          }
          locations={[0, 0.42, 0.58, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <CompactScoreHeader
        data={data}
        topPad={topPad}
        liveMinute={live.minute}
        showCompact={showCompactHeader}
        homeColor={homeColor}
        awayColor={awayColor}
      />

      {isLoading ? (
        <MatchDetailSkeleton bottomPad={insets.bottom + 40} />
      ) : isError || !data ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Failed to load match</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Animated.ScrollView
            ref={scrollRef}
            style={styles.root}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={floatingNav ? undefined : [1]}
            contentContainerStyle={{ paddingBottom: bottomPad }}
          >
            <View onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}>
              <ScoreHero data={data} homeColor={homeColor} awayColor={awayColor} liveMinute={live.minute} leagueSlug={matchLeague} />
            </View>

            {!floatingNav ? (
              <MatchTabs
                tabs={visibleTabs}
                activeTab={activeTab}
                onChange={handleTabChange}
                position={pagePosition}
              />
            ) : null}

            <GestureDetector gesture={swipeGesture}>
            <View
              style={styles.tabContentClip}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                contentWidthRef.current = w;
                contentWidth.value = w;
                setPageW(w);
                // Re-anchor the strip to the active page whenever the width changes.
                offset.value = visibleTabs.findIndex((t) => t.id === activeTabRef.current) * w;
              }}
            >
              <Animated.View style={[styles.tabStrip, stripStyle, stripHeight > 0 ? { height: stripHeight } : null]}>
                {pageW > 0 && windowIndices.map((index) => {
                  const tab = visibleTabs[index].id as Tab;
                  return (
                    <View key={tab} style={[styles.tabPage, { left: index * pageW, width: pageW }]}>
                      <View onLayout={(e) => setPageHeight(tab, e.nativeEvent.layout.height)}>
                        {renderTab(tab)}
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
            </View>
            </GestureDetector>
          </Animated.ScrollView>

          {isEventsTab && data.events.length > 0 ? (
            <EventScrubber
              events={data.events}
              homeTeam={data.homeTeam}
              awayTeam={data.awayTeam}
              activeIndex={activeEvent}
              onSeek={seekToEvent}
              onScrub={scrubTo}
              onScrubEnd={scrubEnd}
              bottomInset={insets.bottom}
              onGestureActive={setScrubGestureActive}
            />
          ) : null}
          {isCommentaryTab && commentaryRows.length > 0 ? (
            <CommentaryScrubber
              rows={commentaryRows}
              activeIndex={Math.min(activeCommentary, commentaryRows.length - 1)}
              onSeek={seekToCommentary}
              onScrub={scrubCommentaryTo}
              onScrubEnd={scrubCommentaryEnd}
              bottomInset={insets.bottom}
              homeColor={vizHome}
              awayColor={vizAway}
              onGestureActive={setScrubGestureActive}
            />
          ) : null}
          {floatingNav ? (
            <FloatingMatchNav
              tabs={visibleTabs}
              activeTab={activeTab}
              onChange={(tab) => handleTabChange(tab as Tab)}
              bottomInset={insets.bottom}
              elevated={hasBottomScrubber}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function CompactScoreHeader({
  data,
  topPad,
  liveMinute,
  showCompact,
  homeColor,
  awayColor,
}: {
  data?: MatchData;
  topPad: number;
  liveMinute?: string | null;
  showCompact: boolean;
  homeColor: string;
  awayColor: string;
}) {
  const colors = useColors();
  const status = data?.isLive
    ? liveMinute ?? data.statusDetail ?? 'LIVE'
    : data?.isFinished
      ? data.resultSuffix ? `FT · ${data.resultSuffix}` : 'FT'
      : data?.statusDetail ?? 'MATCH CENTRE';

  return (
    <View style={[styles.scoreHeader, { paddingTop: topPad, backgroundColor: showCompact ? colors.background : 'transparent', borderBottomColor: showCompact ? colors.separator : 'transparent' }]}>
      {/* Keep the two-team colour wash alive behind the collapsed score bar. */}
      {showCompact ? (
        <LinearGradient
          pointerEvents="none"
          colors={[homeColor + '2E', 'transparent', awayColor + '2E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.scoreHeaderRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={27} color={colors.foreground} strokeWidth={2.6} />
        </TouchableOpacity>

        <View style={styles.scoreHeaderCenter} pointerEvents="none">
          {data && showCompact ? (
            <View style={styles.compactBoard}>
              <Text style={[styles.compactTeamCode, { color: colors.foreground }]}>{teamCode(data.homeTeam.displayName)}</Text>
              {data.homeTeam.logo ? (
                <Image source={{ uri: data.homeTeam.logo }} style={styles.compactLogo} resizeMode="contain" />
              ) : null}
              <View style={styles.compactScoreStack}>
                <Text style={[styles.compactStatus, { color: data.isLive ? colors.live : colors.mutedForeground }]}>{status}</Text>
                <Text style={[styles.compactScore, { color: colors.foreground }]}>
                  {data.homeTeam.score || '0'}–{data.awayTeam.score || '0'}
                </Text>
              </View>
              {data.awayTeam.logo ? (
                <Image source={{ uri: data.awayTeam.logo }} style={styles.compactLogo} resizeMode="contain" />
              ) : null}
              <Text style={[styles.compactTeamCode, { color: colors.foreground }]}>{teamCode(data.awayTeam.displayName)}</Text>
            </View>
          ) : (
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>MATCH CENTRE</Text>
          )}
        </View>

        <View style={styles.headerSide}>
          {data && !data.isFinished ? (
            <MatchAlertBell
              match={{
                id: data.id,
                homeName: data.homeTeam.displayName,
                awayName: data.awayTeam.displayName,
                kickoff: new Date(data.date),
                groupLabel: data.round,
              }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Score hero (in-page, collapses into header on scroll) ─────────────────────

function ScoreHero({ data, homeColor, awayColor, liveMinute, leagueSlug }: {
  data: MatchData;
  homeColor: string;
  awayColor: string;
  liveMinute?: string | null;
  leagueSlug?: string;
}) {
  const colors = useColors();
  const { theme } = useTheme();
  const isLight = theme === 'white';
  const finishedInfo = finishedDuration(data.period, !!data.shootout, data.resultSuffix);
  const status = data.isLive
    ? liveMinute ?? data.statusDetail ?? 'LIVE'
    : data.isFinished
      ? data.resultSuffix ? `FULL TIME · ${data.resultSuffix}` : 'FULL TIME'
      : formatKickoff(data.date) || 'UPCOMING';

  // Winner emphasis (respects a penalty shootout when regulation ended level) —
  // kept subtle: winner stays white, loser goes muted grey. No colour tricks.
  const hs = Number(data.homeTeam.score || 0);
  const as = Number(data.awayTeam.score || 0);
  let homeWin = false;
  let awayWin = false;
  if (data.isFinished) {
    if (data.shootout) { homeWin = data.shootout.home > data.shootout.away; awayWin = !homeWin; }
    else { homeWin = hs > as; awayWin = as > hs; }
  }
  const homeScoreColor = awayWin ? colors.mutedForeground : colors.foreground;
  const awayScoreColor = homeWin ? colors.mutedForeground : colors.foreground;

  return (
    <View style={styles.heroWrap}>
      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {/* The page's two-team wash bleeds into the top of the card — a subtle
            colour pop that fades into the card background. */}
        <View pointerEvents="none" style={styles.heroTopWash}>
          <LinearGradient
            colors={isLight ? [homeColor + '0E', 'transparent', awayColor + '0E'] : [homeColor + '38', 'transparent', awayColor + '38']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.hero}>
          {data.round ? (
            <Text style={[styles.heroRound, { color: colors.mutedForeground }]} numberOfLines={1}>
              {data.round.toUpperCase()}
            </Text>
          ) : null}

          <View style={styles.heroBoard}>
            <HeroTeam name={data.homeTeam.displayName} logo={data.homeTeam.logo} color={homeColor} winner={homeWin} dim={awayWin} teamId={data.homeTeam.id} leagueSlug={leagueSlug} />

            <View style={styles.heroCenter}>
              {data.isLive ? (
                <View style={[styles.livePill, { backgroundColor: colors.live }]}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              ) : data.isFinished ? (
                <Text style={[styles.heroStatus, { color: colors.mutedForeground }]} numberOfLines={1}>FULL TIME</Text>
              ) : (
                <Text style={[styles.heroStatus, { color: colors.mutedForeground }]} numberOfLines={1}>{status}</Text>
              )}

              <View style={styles.heroScoreRow}>
                <Text style={[styles.heroScore, { color: homeScoreColor }]}>{data.homeTeam.score || '0'}</Text>
                <Text style={[styles.heroScoreSep, { color: colors.mutedForeground }]}>–</Text>
                <Text style={[styles.heroScore, { color: awayScoreColor }]}>{data.awayTeam.score || '0'}</Text>
              </View>

              {data.isLive ? (
                <View style={[styles.timeBadge, { backgroundColor: colors.secondary }]}>
                  <Clock size={11} color={colors.primary} strokeWidth={2.6} />
                  <Text style={[styles.timeBadgeText, { color: colors.foreground }]}>{liveMinute ?? data.statusDetail ?? '—'}</Text>
                </View>
              ) : data.isFinished ? (
                <View style={styles.heroFooter}>
                  <View style={styles.finishedRow}>
                    <View style={[styles.timeBadge, { backgroundColor: colors.secondary }]}>
                      <Clock size={11} color={colors.primary} strokeWidth={2.6} />
                      <Text style={[styles.timeBadgeText, { color: colors.foreground }]}>{finishedInfo.time}</Text>
                    </View>
                    {finishedInfo.tag ? (
                      <View style={[styles.indicatorChip, { borderColor: colors.hairline }]}>
                        <Text style={[styles.indicatorChipText, { color: colors.mutedForeground }]}>{finishedInfo.tag}</Text>
                      </View>
                    ) : null}
                  </View>
                  {data.shootout ? (
                    <Text style={[styles.heroPens, { color: colors.mutedForeground }]}>
                      Pens {data.shootout.home}–{data.shootout.away}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            <HeroTeam name={data.awayTeam.displayName} logo={data.awayTeam.logo} color={awayColor} winner={awayWin} dim={homeWin} teamId={data.awayTeam.id} leagueSlug={leagueSlug} />
          </View>
        </View>
      </View>
    </View>
  );
}

function HeroTeam({ name, logo, color, dim, teamId, leagueSlug }: {
  name: string; logo: string; color: string; winner?: boolean; dim?: boolean;
  teamId?: string; leagueSlug?: string;
}) {
  const colors = useColors();
  // Only the team block (crest + name) opens the team sheet — not the whole hero,
  // so tapping the score/centre does nothing.
  return (
    <TouchableOpacity
      style={[styles.heroTeam, dim && { opacity: 0.7 }]}
      activeOpacity={0.6}
      disabled={!teamId}
      onPress={() => teamId && router.push(`/team-sheet/${teamId}${leagueSlug ? `?league=${leagueSlug}` : ''}` as any)}
      accessibilityRole="button"
      accessibilityLabel={teamId ? `${name} team profile` : name}
    >
      {logo ? (
        <Image source={{ uri: logo }} style={styles.heroLogo} resizeMode="contain" />
      ) : (
        <View style={[styles.heroLogo, { backgroundColor: color, borderRadius: 30 }]} />
      )}
      <Text style={[styles.heroTeamName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
      <Text style={[styles.heroTeamCode, { color: colors.mutedForeground }]}>{teamCode(name)}</Text>
    </TouchableOpacity>
  );
}

function pillFromProgress(
  xs: number[],
  ws: number[],
  idx: number,
  prog: number,
  count: number,
): { x: number; w: number } {
  'worklet';
  const safeIdx = Math.max(0, Math.min(count - 1, Math.floor(idx)));
  let x = xs[safeIdx] ?? 0;
  let w = ws[safeIdx] ?? 0;

  if (prog > 0 && safeIdx < count - 1) {
    const t = Math.min(1, prog);
    const nextX = xs[safeIdx + 1] ?? x;
    const nextW = ws[safeIdx + 1] ?? w;
    x = x + t * (nextX - x);
    w = w + t * (nextW - w);
  } else if (prog < 0 && safeIdx > 0) {
    const t = Math.min(1, -prog);
    const prevX = xs[safeIdx - 1] ?? x;
    const prevW = ws[safeIdx - 1] ?? w;
    x = x - t * (x - prevX);
    w = w + t * (prevW - w);
  }

  return { x, w };
}

function MatchTabs({
  tabs,
  activeTab,
  onChange,
  position,
}: {
  tabs: { id: string; label: string; Icon: any }[];
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  position: SharedValue<number>;
}) {
  const colors = useColors();
  const count = tabs.length;
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const layoutSlots = useRef(Array.from({ length: TAB_COUNT }, () => ({ x: 0, w: 0 })));
  const tabLayoutsX = useSharedValue<number[]>(Array(TAB_COUNT).fill(0));
  const tabLayoutsW = useSharedValue<number[]>(Array(TAB_COUNT).fill(0));
  const indX = useSharedValue(0);
  const indW = useSharedValue(0);

  const pushLayoutsToShared = useCallback(() => {
    tabLayoutsX.value = layoutSlots.current.map((slot) => slot.x);
    tabLayoutsW.value = layoutSlots.current.map((slot) => slot.w);
  }, [tabLayoutsX, tabLayoutsW]);

  const syncIndicatorToTab = useCallback((tabId: Tab, animated = false) => {
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index < 0) return;
    const slot = layoutSlots.current[index];
    if (!slot || slot.w <= 0) return;
    const ease = { duration: 220, easing: Easing.out(Easing.cubic) };
    if (animated) {
      indX.value = withTiming(slot.x, ease);
      indW.value = withTiming(slot.w, ease);
    } else {
      indX.value = slot.x;
      indW.value = slot.w;
    }
  }, [indX, indW, tabs]);

  const scrollToActive = useCallback((animated = true) => {
    const layout = tabLayouts.current[activeTab];
    const width = viewportWidth.current;
    if (!layout || width <= 0) return;
    const targetX = Math.max(0, layout.x - width / 2 + layout.width / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated });
  }, [activeTab]);

  useEffect(() => {
    pushLayoutsToShared();
    syncIndicatorToTab(activeTab, false);
    const timer = setTimeout(() => scrollToActive(true), 16);
    return () => clearTimeout(timer);
  }, [activeTab, pushLayoutsToShared, syncIndicatorToTab, scrollToActive]);

  const recordTabLayout = useCallback((index: number, tabId: Tab, x: number, width: number) => {
    layoutSlots.current[index] = { x, w: width };
    tabLayouts.current[tabId] = { x, width };
    pushLayoutsToShared();
    if (tabId === activeTab) {
      indX.value = x;
      indW.value = width;
    }
  }, [activeTab, pushLayoutsToShared, indX, indW]);

  const indicatorStyle = useAnimatedStyle(() => {
    const pos = Math.max(0, Math.min(count - 1, position.value));
    const idx = Math.floor(pos);
    const prog = pos - idx;
    const pill = pillFromProgress(tabLayoutsX.value, tabLayoutsW.value, idx, prog, count);
    if (pill.w > 0) {
      return {
        transform: [{ translateX: pill.x }],
        width: pill.w,
      };
    }

    return {
      transform: [{ translateX: indX.value }],
      width: Math.max(indW.value, 0),
    };
  });

  // Clean solid nav surface — like ESPN/FotMob/Apple Sports the tab bar is a
  // neutral strip; the team colour lives in the score hero, not the tabs.
  // Opaque so scrolled content never bleeds through the sticky nav.
  return (
    <View style={[styles.matchTabsBar, { backgroundColor: colors.background, borderBottomColor: colors.separator }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces
        alwaysBounceHorizontal
        directionalLockEnabled
        decelerationRate="normal"
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        style={[styles.matchTabs, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}
        contentContainerStyle={styles.matchTabsContent}
        onLayout={(event) => {
          viewportWidth.current = event.nativeEvent.layout.width;
          syncIndicatorToTab(activeTab, false);
          scrollToActive(false);
        }}
      >
      <View style={styles.matchTabsRow}>
        <Animated.View
          pointerEvents="none"
          style={[styles.tabIndicator, { backgroundColor: colors.muted, borderColor: colors.separator }, indicatorStyle]}
        />
        {tabs.map((tab, index) => {
          const active = tab.id === activeTab;
          const Icon = tab.Icon;
          return (
            <TouchableOpacity
              key={tab.id}
              activeOpacity={0.7}
              onPress={() => onChange(tab.id as Tab)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                recordTabLayout(index, tab.id as Tab, x, width);
                if (tab.id === activeTab) scrollToActive(false);
              }}
              style={styles.matchTab}
            >
              <Icon size={15} color={active ? colors.foreground : colors.mutedForeground} strokeWidth={active ? 2.4 : 2} />
              <Text style={[styles.matchTabText, { color: active ? colors.foreground : colors.mutedForeground, opacity: active ? 1 : 0.72 }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      </ScrollView>
    </View>
  );
}

// ─── News tab ─────────────────────────────────────────────────────────────────

function NewsTab({ matchNews, colors }: {
  matchNews: MatchNewsArticle[];
  colors: ReturnType<typeof useColors>;
}) {
  const { data: leagueNews, isLoading } = useFootballNews();
  const matchKeys = new Set(matchNews.map((a) => (a.headline || '').trim().toLowerCase()));
  const tournament = (leagueNews ?? []).filter((a) => !matchKeys.has((a.headline || '').trim().toLowerCase()));
  const hasAny = matchNews.length > 0 || tournament.length > 0;

  if (!hasAny) {
    return (
      <View style={styles.centered}>
        {isLoading ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading news…</Text>
          </>
        ) : (
          <>
            <Newspaper size={40} color={colors.mutedForeground} strokeWidth={1.8} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No news yet</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ paddingTop: 16 }}>
      {matchNews.length > 0 ? <NewsSection news={matchNews} title="THIS MATCH" /> : null}
      {tournament.length > 0 ? <NewsSection news={tournament} title="AROUND THE TOURNAMENT" max={14} /> : null}
    </View>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

const OVERVIEW_STAT_NAMES = ['totalShots', 'shotsOnTarget', 'expectedGoals', 'wonCorners', 'foulsCommitted'];

const OVERVIEW_STAT_LABELS: Record<string, string> = {
  totalShots: 'Shots',
  shotsOnTarget: 'Shots on Target',
  expectedGoals: 'Expected Goals (xG)',
  wonCorners: 'Corners',
  foulsCommitted: 'Fouls',
};

function statNumeric(value: string): number {
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function PossessionSummary({ possession, homeColor, awayColor, colors }: {
  possession: MatchStat;
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  const homePct = Math.round(possession.homePercent);
  const awayPct = 100 - homePct;
  return (
    <View style={styles.possWrap}>
      <View style={styles.possHead}>
        <Text style={[styles.possValue, { color: colors.foreground }]}>{homePct}%</Text>
        <Text style={[styles.possKicker, { color: colors.mutedForeground }]}>POSSESSION</Text>
        <Text style={[styles.possValue, { color: colors.foreground }]}>{awayPct}%</Text>
      </View>
      <CompareProgressBar
        homePct={homePct}
        awayPct={awayPct}
        homeColor={homeColor}
        awayColor={awayColor}
      />
    </View>
  );
}

function KeyStatRow({ stat, label, homeColor, awayColor, colors, shaded }: {
  stat: MatchStat;
  label: string;
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
  shaded: boolean;
}) {
  const h = statNumeric(stat.homeValue);
  const a = statNumeric(stat.awayValue);
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;
  const awayPct = total > 0 ? (a / total) * 100 : 50;
  const homeLeads = h > a;
  const awayLeads = a > h;
  return (
    <View style={[styles.keyStatRow, shaded && { backgroundColor: colors.rowShade }]}>
      <View style={styles.keyStatHead}>
        <Text style={[styles.keyStatValue, { color: colors.foreground, fontFamily: homeLeads ? font.extrabold : font.semibold }]}>
          {stat.homeValue}
        </Text>
        <Text style={[styles.keyStatLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.keyStatValue, styles.keyStatValueRight, { color: colors.foreground, fontFamily: awayLeads ? font.extrabold : font.semibold }]}>
          {stat.awayValue}
        </Text>
      </View>
      <CompareProgressBar
        homePct={homePct}
        awayPct={awayPct}
        homeColor={homeColor}
        awayColor={awayColor}
      />
    </View>
  );
}

function CardsSummary({ home, away, colors }: {
  home: { yellow: number; red: number };
  away: { yellow: number; red: number };
  colors: ReturnType<typeof useColors>;
}) {
  const chip = (count: number, color: string, key: string) =>
    count > 0 ? (
      <View key={key} style={styles.cardCount}>
        <View style={[styles.cardMark, { backgroundColor: color }]} />
        <Text style={[styles.cardCountText, { color: colors.foreground }]}>{count}</Text>
      </View>
    ) : null;
  return (
    <View style={[styles.cardsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={styles.cardsSide}>
        {chip(home.yellow, '#F5A623', 'hy')}
        {chip(home.red, '#E74C3C', 'hr')}
      </View>
      <Text style={[styles.cardsLabel, { color: colors.mutedForeground }]}>DISCIPLINE</Text>
      <View style={[styles.cardsSide, { justifyContent: 'flex-end' }]}>
        {chip(away.yellow, '#F5A623', 'ay')}
        {chip(away.red, '#E74C3C', 'ar')}
      </View>
    </View>
  );
}

function KeyEventRow({ item, homeColor, awayColor, colors, last }: {
  item: MatchCommentaryItem;
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
  last: boolean;
}) {
  const accent = item.teamSide === 'away' ? awayColor : item.teamSide === 'home' ? homeColor : colors.mutedForeground;
  const isGoal = `${item.title ?? ''} ${item.text}`.toLowerCase().includes('goal');
  return (
    <View style={[styles.keyEventRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <View style={styles.keyEventMinuteCol}>
        {item.minute ? (
          <Text style={[styles.keyEventMinute, { color: colors.foreground }]}>{item.minute}</Text>
        ) : (
          <View style={[styles.keyEventDot, { backgroundColor: accent }]} />
        )}
      </View>
      <View style={[styles.keyEventAccent, { backgroundColor: accent }]} />
      <View style={styles.keyEventBody}>
        {item.title ? (
          <View style={styles.keyEventTitleRow}>
            {isGoal ? <Goal size={13} color={accent} fill={accent} /> : null}
            <Text style={[styles.keyEventTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
          </View>
        ) : null}
        {item.text ? (
          <Text style={[styles.keyEventText, { color: colors.mutedForeground }]} numberOfLines={2}>{item.text}</Text>
        ) : null}
      </View>
    </View>
  );
}

function OverviewTab({ data, homeColor, awayColor, colors, onNavigate }: {
  data: MatchData;
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
  onNavigate: (tab: Tab) => void;
}) {
  if (!data) return null;
  const goals = data.events.filter((e) => e.type === 'goal');
  const homeGoals = goals.filter((g) => g.teamId === data.homeTeam.id);
  const awayGoals = goals.filter((g) => g.teamId === data.awayTeam.id);

  // Compact match-at-a-glance: possession + the handful of stats that tell the
  // story, so Overview stands on its own without diving into the Stats tab.
  const possession = data.stats.find((s) => s.name === 'possessionPct');
  const keyStats = OVERVIEW_STAT_NAMES
    .map((name) => data.stats.find((s) => s.name === name))
    .filter((s): s is MatchStat => !!s);
  const hasSummary = !!possession || keyStats.length > 0;

  const cards = data.events.filter((e) => e.type === 'yellow-card' || e.type === 'red-card');
  const homeCards = { yellow: 0, red: 0 };
  const awayCards = { yellow: 0, red: 0 };
  for (const c of cards) {
    const bucket = c.teamId === data.homeTeam.id ? homeCards : awayCards;
    if (c.type === 'red-card') bucket.red += 1; else bucket.yellow += 1;
  }
  const hasCards = homeCards.yellow + homeCards.red + awayCards.yellow + awayCards.red > 0;

  const info: { Icon: any; label: string; value: string }[] = [];
  if (data.round) info.push({ Icon: Trophy, label: 'Competition', value: data.round });
  const kickoff = formatKickoff(data.date);
  if (kickoff) info.push({ Icon: Clock, label: 'Kick-off', value: kickoff });
  if (data.venue) info.push({ Icon: MapPin, label: 'Stadium', value: data.venue });
  if (data.city) info.push({ Icon: Building2, label: 'City', value: data.city });
  if (data.referee) info.push({ Icon: Flag, label: 'Referee', value: data.referee });
  if (data.attendance) info.push({ Icon: Users, label: 'Attendance', value: data.attendance.toLocaleString('en-US') });

  // Win probability — a pre-match prediction (from each team's season scoring
  // form) for upcoming matches, or the live model once the ball is rolling.
  // Cheap enough to compute inline (no hook, to respect the early return above).
  let winProb: { p: { home: number; draw: number; away: number }; caption: string } | null = null;
  if (!data.isFinished) {
    if (data.isLive) {
      const minute = parseInt(String(data.displayClock ?? '').match(/\d+/)?.[0] ?? '', 10) || 0;
      let hR = 0, aR = 0;
      for (const e of data.events) {
        if (e.type !== 'red-card') continue;
        if (e.teamId === data.awayTeam.id) aR++;
        else if (e.teamId === data.homeTeam.id) hR++;
      }
      winProb = {
        p: liveWinProbability({
          homeScore: parseInt(data.homeTeam.score || '0', 10) || 0,
          awayScore: parseInt(data.awayTeam.score || '0', 10) || 0,
          minute, homeReds: hR, awayReds: aR, isFinished: false, period: data.period,
        }),
        caption: 'Live model · updates with score & clock',
      };
    } else {
      const ts = data.preview?.teamStats ?? [];
      const g = ts.find((s) => s.name === 'avgGoals');
      const gc = ts.find((s) => s.name === 'avgGoalsConceded');
      const rates = {
        homeAvgGoals: g?.homeValue, awayAvgGoals: g?.awayValue,
        homeAvgConceded: gc?.homeValue, awayAvgConceded: gc?.awayValue,
      };
      winProb = {
        p: preMatchWinProbability(rates),
        // Only claim "season form" when the model actually used it (matching
        // hasSeasonRates), else it's the home-advantage baseline.
        caption: hasSeasonRates(rates) ? 'Prediction from season scoring form' : 'Prediction · home-advantage baseline',
      };
    }
  }

  return (
    <View style={{ paddingTop: 12 }}>
      {data.shootout ? (
        <View style={[styles.section, { marginBottom: 18 }]}>
          <PenaltyShootoutCard
            home={data.homeTeam}
            away={data.awayTeam}
            shootout={data.shootout}
            homeColor={homeColor}
            awayColor={awayColor}
          />
        </View>
      ) : null}

      {winProb ? (
        <View style={styles.section}>
          <SectionHeader title="Win Probability" colors={colors} />
          <View style={{ marginHorizontal: 16 }}>
            <WinProbabilityBar
              home={winProb.p.home}
              draw={winProb.p.draw}
              away={winProb.p.away}
              homeColor={homeColor}
              awayColor={awayColor}
              homeLabel={teamCode(data.homeTeam.displayName)}
              awayLabel={teamCode(data.awayTeam.displayName)}
              caption={winProb.caption}
            />
          </View>
        </View>
      ) : null}

      {goals.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Goals" colors={colors} actionable />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onNavigate('commentary')}
            style={[styles.goalsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}
          >
            <View style={styles.goalsCol}>
              {homeGoals.map((g, i) => (
                <ScorerRow key={g.id + i} event={g} colors={colors} align="left" />
              ))}
              {homeGoals.length === 0 ? <Text style={[styles.noScorer, { color: colors.mutedForeground }]}>—</Text> : null}
            </View>
            <View style={[styles.goalsDivider, { backgroundColor: colors.separator }]} />
            <View style={styles.goalsCol}>
              {awayGoals.map((g, i) => (
                <ScorerRow key={g.id + i} event={g} colors={colors} align="right" />
              ))}
              {awayGoals.length === 0 ? <Text style={[styles.noScorer, { color: colors.mutedForeground, textAlign: 'right' }]}>—</Text> : null}
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {info.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Match Info" colors={colors} />
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            {info.map((row, i) => (
              <View
                key={row.label}
                style={[
                  styles.infoRow,
                  i < info.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                ]}
              >
                <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
                  <row.Icon size={15} color={colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {hasSummary ? (
        <View style={styles.section}>
          <SectionHeader title="Match Stats" colors={colors} actionable />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onNavigate('stats')}
            style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.separator }]}
          >
            {possession ? (
              <PossessionSummary possession={possession} homeColor={homeColor} awayColor={awayColor} colors={colors} />
            ) : null}
            {keyStats.map((stat, i) => (
              <KeyStatRow
                key={stat.name}
                stat={stat}
                label={OVERVIEW_STAT_LABELS[stat.name] ?? stat.displayName}
                homeColor={homeColor}
                awayColor={awayColor}
                colors={colors}
                shaded={i % 2 === 1}
              />
            ))}
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.9} onPress={() => onNavigate('stats')}>
        <XGFlowChart
          shots={data.shots ?? []}
          homeTeam={data.homeTeam}
          awayTeam={data.awayTeam}
          homeColor={homeColor}
          awayColor={awayColor}
        />
      </TouchableOpacity>

      {hasCards ? (
        <TouchableOpacity activeOpacity={0.85} onPress={() => onNavigate('stats')} style={styles.section}>
          <CardsSummary home={homeCards} away={awayCards} colors={colors} />
        </TouchableOpacity>
      ) : null}

      {data.events.length > 0 ? (
        <View style={styles.section}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onNavigate('commentary')}>
            <SectionHeader title="Key Events" colors={colors} actionable />
          </TouchableOpacity>
          {/* Driven by ESPN keyEvents (always populated live) — the old
              commentary-derived list went blank during live matches. */}
          <EventsTimeline events={data.events} homeTeam={data.homeTeam} awayTeam={data.awayTeam} />
        </View>
      ) : null}
    </View>
  );
}

function ScorerRow({ event, colors, align }: {
  event: MatchEvent; colors: ReturnType<typeof useColors>; align: 'left' | 'right';
}) {
  const name = event.playerName || event.text.split(' – ')[0];
  return (
    <View style={[styles.scorerRow, align === 'right' && { flexDirection: 'row-reverse' }]}>
      <Goal size={13} color={colors.primary} fill={colors.primary} />
      <Text style={[styles.scorerName, { color: colors.foreground }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.scorerMin, { color: colors.mutedForeground }]}>{event.clock}′</Text>
    </View>
  );
}

// ─── Lineups tab ──────────────────────────────────────────────────────────────

const PLAYER_STAT_CHIPS: { keys: string[]; label: string }[] = [
  { keys: ['goals'], label: 'G' },
  { keys: ['goalAssists', 'assists'], label: 'A' },
  { keys: ['shotsTotal', 'totalShots'], label: 'Shots' },
  { keys: ['saves'], label: 'Saves' },
  { keys: ['foulsCommitted'], label: 'Fouls' },
  { keys: ['wonCorners'], label: 'Corners' },
];

function playerChips(p: MatchPlayer): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  for (const c of PLAYER_STAT_CHIPS) {
    const key = c.keys.find((k) => p.stats[k] != null && p.stats[k] !== '' && p.stats[k] !== '0');
    if (key) chips.push({ label: c.label, value: p.stats[key] });
    if (chips.length >= 3) break;
  }
  return chips;
}

function LineupsTab({ lineups, homeColor, awayColor, colors }: {
  lineups: MatchData['lineups'];
  homeColor: string;
  awayColor: string;
  colors: ReturnType<typeof useColors>;
}) {
  const [side, setSide] = useState<'home' | 'away'>('home');

  if (!lineups) {
    return (
      <View style={styles.centered}>
        <Users size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Lineups not announced yet
        </Text>
      </View>
    );
  }

  const [home, away] = lineups;
  const active = side === 'home' ? home : away;
  const activeColor = side === 'home' ? homeColor : awayColor;

  return (
    <View style={{ paddingTop: 14 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <FormationPitch home={home} away={away} homeColor={homeColor} awayColor={awayColor} />
      </View>

      {/* Team switcher below the pitch */}
      <View style={styles.teamSwitch}>
        <TeamTab
          lineup={home}
          color={homeColor}
          active={side === 'home'}
          onPress={() => setSide('home')}
          colors={colors}
        />
        <TeamTab
          lineup={away}
          color={awayColor}
          active={side === 'away'}
          onPress={() => setSide('away')}
          colors={colors}
        />
      </View>

      <PlayerListSection title="Starting XI" players={active.starters} color={activeColor} colors={colors} />
      <PlayerListSection title="Substitutes" players={active.bench} color={activeColor} colors={colors} isBench />
    </View>
  );
}

function TeamTab({ lineup, color, active, onPress, colors }: {
  lineup: MatchTeamLineup;
  color: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.teamTab,
        { backgroundColor: active ? colors.cardElevated : 'transparent' },
      ]}
    >
      {lineup.team.logo ? (
        <Image source={{ uri: lineup.team.logo }} style={styles.teamTabLogo} resizeMode="contain" />
      ) : (
        <View style={[styles.teamTabLogo, { backgroundColor: color, borderRadius: 4 }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.teamTabName, { color: active ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
          {lineup.team.displayName}
        </Text>
        {lineup.formation ? (
          <Text style={[styles.teamTabFormation, { color: colors.mutedForeground }]}>{lineup.formation}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function PlayerListSection({ title, players, color, colors, isBench }: {
  title: string;
  players: MatchPlayer[];
  color: string;
  colors: ReturnType<typeof useColors>;
  isBench?: boolean;
}) {
  if (players.length === 0) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.playerSectionHeader}>
        <View style={[styles.playerSectionDot, { backgroundColor: color }]} />
        <Text style={[styles.playerSectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
        <Text style={[styles.playerSectionCount, { color: colors.mutedForeground }]}>{players.length}</Text>
      </View>
      <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {players.map((p, i) => (
          <PlayerRow
            key={p.id + i}
            player={p}
            colors={colors}
            last={i === players.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

function PlayerRow({ player: p, colors, last }: {
  player: MatchPlayer;
  colors: ReturnType<typeof useColors>;
  last: boolean;
}) {
  const qc = useQueryClient();
  const chips = playerChips(p);
  const hasYellow = p.stats['yellowCards'] && p.stats['yellowCards'] !== '0';
  const hasRed = p.stats['redCards'] && p.stats['redCards'] !== '0';
  const goals = p.stats['goals'] && p.stats['goals'] !== '0' ? Number(p.stats['goals']) : 0;

  return (
    <TouchableOpacity
      activeOpacity={p.id ? 0.6 : 1}
      onPress={() => p.id && router.push(`/player/${p.id}` as any)}
      onPressIn={() => p.id && qc.prefetchQuery(playerDetailQueryOptions(p.id))}
      style={[
        styles.playerRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
    >
      {/* Jersey number */}
      <Text style={[styles.jersey, { color: colors.mutedForeground }]}>{p.jersey || '–'}</Text>

      {/* Headshot — ESPN, else TheSportsDB fallback (rounded rect) */}
      <PlayerAvatar
        id={p.id}
        name={p.displayName}
        headshot={p.headshot}
        size={42}
        radius={12}
        fallback={(p.displayName[0] ?? p.positionGroup[0]).toUpperCase()}
      />

      {/* Name + position */}
      <View style={styles.playerInfo}>
        <View style={styles.playerNameRow}>
          <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>{p.displayName}</Text>
          {goals > 0 ? (
            <View style={styles.goalTag}>
              <Goal size={11} color={colors.primary} fill={colors.primary} />
              {goals > 1 ? <Text style={[styles.goalTagText, { color: colors.primary }]}>×{goals}</Text> : null}
            </View>
          ) : null}
          {hasYellow ? <View style={[styles.cardChip, { backgroundColor: '#F5A623' }]} /> : null}
          {hasRed ? <View style={[styles.cardChip, { backgroundColor: '#E74C3C' }]} /> : null}
        </View>
        <View style={styles.chipRow}>
          <View style={[styles.posPill, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.posPillText, { color: colors.mutedForeground }]}>{p.position}</Text>
          </View>
          {chips.map((c) => (
            <Text key={c.label} style={[styles.statChip, { color: colors.mutedForeground }]}>
              <Text style={{ color: colors.foreground, fontFamily: font.extrabold }}>{c.value}</Text> {c.label}
            </Text>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, actionable }: { title: string; colors: ReturnType<typeof useColors>; actionable?: boolean }) {
  const colors = useColors();
  if (actionable) {
    return (
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
        <ChevronRight size={15} color={colors.mutedForeground} strokeWidth={2.4} style={styles.sectionHeaderChevron} />
      </View>
    );
  }
  return (
    <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  topWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  tabContentClip: { overflow: 'hidden' },
  tabStrip: { position: 'relative', width: '100%', minHeight: 120 },
  tabPage: { position: 'absolute', top: 0 },
  scoreHeader: {
    paddingHorizontal: 10,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scoreHeaderRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  scoreHeaderCenter: {
    position: 'absolute',
    left: 54,
    right: 54,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  headerSide: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, lineHeight: 22, fontFamily: font.displaySemi, letterSpacing: 1.2, textAlign: 'center', includeFontPadding: false },
  compactBoard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  compactTeamCode: {
    fontSize: 15,
    fontFamily: font.extrabold,
    letterSpacing: 0.3,
  },
  compactLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  compactScoreStack: {
    minWidth: 72,
    alignItems: 'center',
  },
  compactStatus: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: font.extrabold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: -2,
    includeFontPadding: false,
  },
  compactScore: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: font.extrabold,
    letterSpacing: -0.2,
    includeFontPadding: false,
  },

  // Hero
  heroWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  heroTopWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  heroGlowLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '58%',
  },
  heroGlowRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '58%',
  },
  hero: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },
  heroRound: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: font.displaySemi,
    letterSpacing: KICKER_SPACING,
    marginBottom: 14,
  },
  heroBoard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTeam: { flex: 1, alignItems: 'center', gap: 8 },
  heroLogo: { width: 60, height: 60 },
  heroTeamName: { fontSize: 14, fontFamily: font.bold, textAlign: 'center' },
  heroTeamCode: { fontSize: 11, fontFamily: font.extrabold, letterSpacing: 1 },
  heroTeamAccent: { width: 24, height: 3, borderRadius: 2, marginTop: 2 },
  heroCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    minWidth: 124,
    minHeight: 118,
    gap: 8,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  livePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 11, fontFamily: font.extrabold, letterSpacing: 0.5 },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  timeBadgeText: { fontSize: 12, fontFamily: font.extrabold, letterSpacing: 0.2 },
  heroFooter: { alignItems: 'center', gap: 6, marginTop: 2 },
  finishedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  indicatorChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  indicatorChipText: { fontSize: 11, fontFamily: font.extrabold, letterSpacing: 0.4 },
  heroStatus: { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.4, textAlign: 'center' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroScore: { fontSize: 52, fontFamily: font.displayBold, lineHeight: 58, letterSpacing: -1, textAlign: 'center' },
  heroScoreSep: { fontSize: 30, fontFamily: font.displayLight, lineHeight: 40 },
  heroPens: { fontSize: 12, fontFamily: font.bold },
  heroColorBar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 16 },
  heroColorSeg: { flex: 1 },

  matchTabsBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  matchTabs: {},
  matchTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  matchTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
  },
  matchTabText: {
    fontSize: 13,
    fontFamily: font.bold,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200, paddingVertical: 40 },
  loadingText: { fontSize: 14, fontFamily: 'Nunito_400Regular', marginTop: 8 },
  errorText: { fontSize: 15, fontFamily: 'Nunito_400Regular' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { fontSize: 14, fontFamily: 'Nunito_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Nunito_400Regular', textAlign: 'center', marginTop: 8 },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.displaySemi,
    letterSpacing: KICKER_SPACING,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderChevron: { marginRight: 18, marginBottom: 8 },

  // Goals card
  goalsCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  goalsCol: { flex: 1, gap: 8, justifyContent: 'center' },
  goalsDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  scorerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scorerName: { flexShrink: 1, fontSize: 13, fontFamily: 'Nunito_600SemiBold' },
  scorerMin: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  noScorer: { fontSize: 14, fontFamily: 'Nunito_400Regular' },

  // Info card
  infoCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  infoIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 14, fontFamily: 'Nunito_500Medium' },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: 'Nunito_600SemiBold' },

  // Team switcher
  teamSwitch: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(118,118,128,0.16)',
  },
  teamTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
  },
  teamTabAccent: { width: 4, height: 4, borderRadius: 2 },
  teamTabLogo: { width: 24, height: 24 },
  teamTabName: { fontSize: 13, fontFamily: font.extrabold },
  teamTabFormation: { fontSize: 11, fontFamily: font.semibold, marginTop: 1 },

  // Player list
  playerSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  playerSectionDot: { width: 8, height: 8, borderRadius: 4 },
  playerSectionTitle: { fontSize: 12, fontFamily: 'Nunito_700Bold', letterSpacing: 0.6, flex: 1 },
  playerSectionCount: { fontSize: 12, fontFamily: font.extrabold },
  playerCard: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  jersey: { width: 20, textAlign: 'center', fontSize: 14, fontFamily: font.extrabold },
  headshot: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  headshotPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  headshotInitial: { fontSize: 16, fontFamily: font.extrabold },
  playerInfo: { flex: 1, gap: 5 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  playerName: { flexShrink: 1, fontSize: 14, fontFamily: font.bold },
  goalTag: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  goalTagText: { fontSize: 11, fontFamily: font.extrabold },
  cardChip: { width: 9, height: 13, borderRadius: 2 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  posPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  posPillText: { fontSize: 10, fontFamily: font.extrabold, letterSpacing: 0.4 },
  statChip: { fontSize: 11, fontFamily: font.semibold },

  // Overview → Match Stats snapshot
  statsCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  possWrap: { gap: 9, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  possHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  possValue: { fontSize: 20, fontFamily: font.displayBold, letterSpacing: -0.3 },
  possKicker: { fontSize: 11, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  keyStatRow: { paddingVertical: 11, paddingHorizontal: 16, gap: 8 },
  keyStatHead: { flexDirection: 'row', alignItems: 'center' },
  keyStatValue: { width: 48, fontSize: 15, textAlign: 'left' },
  keyStatValueRight: { textAlign: 'right' },
  keyStatLabel: { flex: 1, fontSize: 12.5, fontFamily: font.semibold, textAlign: 'center' },

  // Overview → Discipline
  cardsCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardsSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardsLabel: { fontSize: 11, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  cardCount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMark: { width: 11, height: 15, borderRadius: 2 },
  cardCountText: { fontSize: 14, fontFamily: font.extrabold },

  // Overview → Key Events (from commentary)
  keyEventsCard: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  keyEventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  keyEventMinuteCol: { width: 34, alignItems: 'center', paddingTop: 1 },
  keyEventMinute: { fontSize: 13, fontFamily: font.extrabold },
  keyEventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  keyEventAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  keyEventBody: { flex: 1, gap: 3 },
  keyEventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyEventTitle: { flex: 1, fontSize: 14, fontFamily: font.extrabold },
  keyEventText: { fontSize: 13, lineHeight: 18, fontFamily: font.medium },
});
