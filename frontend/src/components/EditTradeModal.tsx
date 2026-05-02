import { useState } from 'react';
import { updateTrade } from '../api/endpoints';

interface TradeData {
  id: number;
  symbol: string;
  name: string;
  side: string;
  type: string;
  price: number;
  volume: number;
  limit_price: number | null;
  asset_type?: string;
}

interface Props {
  trade: TradeData;
  onClose: () => void;
  onSuccess: () => void;
}

const ASSET_TYPES = ['stock', 'bond', 'mutual_fund'] as const;

export default function EditTradeModal({ trade, onClose, onSuccess }: Props) {
  const [symbol, setSymbol] = useState(trade.symbol);
  const [name, setName] = useState(trade.name);
  const [side, setSide] = useState(trade.side);
  const [price, setPrice] = useState(String(trade.price));
  const [volume, setVolume] = useState(String(trade.volume));
  const [assetType, setAssetType] = useState(trade.asset_type || 'stock');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSubmitting(true);
    setError('');
    try {
      await updateTrade(trade.id, {
        symbol,
        name,
        side,
        price: parseFloat(price) || 0,
        volume: parseInt(volume) || 0,
        asset_type: assetType,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to update trade.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtNT = (n: number) =>
    `NT$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Edit Trade #{trade.id}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Symbol</label>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Side</label>
              <div className="flex gap-2">
                {(['BUY', 'SELL'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSide(s)}
                    className={`flex-1 py-2 rounded border text-sm font-medium ${side === s ? (s === 'BUY' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-gray-200 text-gray-600'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Price</label>
              <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Volume</label>
              <input type="number" value={volume} onChange={(e) => setVolume(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Asset Type</label>
            <div className="flex gap-2">
              {ASSET_TYPES.map((a) => (
                <button key={a} type="button" onClick={() => setAssetType(a)}
                  className={`flex-1 py-2 rounded border text-sm font-medium capitalize ${assetType === a ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                  {a === 'mutual_fund' ? 'Mutual Fund' : a}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded px-3 py-2 text-xs text-gray-500">
            Total: <span className="font-bold text-gray-900">{fmtNT((parseFloat(price) || 0) * (parseInt(volume) || 0))}</span>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={submitting}
              className="flex-1 py-2 rounded text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
