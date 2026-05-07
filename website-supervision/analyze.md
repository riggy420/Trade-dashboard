# Price, Volume & Volatility Behaviour Around Disposition Designation

## Methodology

**Event study** on 123 unique disposed stocks (TWSE + TPEx) with sufficient OHLCV data.

- **Event date (T=0):** Disposition announcement date
- **Window:** T-20 to T+20 trading days
- **Normalization:** Prices normalized to T=0 (= 100). Returns are cumulative from T-20.
- **Volume baseline:** Average daily volume over T-70 to T-21 (50 trading days before the event window)
- **Volatility:** 20-day rolling annualized volatility

---

## 1. Price Behaviour

Stocks exhibit a clear **pre-disposition rally → post-disposition fade** pattern:

```
Cumulative return relative to T=0:

T-20 ████████████████████░ -21.2%  (price was 21% below disposition price)
T-15 ███████████████░░░░░ -15.8%
T-10 ████████████░░░░░░░░ -12.3%
T-5  ████████░░░░░░░░░░░░  -7.5%  (accelerating into disposition)
T-3  ██████░░░░░░░░░░░░░░  -3.6%
T-1  ██░░░░░░░░░░░░░░░░░░  -1.0%
T=0  ░░░░░░░░░░░░░░░░░░░░   0.0%  ← DISPOSITION ANNOUNCED
T+1  █░░░░░░░░░░░░░░░░░░░  -1.4%  (immediate sell-off)
T+5  ██░░░░░░░░░░░░░░░░░░  -2.0%
T+10 ██░░░░░░░░░░░░░░░░░░  -2.4%
T+20 ███░░░░░░░░░░░░░░░░░  -2.8%  (gradual fade continues)
```

### Key Price Phases

| Phase | Window | Return | Interpretation |
|---|---|---|---|
| **Pre-run-up** | T-20 to T-5 | **+17.4%** | Slow build. Stocks already anomalous 3 weeks out. |
| **Final push** | T-5 to T=0 | **+8.1%** | Acceleration. The trigger event itself. |
| **Announcement gap** | T=0 to T+1 | **-1.4%** | Small immediate sell-off. Market reacts to the news. |
| **Post-designation fade** | T+1 to T+20 | **-1.4%** | Gradual decline. ~2.8% total below disposition price. |

**Interpretation:** Stocks rally ~26% in the 20 trading days before disposition, with the final 5 days accounting for ~1/3 of the total move. The exchange acts at the peak. After designation, stocks give back only ~3% over the next 20 days — **most of the pre-disposition gains are retained.** This is NOT a mean-reversion story; it's a momentum story with trading restrictions creating a slow bleed rather than a crash.

---

## 2. Volume Behaviour

Volume explodes around the trigger dates and remains elevated:

```
Volume ratio vs baseline (1.0 = normal):

T-20 to T-10  ████████████░░░░░░░░░░░░░░░  2.4x   (already elevated)
T-10 to T-5   ████████████████████████████  5.1x   (surge begins)
T-5  to T=0   ████████████████████████████████████████  7.7x   (peak — the trigger)
T=0  to T+5   ████████████████████████████████████  7.0x   (still extreme)
T+5  to T+10  █████████████████████████  4.7x   (elevated, declining)
T+10 to T+20  ██████████████████  3.2x   (slowly normalizing)
```

### Key Volume Phases

| Phase | Ratio vs Baseline | Interpretation |
|---|---|---|
| Pre-event (T-20 to T-10) | 2.4x | Already trading above normal |
| Trigger window (T-5 to T+5) | **7.7x** | Volume explodes — the anomaly peak |
| Post-designation (T+10 to T+20) | 3.2x | Elevated but declining; some drought effect |

**Interpretation:** Volume doesn't crash after disposition — it stays elevated at 3.2x baseline even 10-20 days after. The disposition measures (call auction only, no day trading) reduce matching frequency but the stock remains in the spotlight. Traders continue to trade it aggressively despite the restrictions. The "liquidity drought" hypothesis is partially wrong — volume drops from 7.7x peak to 3.2x, but that's still 3x normal, not a drought.

---

## 3. Volatility Behaviour

Volatility spikes at disposition and stays elevated:

```
20-day annualized volatility:

T-20 to T-5   ██████████████████████████████████  75.6%   (already high)
T=0  to T+5   ████████████████████████████████████████  85.2%   (peak)
T+5  to T+20  ██████████████████████████████████████████  89.7%   (still rising)
```

| Phase | Annualized Vol | Interpretation |
|---|---|---|
| Pre-disposition | 75.6% | ~2-3x typical Taiwan small-cap vol (25-35%) |
| At disposition | 85.2% | Spikes further as traders react |
| Post-disposition | 89.7% | **Continues rising.** Volatility does NOT fade. |

**Interpretation:** This is the opposite of a "volatility fade" hypothesis. Volatility **increases** after disposition, likely because:
1. Call auction matching (every 5-30 min) creates price gaps between matches
2. Reduced liquidity amplifies each trade's price impact
3. The stock remains in the spotlight, attracting speculative attention
4. Pre-collection requirements concentrate orders from well-capitalized traders

The disposition measures are designed to COOL the stock down, but they actually increase measured volatility due to the auction mechanism.

---

## 4. Combined Picture

```
Pre-Disposition (T-20 to T=0):           Post-Disposition (T=0 to T+20):
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│ PRICE:   Rallying (+26%)        │    │ PRICE:   Slow fade (-2.8%)     │
│ VOLUME:  Surging (2.4x→7.7x)    │    │ VOLUME:  Declining (7x→3.2x)   │
│ VOL:     High (76%)             │    │ VOL:     Rising (85%→90%)      │
│                                 │    │                                 │
│ Stock is anomalous              │    │ Stock is restricted             │
│ Engine should detect this       │    │ Engine already flagged it       │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

---

## 5. Trading Implications

1. **Pre-disposition is a momentum trade, not a fade trade.** Prices rally 26% into disposition and retain 90%+ of gains. Shorting at engine flag would lose money on average — the stock keeps going up until the exchange steps in.

2. **Post-disposition is a slow bleed, not a crash.** Prices decline only 2.8% over 20 days (~0.14%/day). This is too slow for a short trade after the disposition costs (pre-collection, auction-only execution).

3. **Volume remains high post-disposition.** The "liquidity drought" is mild — volume stays at 3.2x normal. Position exits are feasible even during the disposition period.

4. **Volatility increases, not decreases.** The auction mechanism creates price jumps. Risk management (stop losses) needs wider bands post-disposition, not tighter.

5. **The optimal trade window is T-5 to T=0 (the final push).** This is where the engine's early warning signal (2.3 days mean lead) is most valuable — enter long when the engine first flags a stock, ride the remaining momentum to the disposition announcement, exit on announcement day.

---

## 6. Data Summary

| Metric | Pre (T-20 to T-5) | Event (T-5 to T+5) | Post (T+5 to T+20) |
|---|---|---|---|
| Cumulative return | +17.4% | +6.6% | -2.8% |
| Volume (vs baseline) | 2.4x | 7.7x | 3.2x |
| Volatility (ann.) | 75.6% | 85.2% | 89.7% |

**123 stocks analyzed.** Mean disposition price: NT$263. Window: 41 trading days (T-20 to T+20).
