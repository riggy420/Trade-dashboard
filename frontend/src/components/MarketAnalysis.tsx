import { useEffect, useMemo, useState, useTransition, useRef } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchAnalysisData } from '../api/endpoints';
import { useLocation, useParams } from 'react-router-dom';

const indicatorLabels: Record<string, string> = {
  sma: 'SMA 5D',
  sma5: 'SMA 5D',
  ema: 'EMA 5D',
  ema5: 'EMA 5D',
  rsi: 'RSI 14D',
  rsi14: 'RSI 14D',
  mfi: 'MFI 14D',
  mfi14: 'MFI 14D',
  volume: 'Volume',
  volatility: 'Volatility',
};

const rangeOptions: Array<{ key: '5d' | '30d' | '60d' | '180d' | '1y' | '5y'; label: string; days: number }> = [
  { key: '5d', label: '5D', days: 5 },
  { key: '30d', label: '30D', days: 30 },
  { key: '60d', label: '60D', days: 60 },
  { key: '180d', label: '180D', days: 180 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '5y', label: '5Y', days: 365 * 5 },
];

const formatValue = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function MarketAnalysis() {
  const { tickerId } = useParams();
  const location = useLocation();
  const activeTicker = tickerId || '2330';
  const searchParams = new URLSearchParams(location.search);
  const indicatorSearch = (searchParams.get('indicator') || '').toLowerCase();
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string>('Unknown Company');
  const [recentPercentChange, setRecentPercentChange] = useState<number | null>(null);
  const [latestVolume, setLatestVolume] = useState<number>(0);
  const [averageVolume5, setAverageVolume5] = useState<number>(0);
  const [volatility, setVolatility] = useState<number>(0);
  const [latestClose, setLatestClose] = useState<number | null>(null);
  const [showSma5, setShowSma5] = useState<boolean>(true);
  const [showEma5, setShowEma5] = useState<boolean>(true);
  const [showRsi14, setShowRsi14] = useState<boolean>(true);
  const [showMfi14, setShowMfi14] = useState<boolean>(true);
  const [selectedRange, setSelectedRange] = useState<'5d' | '30d' | '60d' | '180d' | '1y' | '5y'>('1y');
  const [isPending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStrokes, setDrawingStrokes] = useState<Array<Array<{ x: number; y: number }>>>([]);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  };

  useEffect(() => {
    if (indicatorSearch) {
      setShowSma5(indicatorSearch.includes('sma'));
      setShowEma5(indicatorSearch.includes('ema'));
      setShowRsi14(indicatorSearch.includes('rsi'));
      setShowMfi14(indicatorSearch.includes('mfi'));
    }
  }, [indicatorSearch]);

  const toggleIndicator = (setter: (value: boolean) => void, value: boolean) => {
    startTransition(() => {
      setter(value);
    });
  };

  useEffect(() => {
    setSelectedRange('1y');
    setDrawingStrokes([]);
    lastPointRef.current = null;
  }, [activeTicker]);

  useEffect(() => {
    setDrawingStrokes([]);
    lastPointRef.current = null;
  }, [selectedRange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    canvasCtxRef.current = ctx;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.clearRect(0, 0, rect.width, rect.height);
    drawingStrokes.forEach((stroke) => {
      if (stroke.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      stroke.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
  }, [drawingStrokes]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };
    setDrawingStrokes([...drawingStrokes, [{ x, y }]]);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isDrawingMode) return;
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const lastPoint = lastPointRef.current;
    if (!lastPoint) return;

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPointRef.current = { x, y };

    setDrawingStrokes((prevStrokes) => {
      const newStrokes = [...prevStrokes];
      if (newStrokes.length > 0) {
        newStrokes[newStrokes.length - 1].push({ x, y });
      }
      return newStrokes;
    });
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const handleClearDrawing = () => {
    setDrawingStrokes([]);
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
  };

  useEffect(() => {
    setLoading(true);
    const loadData = async () => {
      try {
        const analysisResponse = await fetchAnalysisData(activeTicker);
        setCompanyName(analysisResponse.companyName || 'Unknown Company');
        setHistoricalData(analysisResponse.chartData || []);
        setRecentPercentChange(analysisResponse.recentPercentChange ?? null);
        setLatestVolume(analysisResponse.latestVolume ?? 0);
        setAverageVolume5(analysisResponse.averageVolume5 ?? 0);
        setVolatility(analysisResponse.volatility ?? 0);
        setLatestClose(analysisResponse.latestClose ?? null);
      } catch (err) {
        console.error('Error fetching historical data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeTicker]);

  const chartData = useMemo(() => {
    return historicalData.map((row) => ({
      ...row,
      DateLabel: formatDate(row.date),
      Close: row.close,
      SMA5: row.sma5,
      EMA5: row.ema5,
      RSI14: row.rsi14,
      MFI14: row.mfi14,
      Volume: row.volume,
    }));
  }, [historicalData]);

  const filteredChartData = useMemo(() => {
    if (!chartData.length) {
      return [];
    }

    const latestDate = new Date(chartData[chartData.length - 1].date).getTime();
    const selectedDays = rangeOptions.find((option) => option.key === selectedRange)?.days ?? 365;
    const start = latestDate - (selectedDays * 24 * 60 * 60 * 1000);

    return chartData.filter((row) => {
      const rowTime = new Date(row.date).getTime();
      return rowTime >= start && rowTime <= latestDate;
    });
  }, [chartData, selectedRange]);

  const latestRow = filteredChartData[filteredChartData.length - 1] || chartData[chartData.length - 1];
  const latestRsi = latestRow?.RSI14 ?? null;
  const latestMfi = latestRow?.MFI14 ?? null;
  const latestSma5 = latestRow?.SMA5 ?? null;
  const latestEma5 = latestRow?.EMA5 ?? null;
  const latestOpen: number | null = latestRow?.open ?? null;

  const activeIndicatorLabel = indicatorLabels[indicatorSearch] || 'All indicators';

  return (
    <div className="p-8 text-gray-800">
      <div className="flex flex-col gap-4 mb-6">
         <div className="bg-white px-4 py-3 rounded shadow-sm border border-gray-200 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-6">
           <div>
             <div className="flex items-baseline gap-3">
               <span className="text-3xl font-black text-gray-900">
                 {latestClose !== null ? `NT$${latestClose.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
               </span>
               {recentPercentChange !== null && (
                 <span className={`text-sm font-semibold px-2 py-0.5 rounded ${recentPercentChange >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                   {recentPercentChange >= 0 ? '+' : ''}{recentPercentChange.toFixed(2)}%
                 </span>
               )}
             </div>
             <div className="text-sm text-gray-500 mt-1">
               Open: {latestOpen !== null ? `NT$${latestOpen.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
             </div>
           </div>
           <div className="text-right">
             <h1 className="text-xl font-bold text-gray-900">{activeTicker} — {companyName}</h1>
             {loading && <span className="text-xs text-gray-400">Fetching 5y data...</span>}
           </div>
         </div>
         <div className="flex flex-wrap gap-4 items-center bg-white border border-gray-200 rounded px-4 py-3 shadow-sm transition-all duration-300 hover:shadow-md">
           <div className="text-sm text-gray-500">
             Search focus: {activeIndicatorLabel}
           </div>
           <div className="ml-auto text-sm text-gray-500">
             Use the controls inside the live feed panel to toggle indicators
           </div>
         </div>
         <div className="bg-white border border-gray-200 rounded px-4 py-3 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between transition-all duration-300 hover:shadow-md">
           <div className="flex flex-wrap items-center gap-2">
             {rangeOptions.map((option) => (
               <button
                 key={option.key}
                 type="button"
                 onClick={() => setSelectedRange(option.key)}
                 className={`rounded-md px-3 py-2 text-xs font-semibold border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-sm ${selectedRange === option.key ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
               >
                 {option.label}
               </button>
             ))}
           </div>
           <div className="text-sm text-gray-500 md:text-right">
             Default view: 1Y daily
           </div>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">5D Average</div>
             <div className="text-lg font-semibold">{formatValue(latestSma5)}</div>
           </div>
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">EMA 5D</div>
             <div className="text-lg font-semibold">{formatValue(latestEma5)}</div>
           </div>
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">RSI 14D</div>
             <div className="text-lg font-semibold">{formatValue(latestRsi)}</div>
           </div>
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">MFI 14D</div>
             <div className="text-lg font-semibold">{formatValue(latestMfi)}</div>
           </div>
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">Latest Volume</div>
             <div className="text-lg font-semibold">{formatValue(latestVolume)}</div>
           </div>
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">5D Avg Volume</div>
             <div className="text-lg font-semibold">{formatValue(averageVolume5)}</div>
           </div>
           <div className="bg-white border border-gray-200 rounded p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
             <div className="text-xs uppercase text-gray-500">Volatility</div>
             <div className="text-lg font-semibold">{formatValue(volatility)}%</div>
           </div>
         </div>
         <div className="text-gray-500 font-semibold">Live Feed</div>
      </div>

      <div className="bg-white p-4 shadow rounded h-96 w-full mb-8 border border-gray-200 overflow-hidden relative transition-all duration-300 hover:shadow-lg">
         <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur transition-all duration-200 hover:shadow-md">
           <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
             <input type="checkbox" checked={showSma5} onChange={(event) => toggleIndicator(setShowSma5, event.target.checked)} />
             SMA 5D
           </label>
           <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
             <input type="checkbox" checked={showEma5} onChange={(event) => toggleIndicator(setShowEma5, event.target.checked)} />
             EMA 5D
           </label>
           <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
             <input type="checkbox" checked={showRsi14} onChange={(event) => toggleIndicator(setShowRsi14, event.target.checked)} />
             RSI 14D
           </label>
           <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
             <input type="checkbox" checked={showMfi14} onChange={(event) => toggleIndicator(setShowMfi14, event.target.checked)} />
             MFI 14D
           </label>
           {isPending && <span className="text-xs text-gray-400 animate-pulse">Updating...</span>}
           <div className="border-l border-gray-300 ml-2 pl-2"></div>
           <button
             type="button"
             onClick={() => setIsDrawingMode(!isDrawingMode)}
             className={`text-xs font-semibold px-2 py-1 rounded transition-all ${isDrawingMode ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
             title="Toggle drawing mode (pen)"
           >
             ✏️ Pen
           </button>
           {drawingStrokes.length > 0 && (
             <button
               type="button"
               onClick={handleClearDrawing}
               className="text-xs font-semibold px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
               title="Clear all drawings"
             >
               ✕ Clear
             </button>
           )}
         </div>
         <div className="absolute top-4 right-4 z-10 flex flex-wrap gap-2">
           <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-xs font-semibold shadow-sm transition-all duration-200 hover:scale-105">
             SMA 5D: {formatValue(latestSma5)}
           </span>
           <span className="rounded-full bg-green-50 text-green-700 border border-green-200 px-3 py-1 text-xs font-semibold shadow-sm transition-all duration-200 hover:scale-105">
             EMA 5D: {formatValue(latestEma5)}
           </span>
         </div>
         <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filteredChartData} margin={{ top: 44, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="DateLabel" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="volume" orientation="right" hide domain={['auto', 'auto']} />
              <Tooltip formatter={(value: any) => formatValue(Number(value))} />
              <Legend />
                <Line yAxisId="left" type="monotone" dataKey="Close" name="Close" stroke="#4a5568" strokeWidth={2} dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out" />
                {showSma5 && <Line yAxisId="left" type="monotone" dataKey="SMA5" name="SMA 5D" stroke="#2563eb" strokeWidth={1.5} dot={false} strokeDasharray="5 5" isAnimationActive animationDuration={700} animationEasing="ease-out" />}
                {showEma5 && <Line yAxisId="left" type="monotone" dataKey="EMA5" name="EMA 5D" stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="3 3" isAnimationActive animationDuration={700} animationEasing="ease-out" />}
                {showRsi14 && <Line yAxisId="right" type="monotone" dataKey="RSI14" name="RSI 14D" stroke="#dc2626" strokeWidth={1.5} dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out" />}
                {showMfi14 && <Line yAxisId="right" type="monotone" dataKey="MFI14" name="MFI 14D" stroke="#7c3aed" strokeWidth={1.5} dot={false} isAnimationActive animationDuration={700} animationEasing="ease-out" />}
                <Bar yAxisId="volume" dataKey="Volume" name="Volume" fill="#cbd5e1" opacity={0.45} barSize={4} isAnimationActive animationDuration={700} animationEasing="ease-out" />
            </ComposedChart>
         </ResponsiveContainer>
         <canvas
           ref={canvasRef}
           onMouseDown={handleCanvasMouseDown}
           onMouseMove={handleCanvasMouseMove}
           onMouseUp={handleCanvasMouseUp}
           onMouseLeave={handleCanvasMouseUp}
           className={`absolute inset-4 rounded ${isDrawingMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
           style={{ top: '1rem', right: '1rem', left: '1rem', bottom: '0.5rem' }}
         />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-100 p-4 rounded h-32">News 1</div>
        <div className="bg-gray-100 p-4 rounded h-32">News 2</div>
        <div className="bg-gray-100 p-4 rounded h-32">News 3</div>
      </div>
    </div>
  );
}