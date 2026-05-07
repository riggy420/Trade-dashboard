# Portfolio Management Dashboard — EquitiTrack

A full-stack portfolio dashboard with ~1,970 Taiwan stocks, real-time yfinance pricing, Market/Limit orders with Redis-backed pending queue, portfolio analytics with pie charts and cumulative returns, **TWSE regulatory supervision engine** with 13-article risk scoring and 30-day backtesting, JWT authentication with inactivity timeout, and full Docker deployment.

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

**First bootstrap** — populate historical data for all 1,970 stocks (takes 10-15 min):
```
POST /api/supervision/full-refresh
```
Subsequent refreshes complete in seconds (cached on disk).

---

## Supervision Engine

The supervision engine implements TWSE (Taiwan Stock Exchange) monitoring rules that detect stocks at risk of being placed on the **Disposition / Attention** list. It scores every listed stock (0-100) across 13 articles and flags stocks that cross regulatory thresholds.

### Decision Tree

```
                         ┌─────────────────────────┐
                         │  Score all 13 articles   │
                         │  for this stock          │
                         └───────────┬─────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │ Any article          │
                          │ triggered = True?    │
                          └──────┬──────────┬────┘
                                 │ NO       │ YES
                                 ▼          ▼
                          ┌──────────┐  ┌─────────────────┐
                          │NO_ACTION │  │ Safe harbor      │
                          │score = 0 │  │ active?          │
                          └──────────┘  └────┬─────────┬───┘
                                        NO   │         │ YES
                                             ▼         ▼
                                     ┌──────────┐  ┌──────────────┐
                                     │ Sector   │  │ SAFE_HARBOR   │
                                     │ < 5?     │  │ score = 0     │
                                     └──┬───┬───┘  │ (exempt)      │
                                   NO   │   │ YES  └──────────────┘
                                        ▼   ▼
                                   ┌──────┐ ┌──────────────┐
                                   │FLAGGED│ │SECTOR_WAIVED │
                                   │       │ │(flag applies)│
                                   └──────┘ └──────────────┘
```

### How Scoring Works — The Two-Phase Architecture

The engine runs in three passes over all stocks with historical data:

**Phase 1 — `_compute_stock_metrics()`**: For each stock, compute all needed values from its 5-year daily OHLCV file: 6d/30d/60d/90d price changes, 60d/6d average volumes, volume ratios, turnover rates (if shares outstanding available), and P/E / P/B (from fundamentals cache). Also loads today's intraday data for real-time turnover.

**Phase 2 — `_compute_aggregates()`**: Compute market-wide and sector-wide averages from ALL stocks' metrics. This is what enables divergence checks — a stock isn't judged in isolation; it's compared against the market and its sector peers.

**Phase 3 — Per-article scoring**: Each of the 13 article functions receives the stock's metrics AND the market/sector aggregates. It returns two independent values:

| Field | Type | Meaning |
|---|---|---|
| `triggered` | `bool` | Did the stock cross ALL regulatory thresholds for this article? |
| `score_contribution` | `0–100` | How close to the thresholds, even if not crossed (continuous proximity) |

### How `triggered` Is Determined — Binary Threshold Gate

Each article defines **hard boolean conditions** that must ALL be met. For example, Art 4 (price + volume spike):

```python
price_ok = (6d_change >= 25%) AND (|stock_change - market_avg| >= 20%)
                                      AND (|stock_change - sector_avg| >= 20%)
vol_ok   = (today_vol >= 5× 60d_avg_vol) AND (stock_ratio - market_avg_ratio >= 4×)
triggered = price_ok AND vol_ok
```

Every article follows this pattern: a chain of AND-ed conditions. If ANY condition fails, `triggered = False`. There is no partial credit for `triggered` — it's all-or-nothing.

### How `score_contribution` Is Computed — Continuous Proximity

Each article also computes a 0–100 score that reflects **how close** the stock is to the threshold, regardless of whether it crossed. Examples:

**Art 12 (NT$ price swing):**
```
threshold = 100 + ⌊(price - 500)/500⌋ × 25     ← sliding scale
score = clamp(price_diff / (2 × threshold) × 100, 0, 100)
```
A NT$600 stock needs NT$125 diff. At NT$110 diff → score = 44 (close). At NT$125 → score = 50 (exactly at threshold). At NT$250 → score = 100.

**Art 3 (long-term price extreme):**
```
best_change = max(|30d_change|, |60d_change|, |90d_change|)
score = clamp(best_change / 200 × 100, 0, 100)
```
A stock up 160% over 90 days → score = 80. Up 200% → score = 100.

**Art 2 (6-day price change):**
```
score = clamp(6d_change_pct / 50 × 100, 0, 100)
```
At 25% change → score = 50. At 50% → score = 100.

### Total Score Aggregation

```python
raw_score = max(all 13 article score_contributions)      # strongest signal wins
if safe_harbor:
    total_score = 0.0                                     # exempt → zero
elif no article triggered AND raw_score >= 70:
    total_score = 69.0                                    # cap: CRITICAL requires a trigger
else:
    total_score = raw_score
```

The key rule: **CRITICAL (70+) requires at least one article to actually fire.** A stock can have Art 3 score = 100 (200% change) but if the market also surged (divergence < threshold), `triggered = False` and the total is capped at 69 (HIGH).

### Risk Levels

| Level | Score | Requirement |
|---|---|---|
| CRITICAL | 70–100 | ≥ 1 article triggered + score ≥ 70 |
| HIGH | 45–69 | Article triggered, or very close to threshold |
| MEDIUM | 20–44 | Elevated metrics, below regulatory line |
| LOW | 0–19 | Normal trading |

### Article Summary

| Article | Description | Key Threshold | Computable |
|---|---|---|---|
| Art 2 | 6-day cumulative price change | ≥ 32% (or ≥ 25% + NT$50), diverge market/sector ≥ 20% | Yes |
| Art 3 | Long-term price extreme (30/60/90d) | 100% / 130% / 160%, diverge ≥ 85% / 110% / 135% | Yes |
| Art 4 | Price + volume spike | 6d price > 25%, vol ≥ 5× 60d avg, diverge market ≥ 4× | Yes |
| Art 5 | Price + intraday turnover | 6d price > 25%, turnover ≥ 10%, diverge market ≥ 5% | Yes* |
| Art 6 | Broker day-trading concentration | Single broker > 25% of volume | No (needs TWSE data) |
| Art 7 | P/E + P/B extremes | PE ≥ 60× or negative, PB ≥ 6.0, turnover ≥ 5% | Partial |
| Art 8 | Margin/short ratios | Long/short ratio ≥ 20%, surge ≥ 4× | No (needs TWSE data) |
| Art 9 | TDR premium/discount | Premium > 80% or Discount > 30% | No (needs TWSE data) |
| Art 10 | Sustained volume surge | 6d + 1d vol ≥ 5× 60d avg, diverge market ≥ 4× | Yes |
| Art 11 | High cumulative turnover | 6d turnover > 50%, 1d ≥ 10%, diverge market ≥ 40% / 5% | Yes* |
| Art 12 | Extreme NT$ price swing | ≥ NT$100 (sliding scale), must be 6d high/low | Yes |
| Art 13 | Borrowed securities sales | 6d borrowed ≥ 12%, 1d ≥ 5× avg | No (needs TWSE data) |
| Art 14 | Day trading volume | 6d + 1d day trading > 60% | No (needs TWSE data) |

\* Requires `sharesOutstanding` from fundamentals cache (populated via `POST /api/refresh/fundamentals`).

### Safe Harbors (Exceptions)

If any of these apply, a triggered article is suppressed (score → 0, decision → SAFE_HARBOR):

| Exception | Condition |
|---|---|
| Low price | Latest close < NT$5 |
| Low volume | Today's volume < 500 units |
| Low turnover | Daily turnover < 0.1% |
| Small sector | Fewer than 5 stocks in the sector |
| Derivative | ETF, warrant, ETN, or non-ordinary share |
| P/E extreme | Negative P/E or P/E ≥ 60× (Art 2, 5 only) |

### Risk Levels

| Level | Score Range | Meaning |
|---|---|---|
| CRITICAL | 70–100 | At least one article triggered with high severity |
| HIGH | 45–69 | Article triggered or very close to threshold |
| MEDIUM | 20–44 | Elevated but below regulatory threshold |
| LOW | 0–19 | Normal trading, no anomalies |

### Decision Rationale

The decision tree answers one question: **should the exchange be notified about this stock?** Each branch has a specific regulatory purpose:

**NO_ACTION** — No article triggered. The stock is trading normally. Even if article scores are high (close to thresholds), without an actual trigger there is nothing to report. *Rationale:* Avoids false positives — regulators don't want noise.

**FLAGGED** — At least one article triggered AND no exemption applies. This is the "action" path. The stock has crossed a defined monitoring threshold and should be reviewed. *Rationale:* Any single article firing is sufficient grounds for attention under TWSE rules. There is no "majority vote" — one clear anomaly is enough.

**SAFE_HARBOR** — At least one article triggered, but a blanket exemption applies (price < NT$5, volume < 500 units, ETF/warrant, etc.). Score is forced to 0. *Rationale:* These are "too small to manipulate" or "not the type of security the rules target." The exchange itself exempts these categories. An ETF surging on high volume is tracking its underlying, not being manipulated.

**SECTOR_WAIVED** — Article triggered but the sector has fewer than 5 stocks. The flag still applies, but sector-comparison thresholds (e.g., "differs from sector average by 20%") are waived since there aren't enough peers for a meaningful average. *Rationale:* You can't compute a reliable sector benchmark from 2-3 stocks. The price and volume checks still apply; only the sector-divergence condition is dropped.

### Why CRITICAL Requires a Trigger

A stock can have `score_contribution = 100` on Art 3 (200% price change) without `triggered = True` if the whole market also surged (divergence < 85%). The stock isn't anomalous — it's just moving with the market. The score reflects magnitude; the trigger reflects anomaly. CRITICAL is reserved for stocks that are both extreme AND anomalous.

### Notable Examples

**TSMC (2330)** — NT$2,265, 6-day diff NT$240:
- Art 12 triggered (NT$240 ≥ threshold NT$200), score = 60 → **HIGH**
- Art 2 at 23.7 (11.8% change, needs 25%), Art 3 at 28.1 (56% change, needs 160%)
- Safe harbors: none active → Decision: **FLAGGED**

**ETF (0050)** — Yuanta Taiwan 50, score = 0:
- Derivative safe harbor active → Decision: **NO_ACTION**
- ETFs are exempt from volume/turnover monitoring rules

**Small-cap (1597)** — score = 100, CRITICAL:
- Multiple articles firing simultaneously (Art 3 at 100, Art 2, Art 4)
- No safe harbors → Decision: **FLAGGED**

**Unscored stock** — No `_historical_5y.txt` file yet:
- Shows "—" in the table, grayed out
- Clicking opens analysis page with "No risk data available" message
- Will be scored after `POST /api/supervision/full-refresh` fetches its data

---

## Dashboard

| Card              | Description                           |
|-------------------|---------------------------------------|
| Portfolio Value   | Total market value of all holdings    |
| Total P&L         | Realized + Unrealized (NT$ + %)      |
| Realized P&L      | Profit from completed SELL trades     |
| Unrealized        | Profit on current holdings            |
| Holdings          | Number of open positions              |

**Charts**: Asset Allocation donut, Industry Breakdown donut, Cumulative Returns line, Return Distribution bar.

**Disposition Risk Monitor**: Full table of all ~1,970 stocks sorted by risk score, with filter, color-coded risk levels, triggered articles, and safe harbor exceptions. "Refresh Now" button triggers the full pipeline (fetch missing data → scan → persist to PostgreSQL).

## Market Pages

| Route              | Content                                      |
|--------------------|----------------------------------------------|
| `/analysis/all`    | All Taiwan stocks with risk scores, 30d flags, exceptions |
| `/analysis/{sym}`  | Candlestick chart + indicators + fundamentals + full risk breakdown |

Each stock's analysis page shows:
- **Disposition Risk card**: total score, risk level, decision, triggered articles, safe harbor reasons, expandable article-by-article breakdown
- **30-Day Backtest card**: sparkline of daily scores, flagged days count, triggered day details

## My Portfolio (`/reports`)

- **Open Positions**: per-stock shares, avg buy, current price, unrealized P&L + total
- **Order History** tab: completed trades with date filter, edit, delete
- **Pending Orders** tab: queued limit orders with inline edit, cancel confirmation

## Architecture

```
Browser → nginx :80 → /api/* → FastAPI :8000 → PostgreSQL (users, trades, watchlist, supervision_history)
                    ← static files             Redis (intraday, pending, fundamentals)
```

## Key API Endpoints (JWT-protected)

### Auth & Data
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login → JWT tokens |
| GET | `/api/data/tickers` | Master list + live prices |
| GET | `/api/data/tickers-supervised` | All tickers with risk scores merged |
| GET | `/api/analysis/{ticker}` | Chart + indicators |
| GET | `/api/fundamentals/{symbol}` | P/E, P/B, shares outstanding |
| POST | `/api/refresh/fundamentals` | Batch fetch fundamentals |
| POST | `/api/refresh/fundamentals/{symbol}` | Single-stock trap door |

### Supervision
| Method | Path | Description |
|---|---|---|
| GET | `/api/supervision/scan` | Full scan (query: `force`, `limit`, `min_score`, `risk_level`) |
| GET | `/api/supervision/{symbol}` | Single-stock detail with all 13 articles |
| POST | `/api/supervision/full-refresh` | Pipeline: fetch missing data → scan → persist to PostgreSQL |
| GET | `/api/supervision/backtest-30d` | 30-day look-back (query: `?symbol=` for detail) |
| GET | `/api/supervision/history` | Query past scan snapshots from PostgreSQL |
| GET | `/api/supervision/latest` | Latest snapshot per ticker |
| GET | `/api/supervision/articles` | Article definitions + thresholds |

### Trading & Watchlist
| Method | Path | Description |
|---|---|---|
| POST | `/api/trades` | Submit buy/sell (market or limit) |
| GET | `/api/trades` | Trade history |
| GET | `/api/trades/holdings` | Open positions + avg buy |
| GET/PUT/DEL | `/api/trades/pending/{id}` | Pending order CRUD |
| PUT/DEL | `/api/trades/{id}` | Edit/delete trade |
| GET/POST/DEL | `/api/watchlist` | Watchlist CRUD |

### Refresh
| Method | Path | Description |
|---|---|---|
| POST | `/api/refresh/tickers` | Regenerate ticker list |
| POST | `/api/refresh/intraday/all` | Mass intraday scrape |
| POST | `/api/refresh/intraday/{ticker}` | Single intraday |
| POST | `/api/refresh/historical/{ticker}` | 5-year historical |
| POST | `/api/refresh/sectors` | Sector/industry data |
| POST | `/api/refresh/indices` | Index data |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:admin@localhost:5432/equititrack` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET_KEY` | built-in dev key | JWT signing key |
| `VITE_API_BASE` | `http://localhost:8000/api` | Frontend API base (set to `/api` in Docker) |
| `TICKER_LIMIT` | `0` | Max tickers to scrape (0 = all ~1,970) |
| `INTRADAY_REFRESH_BATCH_SIZE` | `5` | Stocks per batch during intraday fetch |
| `INTRADAY_REFRESH_PAUSE_SECONDS` | `2.0` | Pause between batches |
| `INTRADAY_REFRESH_INTERVAL_SECONDS` | `10800` | Refresh interval (default 3 hours) |
| `INTRADAY_STALE_THRESHOLD_SECONDS` | `7200` | Consider data stale after 2 hours |

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Account credentials |
| `watchlist` | User watchlists |
| `trades` | Trade history (buy/sell, market/limit) |
| `supervision_history` | Every scan snapshot: `(ticker, time, score, reasons)` |
