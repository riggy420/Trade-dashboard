import { useEffect, useState } from 'react';
import { submitTrade, fetchPosition } from '../api/endpoints';

interface Props {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  side: 'BUY' | 'SELL';
  onClose: () => void;
  onSuccess: () => void;
}

export default function TradeModal({ ticker, companyName, currentPrice, side, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tradeType, setTradeType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [volume, setVolume] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [assetType, setAssetType] = useState<string>('stock');
  const [netPosition, setNetPosition] = useState<number | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const marketPrice = currentPrice ?? 0;
  const volumeNum = parseInt(volume) || 0;
  const limitPriceNum = parseFloat(limitPrice) || undefined;

  // For market orders, execution price is current price.
  // For limit orders, execution price is the limit price (validated server-side).
  const executionPrice = tradeType === 'LIMIT' && limitPriceNum ? limitPriceNum : marketPrice;
  const total = executionPrice * volumeNum;

  // Reset limit price when switching order types
  const handleTypeChange = (t: 'MARKET' | 'LIMIT') => {
    setTradeType(t);
    setLimitPrice('');
    setError('');
  };

  useEffect(() => {
    if (side === 'SELL') {
      setPositionLoading(true);
      fetchPosition(ticker)
        .then((data) => setNetPosition(data.net_position ?? 0))
        .catch(() => setNetPosition(0))
        .finally(() => setPositionLoading(false));
    }
  }, [ticker, side]);

  const limitReached = tradeType === 'LIMIT' && limitPriceNum
    ? (side === 'BUY' ? marketPrice <= limitPriceNum : marketPrice >= limitPriceNum)
    : true;

  const canProceed =
    volumeNum > 0 &&
    marketPrice > 0 &&
    (tradeType === 'MARKET' || (limitPriceNum !== undefined && limitPriceNum > 0)) &&
    (side === 'BUY' || (netPosition !== null && netPosition >= volumeNum));

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await submitTrade(ticker, companyName, side, tradeType, marketPrice, volumeNum, limitPriceNum, assetType);
      if (result.status === 'pending') {
        onSuccess();  // triggers parent toast
        onClose();
      } else {
        onSuccess();
        onClose();
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Trade failed. Please try again.');
      setStep(1);
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = side === 'BUY';
  const accentClass = isBuy ? 'text-green-600' : 'text-red-600';
  const btnClass = isBuy
    ? 'bg-green-600 hover:bg-green-700 text-white'
    : 'bg-red-600 hover:bg-red-700 text-white';

  const fmtNT = (n: number) =>
    `NT$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">
            <span className={accentClass}>{side}</span> — {ticker}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {step === 1 ? (
          <div className="px-6 py-5 space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {side === 'SELL' && (
              <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                {positionLoading ? 'Checking holdings...' :
                  netPosition === 0
                    ? <span className="text-red-600 font-medium">You have no holdings in {ticker}</span>
                    : <span>You hold <span className="font-bold">{netPosition}</span> shares</span>}
              </div>
            )}

            {/* Order type selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Order Type</label>
              <div className="flex gap-3">
                {(['MARKET', 'LIMIT'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`flex-1 py-2 rounded border text-sm font-medium transition ${tradeType === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {t === 'MARKET' ? 'Market' : 'Limit'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {tradeType === 'MARKET'
                  ? 'Executes immediately at the current market price.'
                  : isBuy
                    ? 'Executes only when the market price drops to or below your limit.'
                    : 'Executes only when the market price rises to or above your limit.'}
              </p>
            </div>

            {/* Asset type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Asset Type</label>
              <div className="flex gap-2">
                {(['stock', 'bond', 'mutual_fund'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAssetType(a)}
                    className={`flex-1 py-2 rounded border text-sm font-medium transition capitalize ${assetType === a ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {a === 'mutual_fund' ? 'Mutual Fund' : a}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit price input — only for LIMIT orders */}
            {tradeType === 'LIMIT' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Limit Price (NT$)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                  placeholder={isBuy ? 'Max price you will pay' : 'Min price you will accept'}
                />
                {limitPriceNum !== undefined && limitPriceNum > 0 && (
                  <p className={`text-xs mt-1 font-medium ${limitReached ? 'text-green-600' : 'text-amber-600'}`}>
                    {limitReached
                      ? `Limit met — current price ${fmtNT(marketPrice)} is within your limit.`
                      : isBuy
                        ? `Limit not yet met — current price ${fmtNT(marketPrice)} is above ${fmtNT(limitPriceNum)}.`
                        : `Limit not yet met — current price ${fmtNT(marketPrice)} is below ${fmtNT(limitPriceNum)}.`}
                  </p>
                )}
              </div>
            )}

            {/* Volume */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Volume (shares)</label>
              <input
                type="number"
                min={1}
                max={side === 'SELL' && netPosition !== null ? netPosition : undefined}
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                placeholder="Enter number of shares"
              />
              {side === 'SELL' && netPosition !== null && volumeNum > netPosition && (
                <p className="text-xs text-red-500 mt-1">Cannot sell more than {netPosition} shares</p>
              )}
            </div>

            {/* Estimated total */}
            <div className="bg-gray-50 rounded px-3 py-2 space-y-1 text-sm">
              {tradeType === 'MARKET' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Market Price</span>
                  <span className="font-semibold text-gray-700">{fmtNT(marketPrice)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated Total</span>
                <span className="font-bold text-gray-900">{fmtNT(total)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canProceed}
                className={`flex-1 py-2 rounded text-sm font-semibold transition disabled:opacity-40 ${btnClass}`}
              >
                Review Order →
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm text-gray-500 mb-4">Please confirm your order details below.</p>

            {tradeType === 'LIMIT' && !limitReached && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Limit not currently met. The order will be rejected unless the price reaches {fmtNT(limitPriceNum!)}.
              </div>
            )}

            {[
              ['Action', <span className={`font-bold ${accentClass}`}>{side}</span>],
              ['Symbol', ticker],
              ['Company', companyName],
              ['Order Type', tradeType === 'MARKET' ? 'Market' : 'Limit'],
              ['Asset Type', <span className="capitalize">{assetType === 'mutual_fund' ? 'Mutual Fund' : assetType}</span>],
              ...(tradeType === 'LIMIT' ? [['Limit Price', fmtNT(limitPriceNum!)]] : [['Market Price', fmtNT(marketPrice)]]),
              ['Volume', `${volumeNum} shares`],
              ['Total Value', fmtNT(total)],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 py-2 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50 transition">
                ← Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className={`flex-1 py-2 rounded text-sm font-semibold transition disabled:opacity-50 ${btnClass}`}
              >
                {submitting ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
