# Criteria to get in Monitoring List

## Global Exceptions (Safe Harbors)
These exceptions act as broad shields. If a security meets these conditions, they are exempt from the flag triggers of specific articles as noted:
* **Newly-listed Ordinary Shares:** Exempt during the period in which no price fluctuation limit is imposed. *(Applies to Articles: 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14)*
* **Non-trade Related Factors:** If a stock fluctuates due to ex-rights or ex-dividend factors, those data points are excluded. *(Applies to Articles: 2, 3, 4, 5, 6, 8, 9, 12)*
* **Already Flagged Recently:** If the stock recently received an announcement or disposition measure, a cool-down period or threshold hike might apply to prevent repeat immediate flagging. *(Applies to Articles: 3, 10, 11, 12, 14)*
* **Small Sectors (< 5 Securities):** Sector-comparisons are waived/exempt if the sector is too small. *(Applies to Articles: 2, 3, 4, 5, 6, 8)*
* **Derivatives & Non-Ordinary Shares:** Variables like volume/turnover rules usually don't apply to Warrants, ETNs, ETFs (active or passive), Convertible Bonds, and Preference Shares. *(Applies to: Articles 3, 4, 5, 6, 7, 10, 11, 13, 14 - Specific lists vary slightly per article)*
* **Low Absolute Values:** Certain articles are waived if trading is too small to definitively matter. (e.g., Turnover < 0.1%, Volume < 500 units, Price < NT$5, etc.)

---

## Article 2: Irregularity in the Cumulative Percentage of Increase or Decrease in the Closing Price
On a given day:
* Cumulative percentage of increase or decrease in the closing price for the most recent 6 business days >= 32%
    * **AND** differ for both market as a whole and for the same sector >= 20%
* Cumulative percentage of increase or decrease in the closing price for the most recent 6 business days >= 25%
    * **AND** differ for both market as a whole and for the same sector >= 20%
    * **AND** Closing price of initial vs final days of the 6 business days difference is >= NT$50.

*(Exceptions: Price < NT$5, Negative P/E or trading at 60x earning or above, Premium/Discount opposite standard direction <= 10%)*

---

## Article 3: Long-term Irregularity in Price
A security is flagged if its accumulated closing price change hits severe extremes over longer periods. Meets **one** of the following conditions:
* **30-day window:** Cumulative price change > 100% **AND** differs from market/sector averages by >= 85% **AND** the closing price for the day is above/below the opening reference price.
* **60-day window:** Cumulative price change > 130% **AND** differs from market/sector averages by >= 110% **AND** the closing price for the day is above/below the opening reference price.
* **90-day window:** Cumulative price change > 160% **AND** differs from market/sector averages by >= 135% **AND** the closing price for the day is above/below the opening reference price.

---

## Article 4: Price Irregularity Combined with Volume Increase
Targets short-term price spikes manipulated with extreme volume influxes. Meets **both**:
* **Price:** 6-day cumulative closing price change > 25% (**AND** differs from market/sector averages by >= 20%).
* **Volume Surge:** Trading volume for the given day is >= 5 times the average daily volume over the most recent 60 days, **AND** this increase differs from the market-wide average volume increase by a factor of 4 or more.

---

## Article 5: Price Irregularity with High Intraday Turnover
Targets heavily churned stocks experiencing anomalous price action. Meets **both**:
* **Price:** 6-day cumulative closing price change > 25% (**AND** differs from market/sector averages by >= 20%).
* **Turnover:** Intraday turnover rate >= 10%, **AND** it is greater than the market-wide average turnover by >= 5%.

*(Exceptions: Negative P/E or P/E >= 60x)*

---

## Article 6: Price Irregularity with Highly Concentrated Day Trading
Targets brokerages forcing price changes manually via day trading. Meets **both**:
* **Price:** 6-day cumulative closing price change > 25% (**AND** differs from market/sector averages by >= 20%).
* **Concentration:** Confirmed day trading purchases/sales at a *single* securities firm account for > 25% of total confirmed volume (up to a hard cap of 35% with branches) **AND** the volume reaches 500 trading units or more.

*(Exceptions: Negative P/E or P/E >= 60x)*

---

## Article 7: Irregular P/E, P/B, Turnover, and Trade Concentration
Targets fundamentally mispriced stocks that are being actively pushed. Meets **ALL FOUR**:
1. **P/E Ratio:** Negative or >= 60x, **AND** >= 2 times the weighted average P/E of the entire market.
2. **P/B Ratio:** Price-to-book ratio is >= 6.0, **AND** >= 2 times the weighted average P/B of the entire market.
3. **Turnover:** Intraday turnover >= 5% **AND** volume >= 3,000 units.
4. **Specific Extremes (Meets at least one):**
   * P/B is > 4 times the sector average.
   * A single securities firm accounts for >= 10% of total trade monetary value **AND** an absolute value >= NT$100 million.
   * A single investor accounts for >= 10% of total trade monetary value **AND** an absolute value >= NT$100 million.

---

## Article 8: Price Irregularity with Margin/Short Ratios
Targets potential short squeezes or extreme leverage situations. Meets **all three**:
* **Price:** 6-day cumulative closing price change > 25% (**AND** differs from market/sector averages by >= 20%).
* **High Leverage:** Long/short ratio on previous day >= 20%. Requires Margin utilization >= 25% **AND** Stock loan rate >= 15%.
* **Ratio Surge:** The long/short ratio on previous day is >= 4 times the lowest long/short ratio recorded in the past 6 days.

*(Exceptions: Negative P/E or P/E >= 60x, Long/short ratio on previous day < previous 2 days)*

---

## Article 9: TDR Premium/Discount Irregularities
Applies exclusively to Taiwan Depositary Receipts (TDRs). Meets **one** of:
* **Extreme Premium:** Premium > 80% **AND** closing price > opening reference price.
* **High Premium:** Premium > 30% **AND** closing price is the highest of the past 6 days.
* **High Discount:** Discount > 30% **AND** closing price is the lowest of the past 6 days.

---

## Article 10: Significant Volume Increase
Targets massive continuous volume anomalies independent of the price change percentage. Meets **both**:
* **6-Day Surge:** 6-day average volume is >= 5 times the 60-day average volume (**AND** differs from the market average increase by a factor of 4+).
* **1-Day Surge:** Daily volume is >= 5 times the 60-day average volume (**AND** differs from the market average increase by a factor of 4+).

*(Exceptions: Intraday turnover < 0.1%, or volume < 500 units, or total trading value < NT$30 million)*

---

## Article 11: High Cumulative Turnover Rate
Targets sustained, extreme churning of a security's available shares. Meets **both**:
* **6-Day Accumulation:** 6-day cumulative turnover rate > 50% (**AND** differs from the market average by 40%+).
* **1-Day Spike:** Intraday turnover rate >= 10% (**AND** differs from the market average by 5%+).

*(Exceptions: Confirmed transaction value on the given day is < NT$500 million)*

---

## Article 12: Extreme Initial to Final Day Price Difference
Targets absolutely massive raw monetary swings. Meets **one** of:
* **Extreme Highs:** The difference between the closing prices on the initial and final days of the most recent 6 business days is >= **NT$100** **AND** the closing price on the given day is also the *highest* of the most recent 6 business days. (If there is no closing price, it must exceed the opening reference price).
* **Extreme Lows:** The difference between the closing prices on the initial and final days of the most recent 6 business days is >= **NT$100** **AND** the closing price on the given day is also the *lowest* of the most recent 6 business days. (If there is no closing price, it must be lower than the opening reference price).

**The Bracket Rule Formulation (For Expensive Stocks):** 
If the closing price of the security on a given day is **NT$500 or more**, the baseline NT$100 requirement moves onto a sliding scale.
* For every NT$500 bracket in share price, an additional **NT$25** must be added to the NT$100 threshold limit.
* Example: For a NT$600 stock, the required 6-day price difference would be NT$125.

---

## Article 13: High Percentage of Borrowed Securities Sales
Targets potential orchestrated shorting campaigns via borrowed shares. Meets **both**:
* **Sustained Shorting:** 6-day borrowed securities sales volume >= 12% of total 6-day volume.
* **Current Surge:** Daily borrowed securities sales volume is >= 5 times the 60-day average.

*(Exceptions: Turnover <= 0.3%, overall volume <= 500 units, or borrowed sales <= 100 units)*

---

## Article 14: Extremely High Day Trading Volume
Targets securities overwhelmed almost entirely by day traders. Meets **both**:
* **6-day Average:** 6-day day trading volume accounts for > 60% of total 6-day volume.
* **Daily Average:** Daily day trading volume accounts for > 60% of total daily volume.

*(Exceptions: Turnover < 5%, Trading value < NT$500 million, or absolute day trading volume < 5,000 units)*

---

## Decision Trees for Stock Supervision

### Tree 1 — Violation Detection

```
All 14 articles scored in parallel. Each checks its own thresholds + market/sector
divergence independently. Any article that triggers feeds into the exception review.
If NONE trigger, the stock is ordinary trading.
```

```mermaid
flowchart TD
    classDef start    fill:#f1f5f9,stroke:#64748b,stroke-width:2px,color:#000
    classDef decision fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#000
    classDef article  fill:#f0f9ff,stroke:#0284c7,stroke-width:1px,color:#000,font-size:10px
    classDef pass     fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#16a34a,font-weight:bold

    ROOT(["Start: Daily Market Data<br/>OHLCV + Intraday + Fundamentals"]):::start

    %% All 14 articles scored in parallel
    ROOT --> PRICE
    ROOT --> VOLUME
    ROOT --> VALUATION

    subgraph PRICE [Price Momentum]
        A2["Art 2: 6d Δ≥32% + diverge≥20%"]:::article
        A3["Art 3: 30d>100% / 60d>130% / 90d>160%"]:::article
        A12["Art 12: NT$ swing≥100 (sliding scale)"]:::article
        A41["Art 4-1: Intraday swing≥15% + vol"]:::article
    end

    subgraph VOLUME [Volume & Turnover]
        A4["Art 4: Δ>25% + vol≥5× 60d avg"]:::article
        A5["Art 5: Δ>25% + turnover≥10%"]:::article
        A10["Art 10: 6d+1d vol≥5× 60d avg"]:::article
        A11["Art 11: Cumul TO>50% + 1d≥10%"]:::article
    end

    subgraph VALUATION [Valuation & Structure]
        A7["Art 7: P/E≥60x + P/B≥6.0 + TO≥5%"]:::article
        A6["Art 6,8,9,13,14 [STUB]"]:::article
    end

    A2 & A3 & A12 & A41 & A4 & A5 & A10 & A11 & A7 & A6 --> MERGE{"Any article<br/>triggered?"}:::decision

    MERGE -- "NO" --> X(["NO ACTION<br/>Ordinary Trading"]):::pass
    MERGE -- "YES" --> GATE(["→ Enter Exception Review"]):::pass
```

---

### Tree 2 — Exception Review (Safe Harbors)

```
An article was triggered. Now check: is the stock exempt?
Exceptions are checked in order. The FIRST matching exception applies.
If none match, the stock is FLAGGED.
```

```mermaid
flowchart TD
    classDef except   fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,color:#000
    classDef flagged  fill:#fef2f2,stroke:#dc2626,stroke-width:3px,color:#dc2626,font-weight:bold
    classDef clear    fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#16a34a
    classDef waived   fill:#fffbeb,stroke:#d97706,stroke-width:2px,color:#d97706
    classDef entry    fill:#f0fdf4,stroke:#16a34a,stroke-width:3px,color:#000,font-weight:bold

    ENTRY(["Article Triggered"]):::entry
    ENTRY --> E1

    E1{"Newly listed<br/>(no price limit)?"}:::except
    E1 -- "YES" --> X1(["NO ACTION"]):::clear
    E1 -- "NO" --> E2

    E2{"Ex-rights or<br/>ex-dividend?"}:::except
    E2 -- "YES" --> X2(["NO ACTION"]):::clear
    E2 -- "NO" --> E3

    E3{"Price < NT$5?<br/>Vol < 500?<br/>Turnover < 0.1%?"}:::except
    E3 -- "YES" --> S1(["SAFE HARBOR"]):::clear
    E3 -- "NO" --> E4

    E4{"Sector < 5<br/>securities?"}:::except
    E4 -- "YES" --> W(["SECTOR WAIVED"]):::waived
    E4 -- "NO" --> E5

    E5{"Already flagged<br/>recently?"}:::except
    E5 -- "YES" --> X3(["NO ACTION"]):::clear
    E5 -- "NO" --> E6

    E6{"ETF, Warrant,<br/>ETN, or CB?"}:::except
    E6 -- "YES" --> S2(["SAFE HARBOR"]):::clear
    E6 -- "NO" --> Z

    Z(["FLAGGED<br/>Call Auction · Pre-Collection<br/>Day-Trade Ban · Full Margin"]):::flagged
```

---

### Sub-Trees: Within Each Detection Gate

#### Gate 1 — Price Momentum

```mermaid
flowchart TD
    classDef decision fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#000
    classDef triggered fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#dc2626,font-weight:bold

    P0(["Price Gate Entered"])-->P1

    P1{"6d close change<br/>≥ 32%?<br/>(or ≥ 25% + NT$50)"}:::decision
    P1-- "YES" -->P1A{"Diverges from<br/>mkt & sector<br/>≥ 20%?"}:::decision
    P1A-- "YES" -->P1B["Art 2 TRIGGERED"]:::triggered
    P1A-- "NO" -->P2
    P1-- "NO" -->P2

    P2{"30d > 100%<br/>60d > 130%<br/>90d > 160%?"}:::decision
    P2-- "YES" -->P2A{"Diverges ≥ 85%<br/>110% / 135%?"}:::decision
    P2A-- "YES" -->P2B["Art 3 TRIGGERED"]:::triggered
    P2A-- "NO" -->P3
    P2-- "NO" -->P3

    P3{"6d NT$ diff ≥ 100<br/>(+25 per NT$500<br/>if price ≥ 500)?"}:::decision
    P3-- "YES" -->P3A{"Is 6d high<br/>or 6d low?"}:::decision
    P3A-- "YES" -->P3B["Art 12 TRIGGERED"]:::triggered
    P3A-- "NO" -->P_OUT
    P3-- "NO" -->P_OUT(["Gate 1 Clean<br/>→ Gate 2"])
```

Art 2 checks short-term percentage moves. If clean, Art 3 checks long-term sustained runs. Art 12 catches large absolute NT\$ swings (primarily expensive stocks) that don't reach the percentage thresholds. Each has its own divergence check.

#### Gate 2 — Volume & Turnover

```mermaid
flowchart TD
    classDef decision fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#000
    classDef triggered fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#dc2626,font-weight:bold

    V0(["Volume Gate Entered"])-->V1

    V1{"6d price Δ > 25%<br/>AND vol ≥ 5× 60d avg?"}:::decision
    V1-- "YES" -->V1A{"Vol diverges<br/>from mkt ≥ 4×?"}:::decision
    V1A-- "YES" -->V1B["Art 4 TRIGGERED"]:::triggered
    V1A-- "NO" -->V2
    V1-- "NO" -->V2

    V2{"6d price Δ > 25%<br/>AND turnover ≥ 10%?"}:::decision
    V2-- "YES" -->V2A{"Turnover diverges<br/>from mkt ≥ 5%?"}:::decision
    V2A-- "YES" -->V2B["Art 5 TRIGGERED"]:::triggered
    V2A-- "NO" -->V3
    V2-- "NO" -->V3

    V3{"6d avg vol ≥ 5×<br/>60d avg?"}:::decision
    V3-- "YES" -->V3A{"Diverges from<br/>mkt ≥ 4×?"}:::decision
    V3A-- "YES" -->V3B["Art 10 TRIGGERED"]:::triggered
    V3A-- "NO" -->V4
    V3-- "NO" -->V4

    V4{"6d cumul turnover<br/>> 50% AND<br/>1d turnover ≥ 10%?"}:::decision
    V4-- "YES" -->V4A{"Diverges from<br/>mkt ≥ 40% / 5%?"}:::decision
    V4A-- "YES" -->V4B["Art 11 TRIGGERED"]:::triggered
    V4A-- "NO" -->V_OUT
    V4-- "NO" -->V_OUT(["Gate 2 Clean<br/>→ Gate 3"])
```

Art 4 and 5 require both price movement AND elevated volume/turnover (price-contingent). Art 10 and 11 check volume/turnover independently of price. Price-contingent articles check first since a stock with both price and volume anomalies is the strongest signal.

#### Gate 3 — Valuation & Structure

```mermaid
flowchart TD
    classDef decision fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#000
    classDef triggered fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#dc2626,font-weight:bold
    classDef stub fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,color:#94a3b8

    F0(["Valuation Gate Entered"])-->F1

    F1{"P/E ≥ 60× or negative<br/>AND P/B ≥ 6.0<br/>AND turnover ≥ 5%?"}:::decision
    F1-- "YES" -->F1A{"P/E ≥ 2× mkt avg?<br/>P/B ≥ 4× sector avg?"}:::decision
    F1A-- "YES" -->F1B["Art 7 TRIGGERED"]:::triggered
    F1A-- "NO" -->F2
    F1-- "NO" -->F2

    F2{"Art 6: Broker conc. > 25%?<br/>Art 8: Long/short ≥ 20%?<br/>Art 9: TDR Prem > 80%?<br/>Art 13: Borrowed ≥ 12%?<br/>Art 14: Day-trade > 60%?"}:::decision
    F2-- "YES" -->F2A{"Thresholds<br/>exceeded?"}:::decision
    F2A-- "YES" -->F2B["Art 6/8/9/13/14<br/>[STUB — data unavailable]"]:::stub
    F2A-- "NO" -->F_OUT
    F2-- "NO" -->F_OUT(["Gate 3 Clean<br/>→ NO ACTION"])
```

Art 7 is the only fully computable valuation article. Arts 6, 8, 9, 13, 14 require TWSE-specific data (broker-level, margin reports, TDR reference prices, borrowed securities, day-trade breakdowns) that are not available from public sources. They are evaluated as stubs — returning `triggered=False` with an explicit caveat.


