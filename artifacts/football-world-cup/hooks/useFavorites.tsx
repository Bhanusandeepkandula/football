import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Local (device-only) favourites, persisted to AsyncStorage. Two kinds:
//  • teams  — favouriting a team pins its matches to the top of the feed.
//  • matches — starring a match pins that single fixture to the top.
// Both feed the "Favorites" section and are the seed for a future synced feed.
const TEAMS_KEY = 'favorites.teams';
const MATCHES_KEY = 'favorites.matches';

interface FavoritesContextValue {
  ready: boolean;
  favorites: Set<string>;
  matchFavorites: Set<string>;
  isFavorite: (teamId?: string) => boolean;
  toggle: (teamId: string) => void;
  isFavoriteMatch: (matchId?: string) => boolean;
  toggleMatch: (matchId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  ready: false,
  favorites: new Set(),
  matchFavorites: new Set(),
  isFavorite: () => false,
  toggle: () => {},
  isFavoriteMatch: () => false,
  toggleMatch: () => {},
});

function loadSet(key: string, apply: (s: Set<string>) => void) {
  AsyncStorage.getItem(key)
    .then((raw) => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) apply(new Set(arr.map(String)));
      } catch { /* ignore corrupt store */ }
    })
    .catch(() => {});
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [matchFavorites, setMatchFavorites] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSet(TEAMS_KEY, setFavorites);
    loadSet(MATCHES_KEY, setMatchFavorites);
    setReady(true);
  }, []);

  const toggle = useCallback((teamId: string) => {
    if (!teamId) return;
    setFavorites((cur) => {
      const next = new Set(cur);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      AsyncStorage.setItem(TEAMS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const toggleMatch = useCallback((matchId: string) => {
    if (!matchId) return;
    setMatchFavorites((cur) => {
      const next = new Set(cur);
      next.has(matchId) ? next.delete(matchId) : next.add(matchId);
      AsyncStorage.setItem(MATCHES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const isFavorite = useCallback((teamId?: string) => !!teamId && favorites.has(teamId), [favorites]);
  const isFavoriteMatch = useCallback((matchId?: string) => !!matchId && matchFavorites.has(matchId), [matchFavorites]);

  const value = useMemo(
    () => ({ ready, favorites, matchFavorites, isFavorite, toggle, isFavoriteMatch, toggleMatch }),
    [ready, favorites, matchFavorites, isFavorite, toggle, isFavoriteMatch, toggleMatch],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  return useContext(FavoritesContext);
}
