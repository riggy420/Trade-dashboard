# Assessment Scorecard & Roadmap

> Technology Industrial Placement Program 2026 — Portfolio Management Dashboard

---

## Scoring Rubric

Each requirement scored 0–10 based on:
- **Completeness**: Does it do what was asked?
- **Quality**: Is it well-implemented, robust, polished?
- **Extras**: Does it go beyond the minimum?

---

## 1. User Authentication (JWT) — 9/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Register endpoint | ✅ | `POST /api/auth/register` — username, email, password with validation |
| Login → JWT tokens | ✅ | Access (15 min) + Refresh (7 days) HS256 |
| Token refresh | ✅ | Silent refresh via axios interceptor, queues concurrent 401s |
| Logout | ✅ | Clears tokens, redirects to /login |
| Route protection | ✅ | `ProtectedRoute.tsx` guards all app routes |
| Inactivity timeout | ✅ | Auto-logout after 30 min idle |
| nginx auth forwarding | ✅ | `proxy_set_header Authorization $http_authorization` |

**Deduction (-1)**: No password strength requirements beyond 8-char minimum. Plaintext storage (dev choice). No rate limiting on login attempts.

**Files**: `monitoring/auth.py`, `frontend/src/context/AuthContext.tsx`, `frontend/nginx.conf`

---

## 2. Portfolio Overview — 9/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Portfolio dashboard | ✅ | Live Dashboard with total value, P&L, holdings count |
| Asset summary | ✅ | Stocks (1970 TW + 50 US), bonds (78 TW + 16 US ETFs), mutual funds (12 TW + 20 US) |
| Current value | ✅ | Live prices from Redis/yfinance for ALL asset types (stocks, bonds, funds) |
| Purchase price | ✅ | Weighted avg buy price computed from PostgreSQL trade history |
| Performance metrics | ✅ | Per-holding unrealized P&L (NT$ + %), portfolio-level total P&L |
| Holdings strip | ✅ | Horizontal scrollable cards with symbol, shares, avg buy, current, P&L% |
| Empty state | ✅ | Shows zero values with guidance message |
| Asset allocation chart | ✅ | Donut pie chart on My Portfolio page (Stocks/Bonds/Mutual Funds) |
| Market toggle | ✅ | Taiwan ↔ US market switch in sidebar |

**Deduction (-1)**: Industry data requires sector scrape to populate initially.

**Files**: `frontend/src/components/Dashboard.tsx`, `frontend/src/components/ReportsPage.tsx`

---

## 3. Transaction History — 10/10

| Criteria | Score | Notes |
|----------|-------|-------|
| View buy/sell history | ✅ | Full table with date, symbol, name, side, type, price, volume, total |
| Summary statistics | ✅ | Total trades, total bought, total sold, net invested, unrealized P&L |
| Open positions table | ✅ | Shares held, cost basis, avg price — clickable to analysis |
| Side badges | ✅ | Green BUY / Red SELL badges |
| Empty/loading states | ✅ | Proper loading spinner and empty guidance |
| Date range filter | ✅ | From/To date inputs filter trades, Clear button to reset |
| Tabbed layout | ✅ | Order History / Pending Orders tabs with count badges |

**Files**: `frontend/src/components/ReportsPage.tsx`, `monitoring/main.py`

---

## 4. Add / Edit Investments — 9/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Add new buy/sell | ✅ | Two-step market/limit order modal |
| Market orders | ✅ | Executes at current price |
| Limit orders | ✅ | Live met/not-met indicator, pending queue |
| Pending order edit | ✅ | Inline edit limit price + volume |
| Cancel pending | ✅ | Confirmation popup before cancel |
| Edit completed trades | ✅ | EditTradeModal restores any completed trade field |
| Delete trades | ✅ | Delete with confirmation, recalcs portfolio |
| Sell validation | ✅ | Net position check, oversell prevention |
| Asset types | ✅ | Stock/Bond/Mutual Fund options |
| Trade notifications | ✅ | Push notification on execution + pending placement |

**Deduction (-1)**: No bulk import/CSV upload.

**Files**: `frontend/src/components/TradeModal.tsx`, `frontend/src/components/ReportsPage.tsx`, `frontend/src/components/EditTradeModal.tsx`

---

## 5. Technology Stack — 10/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Frontend | ✅ | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | ✅ | Python FastAPI, asyncpg, yfinance |
| Database | ✅ | PostgreSQL 16 (users, watchlist, trades) + Redis 7 (intraday cache, pending orders) |
| Version control | ✅ | 18+ meaningful commits across multiple branches |
| Code organization | ✅ | Modular: `db/`, `scrape/`, `supervision/`, context providers |
| Error handling | ✅ | Try/catch, fallback states, graceful Redis degradation |
| Environment config | ✅ | Env vars for DB, Redis, JWT, API base URL |

**Files**: Entire project

---

## 6. Docker Deliverable — 9/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Dockerfile (backend) | ✅ | Python 3.11-slim, uvicorn |
| Dockerfile (frontend) | ✅ | Multi-stage node build → nginx serve |
| Docker Compose | ✅ | 4 services: db, redis, backend, frontend |
| Health checks | ✅ | PostgreSQL healthcheck with `pg_isready` |
| Data persistence | ✅ | Docker volumes for PostgreSQL + Redis AOF |
| DB connection retry | ✅ | 5 attempts with 2s delay |
| One-command startup | ✅ | `docker compose up --build` |

**Deduction (-1)**: Backend waits for PostgreSQL but doesn't wait for Redis. Redis healthcheck not configured.

**Files**: `docker-compose.yml`, `monitoring/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`

---

## Overall Score: 56/60 (93%)

```
1. JWT Authentication    9/10  █████████░
2. Portfolio Overview    9/10  █████████░
3. Transaction History  10/10  ██████████
4. Add/Edit Investments  9/10  █████████░
5. Technology Stack     10/10  ██████████
6. Docker Deliverable    9/10  █████████░
```

---

## Suggested Improvements

### High Impact

1. ✅ ~~Portfolio allocation visual~~ — Donut pie chart on My Portfolio page. **DONE**.

2. ✅ ~~Edit completed trades~~ — EditTradeModal with all trade fields. **DONE**.

3. ✅ ~~Date range filter~~ — From/To date inputs on Order History. **DONE**.

4. **Add password hashing** — current plaintext storage should switch to bcrypt. ~15 min.

5. **Redis healthcheck in docker-compose** — `redis-cli ping` check. ~2 min.

### Medium Impact

6. **Settings page** — wire up the ⚙ Settings with language toggle (EN/ZH) and market preference. ~30 min.

7. **Password strength indicator** — visual bar on Register page. ~15 min.

### Low Impact (nice to have)

8. **CSV export** — download button on Reports page. ~15 minutes.

9. **Dark mode** — Tailwind dark variant. ~30 minutes.

10. **Audit log** — immutable log of all trade edits/deletes for compliance. ~30 minutes (new DB table + middleware).

---

## Branch Summary

| Branch | Purpose | Status |
|--------|---------|--------|
| `manulife` | Original development | Archived |
| `manulife-v2` | Notification system, JWT inactivity, portfolio enhancements | Active |
| `us-markets` | US stocks, bonds, mutual funds | Stale (work continued in manulife-v2) |
| `search-enhancements` | Search bar with name+ticker matching, top-5 dropdown | Active |
