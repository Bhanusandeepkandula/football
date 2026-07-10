import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccentProvider } from '@/hooks/useAccent';
import { LeagueProvider } from '@/hooks/useLeague';
import { FavoritesProvider } from '@/hooks/useFavorites';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useColors } from '@/hooks/useColors';
import { MatchNavStyleProvider } from '@/hooks/useMatchNavStyle';
import { MatchAlertsProvider } from '@/hooks/useMatchAlerts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initTelemetry, captureError } from '@/lib/telemetry';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { themeStatusBarStyle } from '@/constants/colors';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import {
  Oswald_300Light,
  Oswald_400Regular,
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';

SplashScreen.preventAutoHideAsync().catch(() => {});
initTelemetry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      // Keep fetched data fresh for 30s (fast tab/back skips the network) and in
      // cache for an hour, so returning to a screen paints instantly from cache
      // instead of re-entering a loading spinner. Per-query refetchInterval still
      // drives liveness for scoreboards / live match detail.
      staleTime: 30 * 1000,
      gcTime: 60 * 60 * 1000,
    },
  },
});

function RootLayoutNav() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
      {/* Match & team detail open as sheets/overlays too — a consistent
          drag-to-dismiss modal for match/player/team everywhere in the app. */}
      <Stack.Screen
        name="match/[id]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          gestureEnabled: true,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.94],
          sheetCornerRadius: 22,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="team/[id]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          gestureEnabled: true,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.94],
          sheetCornerRadius: 22,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      {/* Player detail as a native iOS sheet (grabber + drag-to-dismiss). */}
      <Stack.Screen
        name="player/[id]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          gestureEnabled: true,
          sheetGrabberVisible: true,
          // Single tall detent — opens fully so the profile is visible at once
          // (drag down to dismiss). Avoids the awkward half-open state.
          sheetAllowedDetents: [0.94],
          sheetCornerRadius: 22,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      {/* Team detail as a sheet — opened from a match card's crest/name tap
          (the full-page team route stays for the Teams tab / standings). */}
      <Stack.Screen
        name="team-sheet/[id]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          gestureEnabled: true,
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.94],
          sheetCornerRadius: 22,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}

function ThemedAppShell({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { theme } = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <StatusBar style={themeStatusBarStyle(theme)} translucent backgroundColor="transparent" />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        {children}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    Oswald_300Light,
    Oswald_400Regular,
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#0A0E1A' }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
      <ErrorBoundary onError={(error, stack) => captureError(error, { componentStack: stack })}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AccentProvider>
              <LeagueProvider>
                <FavoritesProvider>
                  <MatchNavStyleProvider>
                    <MatchAlertsProvider>
                      <ThemedAppShell>
                        <RootLayoutNav />
                      </ThemedAppShell>
                    </MatchAlertsProvider>
                  </MatchNavStyleProvider>
                </FavoritesProvider>
              </LeagueProvider>
            </AccentProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
      {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
    </View>
  );
}
