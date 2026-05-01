import { useMemo, useState } from 'react';
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

const indicatorKeywords = new Set(['close', 'sma', 'sma5', 'ema', 'ema5', 'rsi', 'rsi14', 'mfi', 'mfi14', 'volume', 'volatility']);

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [searchValue, setSearchValue] = useState('');

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
      navigate(`/analysis/${cleanedTicker}`);
      setSearchValue('');
      return;
    }
    if (indicatorKeywords.has(normalizedValue)) {
      navigate(`/analysis/${activeTicker}?indicator=${normalizedValue}`);
      setSearchValue('');
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
          <Link to="/analysis/2330" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">📈</span> Market Analysis</span>
          </Link>
          <Link to="/watchlist" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">★</span> Watchlist</span>
          </Link>
          <Link to="/reports" className="block py-3 px-6 hover:bg-gray-50 border-l-4 border-transparent text-gray-600 transition">
            <span className="flex items-center"><span className="text-gray-400 mr-2 text-lg">📄</span> Reports</span>
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
          <div className="w-1/2 bg-gray-50 flex items-center px-4 py-2 rounded-md border border-gray-200">
            <span className="mr-2 text-gray-400 w-4 h-4 rounded-full border border-gray-400 inline-block text-center text-xs leading-none">?</span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              className="bg-transparent border-none outline-none w-full text-sm text-gray-700"
              placeholder="Search ticker or indicator (sma5, ema5, rsi, mfi, volume...)"
            />
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-400 font-bold hover:text-gray-800 cursor-pointer">🔔</span>
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
        <WatchlistProvider>
          <Routes>
            {/* Public routes — no shell */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes — wrapped in shell + auth guard */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/analysis" element={<MarketAnalysis />} />
                <Route path="/analysis/:tickerId" element={<MarketAnalysis />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WatchlistProvider>
      </Router>
    </AuthProvider>
  );
}
