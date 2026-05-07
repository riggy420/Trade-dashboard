import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';
import { getTickers } from '../api/endpoints';

export default function WatchlistPage() {
  const { watchlistItems, toggleWatchlist } = useWatchlist();
  const navigate = useNavigate();
  const [priceMap, setPriceMap] = useState<Record<string, { price: string; change: string }>>({});

  useEffect(() => {
    getTickers()
      .then((data) => {
        const map: Record<string, { price: string; change: string }> = {};
        for (const t of data.tickers || []) {
          map[t.symbol] = { price: t.price, change: t.change };
        }
        setPriceMap(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 text-gray-800">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Watchlist</h2>
        <p className="text-sm text-gray-500 mt-1">{watchlistItems.length} item{watchlistItems.length !== 1 ? 's' : ''}</p>
      </div>

      {watchlistItems.length === 0 ? (
        <div className="border border-gray-200 rounded bg-white p-12 text-center">
          <p className="text-gray-400 text-sm">No items in your watchlist yet.</p>
          <p className="text-gray-400 text-xs mt-1">Star stocks or indexes from the Dashboard to add them here.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Symbol</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Price</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Change</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {watchlistItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => navigate(`/analysis/${item.symbol}`)}
                >
                  <td className="px-4 py-3 font-bold text-blue-600">{item.symbol}</td>
                  <td className="px-4 py-3 text-gray-700">{item.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.item_type === 'index' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {item.item_type === 'index' ? 'Index' : 'Stock'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {priceMap[item.symbol]?.price ?? '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold text-sm ${
                    priceMap[item.symbol]?.change?.includes('+') ? 'text-red-600' :
                    priceMap[item.symbol]?.change?.includes('-') ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {priceMap[item.symbol]?.change ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(item.added_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWatchlist(item.symbol, item.name, item.item_type); }}
                      className="text-yellow-400 hover:text-gray-400 transition text-lg leading-none"
                      title="Remove from watchlist"
                    >
                      ★
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
