import { useMemo, useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate, Outlet } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import MarketAnalysis from './components/MarketAnalysis';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import WatchlistPage from './components/WatchlistPage';
import ReportsPage from './components/ReportsPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import { getTickers } from './api/endpoints';

const indicatorKeywords = new Set(['close', 'sma', 'sma5', 'ema', 'ema5', 'rsi', 'rsi14', 'mfi', 'mfi14', 'volume', 'volatility']);

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [searchValue, setSearchValue] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch tickers once for search indexing
  useEffect(() => {
    getTickers().then((data) => setAllTickers(data.tickers || [])).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchValue(value);
    if (!value.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const q = value.toLowerCase();
    const matches = allTickers.filter((t) =>
      t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    ).slice(0, 5);
    setSearchResults(matches);
    setShowDropdown(matches.length > 0);
  };

  const selectResult = (symbol: string) => {
    setSearchValue('');
    setShowDropdown(false);
    navigate(`/analysis/${symbol}`);
  };

  const activeTicker = useMemo(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'analysis' && pathParts[1]) return pathParts[1].split('.')[0];
    return '2330';
  }, [location.pathname]);

  const handleSearch = () => {
    const rawValue = searchValue.trim();
    if (!rawValue) return;
    const normalizedValue = rawValue.toLowerCase();
    const cleanedTicker = rawValue.replace(/\.(tw|two)$/i, '');
    if (/^\d{4}$/.test(cleanedTicker)) {
      selectResult(cleanedTicker);
      return;
    }
    if (indicatorKeywords.has(normalizedValue)) {
      navigate(`/analysis/${activeTicker}?indicator=${normalizedValue}`);
      setSearchValue('');
      return;
    }
    // If there's a match, go to first result
    if (searchResults.length > 0) {
      selectResult(searchResults[0].symbol);
      return;
    }
    navigate(`/analysis/${cleanedTicker}?indicator=${normalizedValue}`);
    setSearchValue('');
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      <aside className="bg-white border-r border-gray-200 flex flex-col shadow-sm z-10" style={{ width: '220px' }}>
        <div className="p-6 pb-2">
          <h1 className="text-xl font-black tracking-tight">EquitiTrack</h1>
          <p className="text-[10px] text-gray-400 mt-6 font-bold tracking-widest uppercase">Terminal</p>
          <p className="text-[10px] text-gray-400 mt-1">Institutional Access</p>
        </div>
        <nav className="mt-4 flex-1 text-sm border-t border-gray-100 pt-2">
          <Link to="/" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-black font-semibold text-black transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">⊞</span> Dashboard</span>
          </Link>
          <Link to="/analysis/all" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">📈</span> Market Analysis</span>
          </Link>
          <Link to="/analysis/all" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">📋</span> All Stocks</span>
          </Link>
          <Link to="/analysis/bonds" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">💰</span> Bonds</span>
          </Link>
          <Link to="/analysis/funds" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">📊</span> Mutual Funds</span>
          </Link>
          <Link to="/watchlist" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">★</span> Watchlist</span>
          </Link>
          <Link to="/reports" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">💼</span> My Portfolio</span>
          </Link>
        </nav>
        <nav className="mb-4 text-sm border-t border-gray-100 pt-2">
          <div className="block py-3 px-6 text-gray-400 hover:bg-gray-50 transition cursor-pointer">⚙ Settings</div>
          <button onClick={logout} className="w-full text-left block py-3 px-6 text-red-500 hover:bg-red-50 transition">
            ⏻ Sign out
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-3 flex justify-between items-center z-20">
          <div className="w-1/2 relative" ref={searchRef}>
            <div className="bg-gray-50 flex items-center px-4 py-2 rounded-md border border-gray-200">
              <span className="mr-2 text-gray-400 w-4 h-4 rounded-full border border-gray-400 inline-block text-center text-xs leading-none">?</span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                className="bg-transparent border-none outline-none w-full text-sm text-gray-700"
                placeholder="Search by ticker or name (AAPL, TSMC, Microsoft...)"
              />
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                {searchResults.map((r, i) => (
                  <button
                    key={r.symbol}
                    onClick={() => selectResult(r.symbol)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition flex items-center justify-between border-b border-gray-50 last:border-b-0"
                  >
                    <div>
                      <span className="font-bold text-blue-600 text-sm">{r.symbol}</span>
                      <span className="text-xs text-gray-400 ml-2">{r.market || ''}</span>
                    </div>
                    <span className="text-xs text-gray-600 truncate max-w-[200px]">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)}
                className="text-gray-400 font-bold hover:text-gray-800 cursor-pointer relative">
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-8 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <span className="text-xs font-bold text-gray-600">Notifications</span>
                    <div className="flex gap-2">
                      <button onClick={markAllRead} className="text-xs text-blue-500 hover:text-blue-700">Mark all read</button>
                      <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-72">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-gray-400 italic text-center py-8">No notifications</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            if (n.symbol) navigate(`/analysis/${n.symbol}`);
                            setShowNotifications(false);
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${!n.read ? 'bg-blue-50/50' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-sm mt-0.5">
                              {n.type === 'swing' ? '📊' : n.type === 'trade' ? '💼' : n.type === 'limit_executed' ? '✅' : 'ℹ️'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate">{n.title}</p>
                              <p className="text-xs text-gray-500 truncate">{n.message}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.timestamp).toLocaleTimeString()}</p>
                            </div>
                            {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-800">{user?.username ?? 'Institutional Terminal'}</p>
              <p className="text-[10px] text-gray-400 tracking-wider">{user?.email ?? ''}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <NotificationProvider>
        <WatchlistProvider>
          <Routes>
            {/* Public routes — no shell */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes — wrapped in shell + auth guard */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/analysis" element={<Navigate to="/analysis/all" replace />} />
                <Route path="/analysis/:tickerId" element={<MarketAnalysis />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WatchlistProvider>
        </NotificationProvider>
      </Router>
    </AuthProvider>
  );
}
