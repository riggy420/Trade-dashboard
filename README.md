# Portfolio Management Dashboard — EquitiTrack

A full-stack portfolio management dashboard for Taiwanese equities built for the Technology Industrial Placement Program 2026 assessment. Supports 1,970 stocks, 78 bond ETFs, and 12 mutual funds with real-time yfinance data, portfolio tracking, Market/Limit order execution, pending limit order queue, regulatory supervision alerts, and watchlist persistence — all Dockerized with PostgreSQL and Redis.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Python 3.13, FastAPI, asyncpg |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (intraday OHLCV, pending limit order queue) |
| Auth | JWT (access + refresh tokens, HS256) |
| Data | yfinance, TWSE ISIN scraper, TWSE MI_INDEX API |

## Quick Start

### Docker (recommended)
```bash
docker compose up --build
```
| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Development
```bash
# Backend
cd monitoring
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # → http://localhost:5173
```

## Features

### Portfolio Management
- **Dashboard**: Portfolio value, total P&L (green/red), holdings strip with real-time unrealized P&L per position
- **Click** any holding to see full buy/sell history for that symbol
- **My Portfolio**: Open Positions table (shares held, cost basis, avg price), Order History tab (completed trades — immutable), Pending Orders tab (queued limit orders with inline edit)
- Data refreshes every 60 seconds; login triggers background pre-caching

### Trading
- **Market orders**: Two-step confirmation, executes at current price — volume-only input
- **Limit orders**: Set limit price with live met/not-met indicator; unmet orders queue in Redis
- **Pending queue**: Background checker executes limit orders every 30s when price condition is met
- **Edit pending orders**: Inline modify limit price and volume before execution
- **Sell validation**: Net position check with oversell prevention

### Market Data
- **All Stocks** (`/analysis/all`): 1,970 TW stocks — searchable, sortable, star-to-watchlist
- **Bonds** (`/analysis/bonds`): 78 Taiwan bond ETFs (US Treasury, Corporate IG, Sector, EM, High Yield)
- **Mutual Funds** (`/analysis/funds`): Verified funds from Allianz, Yuanta, Fubon, Nomura, KGI
- **Individual Analysis** (`/analysis/{symbol}`): Candlestick chart with SMA/EMA/RSI/MFI, pen drawing, same-industry peers
- **Taiwan Indices**: Industry + concept indices with 60-day sparklines and constituent drill-down
- **Supervision Alerts**: TWSE Articles 2-12 scored from OHLCV data, risk-level cards

### Auth & Watchlist
- JWT login/register with silent token refresh
- Star any stock/bond/fund from any table
- Watchlist page with live prices, optimistic UI, PostgreSQL persistence

## Architecture

```
┌─────────────┐    /api/*    ┌──────────┐    SQL    ┌────────────┐
│  nginx :80  │────────────→│ FastAPI  │─────────→│ PostgreSQL │
│  (React)    │             │  :8000   │          │  (users,   │
└─────────────┘             └────┬─────┘          │   trades,  │
                                 │                │   watchlist)│
                                 │ Redis          └────────────┘
                                 │ commands
                                 │
                          ┌──────▼──────┐
                          │  Redis 7    │
                          │  (intraday  │
                          │   OHLCV,    │
                          │   pending   │
                          │   orders)   │
                          └─────────────┘
```

## Key API Endpoints (all under `/api/`, JWT-protected)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register (public) |
| POST | `/auth/login` | Login → JWT tokens |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/data/tickers` | Master stock/fund list with live prices |
| GET | `/analysis/{ticker}` | Technical analysis + chart data |
| POST | `/trades` | Submit buy/sell (market or limit) |
| GET | `/trades` | Completed trade history |
| GET | `/trades/holdings` | Current open positions with avg buy |
| GET | `/trades/history/{symbol}` | Per-symbol trade history |
| GET | `/trades/pending` | Queued limit orders |
| PUT | `/trades/pending/{id}` | Edit pending limit price/volume |
| DELETE | `/trades/pending/{id}` | Cancel pending order |
| GET | `/trades/position/{symbol}` | Net position for a symbol |
| GET/POST/DELETE | `/watchlist` | User watchlist CRUD |
| GET | `/supervision/scan` | Regulatory risk scan |
| POST | `/refresh/tickers` | Scrape master ticker list |
| POST | `/refresh/intraday/all` | Mass intraday scrape (batched) |
| POST | `/refresh/intraday/{ticker}` | Single-stock refresh |
| POST | `/refresh/historical/{ticker}` | 5-year history scrape |

## Project Structure

```
Trade/
├── docker-compose.yml
├── monitoring/                 # FastAPI backend
│   ├── main.py                 # All endpoints
│   ├── auth.py                 # JWT + Pydantic models
│   ├── analysis_utils.py       # Technical indicators
│   ├── db/
│   │   ├── database.py         # PostgreSQL pool, migrations, queries
│   │   └── redis_client.py     # Redis intraday cache + pending orders
│   ├── scrape/
│   │   └── scrape.py           # yfinance/TWSE scraping
│   ├── supervision/
│   │   ├── supervision_utils.py # TWSE regulatory scoring
│   │   └── article.md          # Monitoring criteria docs
│   ├── data/                   # Cached files
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── App.tsx             # Router, sidebar, search
│   │   ├── api/
│   │   │   ├── endpoints.ts    # API client functions
│   │   │   ├── axiosInstance.ts # JWT interceptor
│   │   │   └── config.ts       # VITE_API_BASE config
│   │   ├── context/
│   │   │   ├── AuthContext.tsx  # Auth state + login pre-caching
│   │   │   └── WatchlistContext.tsx
│   │   └── components/
│   │       ├── Dashboard.tsx    # Portfolio summary + holdings
│   │       ├── MarketAnalysis.tsx # Chart + Board (all/bonds/funds/industry)
│   │       ├── TradeModal.tsx   # Market/Limit order modal
│   │       ├── ReportsPage.tsx  # My Portfolio (positions + history + pending)
│   │       ├── WatchlistPage.tsx
│   │       ├── LoginPage.tsx
│   │       ├── RegisterPage.tsx
│   │       └── ProtectedRoute.tsx
│   ├── Dockerfile
│   └── nginx.conf
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://postgres:admin@localhost:5432/equititrack` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `JWT_SECRET_KEY` | built-in dev key | HS256 signing key |
| `VITE_API_BASE` | `http://localhost:8000/api` | Frontend API base (/api in Docker) |

## License

Confidential — Technology Industrial Placement Program 2026 assessment.
