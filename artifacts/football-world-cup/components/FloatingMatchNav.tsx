import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAccent } from '@/hooks/useAccent';
import { useTheme } from '@/hooks/useTheme';
import { useColors } from '@/hooks/useColors';
import { font } from '@/constants/typography';

export interface FloatingMatchNavTab {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

interface FloatingMatchNavProps {
  tabs: FloatingMatchNavTab[];
  activeTab: string;
  onChange: (tab: string) => void;
  bottomInset: number;
  /** Lift above event/commentary scrubber when present. */
  elevated?: boolean;
}

const TAB_MIN_WIDTH = 62;

export function FloatingMatchNav({
  tabs,
  activeTab,
  onChange,
  bottomInset,
  elevated = false,
}: FloatingMatchNavProps) {
  const { accent } = useAccent();
  const { theme } = useTheme();
  const colors = useColors();
  const blurTint = theme === 'white' ? 'systemChromeMaterialLight' : 'systemChromeMaterialDark';
  const borderColor = colors.hairline;
  const inactiveTint = colors.mutedForeground;
  const scrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const viewportWidth = useRef(0);

  const scrollActiveIntoView = useCallback((animated = true) => {
    const layout = tabLayouts.current[activeTab];
    const width = viewportWidth.current;
    if (!layout || width <= 0) return;
    const targetX = Math.max(0, layout.x - width / 2 + layout.width / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated });
  }, [activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => scrollActiveIntoView(true), 32);
    return () => clearTimeout(timer);
  }, [activeTab, scrollActiveIntoView]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomInset + (elevated ? 118 : 6) }]}
    >
      <View style={styles.shadow}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 88 : 56}
          tint={blurTint}
          style={[styles.bar, { borderColor }]}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces
            contentContainerStyle={styles.scrollContent}
            onLayout={(e) => {
              viewportWidth.current = e.nativeEvent.layout.width;
              scrollActiveIntoView(false);
            }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              const Icon = tab.Icon;
              const tint = active ? accent : inactiveTint;
              return (
                <TouchableOpacity
                  key={tab.id}
                  activeOpacity={0.7}
                  onPress={() => onChange(tab.id)}
                  onLayout={(e) => {
                    tabLayouts.current[tab.id] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width,
                    };
                    if (tab.id === activeTab) scrollActiveIntoView(false);
                  }}
                  style={styles.tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Icon size={22} color={tint} strokeWidth={active ? 2.5 : 2} />
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: tint },
                      active && styles.tabLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 18,
  },
  shadow: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: Platform.OS === 'ios' ? 0.28 : 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  bar: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? 'rgba(22,22,24,0.92)' : 'rgba(30,30,32,0.45)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tab: {
    minWidth: TAB_MIN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: font.medium,
    letterSpacing: 0.05,
    textAlign: 'center',
  },
  tabLabelActive: {
    fontFamily: font.bold,
  },
});
