import { useEffect, useMemo, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { fetchIndices, refreshIndices, fetchSectors, fetchIndexConstituents, fetchIndexHistory, getTickers, fetchHoldings, fetchSymbolHistory, fetchTrades, fetchTickersSupervised, fullSupervisionRefresh } from '../api/endpoints';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';
import { useNotifications } from '../context/NotificationContext';

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [indices, setIndices] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<any | null>(null);
  const [constituents, setConstituents] = useState<any[]>([]);
  const [constituentsLoading, setConstituentsLoading] = useState(false);
  const [indexHistory, setIndexHistory] = useState<{ date: string; close: number }[]>([]);
  const [indexHistoryLoading, setIndexHistoryLoading] = useState(false);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [positionModal, setPositionModal] = useState<{ symbol: string; name: string } | null>(null);
  const [positionHistory, setPositionHistory] = useState<any[]>([]);
  const [positionHistoryLoading, setPositionHistoryLoading] = useState(false);
  const navigate = useNavigate();
  const { isWatched, toggleWatchlist, watchlistItems } = useWatchlist();
  const { addNotification } = useNotifications();
  const [tickers, setTickers] = useState<any[]>([]);
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const [supervisionTickers, setSupervisionTickers] = useState<any[]>([]);
  const [supervisionLoading, setSupervisionLoading] = useState(false);
  const [supervisionSummary, setSupervisionSummary] = useState<any>(null);
  const [supervisionExpanded, setSupervisionExpanded] = useState(false);
  const [supervisionFilter, setSupervisionFilter] = useState('');

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

  const fetchSupervisionAlerts = async (force?: boolean) => {
    setSupervisionLoading(true);
    try {
      const data = await fetchTickersSupervised(force);
      // Show ALL tickers — scored ones first, unscored (null) at the bottom
      const items = (data.tickers || [])
        .sort((a: any, b: any) => (b.supervision_score ?? -1) - (a.supervision_score ?? -1));
      setSupervisionTickers(items);

      // Count risk levels from scanned stocks only
      const riskCounts: Record<string, number> = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNSCORED": 0};
      for (const t of items) {
        if (!t.has_supervision) {
          riskCounts["UNSCORED"] = (riskCounts["UNSCORED"] || 0) + 1;
        } else {
          const rl = t.supervision_risk || 'LOW';
          riskCounts[rl] = (riskCounts[rl] || 0) + 1;
        }
      }
      setSupervisionSummary({
        risk_counts: riskCounts,
        total_scanned: items.filter((t: any) => t.has_supervision).length,
        total_tickers: data.total,
        scan_timestamp: data.scan_timestamp,
      });
    } catch (e) {
      console.error("Failed to load supervision scan:", e);
    }
    setSupervisionLoading(false);
  };

  const handleRefreshSupervision = async () => {
    setSupervisionLoading(true);
    try {
      // Full pipeline: fetch missing historical → fundamentals → scan → persist
      await fullSupervisionRefresh(true);
    } catch (e) {
      console.error("Full refresh pipeline failed:", e);
    }
    // Reload the merged ticker+score list
    await fetchSupervisionAlerts(true);
    setSupervisionLoading(false);
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
    fetchTrades().then((data) => setTrades(data.trades || [])).catch(() => {});
  };

  useEffect(() => {
    refreshLiveData();
    fetchSectorsData();
    intervalRef.current = setInterval(refreshLiveData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);



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
    const color = isPrice ? (last >= first ? '#dc2626' : '#16a34a') : (last >= 0 ? '#dc2626' : '#16a34a');

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

  // Realized P&L from completed sell trades
  const { realizedPnl, totalInvested } = useMemo(() => {
    if (!trades.length) return { realizedPnl: 0, totalInvested: 0 };
    let rp = 0;
    let invested = 0;
    const posMap: Record<string, { qty: number; cost: number }> = {};
    const sorted = [...trades].sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime());
    for (const t of sorted) {
      if (!posMap[t.symbol]) posMap[t.symbol] = { qty: 0, cost: 0 };
      const p = posMap[t.symbol];
      if (t.side === 'BUY') { p.qty += t.volume; p.cost += Number(t.total_value); invested += Number(t.total_value); }
      else {
        const avg = p.qty > 0 ? p.cost / p.qty : 0;
        rp += Number(t.total_value) - (avg * t.volume);
        p.qty -= t.volume; p.cost -= avg * t.volume;
      }
    }
    return { realizedPnl: rp, totalInvested: invested };
  }, [trades]);

  const fmtNT = (n: number) =>
    `NT$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Asset allocation pie data
  const assetPieData = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const h of holdingsWithPnl) {
      const val = h.marketValue ?? h.costBasis;
      const sym = h.symbol;
      const cat = /^\d{4,6}B/.test(sym) ? 'Bonds' : sym.startsWith('TW000T') ? 'Mutual Funds' : 'Stocks';
      groups[cat] = (groups[cat] || 0) + val;
    }
    return Object.entries(groups).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [holdingsWithPnl]);

  // Industry breakdown pie data (stocks only)
  const industryPieData = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const h of holdingsWithPnl) {
      const sym = h.symbol;
      if (/^\d{4,6}B/.test(sym) || sym.startsWith('TW000T')) continue; // skip bonds & funds
      const ticker = tickers.find((t) => t.symbol === sym);
      const industry = ticker?.industry || 'Unknown';
      const val = h.marketValue ?? h.costBasis;
      groups[industry] = (groups[industry] || 0) + val;
    }
    // Sort by value desc, take top 7, group rest as "Other"
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7).map(([n, v]) => ({ name: n, value: Math.round(v * 100) / 100 }));
    if (sorted.length > 7) {
      const rest = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
      top.push({ name: 'Other', value: Math.round(rest * 100) / 100 });
    }
    return top;
  }, [holdingsWithPnl, tickers]);

  // Return distribution: bucket trade returns (sell_price/buy_price - 1) into % ranges
  const returnDistribution = useMemo(() => {
    const buckets = [
      { label: '< -4%', min: -Infinity, max: -4 },
      { label: '-4% to -2%', min: -4, max: -2 },
      { label: '-2% to 0%', min: -2, max: 0 },
      { label: '0% to 2%', min: 0, max: 2 },
      { label: '2% to 4%', min: 2, max: 4 },
      { label: '> 4%', min: 4, max: Infinity },
    ];
    // Pair BUY/SELL trades and compute return for completed round-trips
    const symbolTrades: Record<string, { buys: any[]; sells: any[] }> = {};
    for (const t of trades) {
      if (!symbolTrades[t.symbol]) symbolTrades[t.symbol] = { buys: [], sells: [] };
      if (t.side === 'BUY') symbolTrades[t.symbol].buys.push(t);
      else symbolTrades[t.symbol].sells.push(t);
    }
    const tradeReturns: number[] = [];
    for (const sym of Object.keys(symbolTrades)) {
      const { buys, sells } = symbolTrades[sym];
      let buyIdx = 0;
      for (const sell of sells) {
        if (buyIdx < buys.length) {
          const buy = buys[buyIdx];
          const ret = ((Number(sell.price) - Number(buy.price)) / Number(buy.price)) * 100;
          tradeReturns.push(ret);
          buyIdx++;
        }
      }
      // Remaining open buys: use current market price
      const ticker = tickers.find((t) => t.symbol === sym);
      const currentPrice = ticker ? parseFloat(ticker.price) : null;
      if (currentPrice) {
        for (let i = buyIdx; i < buys.length; i++) {
          const ret = ((currentPrice - Number(buys[i].price)) / Number(buys[i].price)) * 100;
          tradeReturns.push(ret);
        }
      }
    }
    const counts = buckets.map((b) => ({
      name: b.label,
      count: tradeReturns.filter((r) => r >= b.min && r < b.max).length,
      fill: b.min >= 0 ? '#16a34a' : b.max <= 0 ? '#dc2626' : '#6b7280',
    }));
    return counts;
  }, [trades, tickers]);

  // Cumulative returns: tracks Total P&L, final point matches Total P&L card exactly
  const cumulativeReturns = useMemo(() => {
    if (!trades.length) return [];
    const sorted = [...trades].sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime());
    const firstTime = new Date(sorted[0].traded_at).getTime();
    const lastTime = Date.now();
    const spanMs = lastTime - firstTime;
    const intervalMs = spanMs < 3 * 86400000 ? 3600000 : spanMs < 14 * 86400000 ? 14400000 : 86400000;

    // Exact same value as Total P&L card
    const totalUnrealized = holdingsWithPnl.reduce((s, h) => s + (h.pnl ?? 0), 0);
    const finalPnl = realizedPnl + totalUnrealized;
    const finalPct = totalInvested > 0 ? (finalPnl / totalInvested) * 100 : 0;

    let cumInvested = 0;
    let cumRealized = 0;
    const symPos: Record<string, { qty: number; cost: number }> = {};
    let tradeIdx = 0;
    const data: any[] = [];

    for (let ts = firstTime; ts <= lastTime; ts += intervalMs) {
      while (tradeIdx < sorted.length && new Date(sorted[tradeIdx].traded_at).getTime() <= ts) {
        const t = sorted[tradeIdx];
        if (!symPos[t.symbol]) symPos[t.symbol] = { qty: 0, cost: 0 };
        const p = symPos[t.symbol];
        if (t.side === 'BUY') { p.qty += t.volume; p.cost += Number(t.total_value); cumInvested += Number(t.total_value); }
        else { const avg = p.qty > 0 ? p.cost / p.qty : 0; cumRealized += Number(t.total_value) - (avg * t.volume); p.qty -= t.volume; p.cost -= avg * t.volume; }
        tradeIdx++;
      }
      const progress = totalInvested > 0 ? Math.min(1, cumInvested / totalInvested) : 0;
      // Interpolate: realized is actual, unrealized scales with capital deployed
      const pct = totalInvested > 0 ? ((cumRealized + progress * totalUnrealized) / totalInvested) * 100 : 0;
      const d = new Date(ts);
      const label = intervalMs < 86400000
        ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      data.push({ date: label, pct: Math.round(pct * 100) / 100 });
    }

    // Force final point to exactly match Total P&L card
    const finalD = new Date(lastTime);
    data.push({
      date: intervalMs < 86400000 ? finalD.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : finalD.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      pct: Math.round(finalPct * 100) / 100,
    });

    const step = Math.max(1, Math.floor(data.length / 30));
    return data.filter((_, i) => i % step === 0);
  }, [trades, holdingsWithPnl, realizedPnl, totalInvested]);

  return (
    <div className="p-8 text-gray-800">
      {/* Portfolio Summary — always visible */}
      <div className="mb-6">
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Portfolio Value</p>
            <p className="text-lg font-black text-gray-900 mt-1">{fmtNT(portfolioSummary.totalValue)}</p>
          </div>
          <div className={`rounded-lg p-3 shadow-sm border ${portfolioSummary.count === 0 ? 'bg-white border-gray-200' : (realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className="text-[10px] uppercase font-semibold tracking-wide text-gray-600">Total P&amp;L</p>
            <p className={`text-lg font-black mt-1 ${portfolioSummary.count === 0 ? 'text-gray-400' : (realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? 'text-red-700' : 'text-green-700'}`}>
              {(realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? '+' : ''}{fmtNT(realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost)}
            </p>
            <p className={`text-[10px] font-bold mt-0.5 ${portfolioSummary.count === 0 ? 'text-gray-400' : (realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalInvested > 0 ? `(${(realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? '+' : ''}${(((realizedPnl + portfolioSummary.totalValue - portfolioSummary.totalCost) / totalInvested) * 100).toFixed(2)}%)` : '(—)'}
            </p>
          </div>
          <div className={`rounded-lg p-3 shadow-sm border ${realizedPnl >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <p className="text-[10px] uppercase font-semibold tracking-wide text-gray-600">Realized P&amp;L</p>
            <p className={`text-lg font-black mt-1 ${realizedPnl >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {realizedPnl >= 0 ? '+' : ''}{fmtNT(realizedPnl)}
            </p>
            <p className={`text-[10px] font-bold mt-0.5 ${realizedPnl >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
              {totalInvested > 0 ? `${realizedPnl >= 0 ? '+' : ''}${((realizedPnl / totalInvested) * 100).toFixed(2)}%` : '—'}
            </p>
          </div>
          <div className={`rounded-lg p-3 shadow-sm border ${(portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className="text-[10px] uppercase font-semibold tracking-wide text-gray-600">Unrealized</p>
            <p className={`text-lg font-black mt-1 ${(portfolioSummary.totalValue - portfolioSummary.totalCost) >= 0 ? 'text-red-700' : 'text-green-700'}`}>
              {portfolioSummary.totalValue - portfolioSummary.totalCost >= 0 ? '+' : ''}{fmtNT(portfolioSummary.totalValue - portfolioSummary.totalCost)}
            </p>
            <p className={`text-[10px] font-bold mt-0.5 ${portfolioSummary.pnlPct >= 0 ? 'text-purple-500' : 'text-pink-500'}`}>
              {portfolioSummary.totalCost > 0 ? `${portfolioSummary.pnlPct >= 0 ? '+' : ''}${portfolioSummary.pnlPct.toFixed(2)}%` : '—'}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide">Holdings</p>
            <p className="text-lg font-black text-gray-900 mt-1">{portfolioSummary.count}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{portfolioSummary.count === 1 ? 'position' : 'positions'}</p>
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
                      <span className={`ml-1 font-bold ${h.pnlPct >= 0 ? 'text-red-600' : 'text-green-600'}`}>
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

      {/* Portfolio Charts */}
      {holdingsWithPnl.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Asset Allocation */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Asset Allocation</h3>
            {assetPieData.length > 0 ? (
              <div className="flex items-center">
                <ResponsiveContainer width="55%" height={160}>
                  <PieChart>
                    <Pie data={assetPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2} dataKey="value">
                      {assetPieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
                    </Pie>
                    <Tooltip formatter={(v: any) => [fmtNT(Number(v) || 0), 'Value']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 text-xs ml-2">
                  {assetPieData.map((d, i) => {
                    const total = assetPieData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0;
                    return (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                      <span className="text-gray-600">{d.name}</span>
                      <span className="text-gray-400 ml-auto">{pct}%</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No portfolio data yet.</p>
            )}
          </div>

          {/* Industry Breakdown (stocks only) */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Industry Breakdown</h3>
            {industryPieData.length > 0 ? (
              <div className="flex items-center">
                <ResponsiveContainer width="55%" height={160}>
                  <PieChart>
                    <Pie data={industryPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2} dataKey="value">
                      {industryPieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(value: any) => {
                      const total = industryPieData.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0;
                      return [`${pct}%`, 'Share'];
                    }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 text-xs ml-2 max-h-[160px] overflow-y-auto">
                  {industryPieData.map((d, i) => {
                    const total = industryPieData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0;
                    return (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-600 truncate max-w-[100px]" title={d.name}>{d.name}</span>
                      <span className="text-gray-400 ml-auto text-[10px]">{pct}%</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No stock holdings yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Cumulative Returns + Return Distribution */}
      {holdingsWithPnl.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-1">Cumulative Returns</h3>
            <p className="text-[10px] text-gray-400 mb-2">Total P&amp;L (realized + unrealized) over time</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeReturns}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={5} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Cumulative Return']} />
                <Line type="monotone" dataKey="pct" stroke={cumulativeReturns.length > 0 && cumulativeReturns[cumulativeReturns.length - 1].pct >= 0 ? '#dc2626' : '#16a34a'} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 mb-1">Return Distribution</h3>
            <p className="text-[10px] text-gray-400 mb-2">Trade returns bucketed by % gain/loss (completed + open)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={returnDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [v, 'Count']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {returnDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
                        <p className={`text-xs ${idx.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
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
                        <p className={`text-xs ${idx.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
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
                  <span className={`ml-3 font-semibold ${selectedIndex.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
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
                            <td className={`px-3 py-2 text-right font-semibold ${stock.change && stock.change >= 0 ? 'text-red-600' : stock.change ? 'text-green-600' : 'text-gray-400'}`}>
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
                  <span className={`text-sm font-bold ${sector.average_change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {sector.average_change !== null ? `${sector.average_change >= 0 ? '+' : ''}${sector.average_change}%` : '-'}
                  </span>
                </div>
                <div className="mt-3 text-sm text-gray-600">
                  <div className="flex justify-between gap-2">
                    <span>Top</span>
                    <span className="font-medium text-red-700">
                      {sector.top_performer ? `${sector.top_performer.symbol} ${sector.top_performer.change >= 0 ? '+' : ''}${sector.top_performer.change}%` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 mt-1">
                    <span>Weakest</span>
                    <span className="font-medium text-green-700">
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

      {/* Supervision / Disposition Risk — All Stocks */}
      <div className="mb-8 border border-gray-200 rounded shadow-sm bg-white p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-bold text-lg">Disposition Risk — All Stocks</h2>
            <p className="text-xs text-gray-500">
              {supervisionSummary
                ? `${supervisionSummary.total_tickers || 0} tickers · ${supervisionSummary.total_scanned} scored`
                : 'TWSE monitoring rule risk scores for every listed stock'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {supervisionSummary && (
              <span className="text-xs text-gray-400">
                {new Date(supervisionSummary.scan_timestamp).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefreshSupervision}
              disabled={supervisionLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition disabled:opacity-50"
            >
              {supervisionLoading ? 'Scanning...' : 'Refresh Now'}
            </button>
          </div>
        </div>

        {/* Risk summary bar */}
        {supervisionSummary && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {Object.entries(supervisionSummary.risk_counts || {}).map(([level, count]) => (
              <div key={level} className={`px-3 py-1 rounded text-xs font-bold ${
                level === 'CRITICAL' ? 'bg-red-100 text-red-700 border border-red-200' :
                level === 'HIGH' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                level === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {level}: {count as number}
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={supervisionFilter}
            onChange={(e) => setSupervisionFilter(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Full ticker risk list */}
        {supervisionTickers.length > 0 ? (
          <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b-2 border-gray-200 z-10">
                <tr className="text-gray-600 text-xs">
                  <th className="text-left py-2 px-2 font-semibold">Symbol</th>
                  <th className="text-center py-2 px-2 font-semibold">Score</th>
                  <th className="text-center py-2 px-2 font-semibold">Risk</th>
                  <th className="text-center py-2 px-2 font-semibold">Decision</th>
                  <th className="text-left py-2 px-2 font-semibold">Triggered</th>
                  <th className="text-left py-2 px-2 font-semibold">Exceptions</th>
                </tr>
              </thead>
              <tbody>
                {supervisionTickers
                  .filter((t: any) => !supervisionFilter || t.symbol.includes(supervisionFilter.toUpperCase()))
                  .map((t: any) => {
                    const hasScore = t.has_supervision && t.supervision_score !== null && t.supervision_score !== undefined;
                    const score = hasScore ? (t.supervision_score || 0) : 0;
                    const risk = hasScore ? (t.supervision_risk || 'LOW') : '—';
                    const triggered = t.supervision_triggered || [];
                    const isUnscored = !hasScore;
                    return (
                      <tr
                        key={t.symbol}
                        className={`border-b hover:bg-gray-50 cursor-pointer transition ${
                          isUnscored ? 'opacity-50' : score >= 70 ? 'bg-red-50' : score >= 45 ? 'bg-orange-50' : ''
                        }`}
                        onClick={() => navigate(`/analysis/${t.symbol}`)}
                      >
                        <td className={`py-1.5 px-2 font-bold text-xs ${isUnscored ? 'text-gray-400' : 'text-blue-600'}`}>{t.symbol}</td>
                        <td className="py-1.5 px-2 text-center">
                          {isUnscored ? (
                            <span className="text-gray-300 text-[10px]">—</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-10 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    score >= 70 ? 'bg-red-500' : score >= 45 ? 'bg-orange-500' :
                                    score >= 20 ? 'bg-yellow-500' : 'bg-green-400'
                                  }`}
                                  style={{ width: `${Math.min(100, score)}%` }}
                                />
                              </div>
                              <span className="font-bold text-[10px]">{score}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {isUnscored ? (
                            <span className="text-gray-300 text-[10px]">—</span>
                          ) : (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              risk === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                              risk === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                              risk === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>{risk}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center text-[10px]">{isUnscored ? '—' : (t.supervision_decision || '—')}</td>
                        <td className="py-1.5 px-2">
                          {isUnscored ? (
                            <span className="text-gray-300 text-[9px]">—</span>
                          ) : (
                            <div className="flex gap-0.5 flex-wrap">
                              {triggered.map((art: string) => (
                                <span key={art} className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded font-medium">{art}</span>
                              ))}
                              {triggered.length === 0 && <span className="text-gray-300 text-[9px]">—</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          {isUnscored ? (
                            <span className="text-gray-300 text-[9px]">—</span>
                          ) : t.supervision_safe_harbor && (t.supervision_harbor_reasons || []).length > 0 ? (
                            <div className="flex gap-0.5 flex-wrap">
                              {(t.supervision_harbor_reasons || []).map((r: string) => (
                                <span key={r} className="text-[9px] bg-green-50 text-green-700 px-1 py-0.5 rounded font-medium" title={r}>{r}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[9px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic text-center py-4">
            {supervisionLoading ? 'Running supervision scan...' : 'No scan data — click Refresh Now.'}
          </p>
        )}

        {/* Equations & methodology toggle */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={() => setSupervisionExpanded(!supervisionExpanded)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {supervisionExpanded ? 'Hide' : 'Show'} Scoring Methodology &amp; Equations
          </button>
          {supervisionExpanded && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 bg-gray-50 rounded p-4">
              <div>
                <h4 className="font-bold text-gray-700 mb-1">Article Scoring Formula</h4>
                <p className="mb-2">Total risk score is a weighted average across all 13 articles:</p>
                <pre className="bg-white border rounded p-2 text-[11px] overflow-x-auto">
{`total = clamp( sum(score_i * weight_i) / sum(weight_i), 0, 100 )

Weights: Art 2=2.0  Art 3=2.0  Art 4=2.5  Art 5=2.0
         Art 6=0.5  Art 7=2.5  Art 8=0.5  Art 9=0.5
         Art 10=1.5 Art 11=2.0 Art 12=1.5
         Art 13=0.5 Art 14=0.5`}
                </pre>
              </div>
              <div>
                <h4 className="font-bold text-gray-700 mb-1">Sector Aggregation</h4>
                <p className="mb-2">Market and sector averages used for divergence checks:</p>
                <pre className="bg-white border rounded p-2 text-[11px] overflow-x-auto">
{`Sector avg change = mean(change_i) for all stocks in sector
Market avg change = mean(change_i) for all stocks scanned
Weighted PE = sum(PE_i * cap_i) / sum(cap_i)
Weighted PB = sum(PB_i * cap_i) / sum(cap_i)

Divergence = |stock_metric - sector_avg|
e.g. |40% - 10%| = 30pp divergence`}
                </pre>
              </div>
              <div>
                <h4 className="font-bold text-gray-700 mb-1">Risk Level Thresholds</h4>
                <pre className="bg-white border rounded p-2 text-[11px]">
{`CRITICAL  score >= 70
HIGH      45 <= score < 70
MEDIUM    20 <= score < 45
LOW       score < 20`}
                </pre>
              </div>
              <div>
                <h4 className="font-bold text-gray-700 mb-1">Safe Harbor (Exemption) Rules</h4>
                <pre className="bg-white border rounded p-2 text-[11px]">
{`- Price < NT$5
- Volume < 500 units
- Intraday turnover < 0.1%
- Sector < 5 stocks
- Derivative/ETF/Warrant/Bond
- Negative PE or PE >= 60x (Art 5)`}
                </pre>
              </div>
            </div>
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