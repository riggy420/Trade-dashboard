import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../api/endpoints';
import { useAuth } from './AuthContext';

interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  item_type: string;
  added_at: string;
}

interface WatchlistContextValue {
  watchlistItems: WatchlistItem[];
  watchedSymbols: Set<string>;
  isWatched: (symbol: string) => boolean;
  toggleWatchlist: (symbol: string, name: string, item_type: string) => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchWatchlist()
      .then((data) => {
        const items: WatchlistItem[] = data.items || [];
        setWatchlistItems(items);
        setWatchedSymbols(new Set(items.map((i) => i.symbol)));
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const isWatched = (symbol: string) => watchedSymbols.has(symbol);

  const toggleWatchlist = async (symbol: string, name: string, item_type: string) => {
    if (isWatched(symbol)) {
      // Optimistic remove
      setWatchedSymbols((prev) => { const s = new Set(prev); s.delete(symbol); return s; });
      setWatchlistItems((prev) => prev.filter((i) => i.symbol !== symbol));
      try {
        await removeFromWatchlist(symbol);
      } catch {
        // Rollback on failure
        const data = await fetchWatchlist();
        const items: WatchlistItem[] = data.items || [];
        setWatchlistItems(items);
        setWatchedSymbols(new Set(items.map((i) => i.symbol)));
      }
    } else {
      // Optimistic add
      const optimistic: WatchlistItem = { id: -1, symbol, name, item_type, added_at: new Date().toISOString() };
      setWatchedSymbols((prev) => new Set([...prev, symbol]));
      setWatchlistItems((prev) => [optimistic, ...prev]);
      try {
        const item = await addToWatchlist(symbol, name, item_type);
        setWatchlistItems((prev) => prev.map((i) => (i.symbol === symbol && i.id === -1 ? item : i)));
      } catch {
        // Rollback on failure
        const data = await fetchWatchlist();
        const items: WatchlistItem[] = data.items || [];
        setWatchlistItems(items);
        setWatchedSymbols(new Set(items.map((i) => i.symbol)));
      }
    }
  };

  return (
    <WatchlistContext.Provider value={{ watchlistItems, watchedSymbols, isWatched, toggleWatchlist }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used inside WatchlistProvider');
  return ctx;
}
