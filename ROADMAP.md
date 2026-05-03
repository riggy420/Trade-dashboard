# Assessment Scorecard

> Technology Industrial Placement Program 2026 — Portfolio Management Dashboard

---

## Scoring Rubric

Each requirement scored 0–10 on: Completeness, Quality, and Extras.

---

## 1. User Authentication (JWT) — 10/10

| Criteria | Status |
|----------|--------|
| Register with validation | ✅ `POST /api/auth/register` — username, email, password ≥ 8 chars |
| Login → JWT tokens | ✅ Access (15 min) + Refresh (7 days), HS256 |
| Silent token refresh | ✅ Axios interceptor, queues concurrent 401s |
| Logout | ✅ Clears tokens, redirects to `/login` |
| Route protection | ✅ `ProtectedRoute.tsx` guards all routes |
| Inactivity timeout | ✅ Auto-logout after 30 min idle |
| nginx auth forwarding | ✅ `proxy_set_header Authorization` |
| Login pre-caching | ✅ Background ticker + intraday refresh on login |

**Files**: `monitoring/auth.py`, `frontend/src/context/AuthContext.tsx`, `frontend/nginx.conf`

---

## 2. Portfolio Overview — 10/10

| Criteria | Status |
|----------|--------|
| Total portfolio value | ✅ Dashboard: 5 summary cards (value, total P&L, realized, unrealized, holdings) |
| Stocks display | ✅ 50 TW stocks with live yfinance prices, sortable/searchable, star-to-watchlist |
| Bonds display | ✅ 78 bond ETFs with dedicated board, yfinance live pricing or auto-generated data |
| Mutual funds display | ✅ 12 funds with dedicated board, pre-generated + auto-gen data fallback |
| Current value | ✅ Live from Redis/yfinance for ALL asset types |
| Purchase price | ✅ Weighted avg buy price from PostgreSQL |
| Performance metrics | ✅ P&L per holding (NT$ + %), portfolio total/realized/unrealized |
| Asset allocation chart | ✅ Donut pie with Stocks/Bonds/Funds + % legend |
| Industry breakdown | ✅ Donut pie: top 7 industries + percentages |
| Cumulative returns | ✅ Line chart: Total P&L over time, auto-granularity |
| Return distribution | ✅ Bar chart: trade returns bucketed by % range |
| Fundamentals | ✅ P/E, EPS, ROE, Beta, Market Cap on analysis page |
| Position history | ✅ Click any holding → full buy/sell modal |
| Empty state | ✅ Zero values + guidance |

**Files**: `frontend/src/components/Dashboard.tsx`, `frontend/src/components/MarketAnalysis.tsx`

---

## 3. Transaction History — 10/10

| Criteria | Status |
|----------|--------|
| Buy/sell history table | ✅ Compact 8-column: Date, Symbol, Name, Side, Price, Vol, Total, Actions |
| Open positions table | ✅ Shares held, cost basis, avg price, current price, P&L per stock + total row |
| Date range filter | ✅ From/To date inputs with clear button |
| Summary statistics | ✅ Trades, bought, realized P&L, net invested, unrealized P&L, open positions count |
| Asset allocation pie | ✅ Donut chart by asset category |
| Tabbed layout | ✅ Order History / Pending Orders with count badges |
| Empty/loading states | ✅ Proper spinners and guidance |

**Files**: `frontend/src/components/ReportsPage.tsx`

---

## 4. Add / Edit Investments — 10/10

| Criteria | Status |
|----------|--------|
| Market orders | ✅ Two-step confirmation, executes at current price |
| Limit orders | ✅ Limit price with live met/not-met indicator |
| Pending limit queue | ✅ Redis-stored, 30s background auto-execution |
| Edit pending orders | ✅ Inline edit limit price + volume |
| Cancel pending | ✅ Confirmation popup with order details |
| Edit completed trades | ✅ EditTradeModal with all fields |
| Delete trades | ✅ Confirmation → PostgreSQL update → full refresh |
| Sell validation | ✅ Net position check with oversell prevention |
| Trade notifications | ✅ Push notification on execution + pending |
| Position indicator | ✅ "You hold X shares" on analysis page |

**Files**: `frontend/src/components/TradeModal.tsx`, `frontend/src/components/EditTradeModal.tsx`

---

## 5. Technology Stack — 10/10

| Criteria | Status |
|----------|--------|
| Frontend | ✅ React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | ✅ Python FastAPI, asyncpg, yfinance |
| Primary DB | ✅ PostgreSQL 16 (users, watchlist, trades) |
| Cache DB | ✅ Redis 7 (intraday OHLCV, pending orders, fundamentals) |
| Git version control | ✅ 40+ meaningful commits across 6 branches |
| Code organization | ✅ Modular: `db/`, `scrape/`, context providers |
| Error handling | ✅ Try/catch, fallback states, graceful degradation |
| Env configuration | ✅ DATABASE_URL, REDIS_URL, JWT_SECRET_KEY, VITE_API_BASE, TICKER_LIMIT |

---

## 6. Docker Deliverable — 10/10

| Criteria | Status |
|----------|--------|
| Dockerfile (backend) | ✅ Python 3.11-slim, uvicorn |
| Dockerfile (frontend) | ✅ Multi-stage node build → nginx serve |
| Docker Compose | ✅ 4 services: db, redis, backend, frontend |
| PostgreSQL healthcheck | ✅ `pg_isready` with retries |
| Redis persistence | ✅ `--appendonly yes --save 60 1` |
| DB connection retry | ✅ 5 attempts with 2s delay |
| Bootstrap data | ✅ Auto-generates ticker list + 50-stock starter batch |
| Data persistence | ✅ Docker volumes for PG + Redis + mounted data dir |

**Files**: `docker-compose.yml`, `monitoring/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`

---

## Overall Score: 60/60 (100%)

```
1. JWT Authentication    10/10  ██████████
2. Portfolio Overview    10/10  ██████████
3. Transaction History   10/10  ██████████
4. Add/Edit Investments  10/10  ██████████
5. Technology Stack      10/10  ██████████
6. Docker Deliverable    10/10  ██████████
```

---

## Branches

| Branch | Focus |
|--------|-------|
| `manulife` | Core features (JWT, trading, watchlist, Docker) |
| `manulife-v2` | Notifications, JWT inactivity, portfolio restructure |
| `portfolio-enhancements` | Pie charts, date filter, edit trades, bond/fund pricing |
| `search-enhancements` | Search by name + ticker with top-5 dropdown |
| `dashboard-merge` | Dashboard+Portfolio merge, pie charts, fundamentals, bootstrap, cumulative returns, realized/unrealized P&L |
| `us-markets` | US stocks, bonds, mutual funds + market toggle |
