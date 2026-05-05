import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTickers,
  fetchIndices,
  fetchSectors,
  fetchHoldings,
  fetchTrades,
  fetchAnalysisData,
  fetchPosition,
  fetchFundamentals,
  fetchPendingOrders,
  fetchWatchlist,
  fetchSupervisionScan,
  fetchSupervisionDetail,
} from './endpoints';

// Shared stale-time constants (ms)
const STALE = {
  tickers: 30_000,       // live prices — refresh every 30s
  indices: 60_000,       // index data
  sectors: 60_000,       // sector performance
  holdings: 10_000,      // changes with trades
  trades: 10_000,        // changes with new orders
  analysis: 300_000,     // historical — 5min
  position: 10_000,      // changes with trades
  fundamentals: 300_000, // rarely changes
  pending: 10_000,       // changes with orders
  watchlist: 30_000,
  supervision: 300_000,  // full scan — 5min
};

// Shared query key factory
export const qk = {
  tickers: ['tickers'] as const,
  indices: ['indices'] as const,
  sectors: ['sectors'] as const,
  holdings: ['holdings'] as const,
  trades: ['trades'] as const,
  analysis: (ticker: string) => ['analysis', ticker] as const,
  position: (ticker: string) => ['position', ticker] as const,
  fundamentals: (ticker: string) => ['fundamentals', ticker] as const,
  pending: ['pending'] as const,
  watchlist: ['watchlist'] as const,
  supervisionScan: (limit?: number, minScore?: number, riskLevel?: string) =>
    ['supervision', 'scan', { limit, minScore, riskLevel }] as const,
  supervisionDetail: (symbol: string) => ['supervision', 'detail', symbol] as const,
};

export function useTickersQuery() {
  return useQuery({
    queryKey: qk.tickers,
    queryFn: () => getTickers().then((d) => d.tickers || []),
    staleTime: STALE.tickers,
    refetchOnWindowFocus: false,
  });
}

export function useIndicesQuery() {
  return useQuery({
    queryKey: qk.indices,
    queryFn: () => fetchIndices().then((d) => d.indices || []),
    staleTime: STALE.indices,
    refetchOnWindowFocus: false,
  });
}

export function useSectorsQuery() {
  return useQuery({
    queryKey: qk.sectors,
    queryFn: () => fetchSectors().then((d) => d.sectors || []),
    staleTime: STALE.sectors,
    refetchOnWindowFocus: false,
  });
}

export function useHoldingsQuery() {
  return useQuery({
    queryKey: qk.holdings,
    queryFn: () => fetchHoldings().then((d) => d.holdings || []),
    staleTime: STALE.holdings,
    refetchOnWindowFocus: true,
  });
}

export function useTradesQuery() {
  return useQuery({
    queryKey: qk.trades,
    queryFn: () => fetchTrades().then((d) => d.trades || []),
    staleTime: STALE.trades,
    refetchOnWindowFocus: true,
  });
}

export function useAnalysisQuery(ticker: string) {
  return useQuery({
    queryKey: qk.analysis(ticker),
    queryFn: () => fetchAnalysisData(ticker),
    staleTime: STALE.analysis,
    refetchOnWindowFocus: false,
    enabled: !!ticker,
  });
}

export function usePositionQuery(ticker: string) {
  return useQuery({
    queryKey: qk.position(ticker),
    queryFn: () => fetchPosition(ticker).then((d) => d.net_position ?? 0),
    staleTime: STALE.position,
    refetchOnWindowFocus: true,
    enabled: !!ticker,
  });
}

export function useFundamentalsQuery(ticker: string) {
  return useQuery({
    queryKey: qk.fundamentals(ticker),
    queryFn: () => fetchFundamentals(ticker),
    staleTime: STALE.fundamentals,
    refetchOnWindowFocus: false,
    enabled: !!ticker,
  });
}

export function usePendingOrdersQuery() {
  return useQuery({
    queryKey: qk.pending,
    queryFn: () => fetchPendingOrders().then((d) => d.pending || []),
    staleTime: STALE.pending,
    refetchOnWindowFocus: true,
  });
}

export function useWatchlistQuery() {
  return useQuery({
    queryKey: qk.watchlist,
    queryFn: () => fetchWatchlist().then((d) => d.items || []),
    staleTime: STALE.watchlist,
    refetchOnWindowFocus: false,
  });
}

export function useSupervisionScanQuery(limit?: number, minScore?: number, riskLevel?: string) {
  return useQuery({
    queryKey: qk.supervisionScan(limit, minScore, riskLevel),
    queryFn: () => fetchSupervisionScan(limit, minScore, riskLevel),
    staleTime: STALE.supervision,
    refetchOnWindowFocus: false,
  });
}

export function useSupervisionDetailQuery(symbol: string) {
  return useQuery({
    queryKey: qk.supervisionDetail(symbol),
    queryFn: () => fetchSupervisionDetail(symbol),
    staleTime: STALE.supervision,
    refetchOnWindowFocus: false,
    enabled: !!symbol,
  });
}

// Invalidation helpers for mutations
export function useInvalidateTickers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.tickers });
}

export function useInvalidateHoldings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.holdings });
}

export function useInvalidateTrades() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.trades });
}
