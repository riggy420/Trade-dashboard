import axios from "axios";
import api from "./axiosInstance";

const API_BASE = "http://localhost:8000/api";

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
export const refreshAllIntradayData = async (limit?: number) => {
  const url = limit ? `/refresh/intraday/all?limit=${limit}` : `/refresh/intraday/all`;
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

// 7. Supervision
export const fetchSupervisionScan = async () => {
  const response = await api.get(`/supervision/scan`);
  return response.data;
};

export const fetchSupervisionDetail = async (ticker: string) => {
  const response = await api.get(`/supervision/${ticker}`);
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
