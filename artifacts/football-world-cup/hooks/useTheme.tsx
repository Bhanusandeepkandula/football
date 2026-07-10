import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeId } from '@/constants/colors';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  preview: string;
  previewBorder?: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'dark', name: 'Dark', preview: '#000000', previewBorder: 'rgba(255,255,255,0.2)' },
  { id: 'white', name: 'White', preview: '#FFFFFF', previewBorder: 'rgba(0,0,0,0.12)' },
  { id: 'grey', name: 'Grey', preview: '#181818', previewBorder: 'rgba(255,255,255,0.16)' },
];

export const DEFAULT_THEME: ThemeId = 'dark';
const STORAGE_KEY = 'ui.theme';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

// 'white' is our only light theme; 'dark' and 'grey' are both dark.
function nativeScheme(theme: ThemeId): 'light' | 'dark' {
  return theme === 'white' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark' || stored === 'white' || stored === 'grey') {
          setThemeState(stored);
        }
      })
      .catch(() => {});
  }, []);

  // Push the in-app theme down to the native layer so OS-drawn chrome — the
  // native tab bar, sheets, keyboard, scroll indicators — matches the app
  // instead of following the device's system appearance.
  useEffect(() => {
    Appearance.setColorScheme(nativeScheme(theme));
  }, [theme]);

  const setTheme = useCallback((value: ThemeId) => {
    setThemeState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
