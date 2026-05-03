import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchTrades, fetchHoldings, fetchPendingOrders, cancelPendingOrder, updatePendingOrder, getTickers, deleteTrade } from '../api/endpoints';
import EditTradeModal from './EditTradeModal';

interface Trade {
  id: number;
  symbol: string;
  name: string;
  side: string;
  type: string;
  price: number;
  volume: number;
  total_value: number;
  limit_price: number | null;
  asset_type?: string;
  traded_at: string;
}

const fmt = (n: number) =>
  `NT$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'pending'>('history');
  const [editingPending, setEditingPending] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [tickers, setTickers] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const navigate = useNavigate();

  const loadData = () => {
    fetchTrades()
      .then((data) => setTrades(data.trades || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchPendingOrders()
      .then((data) => setPendingOrders(data.pending || []))
      .catch(() => {});
    getTickers()
      .then((data) => setTickers(data.tickers || []))
      .catch(() => {});
    fetchHoldings()
      .then((data) => setHoldings(data.holdings || []))
      .catch(() => {});
  };

  useEffect(() => { loadData(); }, []);

  const handleCancel = async (orderId: string) => {
    try {
      await cancelPendingOrder(orderId);
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
      setCancelConfirm(null);
    } catch {}
  };

  const startEdit = (o: any) => {
    setEditingPending(o.id);
    setEditPrice(String(o.limit_price));
    setEditVolume(String(o.volume));
  };

  const saveEdit = async (orderId: string) => {
    try {
      await updatePendingOrder(orderId, {
        limit_price: parseFloat(editPrice) || 0,
        volume: parseInt(editVolume) || 0,
      });
      setPendingOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, limit_price: parseFloat(editPrice), volume: parseInt(editVolume) } : o
      ));
      setEditingPending(null);
    } catch {}
  };

  const totalBuy = trades.filter((t) => t.side === 'BUY').reduce((s, t) => s + Number(t.total_value), 0);
  const totalSell = trades.filter((t) => t.side === 'SELL').reduce((s, t) => s + Number(t.total_value), 0);
  const netInvested = totalBuy - totalSell;

  // Use backend-computed holdings (avg buy price, net position) — same as Dashboard
  const holdingsWithPnl = holdings.map((h: any) => {
    const ticker = tickers.find((t) => t.symbol === h.symbol);
    const currentPrice = ticker ? parseFloat(ticker.price) || null : null;
    const avgBuy = parseFloat(h.avg_buy_price) || 0;
    const netPos = parseInt(h.net_position) || 0;
    const marketValue = currentPrice !== null ? currentPrice * netPos : null;
    const costBasis = avgBuy * netPos;
    const pnl = marketValue !== null ? marketValue - costBasis : null;
    return { ...h, currentPrice, avgBuy, netPosition: netPos, marketValue, costBasis, pnl };
  });

  // Unrealized P&L: sum of (market value - cost basis) across all holdings
  let unrealizedPnl = 0;
  let hasPrices = false;
  for (const h of holdingsWithPnl) {
    if (h.pnl !== null) {
      hasPrices = true;
      unrealizedPnl += h.pnl;
    }
  }

  // Pie chart: group holdings by category
  const pieData = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const h of holdingsWithPnl) {
      const val = h.marketValue ?? h.costBasis;
      const sym = h.symbol;
      const cat = /^\d{4,6}B/.test(sym) ? 'Bonds' : sym.startsWith('TW000T') ? 'Mutual Funds' : 'Stocks';
      groups[cat] = (groups[cat] || 0) + val;
    }
    return Object.entries(groups).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [holdingsWithPnl]);

  const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981'];

  // Date filter
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const d = new Date(t.traded_at).getTime();
      if (dateFrom && d < new Date(dateFrom).getTime()) return false;
      if (dateTo && d > new Date(dateTo).setHours(23, 59, 59, 999)) return false;
      return true;
    });
  }, [trades, dateFrom, dateTo]);

  const handleDelete = async (tradeId: number) => {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return;
    try {
      await deleteTrade(tradeId);
      loadData(); // refresh everything including holdings
    } catch {}
  };

  return (
    <div className="p-8 text-gray-800">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">My Portfolio</h2>
        <p className="text-sm text-gray-500 mt-1">Your positions, order history, and pending orders</p>
      </div>

      {/* Summary Cards + Pie Chart */}
      <div className="flex gap-4 mb-6">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="bg-white border border-gray-200 rounded p-3 shadow-sm">
            <p className="text-xs uppercase text-gray-500 font-semibold">Total Trades</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{filteredTrades.length}</p>
          </div>
          <div className="bg-white border border-green-200 rounded p-3 shadow-sm">
            <p className="text-xs uppercase text-green-600 font-semibold">Total Bought</p>
            <p className="text-xl font-bold text-green-700 mt-1">{fmt(totalBuy)}</p>
          </div>
          <div className="bg-white border border-red-200 rounded p-3 shadow-sm">
            <p className="text-xs uppercase text-red-500 font-semibold">Total Sold</p>
            <p className="text-xl font-bold text-red-600 mt-1">{fmt(totalSell)}</p>
          </div>
          <div className={`rounded p-3 shadow-sm border ${netInvested >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <p className="text-xs uppercase text-gray-600 font-semibold">Net Invested</p>
            <p className={`text-xl font-bold mt-1 ${netInvested >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{fmt(netInvested)}</p>
          </div>
          <div className={`rounded p-3 shadow-sm border ${unrealizedPnl >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs uppercase text-gray-600 font-semibold">Unrealized P&amp;L</p>
            <p className={`text-xl font-bold mt-1 ${unrealizedPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {hasPrices ? `${unrealizedPnl >= 0 ? '+' : ''}${fmt(unrealizedPnl)}` : '—'}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded p-3 shadow-sm">
            <p className="text-xs uppercase text-gray-500 font-semibold">Open Positions</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{holdingsWithPnl.length}</p>
          </div>
        </div>
        {pieData.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex items-center" style={{ width: '260px' }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(v: any) => [fmt(Number(v) || 0), 'Value']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 ml-2 text-xs">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Open Positions */}
      {holdingsWithPnl.length > 0 && (
        <div className="mb-6 bg-white border border-blue-100 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Open Positions</span>
            <span className="text-xs text-blue-400">{holdingsWithPnl.length} holding{holdingsWithPnl.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Symbol</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Shares</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Avg Buy</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Now</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {holdingsWithPnl.map((h: any) => (
                  <tr key={h.symbol} onClick={() => navigate(`/analysis/${h.symbol}`)}
                    className="border-b border-gray-100 hover:bg-blue-50 transition cursor-pointer">
                    <td className="px-3 py-2 font-bold text-blue-600 text-xs">{h.symbol}</td>
                    <td className="px-3 py-2 text-gray-700 truncate max-w-[140px] text-xs">{h.name || '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold">{h.netPosition}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">{fmt(h.avgBuy)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold">{h.currentPrice ? fmt(h.currentPrice) : '—'}</td>
                    <td className={`px-3 py-2 text-right text-xs font-bold ${h.pnl !== null ? (h.pnl >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                      {h.pnl !== null ? `${h.pnl >= 0 ? '+' : ''}${fmt(h.pnl)}` : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold text-xs">
                  <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Total Unrealized:</td>
                  <td className="px-3 py-2 text-right font-bold">{holdingsWithPnl.reduce((s, h) => s + (h.marketValue ?? h.costBasis), 0) > 0 ? fmt(holdingsWithPnl.reduce((s, h) => s + (h.marketValue ?? h.costBasis), 0)) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-bold ${unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {hasPrices ? `${unrealizedPnl >= 0 ? '+' : ''}${fmt(unrealizedPnl)}` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Date Range Filter */}
      {activeTab === 'history' && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-xs text-gray-500 font-semibold">Filter:</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-blue-500 hover:text-blue-700">Clear</button>
          )}
        </div>
      )}

      {/* Tabs: Order History / Pending Orders */}
      <div className="mb-4 flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-2 px-1 text-sm font-semibold border-b-2 transition ${
            activeTab === 'history' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Order History ({filteredTrades.length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`pb-2 px-1 text-sm font-semibold border-b-2 transition ${
            activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending Orders {pendingOrders.length > 0 && (
            <span className="ml-1 bg-amber-400 text-white text-xs rounded-full px-1.5 py-0.5">{pendingOrders.length}</span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'pending' ? (
        <div className="bg-white border border-amber-200 rounded overflow-hidden shadow-sm">
          {pendingOrders.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 text-sm">No pending limit orders.</p>
              <p className="text-gray-400 text-xs mt-1">Limit orders that haven't reached their target price will appear here.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-amber-50 border-b border-amber-200">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-amber-700">Created</th>
                  <th className="text-left px-4 py-2 font-semibold text-amber-700">Symbol</th>
                  <th className="text-left px-4 py-2 font-semibold text-amber-700">Name</th>
                  <th className="text-left px-4 py-2 font-semibold text-amber-700">Side</th>
                  <th className="text-right px-4 py-2 font-semibold text-amber-700">Limit Price</th>
                  <th className="text-right px-4 py-2 font-semibold text-amber-700">Volume</th>
                  <th className="text-center px-4 py-2 font-semibold text-amber-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((o) => (
                  <tr key={o.id} className="border-b border-amber-100">
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 font-bold text-blue-600">{o.symbol}</td>
                    <td className="px-4 py-2 text-gray-700 text-xs truncate max-w-[160px]">{o.name || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${o.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {o.side}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editingPending === o.id ? (
                        <input type="number" step="0.01" value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 px-1 py-0.5 border border-blue-300 rounded text-xs text-right" />
                      ) : (
                        <span className="font-semibold">{fmt(Number(o.limit_price))}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editingPending === o.id ? (
                        <input type="number" value={editVolume}
                          onChange={(e) => setEditVolume(e.target.value)}
                          className="w-20 px-1 py-0.5 border border-blue-300 rounded text-xs text-right" />
                      ) : (
                        <span className="text-gray-700">{o.volume}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center space-x-1">
                      {editingPending === o.id ? (
                        <>
                          <button onClick={() => saveEdit(o.id)}
                            className="text-xs text-green-600 hover:text-green-800 underline">Save</button>
                          <button onClick={() => setEditingPending(null)}
                            className="text-xs text-gray-500 hover:text-gray-700 underline">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(o)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline mr-1">Edit</button>
                          <button onClick={() => setCancelConfirm(o.id)}
                            className="text-xs text-red-500 hover:text-red-700 underline">Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : loading ? (
        <p className="text-sm text-gray-400 italic">Loading order history...</p>
      ) : filteredTrades.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded p-12 text-center">
          <p className="text-gray-400 text-sm">No trades recorded yet.</p>
          <p className="text-gray-400 text-xs mt-1">Use the Buy / Sell buttons on any analysis page to place an order.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Date</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Symbol</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Name</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">Side</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Price</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Vol</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Total</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-3 py-2 text-gray-500 text-[11px] whitespace-nowrap">
                    {new Date(t.traded_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 font-bold text-blue-600 text-xs">{t.symbol}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs max-w-[100px] truncate">{t.name || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(Number(t.price))}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-700">{t.volume}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">{fmt(Number(t.total_value))}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <button onClick={(e) => { e.stopPropagation(); setEditingTrade(t); }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 mr-1">Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      className="text-[11px] text-red-500 hover:text-red-700">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cancelConfirm && (() => {
        const o = pendingOrders.find((p) => p.id === cancelConfirm);
        return o ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Cancel Pending Order</h3>
              </div>
              <div className="px-6 py-4 space-y-2 text-sm text-gray-700">
                <p><span className="font-semibold">{o.side}</span> {o.volume} shares of <span className="font-bold text-blue-600">{o.symbol}</span></p>
                <p>Limit Price: <span className="font-semibold">{fmt(Number(o.limit_price))}</span></p>
                <p className="text-gray-500 text-xs">This order will be removed from the queue.</p>
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex gap-3 justify-end">
                <button onClick={() => setCancelConfirm(null)}
                  className="px-4 py-1.5 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">Keep Order</button>
                <button onClick={() => handleCancel(cancelConfirm)}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded">Cancel Order</button>
              </div>
            </div>
          </div>
        ) : null;
      })()}
      {editingTrade && (
        <EditTradeModal
          trade={editingTrade}
          onClose={() => setEditingTrade(null)}
          onSuccess={() => { setEditingTrade(null); loadData(); }}
        />
      )}
    </div>
  );
}
