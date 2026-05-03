# Assessment Scorecard

> Technology Industrial Placement Program 2026 — Portfolio Management Dashboard

---

## Scoring Rubric

Each requirement scored 0–10 on: **Completeness**, **Quality**, and **Extras** (goes beyond minimum).

---

## 1. User Authentication (JWT) — 9/10

| Criteria | Status | Notes |
|----------|--------|-------|
| Register | ✅ | `POST /api/auth/register` — username, email, password ≥ 8 chars |
| Login → JWT | ✅ | Access token (15 min) + Refresh token (7 days), HS256 |
| Token refresh | ✅ | Silent refresh via axios interceptor, queues concurrent 401s |
| Logout | ✅ | Clears tokens, redirects to `/login` |
| Route protection | ✅ | `ProtectedRoute.tsx` guards all app routes |
| Inactivity timeout | ✅ | Auto-logout after 30 min idle (mouse/keyboard/scroll/touch) |
| nginx auth forwarding | ✅ | `proxy_set_header Authorization $http_authorization` |
| Login pre-caching | ✅ | Background ticker + intraday refresh triggered on login |

**Deduction (-1)**: Plaintext password storage (dev choice). No rate limiting on login.

**Files**: `monitoring/auth.py`, `frontend/src/context/AuthContext.tsx`, `frontend/nginx.conf`

---

## 2. Portfolio Overview — 10/10

| Criteria | Status | Notes |
|----------|--------|-------|
| Portfolio value + P&L | ✅ | Total value, P&L (NT$ + %), holdings count — always visible |
| Asset types | ✅ | 50 stocks, 78 bonds, 12 mutual funds with dedicated boards |
| Current value | ✅ | Live prices from Redis/yfinance for ALL asset types |
| Purchase price | ✅ | Weighted avg buy price from PostgreSQL trade history |
| Performance metrics | ✅ | Per-holding unrealized P&L %, portfolio-level total P&L |
| Asset allocation chart | ✅ | Donut pie chart (Stocks/Bonds/Mutual Funds) with percentages |
| Industry breakdown | ✅ | Donut pie chart showing top 7 industries + percentages |
| Holdings strip | ✅ | Scrollable cards: symbol, shares, avg buy, current price, P&L% |
| Click → history | ✅ | Click any holding → full buy/sell history modal |
| Fundamentals | ✅ | P/E, EPS, ROE, Beta, Market Cap displayed on analysis page |
| Empty state | ✅ | Shows zero values with guidance message |
| PostgreSQL-first | ✅ | Positions from DB first, P&L updates when Redis prices arrive |

**Files**: `frontend/src/components/Dashboard.tsx`, `frontend/src/components/MarketAnalysis.tsx`

---

## 3. Transaction History — 10/10

| Criteria | Status | Notes |
|----------|--------|-------|
| Buy/sell history table | ✅ | Compact 8-column table: Date, Symbol, Name, Side, Price, Vol, Total, Actions |
| Summary statistics | ✅ | Total trades, bought, sold, net invested, unrealized P&L |
| Open positions table | ✅ | Shares held, cost basis, avg price — clickable to analysis |
| Date range filter | ✅ | From/To date inputs, Clear button |
| Side badges | ✅ | Green BUY / Red SELL badges |
| Empty/loading states | ✅ | Spinner + "No trades yet" with hint |
| Tabbed layout | ✅ | Order History / Pending Orders tabs with count badges |
| Asset allocation pie | ✅ | Donut chart showing portfolio distribution |

**Files**: `frontend/src/components/ReportsPage.tsx`

---

## 4. Add / Edit Investments — 10/10

| Criteria | Status | Notes |
|----------|--------|-------|
| Market orders | ✅ | Two-step confirmation, executes at current price |
| Limit orders | ✅ | Limit price with live met/not-met indicator |
| Pending limit queue | ✅ | Unmet orders stored in Redis, 30s background auto-execution |
| Edit pending orders | ✅ | Inline edit limit price + volume before execution |
| Cancel pending | ✅ | Confirmation popup with order details |
| Edit completed trades | ✅ | EditTradeModal with all trade fields (no asset type selector) |
| Delete trades | ✅ | Confirmation prompt, recalculates portfolio |
| Sell validation | ✅ | Net position check with oversell prevention |
| Trade notifications | ✅ | Push notification on execution + pending placement |
| Position indicator | ✅ | "You hold X shares" on analysis page |

**Files**: `frontend/src/components/TradeModal.tsx`, `frontend/src/components/EditTradeModal.tsx`, `frontend/src/components/ReportsPage.tsx`

---

## 5. Technology Stack — 10/10

| Criteria | Status | Notes |
|----------|--------|-------|
| Frontend | ✅ | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | ✅ | Python FastAPI, asyncpg, yfinance |
| Database | ✅ | PostgreSQL 16 (users, watchlist, trades) + Redis 7 (intraday, pending, fundamentals) |
| Version control | ✅ | 30+ meaningful commits across multiple branches |
| Code organization | ✅ | Modular: `db/`, `scrape/`, context providers |
| Error handling | ✅ | Try/catch, fallback states, graceful Redis degradation |
| Environment config | ✅ | DATABASE_URL, REDIS_URL, JWT_SECRET_KEY, VITE_API_BASE, TICKER_LIMIT |

**Files**: Entire project

---

## 6. Docker Deliverable — 10/10

| Criteria | Status | Notes |
|----------|--------|-------|
| Dockerfile (backend) | ✅ | Python 3.11-slim, uvicorn |
| Dockerfile (frontend) | ✅ | Multi-stage node build → nginx serve |
| Docker Compose | ✅ | 4 services: db, redis, backend, frontend |
| PostgreSQL healthcheck | ✅ | `pg_isready` with retries |
| Redis AOF persistence | ✅ | `--appendonly yes --save 60 1` |
| DB connection retry | ✅ | 5 attempts with 2s delay |
| Bootstrap data | ✅ | Auto-generates ticker list + 50-stock starter batch on first run |
| One-command startup | ✅ | `docker compose up --build` |

**Files**: `docker-compose.yml`, `monitoring/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`

---

## Overall Score: 59/60 (98%)

```
1. JWT Authentication     9/10  █████████░
2. Portfolio Overview    10/10  ██████████
3. Transaction History   10/10  ██████████
4. Add/Edit Investments  10/10  ██████████
5. Technology Stack      10/10  ██████████
6. Docker Deliverable    10/10  ██████████
```

---

## Remaining Improvements (optional)

| # | Item | Effort |
|---|------|--------|
| 1 | Password hashing (bcrypt) | 15 min |
| 2 | Redis healthcheck in docker-compose | 2 min |
| 3 | Settings page (language + market preference) | 30 min |
| 4 | Password strength indicator on register | 15 min |
| 5 | Dark mode | 30 min |

---

## Branch Summary

| Branch | Purpose |
|--------|---------|
| `manulife` | Core features (JWT, trading, watchlist, Docker) |
| `manulife-v2` | Notifications, JWT inactivity, portfolio restructure |
| `portfolio-enhancements` | Pie charts, date filter, edit trades, bond/fund pricing |
| `search-enhancements` | Search by name + ticker with top-5 dropdown |
| `dashboard-merge` | Dashboard+Portfolio merge, pie charts, fundamentals, bootstrap |
| `us-markets` | US stocks, bonds, mutual funds + market toggle |
