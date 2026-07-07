import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

// Icons as text so we avoid any Lucide import crash on web
const TAB_ICONS: Record<string, string> = {
  index:   '⚽',
  bracket: '🏆',
  groups:  '📋',
  teams:   '🚩',
};

function TabIcon({ route, focused }: { route: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <View style={focused ? styles.activeIndicator : null} />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : 60;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8,
          paddingTop: 8,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0px -4px 16px rgba(0,0,0,0.30)' } as any
            : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.3,
                shadowRadius: 16,
                elevation: 20,
              }),
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Nunito_700Bold',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>⚽</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="bracket"
        options={{
          title: 'Bracket',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>🏆</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>📊</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>🌍</Text>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 24,
    opacity: 0.5,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  iconWrap: {},
  iconWrapActive: {},
  activeIndicator: {},
});
