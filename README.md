# Portfolio Management Dashboard — EquitiTrack

 A full-stack portfolio dashboard with 50 Taiwan stocks, 78 bond ETFs, and 12 mutual funds — real-time yfinance pricing, Market/Limit orders with Redis-backed pending queue, portfolio analytics with pie charts and cumulative returns, JWT authentication with inactivity timeout, and full Docker deployment.

## Quick Start

```bash
docker compose up --build
```
| Service    | URL                  |
|------------|----------------------|
| Frontend   | http://localhost      |
| Backend    | http://localhost:8000 |
| PostgreSQL | localhost:5432        |
| Redis      | localhost:6379        |

**Development:**
```bash
# Backend
cd monitoring && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev  # → http://localhost:5173
```

## Dashboard

| Card              | Description                           |
|-------------------|---------------------------------------|
| Portfolio Value   | Total market value of all holdings    |
| Total P&L         | Realized + Unrealized (NT$ + %)      |
| Realized P&L      | Profit from completed SELL trades     |
| Unrealized        | Profit on current holdings            |
| Holdings          | Number of open positions              |

**Charts**: Asset Allocation donut, Industry Breakdown donut, Cumulative Returns line, Return Distribution bar.

## Market Pages

| Route              | Content                                      |
|--------------------|----------------------------------------------|
| `/analysis/all`    | 50 Taiwan stocks (searchable, sortable)      |
| `/analysis/bonds`  | 78 bond ETFs with live/synthetic pricing     |
| `/analysis/funds`  | 12 mutual funds with auto-generated data     |
| `/analysis/{sym}`  | Candlestick chart + fundamentals + peer table|

## My Portfolio (`/reports`)

- **Open Positions**: per-stock shares, avg buy, current price, unrealized P&L + total
- **Order History** tab: completed trades with date filter, edit, delete
- **Pending Orders** tab: queued limit orders with inline edit, cancel confirmation

## Architecture

```
Browser → nginx :80 → /api/* → FastAPI :8000 → PostgreSQL (users, trades, watchlist)
                    ← static files             Redis (intraday, pending, fundamentals)
```

## Key API Endpoints (JWT-protected)

| Method   | Path                               | Description            |
|----------|------------------------------------|------------------------|
| POST     | `/api/auth/register`               | Register               |
| POST     | `/api/auth/login`                  | Login → JWT tokens     |
| POST     | `/api/auth/refresh`                | Refresh token          |
| GET      | `/api/data/tickers`                | Master list + prices   |
| GET      | `/api/analysis/{ticker}`           | Chart + indicators     |
| POST     | `/api/trades`                      | Submit buy/sell        |
| GET      | `/api/trades`                      | Trade history          |
| GET      | `/api/trades/holdings`             | Open positions + avg   |
| GET/PUT/DEL | `/api/trades/pending/{id}`     | Pending order CRUD     |
| PUT/DEL  | `/api/trades/{id}`                 | Edit/delete trade      |
| GET      | `/api/fundamentals/{symbol}`       | P/E, EPS, ROE, Beta    |
| GET/POST/DEL | `/api/watchlist`              | Watchlist CRUD         |
| POST     | `/api/refresh/intraday/all`        | Mass scrape (force)    |
| POST     | `/api/refresh/tickers`             | Regenerate ticker list |

## Environment Variables

| Variable                      | Default                                                  |
|-------------------------------|----------------------------------------------------------|
| `DATABASE_URL`                | `postgres://postgres:admin@localhost:5432/equititrack`   |
| `REDIS_URL`                   | `redis://localhost:6379`                                 |
| `JWT_SECRET_KEY`              | built-in dev key                                         |
| `VITE_API_BASE`               | `http://localhost:8000/api` (set to `/api` in Docker)    |
| `TICKER_LIMIT`                | `50` (set `0` for all 1,970)                             |
| `INTRADAY_REFRESH_BATCH_SIZE` | `20`                                                     |
| `INTRADAY_REFRESH_PAUSE_SECONDS` | `0.5`                                                |

## Branches & Commit History

| Branch                   | Commits | Focus                                        |
|--------------------------|---------|----------------------------------------------|
| `manulife`               | 19      | Core: JWT, trading, watchlist, Docker        |
| `manulife-v2`            | 22      | Notifications, inactivity, portfolio         |
| `portfolio-enhancements` | 27      | Pie charts, date filter, edit trades         |
| `search-enhancements`    | 23      | Search by name + ticker dropdown             |
| `dashboard-merge`        | 60      | Dashboard+Portfolio merge, charts, bootstrap |
| `us-markets`             | 22      | US stocks, bonds, funds + market toggle      |

**Total**: 80+ commits across 6 feature branches
