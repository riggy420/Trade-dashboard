# Assessment Progress Roadmap

> Technology Industrial Placement Program 2026 — Portfolio Management Dashboard

## Legend
- ✅ Complete — ❌ Not started

---

## 1. User Authentication (JWT) — ✅

| # | Requirement | Status |
|---|-----------|--------|
| 1.1 | Register endpoint | ✅ `POST /api/auth/register` |
| 1.2 | Login endpoint | ✅ `POST /api/auth/login` — access + refresh token pair |
| 1.3 | Token refresh | ✅ `POST /api/auth/refresh` — silent refresh via axios interceptor |
| 1.4 | Protected routes | ✅ `ProtectedRoute.tsx` guards all app routes |
| 1.5 | Logout | ✅ Clears tokens + redirects to `/login` |
| 1.6 | Frontend forms | ✅ LoginPage + RegisterPage with validation |
| 1.7 | nginx auth forwarding | ✅ `proxy_set_header Authorization $http_authorization` |

**Files**: `monitoring/auth.py`, `frontend/src/context/AuthContext.tsx`, `frontend/nginx.conf`

---

## 2. Portfolio Overview Dashboard — ✅

| # | Requirement | Status |
|---|-----------|--------|
| 2.1 | Portfolio value cards | ✅ Total Value, Total P&L (green/red), Holdings count |
| 2.2 | Current value per holding | ✅ Live market price from Redis/ticker feed, refreshed every 60s |
| 2.3 | Purchase price per holding | ✅ Weighted average buy price from PostgreSQL |
| 2.4 | Performance metrics (P&L %) | ✅ Real-time unrealized P&L per holding |
| 2.5 | Holdings strip | ✅ Horizontal scrollable cards with symbol, shares, avg buy, current price, P&L% |
| 2.6 | Watchlist Movers strip | ✅ Most volatile watchlisted stocks |
| 2.7 | Position history modal | ✅ Click any holding → full buy/sell history for that symbol |
| 2.8 | Empty portfolio state | ✅ Shows zero values with hint message |
| 2.9 | PostgreSQL-first data | ✅ Positions loaded from DB first, 0% P&L until Redis prices arrive |
| 2.10 | Login pre-caching | ✅ Background ticker + intraday refresh triggered on login |

**Files**: `frontend/src/components/Dashboard.tsx`, `monitoring/db/database.py`

---

## 3. Transaction History — ✅

| # | Requirement | Status |
|---|-----------|--------|
| 3.1 | Buy/sell history table | ✅ Full table with date, symbol, name, side, type, price, limit, volume, total |
| 3.2 | Summary stats | ✅ Total trades, total bought, total sold, net invested |
| 3.3 | Open Positions table | ✅ Shares held, cost basis, avg price per symbol — clickable to analysis |
| 3.4 | Completed trades immutable | ✅ No edit/delete on executed trades (PostgreSQL = final) |
| 3.5 | Loading + empty states | ✅ |

**Files**: `frontend/src/components/ReportsPage.tsx`, `monitoring/main.py`

---

## 4. Add / Edit Investments — ✅

| # | Requirement | Status |
|---|-----------|--------|
| 4.1 | Market orders | ✅ Two-step confirmation modal, executes at current price |
| 4.2 | Limit orders | ✅ Limit price input with live met/not-met indicator |
| 4.3 | Pending limit queue | ✅ Orders queued in Redis, 30s background checker auto-executes |
| 4.4 | Edit pending orders | ✅ Inline edit limit price + volume in Pending Orders tab |
| 4.5 | Cancel pending orders | ✅ Removes from Redis queue |
| 4.6 | Sell validation | ✅ Net position check, oversell prevention |

**Files**: `frontend/src/components/TradeModal.tsx`, `frontend/src/components/ReportsPage.tsx`, `monitoring/main.py`, `monitoring/db/redis_client.py`

---

## 5. Technology Stack — ✅

| # | Requirement | Status |
|---|-----------|--------|
| 5.1 | Frontend | ✅ React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| 5.2 | Backend | ✅ Python FastAPI, asyncpg, yfinance |
| 5.3 | Database | ✅ PostgreSQL 16 (users, watchlist, trades tables) |
| 5.4 | Cache | ✅ Redis 7 (intraday OHLCV data, pending limit order queue) |
| 5.5 | Git version control | ✅ 14+ meaningful commits |

---

## 6. Docker Deliverable — ✅

| # | Requirement | Status |
|---|-----------|--------|
| 6.1 | Dockerfile (backend) | ✅ Python 3.11-slim, uvicorn |
| 6.2 | Dockerfile (frontend) | ✅ Multi-stage node build → nginx serve |
| 6.3 | Docker Compose | ✅ 4 services: db, redis, backend, frontend |
| 6.4 | nginx reverse proxy | ✅ Static files + /api/ proxy + SPA fallback |
| 6.5 | PostgreSQL in container | ✅ postgres:16-alpine with healthcheck + init |
| 6.6 | Redis in container | ✅ redis:7-alpine with AOF persistence |
| 6.7 | DB connection retry | ✅ 5 attempts with 2s delay |
| 6.8 | One-command startup | ✅ `docker compose up --build` |

---

## 7. Market Data & Analysis — ✅

| # | Feature | Status |
|---|---------|--------|
| 7.1 | All Stocks board | ✅ `/analysis/all` — sortable, searchable, 1,970 TW stocks |
| 7.2 | Bond ETFs board | ✅ `/analysis/bonds` — 78 Taiwan bond ETFs with live prices |
| 7.3 | Mutual Funds board | ✅ `/analysis/funds` — 12 verified Taiwan mutual funds |
| 7.4 | Same-industry stocks | ✅ Below chart on individual analysis pages |
| 7.5 | Candlestick chart | ✅ SMA/EMA/RSI/MFI indicators, 5D-5Y ranges, pen drawing tool |
| 7.6 | Taiwan market indices | ✅ Industry + concept indices with 60-day sparklines |
| 7.7 | Sector performance | ✅ Per-sector avg change, top/bottom performers |
| 7.8 | Regulatory supervision | ✅ TWSE Articles 2-12 scored from OHLCV, risk-level alerts |
| 7.9 | Auto-refresh | ✅ Dashboard 60s, Market hourly toggle, overview pages on-entry |

---

## 8. Watchlist — ✅

| # | Feature | Status |
|---|---------|--------|
| 8.1 | Star/unstar stocks | ✅ From Taiwan Board, index cards |
| 8.2 | Watchlist page | ✅ `/watchlist` with live prices and changes |
| 8.3 | Optimistic UI | ✅ Instant feedback, rollback on API failure |
| 8.4 | DB persistence | ✅ Per-user in PostgreSQL |

---

## Summary

| Section | Status |
|---------|--------|
| 1. JWT Authentication | ✅ 7/7 |
| 2. Portfolio Dashboard | ✅ 10/10 |
| 3. Transaction History | ✅ 5/5 |
| 4. Add / Edit Investments | ✅ 6/6 |
| 5. Technology Stack | ✅ 5/5 |
| 6. Docker Deliverable | ✅ 8/8 |
| 7. Market Data & Analysis | ✅ 9/9 |
| 8. Watchlist | ✅ 4/4 |

**Overall**: 54/54 ✅ — All assessment requirements met.
