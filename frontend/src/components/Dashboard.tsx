import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchIndices, refreshIndices, fetchSectors, fetchIndexConstituents, fetchIndexHistory, fetchSupervisionScan, getTickers, fetchHoldings, fetchSymbolHistory } from '../api/endpoints';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';
import { useNotifications } from '../context/NotificationContext';

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [indices, setIndices] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<any | null>(null);
  const [constituents, setConstituents] = useState<any[]>([]);
  const [constituentsLoading, setConstituentsLoading] = useState(false);
  const [indexHistory, setIndexHistory] = useState<{ date: string; close: number }[]>([]);
  const [indexHistoryLoading, setIndexHistoryLoading] = useState(false);
  const [supervisionAlerts, setSupervisionAlerts] = useState<any[]>([]);
  const [supervisionLoading, setSupervisionLoading] = useState(false);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [positionModal, setPositionModal] = useState<{ symbol: string; name: string } | null>(null);
  const [positionHistory, setPositionHistory] = useState<any[]>([]);
  const [positionHistoryLoading, setPositionHistoryLoading] = useState(false);
  const navigate = useNavigate();
  const { isWatched, toggleWatchlist, watchlistItems } = useWatchlist();
  const { addNotification } = useNotifications();
  const [tickers, setTickers] = useState<any[]>([]);
  const prevPricesRef = useRef<Map<string, number>>(new Map());

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleOpenPosition = async (symbol: string, name: string) => {
    setPositionModal({ symbol, name });
    setPositionHistoryLoading(true);
    try {
      const data = await fetchSymbolHistory(symbol);
      setPositionHistory(data.trades || []);
    } catch {
      setPositionHistory([]);
    } finally {
      setPositionHistoryLoading(false);
    }
  };

  const checkSwings = (newTickers: any[]) => {
    const watched = new Set(watchlistItems.filter((w) => w.item_type === 'stock').map((w) => w.symbol));
    const held = new Set(holdings.map((h) => h.symbol));
    for (const t of newTickers) {
      if (!watched.has(t.symbol) && !held.has(t.symbol)) continue;
      const change = parseFloat(t.change) || 0;
      if (Math.abs(change) >= 3) {
        const prev = prevPricesRef.current.get(t.symbol);
        if (prev !== undefined && Math.abs(change - prev) < 0.01) continue; // already notified
        prevPricesRef.current.set(t.symbol, change);
        const dir = change >= 0 ? 'up' : 'down';
        const label = held.has(t.symbol) ? 'Position' : 'Watchlist';
        addNotification({
          type: 'swing',
          title: `${t.symbol} ${dir} ${Math.abs(change).toFixed(2)}%`,
          message: `${label}: ${t.name} is ${dir} by ${Math.abs(change).toFixed(2)}%`,
          symbol: t.symbol,
        });
      }
    }
  };

  const refreshLiveData = () => {
    fetchIndicesData();
    fetchSupervisionAlerts();
    getTickers().then((data) => {
      const newTickers = data.tickers || [];
      setTickers(newTickers);
      checkSwings(newTickers);
    }).catch(() => {});
    fetchHoldings().then((data) => setHoldings(data.holdings || [])).catch(() => {});
  };

  useEffect(() => {
    refreshLiveData();
    fetchSectorsData();
    intervalRef.current = setInterval(refreshLiveData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fetchSupervisionAlerts = async () => {
    setSupervisionLoading(true);
    try {
      const data = await fetchSupervisionScan();
      setSupervisionAlerts(data.stocks || []);
    } catch (e) {
      console.error("Failed to load supervision scan:", e);
    }
    setSupervisionLoading(false);
  };

  const fetchIndicesData = async () => {
    try {
      const data = await fetchIndices();
      setIndices(data.indices || []);
    } catch (e) {
      console.error("Failed to load indices:", e);
    }
  };

  const fetchSectorsData = async () => {
    try {
      const data = await fetchSectors();
      setSectors(data.sectors || []);
    } catch (e) {
      console.error("Failed to load sectors:", e);
    }
  };

  const fetchConstituentsData = async (indexName: string) => {
    setConstituentsLoading(true);
    try {
      const data = await fetchIndexConstituents(indexName);
      setConstituents(data.constituents || []);
    } catch (e) {
      console.error("Failed to load constituents:", e);
      setConstituents([]);
    }
    setConstituentsLoading(false);
  };

  const fetchIndexHistoryData = async (indexName: string) => {
    setIndexHistory([]);
    setIndexHistoryLoading(true);
    try {
      const data = await fetchIndexHistory(indexName);
      setIndexHistory(data.history || []);
    } catch (e) {
      console.error("Failed to load index history:", e);
    }
    setIndexHistoryLoading(false);
  };

  const renderSparkline = (values: number[] | null | undefined, isPrice = false) => {
    if (!values || !values.length) return null;
    const w = 120;
    const h = 36;
    const pad = 4;
    const len = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = pad + (i / Math.max(1, len - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    });

    const first = values[0];
    const last = values[values.length - 1];
    const color = isPrice ? (last >= first ? '#16a34a' : '#dc2626') : (last >= 0 ? '#16a34a' : '#dc2626');

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block align-middle">
        <polyline fill="none" stroke={color} strokeWidth={2} points={points.join(' ')} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  const handleRefreshIndices = async () => {
    setLoading(true);
    try {
      await refreshIndices();
      await fetchIndicesData();
      alert('Indices data refreshed!');
    } catch (e) {
      alert("Error connecting to backend");
    }
    setLoading(false);
  };

  const industryIndices = indices.filter((idx) => idx.group === 'industry');
  const conceptIndices = indices.filter((idx) => idx.group === 'concept');

  // Portfolio totals computed client-side from holdings + live ticker prices
  const holdingsWithPnl = useMemo(() => {
    return holdings.map((h) => {
      const ticker = tickers.find((t) => t.symbol === h.symbol);
      const currentPrice = ticker ? parseFloat(ticker.price) || null : null;
      const avgBuy = parseFloat(h.avg_buy_price) || 0;
      const netPos = parseInt(h.net_position) || 0;
      const marketValue = currentPrice !== null ? currentPrice * netPos : null;
      const costBasis = avgBuy * netPos;
      const pnl = marketValue !== null ? marketValue - costBasis : null;
      const pnlPct = costBasis > 0 && pnl !== null ? (pnl / costBasis) * 100 : null;
      return { ...h, currentPrice, avgBuy, netPosition: netPos, marketValue, costBasis, pnl, pnlPct };
    });
  }, [holdings, tickers]);

  const portfolioSummary = useMemo(() => {
    if (!holdingsWithPnl.length) {
      return { totalValue: 0, totalCost: 0, totalPnl: 0, pnlPct: 0, count: 0 };
    }
    let totalValue = 0;
    let totalCost = 0;
    for (const h of holdingsWithPnl) {
      if (h.marketValue !== null) totalValue += h.marketValue;
      totalCost += h.costBasis;
    }
    const totalPnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { totalValue, totalCost, totalPnl, pnlPct, count: holdingsWithPnl.length };
  }, [holdingsWithPnl]);

  const fmtNT = (n: number) =>
    `NT$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const watchlistMovers = watchlistItems
    .filter((w) => w.item_type === 'stock')
    .map((w) => {
      const ticker = tickers.find((t) => t.symbol === w.symbol);
      if (!ticker) return null;
      const changeNum = parseFloat(ticker.change) || 0;
      return { ...ticker, absChange: Math.abs(changeNum), changeNum };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.absChange - a.absChange);

  return (
    <div className="p-8 text-gray-800">
      {/* Portfolio Summary — always visible */}
      <div className="mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <p className="text-xs uppercase text-gray-500 font-semibold tracking-wide">Portfolio Value</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{fmtNT(portfolioSummary.totalValue)}</p>
          </div>
          <div className={`rounded-lg p-5 shadow-sm border ${portfolioSummary.count === 0 ? 'bg-white border-gray-200' : portfolioSummary.totalPnl >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs uppercase font-semibold tracking-wide text-gray-600">Total P&amp;L</p>
            <p className={`text-2xl font-black mt-1 ${portfolioSummary.count === 0 ? 'text-gray-400' : portfolioSummary.totalPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {portfolioSummary.totalPnl >= 0 ? '+' : ''}{fmtNT(portfolioSummary.totalPnl)}
            </p>
            <p className={`text-sm font-bold mt-0.5 ${portfolioSummary.count === 0 ? 'text-gray-400' : portfolioSummary.pnlPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ({portfolioSummary.pnlPct >= 0 ? '+' : ''}{portfolioSummary.pnlPct.toFixed(2)}%)
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <p className="text-xs uppercase text-gray-500 font-semibold tracking-wide">Holdings</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{portfolioSummary.count}</p>
            <p className="text-xs text-gray-400 mt-0.5">{portfolioSummary.count === 1 ? 'position' : 'positions'}</p>
          </div>
        </div>
        {portfolioSummary.count === 0 && (
          <p className="text-sm text-gray-400 italic mt-3 text-center">
            No stocks currently held. Use the <span className="font-semibold text-gray-500">Buy</span> button on any analysis page to start building your portfolio.
          </p>
        )}
      </div>

      {/* Holdings Strip — same style as Watchlist Movers */}
      {holdingsWithPnl.length > 0 && (
        <div className="mb-6 bg-white border border-blue-100 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-blue-50 flex items-center justify-between bg-blue-50">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">My Holdings</span>
            <span className="text-xs text-blue-400">{holdingsWithPnl.length} stock{holdingsWithPnl.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex overflow-x-auto divide-x divide-gray-100">
            {holdingsWithPnl.map((h: any) => (
              <button
                key={h.symbol}
                type="button"
                onClick={() => handleOpenPosition(h.symbol, h.name)}
                className="flex-shrink-0 px-5 py-3 text-left hover:bg-blue-50 transition min-w-[160px]"
              >
                <div className="font-bold text-gray-900 text-sm">{h.symbol}</div>
                <div className="text-xs text-gray-500 truncate max-w-[140px]">{h.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{h.netPosition}</span> sh &middot; Avg <span className="font-semibold text-gray-700">{fmtNT(h.avgBuy)}</span>
                </div>
                {h.currentPrice !== null && (
                  <div className="text-xs mt-0.5">
                    Now <span className="font-semibold text-gray-700">{fmtNT(h.currentPrice)}</span>
                    {h.pnlPct !== null && (
                      <span className={`ml-1 font-bold ${h.pnlPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Watchlist Movers */}
      {watchlistMovers.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Watchlist Movers</span>
            <span className="text-xs text-gray-400">sorted by volatility</span>
          </div>
          <div className="flex overflow-x-auto divide-x divide-gray-100">
            {watchlistMovers.map((t: any) => (
              <button
                key={t.symbol}
                type="button"
                onClick={() => navigate(`/analysis/${t.symbol}`)}
                className="flex-shrink-0 px-5 py-3 text-left hover:bg-gray-50 transition min-w-[130px]"
              >
                <div className="font-bold text-gray-900 text-sm">{t.symbol}</div>
                <div className="text-xs text-gray-500 truncate max-w-[110px]">{t.name}</div>
                <div className="mt-1 font-semibold text-sm">{t.price}</div>
                <div className={`text-xs font-semibold ${t.changeNum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {t.change}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-red-600 font-bold text-lg">Regulatory Alert List</h2>
          {!supervisionLoading && supervisionAlerts.length > 0 && (
            <span className="text-xs text-gray-500">
              {supervisionAlerts.filter(a => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH').length} flagged stocks
            </span>
          )}
        </div>
        {supervisionLoading ? (
          <p className="text-sm text-gray-400 italic">Scanning stocks for regulatory signals...</p>
        ) : supervisionAlerts.length === 0 ? (
          <p className="text-sm text-gray-500">No supervision data available. Ensure historical data is loaded.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {supervisionAlerts
              .filter(a => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH')
              .slice(0, 6)
              .map((alert: any, i: number) => (
                <div
                  key={i}
                  className={`border rounded p-4 cursor-pointer hover:shadow-md transition ${alert.risk_level === 'CRITICAL' ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
                  onClick={() => navigate(`/analysis/${alert.symbol}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-gray-900">{alert.symbol}</span>
                      <span className="ml-2 text-sm text-gray-600 truncate">{alert.name}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${alert.risk_level === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                      {alert.risk_level}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${alert.risk_level === 'CRITICAL' ? 'bg-red-500' : 'bg-orange-400'}`}
                        style={{ width: `${alert.total_score}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 shrink-0">{alert.total_score}/100</span>
                  </div>
                  {alert.triggered_articles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {alert.triggered_articles.map((art: string, j: number) => (
                        <span key={j} className="text-xs bg-white border border-gray-300 text-gray-700 px-1.5 py-0.5 rounded">
                          {art}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            {supervisionAlerts.filter(a => a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH').length === 0 && (
              <p className="text-sm text-green-700 col-span-3">No HIGH or CRITICAL risk stocks detected.</p>
            )}
          </div>
        )}
      </div>

      {/* Taiwan Indices Overview */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">Taiwan Market Indices</h2>
          <button 
            onClick={handleRefreshIndices} 
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition disabled:opacity-50" 
            disabled={loading}
          >
            Refresh Indices
          </button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 border border-gray-200 rounded bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">Industry Indexes</h3>
                <p className="text-xs text-gray-500">Market and sector-oriented indexes</p>
              </div>
              <span className="text-xs text-gray-500">{industryIndices.length} items</span>
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
              {industryIndices.length > 0 ? industryIndices.map((idx, i) => (
                <div key={`industry-${i}`} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(idx);
                      fetchConstituentsData(idx.name);
                      fetchIndexHistoryData(idx.name);
                    }}
                    className={`w-full text-left border rounded-lg px-3 py-3 transition hover:shadow-sm ${selectedIndex?.name === idx.name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{idx.name}</p>
                        <p className="text-xs text-gray-500 truncate">{idx.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">{idx.price ?? '-'}</p>
                        <p className={`text-xs ${idx.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {idx.change !== null ? `${idx.change >= 0 ? '+' : ''}${idx.change}%` : '-'}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleWatchlist(idx.name, idx.name, 'index'); }}
                    className="absolute top-2 right-2 text-base leading-none transition"
                    title={isWatched(idx.name) ? 'Remove from watchlist' : 'Add to watchlist'}
                  >
                    <span className={isWatched(idx.name) ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}>★</span>
                  </button>
                </div>
              )) : <p className="text-sm text-gray-500">No industry indexes loaded.</p>}
            </div>
          </div>

          <div className="border border-gray-200 rounded bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">Concept Indexes</h3>
                <p className="text-xs text-gray-500">Thematic and cross-market indexes</p>
              </div>
              <span className="text-xs text-gray-500">{conceptIndices.length} items</span>
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
              {conceptIndices.length > 0 ? conceptIndices.map((idx, i) => (
                <div key={`concept-${i}`} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(idx);
                      fetchConstituentsData(idx.name);
                      fetchIndexHistoryData(idx.name);
                    }}
                    className={`w-full text-left border rounded-lg px-3 py-3 transition hover:shadow-sm ${selectedIndex?.name === idx.name ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{idx.name}</p>
                        <p className="text-xs text-gray-500 truncate">{idx.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">{idx.price ?? '-'}</p>
                        <p className={`text-xs ${idx.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {idx.change !== null ? `${idx.change >= 0 ? '+' : ''}${idx.change}%` : '-'}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleWatchlist(idx.name, idx.name, 'index'); }}
                    className="absolute top-2 right-2 text-base leading-none transition"
                    title={isWatched(idx.name) ? 'Remove from watchlist' : 'Add to watchlist'}
                  >
                    <span className={isWatched(idx.name) ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}>★</span>
                  </button>
                </div>
              )) : <p className="text-sm text-gray-500">No concept indexes loaded.</p>}
            </div>
          </div>
        </div>

        <div className="mt-4 border border-gray-200 rounded bg-gray-50 p-4">
          {selectedIndex ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Selected Index</p>
                <h3 className="text-lg font-bold text-gray-900 mt-1">{selectedIndex.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedIndex.category}</p>
                <p className="mt-3 text-sm">
                  <span className="font-semibold">Value:</span> {selectedIndex.price ?? '-'}
                  <span className={`ml-3 font-semibold ${selectedIndex.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedIndex.change !== null ? `${selectedIndex.change >= 0 ? '+' : ''}${selectedIndex.change}%` : ''}
                  </span>
                </p>
                <div className="mt-3">
                  {indexHistoryLoading ? (
                    <p className="text-xs text-gray-400 italic">Loading 60d chart...</p>
                  ) : indexHistory.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">60-day closing price</p>
                      {renderSparkline(indexHistory.map(r => r.close), true)}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No price history</p>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Constituent Stocks</p>
                </div>
                {constituentsLoading ? (
                  <div className="border border-gray-200 rounded bg-white p-4 text-center text-gray-500">
                    <p>Loading constituent stocks...</p>
                  </div>
                ) : constituents.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded bg-white">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Symbol</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Name</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Industry</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Trend (60d)</th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-700">Price</th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-700">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {constituents.map((stock, i) => (
                          <tr key={i} className="border-b hover:bg-blue-50 transition cursor-pointer" onClick={() => navigate(`/analysis/${stock.symbol}`)}>
                            <td className="px-3 py-2 font-semibold text-blue-600">{stock.symbol}</td>
                            <td className="px-3 py-2 text-gray-700 truncate">{stock.name}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{stock.industry || 'Unknown'}</td>
                            <td className="px-3 py-2">
                              {stock.minigraph ? renderSparkline(stock.minigraph) : <span className="text-gray-400 text-xs italic">No data</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">{stock.price ?? '-'}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${stock.change && stock.change >= 0 ? 'text-green-600' : stock.change ? 'text-red-600' : 'text-gray-400'}`}>
                              {stock.change !== null ? `${stock.change >= 0 ? '+' : ''}${stock.change}%` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded bg-white p-4 text-center text-gray-500">
                    <p className="text-sm">No constituent stocks found for this index.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Click any index above to view its constituent stocks here.</p>
          )}
        </div>
      </div>

      {/* Sector / Industry Overview */}
      <div className="mb-8 border border-gray-200 rounded shadow-sm bg-white p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">Sector / Industry Performance</h2>
          <p className="text-xs text-gray-500">Average change is based on available intraday data</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sectors.length > 0 ? (
            sectors.map((sector, idx) => (
              <div key={idx} className="border border-gray-200 rounded p-4 hover:shadow-md transition bg-gray-50">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{sector.sector}</p>
                    <p className="text-xs text-gray-500">{sector.stock_count} stocks • {sector.available_data_count} with data</p>
                  </div>
                  <span className={`text-sm font-bold ${sector.average_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {sector.average_change !== null ? `${sector.average_change >= 0 ? '+' : ''}${sector.average_change}%` : '-'}
                  </span>
                </div>
                <div className="mt-3 text-sm text-gray-600">
                  <div className="flex justify-between gap-2">
                    <span>Top</span>
                    <span className="font-medium text-green-700">
                      {sector.top_performer ? `${sector.top_performer.symbol} ${sector.top_performer.change >= 0 ? '+' : ''}${sector.top_performer.change}%` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 mt-1">
                    <span>Weakest</span>
                    <span className="font-medium text-red-700">
                      {sector.worst_performer ? `${sector.worst_performer.symbol} ${sector.worst_performer.change >= 0 ? '+' : ''}${sector.worst_performer.change}%` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No sector data loaded.</p>
          )}
        </div>
      </div>

      {positionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPositionModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">
                {positionModal.symbol} — {positionModal.name}
              </h2>
              <button onClick={() => setPositionModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              {positionHistoryLoading ? (
                <p className="text-sm text-gray-400 italic p-6">Loading...</p>
              ) : positionHistory.length === 0 ? (
                <p className="text-sm text-gray-400 italic p-6">No trade history for this symbol.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-gray-700">Date</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-700">Side</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-700">Type</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-700">Price</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-700">Volume</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionHistory.map((t: any) => (
                      <tr key={t.id} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(t.traded_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${t.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {t.side}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">{t.type}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">{fmtNT(Number(t.price))}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{t.volume}</td>
                        <td className="px-4 py-2 text-right font-bold">{fmtNT(Number(t.total_value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}