import { useEffect, useState } from 'react';
import { fetchTrades, fetchPendingOrders, cancelPendingOrder, deleteTrade } from '../api/endpoints';
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
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'pending'>('history');

  const loadData = () => {
    fetchTrades()
      .then((data) => setTrades(data.trades || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchPendingOrders()
      .then((data) => setPendingOrders(data.pending || []))
      .catch(() => {});
  };

  useEffect(() => { loadData(); }, []);

  const handleCancel = async (orderId: string) => {
    try {
      await cancelPendingOrder(orderId);
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {}
  };

  const handleDelete = async (tradeId: number) => {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return;
    try {
      await deleteTrade(tradeId);
      setTrades((prev) => prev.filter((t) => t.id !== tradeId));
    } catch {}
  };

  const totalBuy = trades.filter((t) => t.side === 'BUY').reduce((s, t) => s + Number(t.total_value), 0);
  const totalSell = trades.filter((t) => t.side === 'SELL').reduce((s, t) => s + Number(t.total_value), 0);
  const netInvested = totalBuy - totalSell;

  // Compute current open positions from trades
  const positionMap = new Map<string, { symbol: string; name: string; net: number; totalCost: number }>();
  for (const t of trades) {
    const key = t.symbol;
    if (!positionMap.has(key)) {
      positionMap.set(key, { symbol: t.symbol, name: t.name, net: 0, totalCost: 0 });
    }
    const pos = positionMap.get(key)!;
    if (t.side === 'BUY') {
      pos.net += t.volume;
      pos.totalCost += Number(t.total_value);
    } else {
      pos.net -= t.volume;
      pos.totalCost -= Number(t.total_value);
    }
  }
  const openPositions = [...positionMap.values()].filter((p) => p.net > 0);

  return (
    <div className="p-8 text-gray-800">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">My Portfolio</h2>
        <p className="text-sm text-gray-500 mt-1">Your positions, order history, and pending orders</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded p-4 shadow-sm">
          <p className="text-xs uppercase text-gray-500 font-semibold">Total Trades</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{trades.length}</p>
        </div>
        <div className="bg-white border border-green-200 rounded p-4 shadow-sm">
          <p className="text-xs uppercase text-green-600 font-semibold">Total Bought</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmt(totalBuy)}</p>
        </div>
        <div className="bg-white border border-red-200 rounded p-4 shadow-sm">
          <p className="text-xs uppercase text-red-500 font-semibold">Total Sold</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totalSell)}</p>
        </div>
        <div className={`rounded p-4 shadow-sm border ${netInvested >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <p className="text-xs uppercase text-gray-600 font-semibold">Net Invested</p>
          <p className={`text-2xl font-bold mt-1 ${netInvested >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {fmt(netInvested)}
          </p>
        </div>
      </div>

      {/* Open Positions */}
      {openPositions.length > 0 && (
        <div className="mb-6 bg-white border border-blue-100 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Open Positions</span>
            <span className="text-xs text-blue-400">{openPositions.length} holding{openPositions.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Symbol</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700">Shares Held</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700">Cost Basis</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700">Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((p) => (
                  <tr key={p.symbol} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="px-4 py-2 font-bold text-blue-600">{p.symbol}</td>
                    <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{p.name || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{p.net}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmt(p.totalCost)}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{fmt(p.totalCost / p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          Order History ({trades.length})
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
                    <td className="px-4 py-2 text-right font-semibold">{fmt(Number(o.limit_price))}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{o.volume}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleCancel(o.id)}
                        className="text-xs text-red-600 hover:text-red-800 underline">Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : loading ? (
        <p className="text-sm text-gray-400 italic">Loading order history...</p>
      ) : trades.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded p-12 text-center">
          <p className="text-gray-400 text-sm">No trades recorded yet.</p>
          <p className="text-gray-400 text-xs mt-1">Use the Buy / Sell buttons on any analysis page to place an order.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Symbol</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Side</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Price</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Limit</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Volume</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Total Value</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(t.traded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-bold text-blue-600">{t.symbol}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">{t.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${t.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.side}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${t.type === 'LIMIT' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(Number(t.price))}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {t.limit_price != null ? fmt(Number(t.limit_price)) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{t.volume}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(Number(t.total_value))}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={(e) => { e.stopPropagation(); setEditingTrade(t); }}
                      className="text-xs text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
