import { useEffect, useState } from 'react';
import { fetchIndices, refreshIndices, fetchSectors, fetchIndexConstituents, fetchIndexHistory, fetchSupervisionScan, getTickers } from '../api/endpoints';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';

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
  const navigate = useNavigate();
  const { isWatched, toggleWatchlist, watchlistItems } = useWatchlist();
  const [tickers, setTickers] = useState<any[]>([]);

  useEffect(() => {
    fetchIndicesData();
    fetchSectorsData();
    fetchSupervisionAlerts();
    getTickers().then((data) => setTickers(data.tickers || [])).catch(() => {});
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
    </div>
  );
}