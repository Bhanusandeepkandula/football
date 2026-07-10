import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AccentOption {
  name: string;
  value: string;
}

// Accents tuned for the dark UI. Gold is the original brand colour. The first
// block is the vivid set; the second is a muted/sophisticated set for a subtler,
// more editorial feel.
export const ACCENT_OPTIONS: AccentOption[] = [
  { name: 'Gold', value: '#F5A623' },
  { name: 'Tangerine', value: '#FF7A1A' },
  { name: 'Crimson', value: '#FF375F' },
  { name: 'Rose', value: '#FF2D78' },
  { name: 'Purple', value: '#AF52DE' },
  { name: 'Indigo', value: '#5E5CE6' },
  { name: 'Blue', value: '#2E7DF6' },
  { name: 'Sky', value: '#32ADE6' },
  { name: 'Teal', value: '#2DD4BF' },
  { name: 'Green', value: '#30D158' },
  // Muted / sophisticated tones
  { name: 'Sand', value: '#C7A66B' },
  { name: 'Clay', value: '#C77B5A' },
  { name: 'Dusty Rose', value: '#C68A93' },
  { name: 'Mauve', value: '#9E8BB0' },
  { name: 'Steel', value: '#7C93AC' },
  { name: 'Sage', value: '#89A98C' },
  { name: 'Olive', value: '#A6A56B' },
  { name: 'Stone', value: '#9A9AA2' },
];

export const DEFAULT_ACCENT = ACCENT_OPTIONS[0].value;
const STORAGE_KEY = 'ui.accentColor';

interface AccentContextValue {
  accent: string;
  setAccent: (value: string) => void;
}

const AccentContext = createContext<AccentContextValue>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
});

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => { if (stored) setAccentState(stored); })
      .catch(() => {});
  }, []);

  const setAccent = useCallback((value: string) => {
    setAccentState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
  }, []);

  return <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  return useContext(AccentContext);
}

/** Black or white text/icon that reads on top of the given accent. */
export function accentForeground(hex: string): string {
  const s = hex.replace('#', '');
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}
