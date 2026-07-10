import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MatchNavStyle = 'sticky' | 'floating';

const STORAGE_KEY = 'ui.matchNavStyle';
const DEFAULT: MatchNavStyle = 'sticky';

interface MatchNavStyleContextValue {
  navStyle: MatchNavStyle;
  setNavStyle: (value: MatchNavStyle) => void;
  floatingNav: boolean;
}

const MatchNavStyleContext = createContext<MatchNavStyleContextValue>({
  navStyle: DEFAULT,
  setNavStyle: () => {},
  floatingNav: false,
});

export function MatchNavStyleProvider({ children }: { children: React.ReactNode }) {
  const [navStyle, setNavStyleState] = useState<MatchNavStyle>(DEFAULT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'sticky' || stored === 'floating') setNavStyleState(stored);
      })
      .catch(() => {});
  }, []);

  const setNavStyle = useCallback((value: MatchNavStyle) => {
    setNavStyleState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
  }, []);

  return (
    <MatchNavStyleContext.Provider value={{ navStyle, setNavStyle, floatingNav: navStyle === 'floating' }}>
      {children}
    </MatchNavStyleContext.Provider>
  );
}

export function useMatchNavStyle(): MatchNavStyleContextValue {
  return useContext(MatchNavStyleContext);
}
