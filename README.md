# Portfolio Management Dashboard — EquitiTrack

A full-stack portfolio management dashboard built for the **Technology Industrial Placement Program 2026** assessment. Supports 1,970 Taiwan stocks, 78 bond ETFs, 12 mutual funds, and 86 US equities — all with real-time yfinance pricing, Market/Limit order execution, pending limit order queue with Redis, regulatory supervision alerts, notification system, and watchlist persistence. Fully Dockerized with PostgreSQL, Redis, FastAPI, and nginx.

## Assessment Requirements Mapping

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | **JWT Authentication** | Register/Login/Logout, access+refresh tokens (HS256), silent refresh via axios interceptor, inactivity auto-logout (30 min), route guards |
| 2 | **Portfolio Overview** | Dashboard with total value, P&L, holdings strip; separate boards for Stocks, Bonds, Mutual Funds; asset allocation pie chart; live pricing from Redis/yfinance; performance metrics per holding; open positions table |
| 3 | **Transaction History** | My Portfolio page with Order History tab (date range filter, edit/delete), Pending Orders tab (inline edit, cancel confirmation), summary stats, unrealized P&L card |
| 4 | **Add/Edit Investments** | Market/Limit order modal (two-step confirmation), pending limit queue with auto-execution, edit existing trades (EditTradeModal), sell position validation |
| 5 | **Technology Stack** | React 19 + TypeScript + Tailwind, FastAPI + asyncpg, PostgreSQL 16 + Redis 7, 25+ meaningful Git commits |
| 6 | **Docker Deliverable** | `docker compose up --build` — 4 services (postgres, redis, backend, frontend), nginx reverse proxy, health checks, data persistence |

## Quick Start

### Docker (one command)
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

### Authentication
- JWT with 15-min access tokens + 7-day refresh tokens
- Silent refresh via axios interceptor (queues concurrent 401s)
- Auto-logout after 30 minutes of inactivity
- nginx passes `Authorization` header to backend

### Portfolio Dashboard
- **Summary cards**: Total Portfolio Value, Total P&L (green/red with %), Holdings count
- **Holdings strip**: Horizontal scrollable cards with symbol, shares, avg buy price, current price, unrealized P&L %
- **Click** any holding → full buy/sell history modal for that symbol
- **Watchlist Movers**: Most volatile watchlisted stocks by absolute change
- **Regulatory Alerts**: TWSE Article 2–12 risk scores with CRITICAL/HIGH/MEDIUM/LOW badges
- **Taiwan Indices**: Industry + concept indices with 60-day sparklines + constituent drill-down
- **Sector Performance**: Per-sector average change, top + worst performers
- Data refreshes every 60 seconds; login triggers background pre-caching

### My Portfolio
- **Open Positions** table: symbol, shares held, cost basis, avg price — clickable to analysis
- **Asset Allocation Pie Chart**: donut chart showing Stocks/Bonds/Mutual Funds breakdown
- **Order History** tab: all completed trades with date range filter, edit, delete
- **Pending Orders** tab: queued limit orders with inline edit (price/volume), cancel confirmation popup
- **Summary stats**: total trades, total bought, total sold, net invested, unrealized P&L

### Trading
- **Market orders**: Two-step confirmation, executes at current price — volume-only input
- **Limit orders**: Set limit price with live met/not-met indicator; unmet orders queue in Redis
- **Pending queue**: Background checker executes limit orders every 30s when price condition met
- **Trade notifications**: Push notification on every execution and pending placement
- **Sell validation**: Net position check with oversell prevention

### Market Data
- **All Stocks** (`/analysis/all`): 1,970 Taiwan stocks — searchable, sortable, star-to-watchlist
- **Bonds** (`/analysis/bonds`): 78 Taiwan bond ETFs (US Treasury, Corporate IG, Sector, EM, High Yield)
- **Mutual Funds** (`/analysis/funds`): 12 verified Taiwan mutual funds (Allianz, Yuanta, Fubon, Nomura, KGI)
- **US Stocks/Bonds/Funds**: 86 US market tickers available via market toggle
- **Individual Analysis** (`/analysis/{symbol}`): Candlestick chart with SMA/EMA/RSI/MFI, pen drawing tool, same-industry peers, "You hold X shares" indicator
- **Search bar**: Type any symbol or company name — top 5 matches appear in dropdown
- **Auto-refresh**: Dashboard 60s, overview pages on-entry, market toggle for hourly full scrape

### Notifications
- **Bell icon** in header with unread count badge
- **Price swing alerts**: 3%+ moves on watchlisted or held stocks
- **Trade notifications**: Executed and pending orders
- **Dropdown**: Mark all read, clear all, click to navigate to symbol

### Watchlist
- Star any stock/bond/fund from any table
- Watchlist page with live prices and percent changes
- Optimistic UI (instant feedback, rollback on failure)
- PostgreSQL persistence per user

## Architecture

```
Browser → nginx :80 → /api/* proxy → FastAPI :8000 → PostgreSQL (users, trades, watchlist)
                         ↓                            Redis (intraday OHLCV, pending orders)
                    ← static files (React SPA)
```

## Key API Endpoints (JWT-protected)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register (public) |
| POST | `/api/auth/login` | Login → JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/data/tickers` | Master list with live prices |
| GET | `/api/analysis/{ticker}` | Technical analysis + chart |
| POST | `/api/trades` | Submit buy/sell (market/limit) |
| GET | `/api/trades` | Completed trade history |
| GET | `/api/trades/holdings` | Open positions with avg buy |
| GET | `/api/trades/pending` | Queued limit orders |
| PUT | `/api/trades/pending/{id}` | Edit pending order |
| DELETE | `/api/trades/pending/{id}` | Cancel pending order |
| PUT | `/api/trades/{id}` | Edit completed trade |
| DELETE | `/api/trades/{id}` | Delete trade |
| GET/POST/DELETE | `/api/watchlist` | Watchlist CRUD |
| GET | `/api/supervision/scan` | Regulatory risk scan |
| POST | `/api/refresh/tickers` | Scrape master list |
| POST | `/api/refresh/intraday/all` | Mass intraday scrape |

## Project Structure

```
Trade/
├── docker-compose.yml
├── monitoring/                 # FastAPI backend
│   ├── main.py                 # All endpoints + background tasks
│   ├── auth.py                 # JWT + Pydantic models
│   ├── db/
│   │   ├── database.py         # PostgreSQL pool, schema, queries
│   │   └── redis_client.py     # Redis intraday cache + pending orders
│   ├── scrape/
│   │   └── scrape.py           # yfinance/TWSE scraping
│   ├── supervision/
│   │   └── supervision_utils.py # TWSE regulatory scoring
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── App.tsx             # Router, sidebar, search, notifications
│   │   ├── api/                # API client + config + JWT interceptor
│   │   ├── context/            # Auth, Watchlist, Notification providers
│   │   └── components/         # Dashboard, MarketAnalysis, TradeModal,
│   │                             ReportsPage, EditTradeModal, etc.
│   ├── Dockerfile + nginx.conf
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://postgres:admin@localhost:5432/equititrack` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `JWT_SECRET_KEY` | built-in dev key | HS256 signing key |
| `VITE_API_BASE` | `http://localhost:8000/api` | Frontend API base (set to `/api` in Docker) |
| `INTRADAY_REFRESH_BATCH_SIZE` | `20` | Stocks per parallel scrape batch |
| `INTRADAY_REFRESH_PAUSE_SECONDS` | `0.5` | Pause between scrape batches |

## Git Branches

| Branch | Purpose |
|--------|---------|
| `manulife` | Core features (JWT, trading, watchlist, Docker) |
| `manulife-v2` | Notifications, JWT inactivity, portfolio enhancements |
| `portfolio-enhancements` | Pie chart, date filter, edit trades, bond/fund pricing |
| `search-enhancements` | Search bar with name+ticker matching + top-5 dropdown |
| `us-markets` | US stocks, bonds, mutual funds + market toggle |

## License

Confidential — Technology Industrial Placement Program 2026 assessment.
