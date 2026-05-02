import { useEffect, useState } from 'react';
import { fetchTrades } from '../api/endpoints';

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
  traded_at: string;
}

const fmt = (n: number) =>
  `NT$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrades()
      .then((data) => setTrades(data.trades || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalBuy = trades.filter((t) => t.side === 'BUY').reduce((s, t) => s + Number(t.total_value), 0);
  const totalSell = trades.filter((t) => t.side === 'SELL').reduce((s, t) => s + Number(t.total_value), 0);

  return (
    <div className="p-8 text-gray-800">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Trade Reports</h2>
        <p className="text-sm text-gray-500 mt-1">Complete history of your buy and sell orders</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
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
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 italic">Loading trade history...</p>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
