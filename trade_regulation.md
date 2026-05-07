# TWSE Trading Regulations — Summary

Source: [TWSE Trading System](https://www.twse.com.tw/en/products/system/trading.html)

---

## 1. Trading Hours

| Session | Order Placing | Matching |
|---|---|---|
| Regular Trading | 08:30–13:30 | 09:00–13:30 |
| After-Hour Fixed-Price | 14:00–14:30 | 14:30 |
| Intraday Odd Lot | 09:00–13:30 | 13:30 |
| After-Hour Odd Lot | 14:00–14:30 | 14:30 |

Closing extension: If a stock's reference price moves > ±3.5% in the final minute (13:29–13:30), orders can be added/modified/cancelled from 13:31–13:33 and matching occurs at 13:33.

---

## 2. Trading Units

| Security Type | Trading Unit |
|---|---|
| Stocks, foreign primary listing, certificates | 1,000 shares |
| ETFs, REITs, TDRs, warrants, ETNs, closed-end funds | 1,000 units |
| Convertible bonds, government bonds, corporate bonds | NT$100,000 par value |
| Foreign secondary listing, offshore ETFs | No minimum |

Orders below 1,000 shares are considered odd-lot orders.

---

## 3. Daily Price Fluctuation Limit

| Security Type | Limit |
|---|---|
| Stocks, ETFs (domestic-only), closed-end funds, TDRs, convertible bonds | **±10%** of opening auction reference price |
| Leveraged/Inverse ETFs (domestic) | ±10% × leverage multiple |
| Warrants | Derived from underlying ±10% × exercise ratio |
| Corporate bonds | ±5% |
| Government bonds, foreign bonds | No limit |
| **Newly-listed stocks (first 5 days)** | **No limit** |
| ETFs with foreign components, offshore ETFs, foreign stocks secondary listing | No limit |

---

## 4. Tick Sizes (Equity Products — stocks, TDRs, ETFs, closed-end funds)

| Price Range (NT$) | Tick Size |
|---|---|
| 0.01 ≤ P < 5 | 0.01 |
| 5 ≤ P < 10 | 0.01 |
| 10 ≤ P < 50 | 0.05 |
| 50 ≤ P < 100 | 0.10 |
| 100 ≤ P < 150 | 0.50 |
| 150 ≤ P < 500 | 0.50 |
| 500 ≤ P < 1,000 | 1.00 |
| 1,000 ≤ P | 5.00 |

Block trades: tick is always 0.01.

**Implication for disposition stocks:** When a stock's price is high (≥ NT$500), the tick size is NT$1–5, which significantly reduces granularity and liquidity.

---

## 5. Order Types

| Type | Description | Available |
|---|---|---|
| Limit Order | Specify price; may not execute immediately | All sessions |
| Market Order | No price specified; executes at best available price | Continuous session only |
| IOC (Immediate or Cancel) | Execute immediately whatever possible; cancel rest | Continuous session only |
| FOK (Fill or Kill) | Execute entire order immediately or cancel all | Continuous session only |

Market orders are NOT available for:
- Call auction sessions (opening, closing)
- Intraday volatility interruption events
- **Disposition securities** (these are restricted to call auction only)

---

## 6. Matching Methods

| Method | When Used |
|---|---|
| **Call Auction** (集合競價) | Opening (09:00), closing (13:30), intraday volatility interruption, **disposition securities** |
| **Continuous Trading** (逐筆交易) | Regular session 09:00–13:30 (except call auction moments) |

During call auction, orders are accumulated and matched at a single price that maximizes volume. During continuous trading, orders are matched order-by-order.

---

## 7. Disposition Measures — What Changes When a Stock Is Flagged

This is the most important section for the supervision engine. When TWSE announces a stock as a **disposition security**, the following restrictions apply:

### 7.1 Matching Frequency Changes

Normal stocks trade continuously. Disposition stocks are restricted to **call auction at fixed intervals**:

| Disposition Severity | Matching Interval | Effect |
|---|---|---|
| Standard (1st time, standard measure) | **Every 5 minutes** | ~54 matches/day vs ~27,000 continuous |
| Standard (1st time, with margin restriction) | **Every 20 minutes** | ~13 matches/day |
| Second time / severe | **Every 30 minutes** | ~9 matches/day |

This drastically reduces liquidity and makes intraday price discovery much slower.

### 7.2 Pre-Collection Requirements

Brokers must collect funds/securities BEFORE accepting orders:

| Disposition Type | Requirement |
|---|---|
| **First-time disposition** | Pre-collect 100% for single orders ≥ 10 trading units OR aggregate ≥ 30 trading units. For margin trades, collect full margin upfront. |
| **Second-time disposition** | Pre-collect 100% for ALL orders, regardless of size. Full margin upfront for all margin trades. |
| **Altered-trading-method** | Always pre-collect 100% for all orders. |

Exceptions: Liquidation of margin positions, default account trades, warrant liquidity provider/hedging accounts.

### 7.3 Margin Trading Restrictions

- Margin purchases and short sales may be restricted or banned entirely for disposition securities
- When margin is still allowed, brokers must collect 100% of margin requirements upon order receipt (normally collected at settlement)
- Margin maintenance ratio remains 130%

### 7.4 Day Trading Restrictions

- Day trading (buying and selling the same stock in one day) is typically **banned** for disposition securities
- This is one of the primary impacts — day traders account for significant volume in Taiwan markets

---

## 8. Intraday Volatility Interruption

If a stock's price would execute at a price more than ±3.5% from the previous match price (within the same session), a 2-minute call auction pause is triggered. During this pause:
- New orders are accepted
- Existing orders can be cancelled/modified
- Market orders are automatically cancelled
- Matching resumes via call auction after 2 minutes
- This can happen multiple times per day for the same stock

---

## 9. Suspending and Resuming Trading

TWSE may suspend trading for:
- Major corporate announcements pending clarification
- Unusual trading activity investigation
- Court-ordered suspension
- Delisting proceedings
- Other regulatory reasons

Resumption follows a call auction at the originally scheduled matching time.

---

## 10. Summary: Impact of Disposition on Trading

| Normal Stock | Disposition Stock (1st time) | Disposition Stock (2nd time) |
|---|---|---|
| Continuous matching (~27,000/day) | Call auction every 5 min (~54/day) | Call auction every 20-30 min (~9-13/day) |
| Market orders allowed | Market orders NOT allowed | Market orders NOT allowed |
| No pre-collection (broker discretion) | Pre-collect 100% for large orders | Pre-collect 100% for ALL orders |
| Full margin on settlement (T+2) | Full margin on order | Full margin on order |
| Day trading allowed | Day trading banned | Day trading banned |
| Normal tick sizes | Same tick sizes | Same tick sizes |

These restrictions make disposition stocks much harder to trade — liquidity collapses, order entry is constrained, and capital requirements increase. This is why the supervision engine's **early warning** capability matters: traders who can anticipate disposition designation can adjust positions before these restrictions hit.
