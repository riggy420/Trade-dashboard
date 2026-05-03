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

## 2. Portfolio Overview — 8/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Portfolio dashboard | ✅ | Live Dashboard with total value, P&L, holdings count |
| Asset summary | ✅ | Stocks (1970 TW + 50 US), bonds (78 TW + 16 US ETFs), mutual funds (12 TW + 20 US) |
| Current value | ✅ | Live prices from Redis/yfinance, refreshed every 60s |
| Purchase price | ✅ | Weighted avg buy price computed from PostgreSQL trade history |
| Performance metrics | ✅ | Per-holding unrealized P&L (NT$ + %), portfolio-level total P&L |
| Holdings strip | ✅ | Horizontal scrollable cards with symbol, shares, avg buy, current, P&L% |
| Empty state | ✅ | Shows zero values with guidance message |
| Market toggle | ✅ | Taiwan ↔ US market switch in sidebar |

**Deductions (-2)**:
- Bond/mutual fund performance metrics use cost basis as current value (no live pricing for non-stock assets)
- No allocation pie chart or visual portfolio breakdown
- Industry data requires manual sector scrape to populate

**Files**: `frontend/src/components/Dashboard.tsx`, `monitoring/db/database.py`

---

## 3. Transaction History — 9/10

| Criteria | Score | Notes |
|----------|-------|-------|
| View buy/sell history | ✅ | Full table with date, symbol, name, side, type, price, volume, total |
| Summary statistics | ✅ | Total trades, total bought, total sold, net invested, unrealized P&L |
| Open positions table | ✅ | Shares held, cost basis, avg price — clickable to analysis |
| Side badges | ✅ | Green BUY / Red SELL badges |
| Empty/loading states | ✅ | Proper loading spinner and empty guidance |
| Completed trades immutable | ✅ | No edit/delete on executed trades |
| Tabbed layout | ✅ | Order History / Pending Orders tabs with count badges |

**Deduction (-1)**: No CSV/PDF export. No date range filtering.

**Files**: `frontend/src/components/ReportsPage.tsx`, `monitoring/main.py`

---

## 4. Add / Edit Investments — 8/10

| Criteria | Score | Notes |
|----------|-------|-------|
| Add new buy/sell | ✅ | Two-step market/limit order modal |
| Market orders | ✅ | Executes at current price |
| Limit orders | ✅ | Live met/not-met indicator, pending queue |
| Pending order edit | ✅ | Inline edit limit price + volume |
| Cancel pending | ✅ | Confirmation popup before cancel |
| Sell validation | ✅ | Net position check, oversell prevention |
| Asset types | ✅ | Stock/Bond/Mutual Fund options |
| Trade notifications | ✅ | Push notification on execution + pending placement |

**Deductions (-2)**:
- Completed trades are immutable by design (PostgreSQL = final), but the assessment expects edit capability on existing investments
- No bulk import or CSV upload
- No stop-loss or take-profit order types

**Files**: `frontend/src/components/TradeModal.tsx`, `frontend/src/components/ReportsPage.tsx`

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

## Overall Score: 53/60 (88%)

```
1. JWT Authentication    9/10  █████████░
2. Portfolio Overview    8/10  ████████░░
3. Transaction History   9/10  █████████░
4. Add/Edit Investments  8/10  ████████░░
5. Technology Stack     10/10  ██████████
6. Docker Deliverable    9/10  █████████░
```

---

## Suggested Improvements

### High Impact (worth implementing before submission)

1. **Add password hashing** — current plaintext storage is a security concern. Switch to bcrypt (`passlib[bcrypt]`). ~15 minutes.

2. **Portfolio allocation visual** — add a simple donut/pie chart on the Dashboard showing portfolio breakdown by asset type (stocks vs bonds vs funds). Recharts already imported. ~20 minutes.

3. **Edit completed trades** — assessment explicitly says "edit existing ones." Add back the edit modal with a warning that it changes historical records. ~10 minutes (EditTradeModal already exists).

4. **Redis healthcheck in docker-compose** — simple `redis-cli ping` check. ~2 minutes.

### Medium Impact

5. **Date range filter on transaction history** — simple "From / To" date inputs above the table. ~20 minutes.

6. **Settings page** — wire up the existing ⚙ Settings sidebar link with language toggle (EN/ZH) and market preference. Already planned. ~30 minutes.

7. **Password strength indicator** — visual bar on Register page showing password requirements. ~15 minutes.

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
