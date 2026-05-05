# Supervision Engine — Assessment & Improvement Roadmap

## 1. Executive Summary

**Overall Rating: 62/100 — Functional Foundation, Gaps in Completeness & Production Readiness**

The current implementation successfully translates TWSE monitoring rules (Articles 2-14) into a two-phase supervision engine with market/sector-aware scoring. It correctly identifies the core anomaly patterns and produces a working decision tree. However, it falls short of the exercise brief in three critical areas: (1) **missing the official Art. 4-1 trigger mapping** used by TWSE/TPEx for actual disposition/attention designation, (2) **no intraday monitor** for real-time alerts during trading hours, and (3) **no historical designation data** for statistical analysis of trigger frequency or pre/post-designation behavior.

---

## 2. Current Implementation Scorecard

| Category | Score | Max | Notes |
|---|---|---|---|
| **Rule accuracy & completeness** | 22 | 30 | 6/14 articles fully computable; market/sector divergence correct; missing Art. 4-1 cross-reference |
| **Decision tree** | 8 | 10 | Implements the article.md mermaid flowchart; safe harbors work; ETF/warrant detection added |
| **Data pipeline** | 6 | 10 | yfinance only; fundamentals never populated in practice; no intraday OHLCV used for real-time triggers |
| **Intraday monitor** | 0 | 15 | Not implemented — no real-time scanning, no price-swing alerts, no trading-hours refresh |
| **Historical analysis** | 0 | 15 | No scraping of disposition lists; no trigger-frequency stats; no pre/post designation study |
| **API & frontend integration** | 10 | 10 | Clean REST endpoints; React Query hooks; frontend functions defined (UI integration pending) |
| **Code quality** | 8 | 5 | Dataclass-driven; two-phase aggregation correct; stubs documented; bonus: backward-compatible API |
| **Trade insights** | 0 | 5 | No analysis of liquidity, volatility fade, or mean-reversion around designation events |
| **Documentation** | 4 | 5 | Article definitions endpoint works; missing: rule-to-code traceability matrix |
| **Production readiness** | 4 | 5 | In-memory cache; stale after 5 min; no alert notifications; no persistent flag history |
| **TOTAL** | **62** | **100** | |

---

## 3. Gap Analysis: Exercise Requirements vs Current State

### 3.1 Rule Mapping — Art. 4-1 Cross-Reference

The exercise references **Art. 4-1 of the official TWSE regulation** as the governing rule for disposition/attention triggers. The current `article.md` documents Articles 2-14 of a TWSE monitoring publication, which overlaps with but is not identical to Art. 4-1. Key triggers from Art. 4-1 that are **missing** from the current implementation:

| Official Trigger (Art. 4-1) | Current Status | Priority |
|---|---|---|
| Intraday swing ≥ 15% + volume spike | Not in article.md or code | **HIGH** |
| Consecutive limit-up/limit-down (match-price days) | Partially covered by Art 2/3 cumulative % change | MEDIUM |
| Turnover rate vs paid-in capital | Art 5/11 partial (shares outstanding ≈ paid-in capital) | MEDIUM |
| Abnormal P/E or P/B divergence | Art 7 partial (no broker/investor concentration) | LOW |
| Trade concentration at single broker | Art 6 stub | LOW |

### 3.2 Intraday Monitor — Not Implemented

The exercise explicitly asks for an **Intraday Monitor** that:
- Refreshes during TWSE trading hours (09:00-13:30 Taipei time)
- Produces alert/probability scores based on official triggers
- Surfaces stocks approaching thresholds in real time

Current state: The supervision engine only operates on **daily OHLCV** from 5-year historical files. It does not:
- Consume intraday data from the 1-hour yfinance feed or `.TW_intraday.txt` files
- Run on a sub-minute cadence during trading hours
- Compute intraday-specific triggers (swing ≥ 15%, real-time turnover)
- Push alerts to any notification channel

### 3.3 Historical Disposition Lists — Not Scraped

The exercise asks to scrape historical daily disposition/attention lists from:
- `https://www.twse.com.tw/en/announcement/punish.html` (TWSE)
- `https://www.tpex.org.tw/en-us/announce/market/disposal.html` (TPEx)

Current state: No scraping of these pages exists anywhere in the codebase. Without historical designation data, these analyses are impossible:
- **Trigger frequency**: Which criterion triggers most designations?
- **Pre/post behavior**: How do price, volume, and volatility change around designation?
- **Backtesting**: How well does our scoring engine predict actual designations?

### 3.4 Trade Insights — Not Addressed

The exercise asks for ≥ 3 actionable observations and one fully outlined trade setup. This requires historical designation data (#3.3) plus statistical analysis.

---

## 4. Prioritized Recommendations

### Level 1 — Critical (Week 1)

These directly impact whether the implementation meets the exercise brief.

#### 1.1 Add Intraday Price-Swing Trigger

**File**: `monitoring/supervision/supervision_utils.py`

The official Art. 4-1 includes an intraday swing trigger: ≥ 15% price swing from open with elevated volume. This is **not** in article.md but is explicitly listed in the exercise.

Add to the supervision engine:
```
Art 4-1 Swing: intraday (high - low) / open ≥ 15% AND today_vol ≥ 2x 20d avg vol
```

This requires reading intraday OHLCV data (high/low from intraday files or Redis).

**Effort**: 3-4 hours. **Impact**: High — unlocks the most commonly cited trigger.

#### 1.2 Implement Trading-Hours Refresh Loop

**File**: `monitoring/main.py` (new background task)

Add a background coroutine that:
1. Checks if TWSE is open (Mon-Fri, 09:00-13:30 Taipei time, excluding holidays)
2. Every 60 seconds during market hours, runs a lightweight intraday scan
3. Computes intraday-specific triggers (swing ≥ 15%, real-time turnover ≥ 10%, volume surge vs running 5d average)
4. Emits alerts via a new notification mechanism when thresholds are approached (e.g., ≥ 80% of threshold)

**Effort**: 5-6 hours. **Impact**: High — this is the "Intraday Monitor" the exercise requires.

#### 1.3 Scrape Historical Disposition Lists

**New file**: `monitoring/scrape/disposition.py`

Scrape the TWSE and TPEx disposition announcement pages:
- Parse HTML tables for date, stock code, stock name, disposition reason, disposition period
- Store in a structured format (CSV or SQLite)
- Handle pagination (historical pages go back months/years)

The TWSE page at `https://www.twse.com.tw/en/announcement/punish.html` and TPEx at `https://www.tpex.org.tw/en-us/announce/market/disposal.html` both have query parameters for date range.

**Effort**: 8-10 hours. **Impact**: Critical — unlocks all historical analysis tasks.

### Level 2 — High Impact (Week 1-2)

#### 2.1 Trigger Frequency Analysis

**New file**: `monitoring/analysis/disposition_analysis.py`

Once historical disposition data is scraped:
1. Parse the "reason" field of each disposition to classify which trigger criterion caused it
2. Map each to our engine's articles: "turnover spike" → Art 5/11, "price change" → Art 2/3, "intraday swing" → new Art 4-1 trigger
3. Compute a frequency table: "Turnover spike explains X% of past designations"
4. Cross-reference: for stocks that WERE designated, what score did our engine assign on the day before designation? (i.e., does our engine predict designations?)

**Effort**: 4-5 hours. **Impact**: High — directly answers "quantify how often each trigger was the deciding factor."

#### 2.2 Pre/Post Designation Behavior Analysis

**Extension to**: `monitoring/analysis/disposition_analysis.py`

For each designated stock:
1. Load OHLCV from T-20 to T+20 trading days around designation date
2. Compute: average return, volume change, volatility (20d annualized), bid-ask spread proxy
3. Plot aggregate curves with confidence bands
4. Identify patterns: liquidity drought before? volatility fade after? mean-reversion post-designation?

**Effort**: 6-8 hours. **Impact**: High — answers "analyse price, volume, and volatility behaviour around designation."

#### 2.3 Tighten Rule-to-Code Traceability

**File**: `monitoring/supervision/supervision_utils.py` (add docstring), or new `RULE_MAPPING.md`

Create a table mapping each official trigger (from Art. 4-1 and the TWSE monitoring rules) to the exact Python function and threshold constants that implement it. This addresses the exercise's "clear mapping of rules from the official regulation into code."

Example:

| Official Rule | Trigger Description | Function | Threshold Location |
|---|---|---|---|
| Art. 4-1 ¶2(1) | 6d cumulative price change ≥ 32% | `_score_article_2()` | `change_6d_pct >= 32.0` |
| Art. 4-1 ¶2(3) | Intraday swing ≥ 15% + volume | `_score_intraday_swing()` | `(high-low)/open >= 0.15` |
| ... | ... | ... | ... |

**Effort**: 2 hours. **Impact**: Medium — demonstrates rigor to reviewers.

### Level 3 — Nice to Have (Week 2+)

#### 3.1 Fundamentals Auto-Population Fix

**Files**: `monitoring/scrape/fundamentals.py`, `monitoring/main.py`

Currently the `fundamentals:{symbol}` Redis keys are never populated because the background task runs `fetch_fundamentals_batch()` but that function depends on all tickers having yfinance data and may fail silently. Fix:
1. Add retry logic with exponential backoff
2. Add a startup fundamentals bootstrap (first 50 stocks)
3. Log success/failure counts to the API

**Effort**: 2 hours. **Impact**: Medium — enables Art 5, 7, 11 fully.

#### 3.2 Persistent Alert/Fflag History

**New table**: PostgreSQL `supervision_flags` table

Track when stocks were flagged, by which articles, and what decision was reached. Enables:
- "Already flagged recently" safe harbor (currently unimplementable)
- Historical flag frequency analysis
- Flag-to-designation comparison (does TWSE act on our flags?)

**Effort**: 4 hours. **Impact**: Medium.

#### 3.3 Frontend Supervision Dashboard

**Files**: `frontend/src/components/Dashboard.tsx`, new `SupervisionAlerts.tsx`

Uncomment and complete the existing commented-out supervision code in Dashboard.tsx:
- Alert summary bar (CRITICAL/HIGH/MEDIUM counts)
- Flagged stocks table with sortable columns
- Detail modal showing per-article breakdown
- Color-coded risk badges

**Effort**: 6-8 hours. **Impact**: Medium — visual polish for the exercise.

#### 3.4 Trade Insight: Post-Designation Mean-Reversion Strategy

**New file**: `monitoring/analysis/trade_ideas.py` or notebook

Based on the pre/post analysis (#2.2), outline one concrete trade:
1. **Observation**: e.g., "Stocks designated for turnover spikes show mean-reversion in the 5 days post-designation, with average drawdown of 3.2%"
2. **Entry**: Short at designation announcement close; or wait for first down day
3. **Exit**: Cover when price reverts to 10d SMA; or time-stop at T+5
4. **Sizing**: 1% risk per trade, adjusted for elevated vol post-designation
5. **Risk management**: Hard stop at 2x ATR(14) above entry

**Effort**: 3-4 hours. **Impact**: Medium — directly answers "pick one observation and outline a trade setup."

---

## 5. Implementation Roadmap (Phased)

```
Week 1 ─────────────────────────────────────────────────────
│
├─ Day 1-2: [CRITICAL] Intraday monitor foundations
│   ├── 1.1 Add Art. 4-1 intraday swing trigger
│   ├── 1.2 Trading-hours refresh loop
│   └── Wire intraday data (Redis intrada:{symbol}) into scoring
│
├─ Day 2-4: [CRITICAL] Historical data pipeline
│   ├── 1.3 Scrape TWSE/TPEx disposition lists
│   ├── Store in structured format (JSON or SQLite)
│   └── Add API endpoint: GET /api/supervision/disposition-history
│
├─ Day 4-5: [HIGH] Trigger analysis
│   ├── 2.1 Parse disposition reasons, classify triggers
│   ├── 2.1 Cross-reference with engine predictions
│   └── Add API endpoint: GET /api/supervision/trigger-stats
│
Week 2 ─────────────────────────────────────────────────────
│
├─ Day 6-8: [HIGH] Pre/post designation analysis
│   ├── 2.2 Load OHLCV around designation dates
│   ├── 2.2 Compute aggregate price/vol/vol curves
│   ├── 2.2 Generate charts (save as PNG or return as data)
│   └── Add API endpoint: GET /api/supervision/designation-analysis
│
├─ Day 8-9: [HIGH] Rule traceability + fundamentals fix
│   ├── 2.3 Create RULE_MAPPING.md
│   └── 3.1 Fix fundamentals auto-population
│
├─ Day 9-10: [NICE] Polish
│   ├── 3.3 Frontend supervision dashboard
│   ├── 3.4 One trade insight write-up
│   └── 3.2 Persistent flag history
│
Week 2+ ────────────────────────────────────────────────────
│
└─ Polish presentation deck, code cleanup, final review
```

---

## 6. Quick Wins (Can Do Now With Existing Code)

These require no new data sources and can improve the current implementation immediately:

1. **Run fundamentals refresh once** — `POST /api/refresh/fundamentals` to populate P/E, P/B, shares outstanding. This instantly enables Articles 5, 7, 11 to compute fully instead of returning partial results.

2. **Add HK/Taipei timezone awareness** — All timestamps are currently UTC. Add `Asia/Taipei` timezone for trading-hours detection.

3. **Increase scan frequency during market hours** — Set cache TTL to 60s (from 300s) when TWSE is open.

4. **Add stock name to `run_supervision_scan()` output** — Already done for some code paths, but `score_stock()` doesn't always attach it.

---

## 7. Verification Checklist

After implementing the above, verify:

- [ ] `GET /api/supervision/scan` returns intraday trigger results during market hours
- [ ] Intraday monitor correctly detects ≥ 15% intraday swings on volatile names
- [ ] Disposition history scraping returns ≥ 6 months of past designations
- [ ] Trigger frequency analysis identifies the top-3 deciding factors
- [ ] Pre/post designation charts show clear behavioral patterns
- [ ] One trade setup has entry/exit/sizing/risk documented
- [ ] Rule-to-code mapping table is complete and correct
- [ ] Frontend dashboard shows real-time supervision alerts
