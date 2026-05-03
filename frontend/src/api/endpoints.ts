import axios from "axios";
import api from "./axiosInstance";
import { API_BASE } from "./config";

// 1. Auth (uses plain axios — no token needed for these calls)
export const loginUser = async (username: string, password: string) => {
  const response = await axios.post(`${API_BASE}/auth/login`, { username, password });
  return response.data;
};

export const registerUser = async (username: string, email: string, password: string) => {
  const response = await axios.post(`${API_BASE}/auth/register`, { username, email, password });
  return response.data;
};

export const refreshToken = async (refresh_token: string) => {
  const response = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get(`/auth/me`);
  return response.data;
};

// 2. Tickers Master List
export const refreshTickers = async () => {
  const response = await api.post(`/refresh/tickers`);
  return response.data;
};

export const getTickers = async () => {
  const response = await api.get(`/data/tickers`);
  return response.data;
};

// 3. Intraday Actions
export const refreshAllIntradayData = async (limit?: number, force?: boolean) => {
  let url = limit ? `/refresh/intraday/all?limit=${limit}` : `/refresh/intraday/all`;
  if (force) url += `${limit ? '&' : '?'}force=true`;
  const response = await api.post(url);
  return response.data;
};

export const refreshIntraday = async (ticker: string) => {
  const response = await api.post(`/refresh/intraday/${ticker}`);
  return response.data;
};

export const fetchIntradayData = async (ticker: string) => {
  const response = await api.get(`/data/intraday/${ticker}`);
  return response.data;
};

// 4. Historical Actions
export const refreshHistorical = async (ticker: string) => {
  const response = await api.post(`/refresh/historical/${ticker}`);
  return response.data;
};

export const fetchHistoricalData = async (ticker: string) => {
  const response = await api.get(`/data/historical/${ticker}`);
  return response.data;
};

export const fetchAnalysisData = async (ticker: string) => {
  const response = await api.get(`/analysis/${ticker}`);
  return response.data;
};

// 5. Indices
export const refreshIndices = async () => {
  const response = await api.post(`/refresh/indices`);
  return response.data;
};

export const fetchIndices = async () => {
  const response = await api.get(`/data/indices`);
  return response.data;
};

export const fetchIndexConstituents = async (indexOrSector: string) => {
  const response = await api.get(`/data/indices/${encodeURIComponent(indexOrSector)}`);
  return response.data;
};

export const fetchIndexList = async () => {
  const response = await api.get(`/data/index-list`);
  return response.data;
};

export const fetchIndexHistory = async (indexName: string) => {
  const response = await api.get(`/data/index-history/${encodeURIComponent(indexName)}`);
  return response.data;
};

// 6. Sectors
export const refreshSectors = async () => {
  const response = await api.post(`/refresh/sectors`);
  return response.data;
};

export const fetchSectors = async () => {
  const response = await api.get(`/data/sectors`);
  return response.data;
};

export const fetchSectorDetails = async (sectorName: string) => {
  const response = await api.get(`/data/sectors/${encodeURIComponent(sectorName)}`);
  return response.data;
};

// 7. Fundamentals
export const fetchFundamentals = async (symbol: string) => {
  const response = await api.get(`/fundamentals/${encodeURIComponent(symbol)}`);
  return response.data;
};

// 8. Watchlist
export const fetchWatchlist = async () => {
  const response = await api.get(`/watchlist`);
  return response.data;
};

export const addToWatchlist = async (symbol: string, name: string, item_type: string) => {
  const response = await api.post(`/watchlist`, { symbol, name, item_type });
  return response.data;
};

export const removeFromWatchlist = async (symbol: string) => {
  await api.delete(`/watchlist/${encodeURIComponent(symbol)}`);
};

// 9. Trades
export const submitTrade = async (symbol: string, name: string, side: string, type: string, price: number, volume: number, limitPrice?: number, assetType?: string) => {
  const response = await api.post(`/trades`, { symbol, name, side, type, price, volume, limit_price: limitPrice ?? null, asset_type: assetType ?? 'stock' });
  return response.data;
};

export const fetchTrades = async () => {
  const response = await api.get(`/trades`);
  return response.data;
};

export const fetchPosition = async (symbol: string) => {
  const response = await api.get(`/trades/position/${encodeURIComponent(symbol)}`);
  return response.data;
};

export const fetchHoldings = async () => {
  const response = await api.get(`/trades/holdings`);
  return response.data;
};

export const fetchPendingOrders = async () => {
  const response = await api.get(`/trades/pending`);
  return response.data;
};

export const cancelPendingOrder = async (orderId: string) => {
  await api.delete(`/trades/pending/${encodeURIComponent(orderId)}`);
};

export const updatePendingOrder = async (orderId: string, data: { limit_price?: number; volume?: number }) => {
  const response = await api.put(`/trades/pending/${encodeURIComponent(orderId)}`, data);
  return response.data;
};

export const updateTrade = async (tradeId: number, data: Record<string, unknown>) => {
  const response = await api.put(`/trades/${tradeId}`, data);
  return response.data;
};

export const deleteTrade = async (tradeId: number) => {
  await api.delete(`/trades/${tradeId}`);
};

export const fetchSymbolHistory = async (symbol: string) => {
  const response = await api.get(`/trades/history/${encodeURIComponent(symbol)}`);
  return response.data;
};
