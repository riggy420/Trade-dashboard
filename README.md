# Portfolio Management Dashboard — EquitiTrack

A full-stack portfolio management dashboard for Taiwanese equities built for the Technology Industrial Placement Program 2026 assessment. Features real-time stock data, portfolio tracking with multi-asset support, trade execution (Market/Limit orders), transaction history with edit/delete, regulatory supervision alerts, and watchlist persistence.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Python 3.11+, FastAPI, asyncpg |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh tokens, HS256) |
| Data Sources | yfinance, TWSE ISIN scraper, TWSE MI_INDEX API |
| Container | Docker + Docker Compose (nginx reverse proxy) |

## Project Structure

```
Trade/
├── docker-compose.yml
├── monitoring/                    # Backend (FastAPI)
│   ├── main.py                    # App entrypoint, all API endpoints
│   ├── auth.py                    # JWT auth, Pydantic models
│   ├── analysis_utils.py          # Technical indicator computation
│   ├── db/
│   │   └── database.py            # Pool bootstrap, schema migrations, all DB helpers
│   ├── scrape/
│   │   └── scrape.py              # yfinance / TWSE scraping (intraday, historical, indices, sectors)
│   ├── supervision/
│   │   ├── supervision_utils.py   # TWSE regulatory article scoring engine
│   │   └── article.md             # Monitoring criteria documentation
│   └── data/                      # Cached scraped data files
├── frontend/                      # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── App.tsx                # Router, sidebar, search bar, auth wrapper
│   │   ├── api/
│   │   │   ├── endpoints.ts       # All API client functions
│   │   │   ├── axiosInstance.ts   # Axios with JWT interceptor + silent token refresh
│   │   │   └── config.ts          # API base URL (env-configurable)
│   │   ├── context/
│   │   │   ├── AuthContext.tsx     # Auth state, login/logout/register, token management
│   │   │   └── WatchlistContext.tsx # Optimistic watchlist with DB persistence
│   │   └── components/
│   │       ├── Dashboard.tsx       # Portfolio summary, holdings, indices, supervision alerts
│   │       ├── MarketAnalysis.tsx  # Candlestick chart, indicators, Taiwan Board, trade buttons
│   │       ├── TradeModal.tsx      # Market/Limit order modal (two-step confirmation)
│   │       ├── ReportsPage.tsx     # Full transaction history with edit/delete
│   │       ├── WatchlistPage.tsx   # Saved watchlist with live prices
│   │       ├── LoginPage.tsx       # Login form
│   │       ├── RegisterPage.tsx    # Registration form
│   │       └── ProtectedRoute.tsx  # Auth guard for protected routes
│   ├── Dockerfile
│   └── nginx.conf
└── README.md
```

## Features

### 1. JWT Authentication
- Register with username, email, and password
- Login returns access token (15 min) + refresh token (7 days)
- Silent token refresh via axios interceptor (queues failed requests during refresh)
- All protected routes redirect unauthenticated users to `/login`

### 2. Portfolio Overview Dashboard
- **Portfolio Summary**: total portfolio value, total P&L with percentage, breakdown by asset type (Stocks, Bonds, Mutual Funds)
- **Open Positions Strip**: per-symbol cards showing shares held, average buy price, current market price, and real-time unrealized P&L % (green/red)
- **Watchlist Movers**: most volatile watchlisted stocks sorted by absolute change
- **Regulatory Alert Panel**: stocks flagged by TWSE monitoring criteria (Articles 2–12), color-coded risk levels (CRITICAL/HIGH/MEDIUM/LOW), score progress bars, and triggered article tags
- **Taiwan Market Indices**: industry and concept index cards with live prices, 60-day closing-price sparklines, and constituent drill-down tables
- **Sector Performance Grid**: per-sector average change, top performer, and worst performer
- All live data auto-refreshes every 60 seconds

### 3. Transaction History
- Full table of all buy/sell orders: date, symbol, name, side (green BUY / red SELL badge), type (Market / Limit badge), price, limit price, volume, total value
- Summary stats cards: total trades, total bought value, total sold value
- Edit button opens a pre-filled modal to modify any trade field
- Delete button with confirmation prompt removes the trade

### 4. Add / Edit Investments
- **Buy/Sell modal** on every analysis page with two-step confirmation
- **Market orders**: execute immediately at current price — enter volume only
- **Limit orders**: set a limit price — executes only when market reaches it (validated both client-side and server-side with a live status indicator)
- **Asset type selector**: Stock, Bond, or Mutual Fund
- **Sell validation**: fetches net position, displays current holdings, prevents overselling
- **Edit modal**: modify any existing trade (symbol, price, volume, side, asset type)
- **Delete**: removes trade with confirmation dialog

### 5. Market Analysis Page
- Interactive candlestick chart with toggleable indicators: SMA 5D, EMA 5D, RSI 14D, MFI 14D
- Time range selector: 5D, 30D, 60D, 180D, 1Y, 5Y
- Drawing mode (pen tool) directly on the chart canvas
- Current price display with open price and percent change badge
- Taiwan Board: full searchable/sortable stock table with star-to-watchlist
- Hourly auto-refresh toggle with countdown timer

### 6. Regulatory Supervision Engine
Scores every stock against TWSE monitoring criteria from OHLCV data:
- **Article 2**: 6-day price surge ≥ 25%
- **Article 3**: 30/60/90-day price extremes ≥ 100%/130%/160%
- **Article 4**: Price surge + volume spike (≥ 5× 60-day average)
- **Article 10**: Sustained volume surge (6-day vs 60-day average)
- **Article 12**: Extreme NT$ price swing (sliding scale for high-priced stocks)
- **Article 5**: Partial — price surge flag (turnover requires shares outstanding data)
- Weighted aggregate score (0–100) with risk classification: CRITICAL (≥70), HIGH (≥45), MEDIUM (≥20), LOW (<20)
- Safe harbor detection: price < NT$5 or volume < 500 units

### 7. Watchlist
- Star any stock from the Taiwan Board or any index from the Dashboard
- Optimistic UI: instant visual feedback, automatic rollback on API failure
- Watchlist page displays all saved items with live current prices and percent changes
- Persists across sessions per-user in PostgreSQL

---

## API Endpoints

All endpoints under `/api/` require JWT authentication unless marked **(public)**.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user **(public)** |
| POST | `/api/auth/login` | Login, returns token pair **(public)** |
| POST | `/api/auth/refresh` | Refresh access token **(public)** |
| GET | `/api/auth/me` | Get current user profile |

### Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/data/tickers` | Master stock list with prices, changes, industries |
| GET | `/api/analysis/{ticker}` | Technical analysis with chart data and indicators |
| GET | `/api/data/intraday/{ticker}` | Cached hourly intraday data |
| GET | `/api/data/historical/{ticker}` | Cached 5-year daily history |
| GET | `/api/data/indices` | Taiwan index list with prices and changes |
| GET | `/api/data/indices/{name}` | Index constituent stocks with 60-day minigraphs |
| GET | `/api/data/index-history/{name}` | 60-day closing prices for an index |
| GET | `/api/data/sectors` | Sector performance overview |
| GET | `/api/data/sectors/{name}` | Detailed sector breakdown |

### Portfolio & Trades
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolio` | Portfolio summary by asset type with P&L |
| POST | `/api/trades` | Submit a buy/sell order |
| GET | `/api/trades` | Full transaction history |
| GET | `/api/trades/position/{symbol}` | Net position for a symbol |
| GET | `/api/trades/holdings` | Current open positions with avg buy price |
| PUT | `/api/trades/{id}` | Edit an existing trade |
| DELETE | `/api/trades/{id}` | Delete a trade |

### Watchlist
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/watchlist` | Get user's watchlist items |
| POST | `/api/watchlist` | Add item to watchlist |
| DELETE | `/api/watchlist/{symbol}` | Remove item from watchlist |

### Supervision
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/supervision/scan` | Scan all stocks for regulatory risks |
| GET | `/api/supervision/{ticker}` | Single-stock supervision detail |

### Refresh / Scrape
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/refresh/tickers` | Scrape master ticker list from TWSE+TPEx |
| POST | `/api/refresh/intraday/all` | Mass intraday scrape (batched, 10 parallel) |
| POST | `/api/refresh/intraday/{ticker}` | Single-stock intraday scrape |
| POST | `/api/refresh/historical/{ticker}` | Single-stock 5-year history scrape |
| POST | `/api/refresh/sectors` | Scrape sector/industry classifications |
| POST | `/api/refresh/indices` | Scrape index data from TWSE API |

---

## Quick Start

### Prerequisites
- Python 3.11+, Node.js 20+, PostgreSQL 16+

### Development

**Backend:**
```bash
cd monitoring
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
The database `equititrack` is auto-created on first run. All tables are migrated automatically.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 — API requests proxy to the backend automatically.

### Docker

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

Data persists in a Docker volume (`pgdata`). Scraped data files are mounted from `./monitoring/data`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://postgres:admin@localhost:5432/equititrack` | PostgreSQL connection |
| `JWT_SECRET_KEY` | (built-in dev key) | HS256 signing key |
| `INTRADAY_REFRESH_BATCH_SIZE` | `10` | Stocks per parallel scrape batch |
| `INTRADAY_REFRESH_PAUSE_SECONDS` | `2` | Pause between scrape batches |
| `VITE_API_BASE` | `http://localhost:8000/api` | Frontend API base URL (set to `/api` in Docker) |

---

## Database Schema

Three tables auto-created on first backend start:

**users** — `id SERIAL PK`, `username VARCHAR(50) UNIQUE`, `email VARCHAR(255) UNIQUE`, `hashed_password TEXT`, `created_at TIMESTAMPTZ`

**watchlist** — `id SERIAL PK`, `user_id INTEGER FK → users`, `symbol VARCHAR(20)`, `name TEXT`, `item_type VARCHAR(10)`, `added_at TIMESTAMPTZ`, `UNIQUE(user_id, symbol)`

**trades** — `id SERIAL PK`, `user_id INTEGER FK → users`, `symbol VARCHAR(20)`, `name TEXT`, `side VARCHAR(4)` (BUY/SELL), `type VARCHAR(10)` (MARKET/LIMIT), `price NUMERIC(12,2)`, `volume INTEGER`, `total_value NUMERIC(14,2)`, `limit_price NUMERIC(12,2)`, `asset_type VARCHAR(20) DEFAULT 'stock'`, `traded_at TIMESTAMPTZ`

---

## Git History

```
806e86f feat: add reports and trading functionality
9fe4d39 Add watchlist movers feature onto the main dashboard and display price changes in WatchlistPage
339fa45 Add Watchlist context and authentication module
d7c8096 Add monitoring criteria documentation and implement supervision scoring system
```

## License

Confidential — for Technology Industrial Placement Program 2026 assessment purposes only.
