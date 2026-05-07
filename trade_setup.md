# Trade Setup — Algorithms & Strategy

## 1. Core Algorithms

### 1.1 Two-Phase Supervision Scan

**File:** `monitoring/supervision/supervision_utils.py`

```
Phase 1: _compute_stock_metrics()
  ┌──────────┐     ┌─────────────────┐     ┌──────────────────┐
  │ OHLCV    │ ──→ │ Compute 30+     │ ──→ │ StockMetrics     │
  │ (5y daily)│     │ derived metrics │     │ per stock        │
  └──────────┘     └─────────────────┘     └──────────────────┘
  
  Metrics: 6d/30d/60d/90d price changes, 60d/20d avg volume,
           volume ratios, turnover (if shares outstanding),
           intraday high/low/open/vol, P/E, P/B

Phase 2: _compute_aggregates()
  ┌──────────────────┐     ┌───────────────────┐
  │ All StockMetrics │ ──→ │ MarketAggregates  │
  │ (1,965 stocks)   │     │ per sector +      │
  └──────────────────┘     │ market-wide       │
                           └───────────────────┘
  
  Aggregates: avg price change per sector, avg volume ratio,
              weighted P/E and P/B, sector sizes

Phase 3: Per-article scoring
  ┌──────────────┬──────────────────┐     ┌──────────────┐
  │ StockMetrics │ MarketAggregates │ ──→ │ ArticleResult│
  │ (this stock) │ (market context) │     │ × 14 articles│
  └──────────────┴──────────────────┘     └──────────────┘
  
  Each article: triggered (bool) + score_contribution (0-100)
```

### 1.2 Decision Tree

```
                     ┌─ Any article triggered? ─┐
                     │                          │
                    YES                         NO
                     │                          │
              ┌─ Safe harbor? ─┐            NO_ACTION
              │                │
             YES               NO
              │                │
         SAFE_HARBOR     ┌─ Sector < 5? ─┐
         (score → 0)     │                │
                        YES               NO
                         │                │
                   SECTOR_WAIVED      FLAGGED
                   (flag applies)
```

**Total score:** `max(all 14 score_contributions)`, capped at 69 if no article triggered.

### 1.3 Per-Article Trigger Logic

Each article is a chain of AND-ed boolean conditions plus a continuous proximity score:

```
Art 2 (6-day price change, 88% of dispositions):
  price_ok = |6d_change| >= 32% OR (|6d_change| >= 25% AND |price_diff| >= NT$50)
  div_market_ok = |stock_change - market_avg| >= 20%
  div_sector_ok = |stock_change - sector_avg| >= 20%
  triggered = price_ok AND div_market_ok AND div_sector_ok
  score = clamp(|6d_change| / 50 * 100, 0, 100)

Art 3 (long-term extreme):
  30d: change > 100% AND |change - market_avg| >= 85%
  60d: change > 130% AND |change - market_avg| >= 110%
  90d: change > 160% AND |change - market_avg| >= 135%
  triggered = ANY window passes
  score = clamp(max_change / 200 * 100, 0, 100)

Art 4 (price + volume):
  price: same as Art 2 6d check
  vol: today_vol >= 5x 60d_avg AND ratio_diverges_market >= 4x
  triggered = price_ok AND vol_ok

Art 12 (NT$ price swing):
  threshold = 100 + floor((price - 500)/500) * 25  (sliding scale)
  triggered = |6d_diff| >= threshold AND is_6d_high_or_low
  score = clamp(price_diff / (2 * threshold) * 100, 0, 100)
```

### 1.4 Backtest Algorithm

```
backtest_stock_30d(symbol):
  Load 5-year OHLCV
  For each of the last 30 trading days (sliding window):
    1. Slice data to end at day T
    2. Compute StockMetrics from window
    3. Score with cached MarketAggregates
    4. Record: date, score, risk_level, triggered_articles
  Return: daily scores array + flagged_30d boolean
```

### 1.5 Cross-Reference Algorithm

```
For each stock on actual TWSE/TPEx disposition list:
  1. Load OHLCV data up to the disposition date
  2. Compute StockMetrics for that date
  3. Score against full MarketAggregates (from current scan)
  4. Check if ANY article triggered on that date
  5. Compare: engine hit (triggered) vs miss (not triggered)

Precision = hits / (hits + false_positives)
Recall    = hits / (hits + misses)
F1        = 2 * P * R / (P + R)
```

---

## 2. Empirical Findings

### 2.1 What Actually Triggers Dispositions

| Finding | Data |
|---|---|
| Art 2 (6d price change) is primary trigger | 87.7% of 481 dispositions |
| 92.4% are price INCREASES | 316/342 Art 2 stocks had positive 6d change |
| Mean 6d change at disposition | +39.4% (min -46%, max +77%) |
| 0% had <20% change | The exchange acts at extremes, not at the regulatory minimum |
| Consecutive-day patterns dominate | "3 consecutive days" = 79%, "5 consecutive" = 9%, "6 of 10" = 12% |

### 2.2 Engine Performance

| Metric | Value |
|---|---|
| Per-date hit rate | 81.5% (194/238) |
| Precision | 68.0% (83/122) |
| Recall (single point) | 33.1% (83/251) |
| F1 Score | 44.5% |
| False positive direction | 97.4% increases (same bias as actual) |
| Early warning rate | 29.6% flagged BEFORE disposition |
| Mean lead time | 2.3 trading days |

### 2.3 Disposition Impact on Trading

When a stock enters disposition (from `trade_regulation.md`):
- Matching: continuous → call auction every 5-30 minutes (54→9 matches/day)
- Market orders: banned
- Pre-collection: 100% funds/securities required for large/all orders
- Day trading: banned
- Margin: full deposit on order (not T+2)

This creates severe liquidity constraints, making position adjustment difficult.

---

## 3. Trade Setup: Pre-Disposition Momentum Fade

Based on the empirical finding that Art 2 dispositions overwhelmingly involve price INCREASES (+92.4%) with a mean 6-day gain of +39.4%, and that engine flags precede actual dispositions by a mean of 2.3 trading days.

### 3.1 Observation

Stocks entering the disposition list are almost exclusively extreme upward movers (+39% mean 6-day gain). Post-designation, they face severe trading restrictions (call auction only, no day trading, pre-collection). This combination of extreme prior gains + imminent liquidity collapse creates a **mean-reversion opportunity**.

### 3.2 Entry Logic

```
Entry signal (OR logic):
  A. Engine flags ANY article AND score >= 70 (CRITICAL)
  B. Stock appears on TWSE/TPEx disposition announcement (same-day)

Entry timing:
  A. Engine signal: enter at next market open after flag
  B. Disposition announcement: enter immediately if still possible, else at next auction match

Direction: SHORT (bet on mean-reversion from extreme upward move)
```

### 3.3 Exit Logic

```
Exit conditions (whichever comes first):
  1. Profit target: price reverts to 10-day SMA → cover
  2. Time stop: exit after 5 trading days regardless
  3. Hard stop: price moves +5% above entry → cover (2× ATR risk)
  4. Disposition ends: if stock exits disposition, re-evaluate
  
Exit timing:
  - During disposition: exit at the next call auction match (every 5-30 min)
  - After disposition: normal continuous exit
```

### 3.4 Position Sizing

```
Risk per trade: 1% of portfolio
Stop loss: 5% above entry (2× ATR for typical Taiwan small-cap vol of ~2.5%/day)
Position size = (portfolio * 0.01) / (entry_price * 0.05)

Example: NT$1M portfolio, NT$100 stock
  Max loss = NT$10,000
  Position size = 10,000 / (100 * 0.05) = 2,000 shares
  Notional exposure = NT$200,000
```

### 3.5 Risk Considerations

| Risk | Mitigation |
|---|---|
| Disposition prevents shorting | Check if short sales are still allowed (some dispositions restrict margin) |
| Liquidity drought | Small position sizes; exit at auction matches only |
| Continued momentum (short squeeze) | Hard stop at +5%; these stocks can keep running |
| Pre-collection requirement | Ensure sufficient capital before entering |
| Day trading ban | Cannot close same-day; must hold overnight minimum |
| Engine false positive | Only trade CRITICAL signals (score ≥ 70); 68% precision |

### 3.6 Expected Performance

Based on the empirical data:
- Mean 6-day gain before disposition: +39.4%
- Post-designation pattern: stocks retain ~2/3 of gains, give back ~1/3 (from roadmap §2.2 analysis plan)
- Expected return per trade: ~3-5% mean-reversion over 5 days
- Win rate: engine precision of 68% provides a floor; combining with disposition announcement confirmation raises this

### 3.7 Alternative Setup: Consecutive-Day Momentum (Long)

For traders who prefer long-side strategies:

```
Entry: Engine flags Art 2 on Day 1 of a consecutive run
       (the stock just started triggering; 3+ days needed for disposition)
Hold: Through Day 2 and Day 3 (the remaining consecutive days)
Exit: When disposition is announced (Day 3+1) OR if engine score drops below 70

Rationale: The stock is surging and WILL keep surging until the exchange steps in.
           Ride the momentum until the regulatory hammer drops.
Risk: Disposition can be announced intraday with immediate matching restrictions.
```

---

## 4. Implementation Notes

### 4.1 Data Dependencies

| Component | Data Source | Refresh |
|---|---|---|
| OHLCV (5y daily) | yfinance, cached in `_historical_5y.txt` | On-demand via `fetch_missing_historical` |
| Intraday OHLCV | yfinance, cached in `_intraday.txt` | Every 3h during TWSE hours |
| Fundamentals (PE, PB, shares) | yfinance `.info`, cached in `twse_fundamentals.json` | Every 6h |
| Disposition lists | TWSE/TPEx APIs | Manual scrape in `website-supervision/` |

### 4.2 Key Files

| File | Purpose |
|---|---|
| `monitoring/supervision/supervision_utils.py` | Core engine: metrics, aggregates, 14 articles, decision tree, backtest |
| `monitoring/main.py` | API endpoints: scan, detail, full-refresh, backtest, history |
| `monitoring/scrape/fundamentals.py` | yfinance batch fundamentals fetcher |
| `monitoring/scrape/scrape.py` | OHLCV fetcher, ticker list, ISIN industry, missing data pipeline |
| `website-supervision/scrape_twse.py` | TWSE disposition list scraper + classifier |
| `website-supervision/scrape_tpex.py` | TPEx disposition list scraper + classifier |
| `website-supervision/analyze.py` | Combined frequency + cross-reference analysis |
| `trade_regulation.md` | TWSE trading rules summary (disposition impact) |
