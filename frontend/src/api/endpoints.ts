import axios from "axios";

// Update to your FastAPI port if different
const API_BASE = "http://localhost:8000/api";

// 1. Tickers Master List
export const refreshTickers = async () => {
  const response = await axios.post(`${API_BASE}/refresh/tickers`);
  return response.data;
};

export const getTickers = async () => {
  const response = await axios.get(`${API_BASE}/data/tickers`);
  return response.data;
};

// 2. Intraday Actions
export const refreshAllIntradayData = async (limit?: number) => {
  const url = limit 
    ? `${API_BASE}/refresh/intraday/all?limit=${limit}` 
    : `${API_BASE}/refresh/intraday/all`;
  const response = await axios.post(url);
  return response.data;
};

export const refreshIntraday = async (ticker: string) => {
  const response = await axios.post(`${API_BASE}/refresh/intraday/${ticker}`);
  return response.data;
};

export const fetchIntradayData = async (ticker: string) => {
  const response = await axios.get(`${API_BASE}/data/intraday/${ticker}`);
  return response.data;
};

// 3. Historical Actions
export const refreshHistorical = async (ticker: string) => {
  const response = await axios.post(`${API_BASE}/refresh/historical/${ticker}`);
  return response.data;
};

export const fetchHistoricalData = async (ticker: string) => {
  const response = await axios.get(`${API_BASE}/data/historical/${ticker}`);
  return response.data;
};

export const fetchAnalysisData = async (ticker: string) => {
  const response = await axios.get(`${API_BASE}/analysis/${ticker}`);
  return response.data;
};

// 4. Indices
export const refreshIndices = async () => {
  const response = await axios.post(`${API_BASE}/refresh/indices`);
  return response.data;
};

export const fetchIndices = async () => {
  const response = await axios.get(`${API_BASE}/data/indices`);
  return response.data;
};

export const fetchIndexConstituents = async (indexOrSector: string) => {
  const response = await axios.get(`${API_BASE}/data/indices/${encodeURIComponent(indexOrSector)}`);
  return response.data;
};

export const fetchIndexList = async () => {
  const response = await axios.get(`${API_BASE}/data/index-list`);
  return response.data;
};

export const fetchIndexHistory = async (indexName: string) => {
  const response = await axios.get(`${API_BASE}/data/index-history/${encodeURIComponent(indexName)}`);
  return response.data;
};

// 5. Sectors
export const refreshSectors = async () => {
  const response = await axios.post(`${API_BASE}/refresh/sectors`);
  return response.data;
};

export const fetchSectors = async () => {
  const response = await axios.get(`${API_BASE}/data/sectors`);
  return response.data;
};

export const fetchSectorDetails = async (sectorName: string) => {
  const response = await axios.get(`${API_BASE}/data/sectors/${encodeURIComponent(sectorName)}`);
  return response.data;
};

// 6. Supervision
export const fetchSupervisionScan = async () => {
  const response = await axios.get(`${API_BASE}/supervision/scan`);
  return response.data;
};

export const fetchSupervisionDetail = async (ticker: string) => {
  const response = await axios.get(`${API_BASE}/supervision/${ticker}`);
  return response.data;
};