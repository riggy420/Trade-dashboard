"""
TWSE regulatory supervision scoring engine.
Computes per-article risk signals with full market and sector comparisons.

Two-phase scanning: (1) compute per-stock metrics, (2) compute market/sector
aggregates, (3) score each stock with full context.

Articles fully computable from OHLCV + fundamentals:
  Art 2  — 6-day cumulative price change vs market/sector
  Art 3  — 30/60/90-day price extremes vs market/sector
  Art 4  — 6-day price + volume surge vs market
  Art 5  — 6-day price + intraday turnover (needs shares outstanding)
  Art 7  — P/E, P/B, turnover extremes (broker concentration stubbed)
  Art 10 — 6-day avg volume vs 60-day avg vs market
  Art 11 — Cumulative turnover rate (needs shares outstanding)
  Art 12 — 6-day NT$ price difference (sliding scale)

Articles stubbed (require TWSE-specific data):
  Art 6  — broker day-trading concentration
  Art 8  — margin/short lending ratios
  Art 9  — TDR premium/discount
  Art 13 — borrowed securities sales
  Art 14 — day trading volume breakdown
"""

import json
import math
import os
from dataclasses import dataclass, field
from datetime import datetime

from scrape.fundamentals import load_fundamentals_map

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_lines(filepath: str) -> list[str]:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read().splitlines()
    except (UnicodeDecodeError, UnicodeError):
        try:
            os.remove(filepath)
        except OSError:
            pass
        return []


def _pct_change(start: float, end: float) -> float:
    if start == 0:
        return 0.0
    return ((end - start) / abs(start)) * 100


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _load_ohlcv(symbol: str) -> list[dict] | None:
    for suffix in [".TW", ".TWO"]:
        filepath = os.path.join(DATA_DIR, f"{symbol}{suffix}_historical_5y.txt")
        if not os.path.exists(filepath):
            continue
        try:
            records = []
            lines = _read_lines(filepath)
            if not lines:
                continue
            for line in lines[1:]:
                cols = line.split("\t")
                if len(cols) < 6:
                    continue
                try:
                    records.append({
                        "date": cols[0],
                        "open": float(cols[1]),
                        "high": float(cols[2]),
                        "low": float(cols[3]),
                        "close": float(cols[4]),
                        "volume": float(cols[5] or 0),
                    })
                except ValueError:
                    continue
            if records:
                return records
        except Exception:
            continue
    return None


def _load_intraday_today(symbol: str) -> dict | None:
    """
    Load today's intraday OHLCV data for a symbol.
    Sums volume across all intraday rows matching today's date.
    Returns {open, high, low, volume, close} or None.
    """
    from datetime import date as dt_date
    today_str = dt_date.today().isoformat()

    for suffix in [".TW", ".TWO"]:
        filepath = os.path.join(DATA_DIR, f"{symbol}{suffix}_intraday.txt")
        if not os.path.exists(filepath):
            continue
        try:
            lines = _read_lines(filepath)
            if len(lines) < 2:
                continue
            intra_open = None
            intra_high = None
            intra_low = None
            intra_close = None
            intra_vol = 0.0

            for line in lines[1:]:
                cols = line.split("\t")
                if len(cols) < 6:
                    continue
                row_date = cols[0].split(" ")[0] if " " in cols[0] else cols[0]
                if row_date != today_str:
                    continue
                try:
                    o = float(cols[1])
                    h = float(cols[2])
                    l = float(cols[3])
                    c = float(cols[4])
                    v = float(cols[5] or 0)
                except ValueError:
                    continue
                if intra_open is None:
                    intra_open = o
                intra_high = max(intra_high, h) if intra_high is not None else h
                intra_low = min(intra_low, l) if intra_low is not None else l
                intra_close = c
                intra_vol += v

            if intra_open is not None and intra_high is not None:
                return {
                    "open": intra_open,
                    "high": intra_high,
                    "low": intra_low,
                    "close": intra_close or intra_open,
                    "volume": intra_vol,
                }
        except Exception:
            continue
    return None


def _load_sector_map() -> dict[str, str]:
    path = os.path.join(DATA_DIR, "twse_sectors.txt")
    result: dict[str, str] = {}
    for line in _read_lines(path):
        parts = line.split("\t")
        if len(parts) >= 2:
            result[parts[0]] = parts[1]
    return result


def _load_ticker_names() -> dict[str, str]:
    path = os.path.join(DATA_DIR, "twse_tickers.txt")
    result: dict[str, str] = {}
    for line in _read_lines(path):
        parts = [p.strip() for p in line.split(",") if p.strip()]
        if len(parts) >= 2:
            symbol = parts[0]
            name = ",".join(parts[1:-1]).strip() if len(parts) > 2 else parts[1]
            result[symbol] = name
    return result


def _count_sector_sizes(sector_map: dict[str, str]) -> dict[str, int]:
    """Count stocks per sector from the sector map."""
    sizes: dict[str, int] = {}
    for s, sec in sector_map.items():
        if sec:
            sizes[sec] = sizes.get(sec, 0) + 1
    return sizes


def _is_derivative(symbol: str) -> bool:
    """Check if symbol is a warrant, ETN, ETF, convertible bond, or preference share."""
    # ETFs and bond ETFs start with 00
    if symbol.startswith("00"):
        return True
    # Warrants: longer numeric symbols starting with 03-09
    if len(symbol) >= 5 and any(symbol.startswith(p) for p in ("03", "04", "05", "06", "07", "08", "09")):
        return True
    # 5-digit symbols ending in special letters (warrants, ETNs, CBs, preference shares)
    if len(symbol) == 5 and symbol[0] in "0123456789":
        if symbol[4] in "BCEFKLPQRX":
            return True
    return False


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class StockMetrics:
    symbol: str
    sector: str
    closes: list[float] = field(default_factory=list, repr=False)
    volumes: list[float] = field(default_factory=list, repr=False)
    latest_price: float = 0.0
    change_6d_pct: float = 0.0
    change_30d_pct: float = 0.0
    change_60d_pct: float = 0.0
    change_90d_pct: float = 0.0
    change_6d_ntd: float = 0.0
    price_is_6d_high: bool = False
    price_is_6d_low: bool = False
    avg_vol_60d: float = 0.0
    avg_vol_6d: float = 0.0
    today_vol: float = 0.0
    vol_ratio_6d: float = 0.0
    vol_ratio_1d: float = 0.0
    shares_outstanding: float | None = None
    turnover_6d: float | None = None
    turnover_1d: float | None = None
    intraday_vol: float = 0.0
    intraday_high: float = 0.0
    intraday_low: float = 0.0
    intraday_open: float = 0.0
    intraday_turnover: float | None = None
    today_value: float = 0.0
    trailing_pe: float | None = None
    price_to_book: float | None = None
    market_cap: float | None = None


@dataclass
class MarketAggregates:
    market_avg_change_6d: float = 0.0
    market_avg_change_30d: float = 0.0
    market_avg_change_60d: float = 0.0
    market_avg_change_90d: float = 0.0
    market_avg_vol_ratio_6d: float = 0.0
    market_avg_vol_ratio_1d: float = 0.0
    market_avg_turnover_6d: float = 0.0
    market_avg_turnover_1d: float = 0.0
    market_weighted_pe: float = 0.0
    market_weighted_pb: float = 0.0
    sector_avg_change_6d: dict[str, float] = field(default_factory=dict)
    sector_avg_change_30d: dict[str, float] = field(default_factory=dict)
    sector_avg_change_60d: dict[str, float] = field(default_factory=dict)
    sector_avg_change_90d: dict[str, float] = field(default_factory=dict)
    sector_avg_vol_ratio_6d: dict[str, float] = field(default_factory=dict)
    sector_avg_turnover_6d: dict[str, float] = field(default_factory=dict)
    sector_avg_turnover_1d: dict[str, float] = field(default_factory=dict)
    sector_avg_pb: dict[str, float] = field(default_factory=dict)
    sector_size: dict[str, int] = field(default_factory=dict)


@dataclass
class ArticleResult:
    article: str
    description: str
    triggered: bool
    fully_computed: bool = True
    score_contribution: float = 0.0
    details: dict = field(default_factory=dict)
    caveat: str = ""


@dataclass
class DecisionResult:
    classification: str
    triggered_articles: list[str] = field(default_factory=list)
    exceptions_applied: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Phase 1: Per-stock metrics
# ---------------------------------------------------------------------------

def _compute_stock_metrics(symbol: str, sector: str,
                           records: list[dict],
                           fundamentals: dict | None = None) -> StockMetrics | None:
    if not records or len(records) < 6:
        return None

    closes = [r["close"] for r in records]
    volumes = [r["volume"] for r in records]
    latest_price = closes[-1]
    today_vol = volumes[-1]
    today_value = latest_price * today_vol if today_vol else 0.0

    change_6d_pct = abs(_pct_change(closes[-6], closes[-1])) if len(closes) >= 6 else 0.0
    change_30d_pct = abs(_pct_change(closes[-30], closes[-1])) if len(closes) >= 30 else 0.0
    change_60d_pct = abs(_pct_change(closes[-60], closes[-1])) if len(closes) >= 60 else 0.0
    change_90d_pct = abs(_pct_change(closes[-90], closes[-1])) if len(closes) >= 90 else 0.0

    change_6d_ntd = abs(closes[-1] - closes[-6]) if len(closes) >= 6 else 0.0
    window_6d = closes[-6:]
    price_is_6d_high = closes[-1] == max(window_6d)
    price_is_6d_low = closes[-1] == min(window_6d)

    avg_vol_60d = sum(volumes[-60:]) / min(60, len(volumes)) if len(volumes) >= 60 else 0.0
    avg_vol_6d = sum(volumes[-6:]) / min(6, len(volumes)) if len(volumes) >= 6 else 0.0

    vol_ratio_6d = avg_vol_6d / avg_vol_60d if avg_vol_60d > 0 else 0.0
    vol_ratio_1d = today_vol / avg_vol_60d if avg_vol_60d > 0 else 0.0

    fund = fundamentals or {}
    shares_outstanding = fund.get("sharesOutstanding")
    trailing_pe = fund.get("trailingPE") or fund.get("forwardPE")
    price_to_book = fund.get("priceToBook")
    market_cap = fund.get("marketCap")

    # Load intraday data for today (hourly OHLCV)
    intra = _load_intraday_today(symbol)
    intra_vol = 0.0
    intra_high = 0.0
    intra_low = 0.0
    intra_open = 0.0
    intra_turnover = None
    if intra:
        intra_vol = intra["volume"]
        intra_high = intra["high"]
        intra_low = intra["low"]
        intra_open = intra["open"]
        # Intraday turnover: cumulative today volume / shares outstanding * 100
        if shares_outstanding and shares_outstanding > 0 and intra_vol > 0:
            intra_turnover = (intra_vol / shares_outstanding) * 100

    # Daily turnover from historical data (used for safe harbors and daily scoring)
    turnover_6d = None
    turnover_1d = None
    if shares_outstanding and shares_outstanding > 0:
        turnover_1d = (today_vol / shares_outstanding) * 100
        vol_6d_sum = sum(volumes[-6:]) if len(volumes) >= 6 else sum(volumes)
        turnover_6d = (vol_6d_sum / shares_outstanding) * 100

    return StockMetrics(
        symbol=symbol, sector=sector,
        closes=closes, volumes=volumes,
        latest_price=latest_price,
        change_6d_pct=change_6d_pct, change_30d_pct=change_30d_pct,
        change_60d_pct=change_60d_pct, change_90d_pct=change_90d_pct,
        change_6d_ntd=change_6d_ntd,
        price_is_6d_high=price_is_6d_high, price_is_6d_low=price_is_6d_low,
        avg_vol_60d=avg_vol_60d, avg_vol_6d=avg_vol_6d,
        today_vol=today_vol,
        vol_ratio_6d=vol_ratio_6d, vol_ratio_1d=vol_ratio_1d,
        shares_outstanding=shares_outstanding,
        turnover_6d=turnover_6d, turnover_1d=turnover_1d,
        intraday_vol=intra_vol,
        intraday_high=intra_high,
        intraday_low=intra_low,
        intraday_open=intra_open,
        intraday_turnover=intra_turnover,
        today_value=today_value,
        trailing_pe=trailing_pe, price_to_book=price_to_book,
        market_cap=market_cap,
    )


# ---------------------------------------------------------------------------
# Phase 2: Market / sector aggregates
# ---------------------------------------------------------------------------

def _compute_aggregates(all_metrics: list[StockMetrics]) -> MarketAggregates:
    n = len(all_metrics)
    if n == 0:
        return MarketAggregates()

    def _safe_mean(values: list[float]) -> float:
        if not values:
            return 0.0
        return sum(values) / len(values)

    # Market-wide price change averages
    market = MarketAggregates()
    market.market_avg_change_6d = _safe_mean([m.change_6d_pct for m in all_metrics])
    market.market_avg_change_30d = _safe_mean([m.change_30d_pct for m in all_metrics])
    market.market_avg_change_60d = _safe_mean([m.change_60d_pct for m in all_metrics])
    market.market_avg_change_90d = _safe_mean([m.change_90d_pct for m in all_metrics])
    market.market_avg_vol_ratio_6d = _safe_mean([m.vol_ratio_6d for m in all_metrics])
    market.market_avg_vol_ratio_1d = _safe_mean([m.vol_ratio_1d for m in all_metrics])

    # Turnover averages
    turnovers_6d = [m.turnover_6d for m in all_metrics if m.turnover_6d is not None]
    turnovers_1d = [m.turnover_1d for m in all_metrics if m.turnover_1d is not None]
    market.market_avg_turnover_6d = _safe_mean(turnovers_6d)
    market.market_avg_turnover_1d = _safe_mean(turnovers_1d)

    # Weighted P/E and P/B (by market cap)
    pe_weighted_sum = 0.0
    pb_weighted_sum = 0.0
    total_cap = 0.0
    for m in all_metrics:
        cap = m.market_cap or 0
        if m.trailing_pe is not None and m.trailing_pe > 0 and cap > 0:
            pe_weighted_sum += m.trailing_pe * cap
            total_cap += cap
    market.market_weighted_pe = pe_weighted_sum / total_cap if total_cap > 0 else 0.0

    total_cap = 0.0
    for m in all_metrics:
        cap = m.market_cap or 0
        if m.price_to_book is not None and m.price_to_book > 0 and cap > 0:
            pb_weighted_sum += m.price_to_book * cap
            total_cap += cap
    market.market_weighted_pb = pb_weighted_sum / total_cap if total_cap > 0 else 0.0

    # Group by sector
    sectors: dict[str, list[StockMetrics]] = {}
    for m in all_metrics:
        sec = m.sector or "Unknown"
        sectors.setdefault(sec, []).append(m)

    for sec, sec_metrics in sectors.items():
        market.sector_size[sec] = len(sec_metrics)
        market.sector_avg_change_6d[sec] = _safe_mean([m.change_6d_pct for m in sec_metrics])
        market.sector_avg_change_30d[sec] = _safe_mean([m.change_30d_pct for m in sec_metrics])
        market.sector_avg_change_60d[sec] = _safe_mean([m.change_60d_pct for m in sec_metrics])
        market.sector_avg_change_90d[sec] = _safe_mean([m.change_90d_pct for m in sec_metrics])
        market.sector_avg_vol_ratio_6d[sec] = _safe_mean([m.vol_ratio_6d for m in sec_metrics])

        sec_t_6d = [m.turnover_6d for m in sec_metrics if m.turnover_6d is not None]
        sec_t_1d = [m.turnover_1d for m in sec_metrics if m.turnover_1d is not None]
        market.sector_avg_turnover_6d[sec] = _safe_mean(sec_t_6d)
        market.sector_avg_turnover_1d[sec] = _safe_mean(sec_t_1d)

        sec_pb = [m.price_to_book for m in sec_metrics
                  if m.price_to_book is not None and m.price_to_book > 0]
        market.sector_avg_pb[sec] = _safe_mean(sec_pb)

    return market


# ---------------------------------------------------------------------------
# Phase 3: Per-article scoring
# ---------------------------------------------------------------------------

def _score_article_2(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 2: 6-day cumulative price change >= 32% (or 25% + NT$50 diff),
       differs from market AND sector by >= 20%."""
    if len(m.closes) < 6:
        return ArticleResult("Art 2", "6-day cumulative price change", False,
                             fully_computed=False,
                             details={"error": "Insufficient history"})

    change = m.change_6d_pct
    ntd_diff = m.change_6d_ntd
    market_div = abs(change - agg.market_avg_change_6d)
    sector_div = abs(change - agg.sector_avg_change_6d.get(m.sector, agg.market_avg_change_6d))
    is_32pct = change >= 32.0
    is_25pct_ntd50 = change >= 25.0 and ntd_diff >= 50.0
    price_ok = is_32pct or is_25pct_ntd50
    divergence_ok = market_div >= 20.0 and sector_div >= 20.0
    triggered = price_ok and divergence_ok

    # Exceptions: price < NT$5, negative P/E, P/E >= 60x
    if m.latest_price < 5.0:
        triggered = False
    if m.trailing_pe is not None and (m.trailing_pe < 0 or m.trailing_pe >= 60):
        triggered = False

    score = _clamp((change / 50.0) * 100)
    return ArticleResult(
        article="Art 2", description="6-day cumulative price change",
        triggered=triggered, score_contribution=score,
        details={
            "6d_change_pct": round(change, 2),
            "6d_ntd_diff": round(ntd_diff, 2),
            "threshold_32pct": is_32pct,
            "threshold_25pct_ntd50": is_25pct_ntd50,
            "market_divergence": round(market_div, 2),
            "sector_divergence": round(sector_div, 2),
        })


def _score_article_3(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 3: 30/60/90-day cumulative price change extremes."""
    windows = [("30d", 30, 100.0, 85.0), ("60d", 60, 130.0, 110.0),
               ("90d", 90, 160.0, 135.0)]
    triggered = False
    best_info = {}

    for label, days, price_threshold, div_threshold in windows:
        if len(m.closes) < days:
            continue
        change = abs(_pct_change(m.closes[-days], m.closes[-1]))
        market_avg = getattr(agg, f"market_avg_change_{label}", 0.0)
        sector_avg = agg.sector_avg_change_30d if label == "30d" else \
                     agg.sector_avg_change_60d if label == "60d" else \
                     agg.sector_avg_change_90d
        sector_avg = sector_avg.get(m.sector, market_avg)
        market_div = abs(change - market_avg)
        sector_div = abs(change - sector_avg)
        price_ok = change > price_threshold
        divergence_ok = market_div >= div_threshold and sector_div >= div_threshold
        # Must also be above/below opening reference price (close > open of latest day)
        direction_ok = len(m.closes) >= days and \
            ((change > 0 and m.closes[-1] > m.closes[-1]) or True)

        window_triggered = price_ok and divergence_ok
        if window_triggered:
            triggered = True
            best_info = {
                "window": label, "change_pct": round(change, 2),
                "price_threshold": price_threshold,
                "market_divergence": round(market_div, 2),
                "sector_divergence": round(sector_div, 2),
                "divergence_threshold": div_threshold,
            }

    best_change = max(
        abs(_pct_change(m.closes[-min(30, len(m.closes))], m.closes[-1])) if len(m.closes) >= 30 else 0,
        abs(_pct_change(m.closes[-min(60, len(m.closes))], m.closes[-1])) if len(m.closes) >= 60 else 0,
        abs(_pct_change(m.closes[-min(90, len(m.closes))], m.closes[-1])) if len(m.closes) >= 90 else 0,
    )
    score = _clamp((best_change / 200.0) * 100)

    return ArticleResult(
        article="Art 3", description="Long-term price extreme (30/60/90d)",
        triggered=triggered, score_contribution=score, details=best_info)


def _score_article_4(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 4: 6-day price change > 25% + volume >= 5x 60d avg."""
    if len(m.closes) < 6 or len(m.volumes) < 60:
        return ArticleResult("Art 4", "Price surge + volume spike", False,
                             caveat="Insufficient history")

    price_change = m.change_6d_pct
    price_div_market = abs(price_change - agg.market_avg_change_6d)
    price_div_sector = abs(price_change - agg.sector_avg_change_6d.get(m.sector, agg.market_avg_change_6d))
    price_ok = price_change >= 25.0 and price_div_market >= 20.0 and price_div_sector >= 20.0

    vol_ok = m.vol_ratio_1d >= 5.0
    vol_div_market = m.vol_ratio_1d - agg.market_avg_vol_ratio_1d
    vol_div_ok = vol_div_market >= 4.0

    triggered = price_ok and vol_ok and vol_div_ok

    price_score = _clamp((price_change / 50.0) * 100)
    vol_score = _clamp(((m.vol_ratio_1d - 1) / 9.0) * 100 if m.vol_ratio_1d > 1 else 0)
    score = (price_score * 0.5 + vol_score * 0.5) if price_ok else vol_score * 0.3

    return ArticleResult(
        article="Art 4", description="Price surge + volume spike",
        triggered=triggered, score_contribution=_clamp(score),
        details={
            "6d_price_change_pct": round(price_change, 2),
            "price_market_divergence": round(price_div_market, 2),
            "price_sector_divergence": round(price_div_sector, 2),
            "today_volume": int(m.today_vol),
            "avg_volume_60d": round(m.avg_vol_60d, 0),
            "volume_ratio": round(m.vol_ratio_1d, 2),
            "volume_market_divergence": round(vol_div_market, 2),
        })


def _score_article_5(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 5: 6-day price change > 25% + intraday turnover >= 10%."""
    if len(m.closes) < 6:
        return ArticleResult("Art 5", "Price surge + high turnover", False,
                             caveat="Insufficient history")

    price_change = m.change_6d_pct
    price_div_market = abs(price_change - agg.market_avg_change_6d)
    price_div_sector = abs(price_change - agg.sector_avg_change_6d.get(m.sector, agg.market_avg_change_6d))
    price_ok = price_change >= 25.0 and price_div_market >= 20.0 and price_div_sector >= 20.0

    if m.turnover_1d is None:
        # Exception: Negative P/E or P/E >= 60x waives this article
        pe_exempt = m.trailing_pe is not None and (m.trailing_pe < 0 or m.trailing_pe >= 60)
        return ArticleResult(
            article="Art 5", description="Price surge + high intraday turnover",
            triggered=False, fully_computed=False,
            score_contribution=_clamp((price_change / 50.0) * 50),
            details={"6d_change_pct": round(price_change, 2), "price_threshold_met": price_ok,
                     "pe_exempt": pe_exempt},
            caveat="Turnover rate requires shares outstanding — price signal only"
        )

    turnover_ok = m.turnover_1d >= 10.0
    turnover_div = m.turnover_1d - agg.market_avg_turnover_1d
    turnover_div_ok = turnover_div >= 5.0
    triggered = price_ok and turnover_ok and turnover_div_ok

    # Exception: Negative P/E or P/E >= 60x
    if m.trailing_pe is not None and (m.trailing_pe < 0 or m.trailing_pe >= 60):
        triggered = False

    price_score = _clamp((price_change / 50.0) * 100)
    turnover_score = _clamp((m.turnover_1d / 20.0) * 100) if m.turnover_1d else 0
    score = (price_score * 0.5 + turnover_score * 0.5)

    return ArticleResult(
        article="Art 5", description="Price surge + high intraday turnover",
        triggered=triggered, score_contribution=_clamp(score),
        details={
            "6d_change_pct": round(price_change, 2),
            "intraday_turnover_pct": round(m.turnover_1d, 2) if m.turnover_1d else None,
            "turnover_market_divergence": round(turnover_div, 2) if m.turnover_1d else None,
        })


def _score_article_6(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 6: Price + broker day-trading concentration. STUB."""
    return ArticleResult(
        article="Art 6",
        description="Price surge + concentrated day trading",
        triggered=False, fully_computed=False,
        caveat="Cannot compute: requires TWSE per-broker day trading volume data"
    )


def _score_article_7(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 7: P/E, P/B, turnover, concentration extremes."""
    if m.trailing_pe is None or m.price_to_book is None:
        return ArticleResult(
            article="Art 7",
            description="P/E, P/B, turnover concentration extremes",
            triggered=False, fully_computed=False,
            details={"pe": m.trailing_pe, "pb": m.price_to_book},
            caveat="P/E or P/B data not cached; run fundamentals refresh"
        )

    pe_ok = (m.trailing_pe < 0 or m.trailing_pe >= 60) and \
            (agg.market_weighted_pe > 0 and m.trailing_pe >= 2 * agg.market_weighted_pe)
    pb_ok = m.price_to_book >= 6.0 and \
            (agg.market_weighted_pb > 0 and m.price_to_book >= 2 * agg.market_weighted_pb)
    turnover_ok = m.turnover_1d is not None and m.turnover_1d >= 5.0 and m.today_vol >= 3000
    sector_pb = agg.sector_avg_pb.get(m.sector, 0)
    pb_extreme = sector_pb > 0 and m.price_to_book > 4 * sector_pb

    triggered = pe_ok and pb_ok and turnover_ok and pb_extreme

    score = 0.0
    if pe_ok: score += 25
    if pb_ok: score += 25
    if turnover_ok: score += 25
    if pb_extreme: score += 25

    return ArticleResult(
        article="Art 7",
        description="P/E, P/B, turnover concentration extremes",
        triggered=triggered, score_contribution=score,
        details={
            "pe": round(m.trailing_pe, 2), "market_weighted_pe": round(agg.market_weighted_pe, 2),
            "pe_ok": pe_ok,
            "pb": round(m.price_to_book, 2), "market_weighted_pb": round(agg.market_weighted_pb, 2),
            "pb_ok": pb_ok,
            "turnover_pct": round(m.turnover_1d, 2) if m.turnover_1d else None,
            "turnover_ok": turnover_ok,
            "sector_pb": round(sector_pb, 2), "pb_4x_sector_ok": pb_extreme,
        },
        caveat="Broker/investor concentration (condition 4b/4c) not checked"
    )


def _score_article_8(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 8: Price + margin/short ratios. STUB."""
    return ArticleResult(
        article="Art 8",
        description="Price surge + extreme margin/short ratios",
        triggered=False, fully_computed=False,
        caveat="Cannot compute: requires TWSE margin trading and short selling data"
    )


def _score_article_9(m: StockMetrics) -> ArticleResult:
    """Art 9: TDR premium/discount. STUB."""
    return ArticleResult(
        article="Art 9",
        description="TDR premium/discount irregularity",
        triggered=False, fully_computed=False,
        caveat="Cannot compute: requires TDR reference price data"
    )


def _score_article_10(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 10: 6-day avg volume >= 5x 60d avg + daily >= 5x 60d avg."""
    if len(m.volumes) < 60:
        return ArticleResult("Art 10", "Sustained volume surge", False,
                             caveat="Insufficient history")

    ratio_6d = m.vol_ratio_6d
    ratio_1d = m.vol_ratio_1d
    market_div_6d = ratio_6d - agg.market_avg_vol_ratio_6d
    market_div_1d = ratio_1d - agg.market_avg_vol_ratio_1d

    volume_ok = ratio_6d >= 5.0 and ratio_1d >= 5.0
    divergence_ok = market_div_6d >= 4.0 and market_div_1d >= 4.0
    triggered = volume_ok and divergence_ok

    # Exceptions: turnover < 0.1%, volume < 500, value < NT$30M
    if m.turnover_1d is not None and m.turnover_1d < 0.1:
        triggered = False
    if m.today_vol < 500:
        triggered = False
    if m.today_value < 30_000_000:
        triggered = False

    score = _clamp(((max(ratio_6d, ratio_1d) - 1) / 9.0) * 100)

    return ArticleResult(
        article="Art 10", description="Sustained volume surge (6d+1d vs 60d)",
        triggered=triggered, score_contribution=score,
        details={
            "6d_vs_60d_ratio": round(ratio_6d, 2),
            "1d_vs_60d_ratio": round(ratio_1d, 2),
            "market_div_6d": round(market_div_6d, 2),
            "market_div_1d": round(market_div_1d, 2),
        })


def _score_article_11(m: StockMetrics, agg: MarketAggregates) -> ArticleResult:
    """Art 11: 6-day cumulative turnover > 50% + intraday >= 10%."""
    if m.turnover_6d is None or m.turnover_1d is None:
        return ArticleResult(
            article="Art 11", description="High cumulative turnover rate",
            triggered=False, fully_computed=False,
            caveat="Turnover rate requires shares outstanding data"
        )

    turnover_6d_ok = m.turnover_6d > 50.0
    turnover_6d_div = m.turnover_6d - agg.market_avg_turnover_6d
    div_6d_ok = turnover_6d_div >= 40.0

    turnover_1d_ok = m.turnover_1d >= 10.0
    turnover_1d_div = m.turnover_1d - agg.market_avg_turnover_1d
    div_1d_ok = turnover_1d_div >= 5.0

    triggered = turnover_6d_ok and div_6d_ok and turnover_1d_ok and div_1d_ok

    # Exception: value < NT$500M
    if m.today_value < 500_000_000:
        triggered = False

    score = _clamp(((m.turnover_6d / 100.0) * 100))

    return ArticleResult(
        article="Art 11", description="High cumulative turnover rate",
        triggered=triggered, score_contribution=score,
        details={
            "turnover_6d_pct": round(m.turnover_6d, 2),
            "turnover_6d_market_div": round(turnover_6d_div, 2),
            "turnover_1d_pct": round(m.turnover_1d, 2),
            "turnover_1d_market_div": round(turnover_1d_div, 2),
        })


def _score_article_12(m: StockMetrics) -> ArticleResult:
    """Art 12: 6-day NT$ price difference with sliding scale."""
    if len(m.closes) < 6:
        return ArticleResult("Art 12", "Extreme NT$ price swing", False,
                             caveat="Insufficient history")

    price_diff = m.change_6d_ntd
    current_price = m.latest_price

    if current_price < 500:
        threshold = 100.0
    else:
        brackets = math.floor((current_price - 500) / 500) + 1
        threshold = 100.0 + brackets * 25.0

    triggered = price_diff >= threshold and (m.price_is_6d_high or m.price_is_6d_low)
    score = _clamp((price_diff / (threshold * 2)) * 100)

    return ArticleResult(
        article="Art 12", description="Extreme 6-day NT$ price swing",
        triggered=triggered, score_contribution=score,
        details={
            "6d_price_diff_ntd": round(price_diff, 2),
            "threshold_ntd": round(threshold, 2),
            "current_price": round(current_price, 2),
            "is_6d_high": m.price_is_6d_high,
            "is_6d_low": m.price_is_6d_low,
        })


def _score_article_13(m: StockMetrics) -> ArticleResult:
    """Art 13: Borrowed securities sales. STUB."""
    return ArticleResult(
        article="Art 13",
        description="High percentage of borrowed securities sales",
        triggered=False, fully_computed=False,
        caveat="Cannot compute: requires TWSE borrowed securities sales data"
    )


def _score_article_14(m: StockMetrics) -> ArticleResult:
    """Art 14: Day trading volume. STUB."""
    return ArticleResult(
        article="Art 14",
        description="Extremely high day trading volume",
        triggered=False, fully_computed=False,
        caveat="Cannot compute: requires TWSE day trading volume breakdown"
    )


# ---------------------------------------------------------------------------
# Safe harbors
# ---------------------------------------------------------------------------

def _apply_safe_harbors(m: StockMetrics, sector_size: int) -> tuple[bool, list[str]]:
    """Check all computable safe harbor conditions. Returns (is_safe, reasons)."""
    reasons = []
    if m.latest_price < 5.0:
        reasons.append("Price < NT$5")
    if m.today_vol < 500:
        reasons.append("Volume < 500 units")
    if m.turnover_1d is not None and m.turnover_1d < 0.1:
        reasons.append("Intraday turnover < 0.1%")
    if sector_size > 0 and sector_size < 5:
        reasons.append(f"Sector < 5 stocks ({sector_size})")
    if _is_derivative(m.symbol):
        reasons.append("Derivative/non-ordinary share")

    return len(reasons) > 0, reasons


# ---------------------------------------------------------------------------
# Decision tree
# ---------------------------------------------------------------------------

def _apply_decision_tree(article_results: list[ArticleResult],
                         safe_harbor: bool,
                         safe_harbor_reasons: list[str],
                         sector_size: int) -> DecisionResult:
    """Implement the decision tree from the article."""
    triggered_articles = [r.article for r in article_results if r.triggered]
    exceptions = list(safe_harbor_reasons)

    if not triggered_articles:
        return DecisionResult("NO_ACTION", exceptions_applied=exceptions)

    if safe_harbor:
        return DecisionResult("SAFE_HARBOR", triggered_articles, exceptions)

    if sector_size > 0 and sector_size < 5:
        return DecisionResult("SECTOR_WAIVED", triggered_articles, exceptions,
                              {"note": "Sector comparisons waived, flag still applies"})

    return DecisionResult("FLAGGED", triggered_articles, exceptions)


# ---------------------------------------------------------------------------
# Scoring aggregation
# ---------------------------------------------------------------------------

# _ARTICLE_WEIGHTS = {
#     "Art 2": 2.0, "Art 3": 2.0, "Art 4": 2.5, "Art 5": 2.0,
#     "Art 6": 0.5, "Art 7": 2.5, "Art 8": 0.5, "Art 9": 0.5,
#     "Art 10": 1.5, "Art 11": 2.0, "Art 12": 1.5,
#     "Art 13": 0.5, "Art 14": 0.5,
# }

_ARTICLE_WEIGHTS = {
    "Art 2": 1.0, "Art 3": 1.0, "Art 4": 1.0, "Art 5": 1.0,
    "Art 6": 1.0, "Art 7": 1.0, "Art 8": 1.0, "Art 9": 1.0,
    "Art 10": 1.0, "Art 11": 1.0, "Art 12": 1.0,
    "Art 13": 1.0, "Art 14": 1.0,
}


def _compute_total_score(results: list[ArticleResult], decision: str,
                         safe_harbor: bool) -> float:
    # Only zero out for true exemptions (safe harbor). Otherwise, the total
    # reflects the strongest article signal even if no article fully triggers.
    if safe_harbor:
        return 0.0
    return max(r.score_contribution for r in results)

def _risk_level(score: float) -> str:
    if score >= 70:
        return "CRITICAL"
    elif score >= 45:
        return "HIGH"
    elif score >= 20:
        return "MEDIUM"
    return "LOW"


# ---------------------------------------------------------------------------
# Single-stock scoring with context
# ---------------------------------------------------------------------------

def score_stock_with_context(m: StockMetrics, agg: MarketAggregates) -> dict:
    """Score a single stock with full market/sector context."""
    sector_size = agg.sector_size.get(m.sector, 0)
    safe_harbor, safe_harbor_reasons = _apply_safe_harbors(m, sector_size)

    article_funcs = [
        _score_article_2, _score_article_3, _score_article_4,
        _score_article_5, _score_article_6, _score_article_7,
        _score_article_8, _score_article_9, _score_article_10,
        _score_article_11, _score_article_12, _score_article_13,
        _score_article_14,
    ]

    # Articles that require MarketAggregates
    needs_agg = {"Art 2", "Art 3", "Art 4", "Art 5", "Art 7", "Art 10", "Art 11"}
    # Articles that only need StockMetrics
    no_agg = {"Art 6", "Art 8", "Art 9", "Art 12", "Art 13", "Art 14"}

    results = []
    for func in article_funcs:
        art_num = func.__name__.replace("_score_", "").replace("article_", "Art ")
        # Determine if this function needs MarketAggregates
        sig = func.__code__.co_varnames[:func.__code__.co_argcount]
        if "agg" in sig:
            results.append(func(m, agg))
        else:
            results.append(func(m))

    decision = _apply_decision_tree(results, safe_harbor, safe_harbor_reasons, sector_size)
    total_score = _compute_total_score(results, decision.classification, safe_harbor)

    return {
        "symbol": m.symbol,
        "total_score": round(total_score, 1),
        "risk_level": _risk_level(total_score),
        "safe_harbor": safe_harbor,
        "safe_harbor_reasons": safe_harbor_reasons,
        "decision": decision.classification,
        "triggered_articles": decision.triggered_articles,
        "signals": [
            {
                "article": r.article,
                "description": r.description,
                "triggered": r.triggered,
                "fully_computed": r.fully_computed,
                "score_contribution": round(r.score_contribution, 1),
                "details": r.details,
                "caveat": r.caveat,
            }
            for r in results
        ],
    }


# ---------------------------------------------------------------------------
# Full scan orchestration
# ---------------------------------------------------------------------------

# In-memory cache
_scan_cache: dict | None = None
_scan_cache_time: datetime | None = None
_CACHE_TTL_SECONDS = 300


def _get_cached_scan() -> tuple[list[StockMetrics], MarketAggregates] | None:
    global _scan_cache, _scan_cache_time
    if _scan_cache and _scan_cache_time:
        age = (datetime.now() - _scan_cache_time).total_seconds()
        if age < _CACHE_TTL_SECONDS:
            return _scan_cache.get("metrics", []), _scan_cache.get("aggregates")
    return None


def _set_cached_scan(metrics: list[StockMetrics], aggregates: MarketAggregates):
    global _scan_cache, _scan_cache_time
    _scan_cache = {"metrics": metrics, "aggregates": aggregates}
    _scan_cache_time = datetime.now()


def refresh_scan_cache():
    """Force rebuild the in-memory supervision cache."""
    global _scan_cache, _scan_cache_time
    _scan_cache = None
    _scan_cache_time = None


def run_supervision_scan(force_refresh: bool = False) -> list[dict]:
    """
    Full two-phase supervision scan across all stocks with cached historical data.

    Phase 1: Load OHLCV + fundamentals, compute StockMetrics per stock.
    Phase 2: Compute MarketAggregates.
    Phase 3: Score each stock with full context.

    Results are cached in memory for 5 minutes.
    """
    if not force_refresh:
        cached = _get_cached_scan()
        if cached:
            metrics_list, aggregates = cached
            results = [score_stock_with_context(m, aggregates) for m in metrics_list]
            results.sort(key=lambda x: x["total_score"], reverse=True)
            return results

    sector_map = _load_sector_map()
    names = _load_ticker_names()
    fundamentals_map = load_fundamentals_map()

    all_metrics: list[StockMetrics] = []
    loaded_sectors = set()

    for filename in os.listdir(DATA_DIR):
        if not filename.endswith("_historical_5y.txt"):
            continue
        ticker_part = filename.replace("_historical_5y.txt", "")
        symbol = ticker_part.split(".")[0]
        # Skip bonds and mutual funds
        if symbol.startswith("TW000T") or (len(symbol) >= 4 and symbol.endswith("B")):
            continue
        records = _load_ohlcv(symbol)
        if not records:
            continue

        sector = sector_map.get(symbol, "Unknown")
        loaded_sectors.add(sector)
        fundamentals = fundamentals_map.get(symbol)

        metrics = _compute_stock_metrics(symbol, sector, records, fundamentals)
        if metrics:
            all_metrics.append(metrics)

    if not all_metrics:
        return []

    aggregates = _compute_aggregates(all_metrics)
    # Override sector sizes from the full sector map (more accurate than loaded-stock counts)
    for sec, count in _count_sector_sizes(sector_map).items():
        aggregates.sector_size[sec] = count
    _set_cached_scan(all_metrics, aggregates)

    results = [score_stock_with_context(m, aggregates) for m in all_metrics]

    # Attach names
    for r in results:
        r["name"] = names.get(r["symbol"], "Unknown")

    results.sort(key=lambda x: x["total_score"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Backward-compatible public API
# ---------------------------------------------------------------------------

def score_stock(symbol: str, name: str = "") -> dict:
    """Score a single stock.
    Uses cached full-scan aggregates when available for consistency with the table view.
    Falls back to single-stock aggregates only when no scan cache exists.
    """
    records = _load_ohlcv(symbol)
    if not records:
        return {
            "symbol": symbol, "name": name, "total_score": 0.0,
            "risk_level": "UNKNOWN", "signals": [], "triggered_articles": [],
            "safe_harbor": False, "safe_harbor_reasons": [],
        }

    sector_map = _load_sector_map()
    fundamentals_map = load_fundamentals_map()
    sector = sector_map.get(symbol, "Unknown")
    fundamentals = fundamentals_map.get(symbol)

    metrics = _compute_stock_metrics(symbol, sector, records, fundamentals)
    if not metrics:
        return {
            "symbol": symbol, "name": name, "total_score": 0.0,
            "risk_level": "UNKNOWN", "signals": [], "triggered_articles": [],
            "safe_harbor": False, "safe_harbor_reasons": [],
        }

    # Prefer cached full-scan aggregates for consistency with the table view
    cached = _get_cached_scan()
    if cached:
        _cached_metrics, aggregates = cached
        # Find this stock's metrics in the cache, or compute fresh
        cached_m = next((m for m in _cached_metrics if m.symbol == symbol), None)
        if cached_m:
            metrics = cached_m
    else:
        aggregates = _compute_aggregates([metrics])
        for sec, count in _count_sector_sizes(sector_map).items():
            aggregates.sector_size[sec] = count

    result = score_stock_with_context(metrics, aggregates)
    if name:
        result["name"] = name
    return result


def scan_all_stocks() -> list[dict]:
    """Scan all stocks with cached historical data. Backward-compatible wrapper."""
    return run_supervision_scan()


# ---------------------------------------------------------------------------
# 30-day backtest — flag stocks that triggered at any point in the last 30 days
# ---------------------------------------------------------------------------

def backtest_stock_30d(symbol: str) -> dict:
    """
    Score a stock on each of the last 30 trading days.
    Returns daily scores plus a summary of whether it was flagged at any point.
    """
    records = _load_ohlcv(symbol)
    if not records or len(records) < 66:  # need 60d history + up to 30 lookback
        return {"symbol": symbol, "backtest_days": 0, "flagged_30d": False,
                "max_score_30d": 0, "daily": []}

    sector_map = _load_sector_map()
    fundamentals_map = load_fundamentals_map()
    sector = sector_map.get(symbol, "Unknown")
    fundamentals = fundamentals_map.get(symbol)

    # Use cached full-scan aggregates for consistency, or build from single stock
    cached = _get_cached_scan()
    if cached:
        _, aggregates = cached
    else:
        # Build aggregates once from full data
        metrics_full = _compute_stock_metrics(symbol, sector, records, fundamentals)
        if not metrics_full:
            return {"symbol": symbol, "backtest_days": 0, "flagged_30d": False,
                    "max_score_30d": 0, "daily": []}
        aggregates = _compute_aggregates([metrics_full])
        for sec, count in _count_sector_sizes(sector_map).items():
            aggregates.sector_size[sec] = count

    daily = []
    flagged_30d = False
    max_score = 0.0
    lookback = min(30, len(records) - 60)

    for i in range(lookback):
        idx = len(records) - lookback + i
        # Slice records up to this day (inclusive)
        window = records[:idx + 1]
        if len(window) < 60:
            continue

        metrics = _compute_stock_metrics(symbol, sector, window, fundamentals)
        if not metrics:
            continue

        result = score_stock_with_context(metrics, aggregates)
        triggered = result.get("triggered_articles", [])
        score = result["total_score"]
        max_score = max(max_score, score)

        if triggered:
            flagged_30d = True

        daily.append({
            "date": window[-1]["date"],
            "total_score": score,
            "risk_level": result["risk_level"],
            "triggered": triggered,
        })

    return {
        "symbol": symbol,
        "backtest_days": len(daily),
        "flagged_30d": flagged_30d,
        "max_score_30d": round(max_score, 1),
        "triggered_days": sum(1 for d in daily if d["triggered"]),
        "daily": daily,
    }


def backtest_all_30d() -> list[dict]:
    """
    Run 30-day backtest across all stocks with historical data.
    Returns summary per stock (without daily detail, for table view).
    """
    results = []
    names = _load_ticker_names()
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith("_historical_5y.txt"):
            continue
        ticker_part = filename.replace("_historical_5y.txt", "")
        symbol = ticker_part.split(".")[0]
        if symbol.startswith("TW000T") or (len(symbol) >= 4 and symbol.endswith("B")):
            continue

        bt = backtest_stock_30d(symbol)
        if bt["backtest_days"] > 0:
            results.append({
                "symbol": symbol,
                "name": names.get(symbol, "Unknown"),
                "flagged_30d": bt["flagged_30d"],
                "max_score_30d": bt["max_score_30d"],
                "triggered_days": bt["triggered_days"],
            })

    results.sort(key=lambda r: (r["flagged_30d"], r["max_score_30d"]), reverse=True)
    return results


# ---------------------------------------------------------------------------
# Article definitions for API
# ---------------------------------------------------------------------------

ARTICLE_DEFINITIONS = [
    {"article": "Art 2", "name": "6-day cumulative price change",
     "computable": True,
     "thresholds": {"change_6d_pct": ">= 32% or (>= 25% + NT$50 diff)",
                    "divergence_market_sector": ">= 20%"},
     "exceptions": ["Price < NT$5", "Negative P/E", "P/E >= 60x",
                    "Premium/Discount <= 10% opposite direction"]},
    {"article": "Art 3", "name": "Long-term price extremes",
     "computable": True,
     "thresholds": {"30d": "> 100% change, > 85% divergence",
                    "60d": "> 130% change, > 110% divergence",
                    "90d": "> 160% change, > 135% divergence"}},
    {"article": "Art 4", "name": "Price surge + volume spike",
     "computable": True,
     "thresholds": {"price": "6d > 25% (diverge market/sector >= 20%)",
                    "volume": ">= 5x 60d avg (diverge market >= 4x)"}},
    {"article": "Art 5", "name": "Price surge + high intraday turnover",
     "computable": False, "computable_note": "Needs shares outstanding for turnover rate",
     "thresholds": {"price": "6d > 25% (diverge market/sector >= 20%)",
                    "turnover": ">= 10% (diverge market >= 5%)"},
     "exceptions": ["Negative P/E", "P/E >= 60x"]},
    {"article": "Art 6", "name": "Price surge + concentrated day trading",
     "computable": False, "computable_note": "Requires TWSE broker concentration data",
     "data_required": ["Per-broker day trading volume"]},
    {"article": "Art 7", "name": "P/E, P/B, turnover, concentration extremes",
     "computable": False, "computable_note": "Partially computable; broker/investor concentration stubbed",
     "thresholds": {"pe": "Negative or >= 60x AND >= 2x market weighted avg",
                    "pb": ">= 6.0 AND >= 2x market weighted avg",
                    "turnover": ">= 5%, volume >= 3000",
                    "concentration": "PB > 4x sector OR broker >= 10% OR investor >= 10%"},
     "data_required": ["Broker concentration %", "Investor concentration %"]},
    {"article": "Art 8", "name": "Price surge + extreme margin/short ratios",
     "computable": False,
     "data_required": ["Long/short ratio", "Margin utilization", "Stock loan rate"]},
    {"article": "Art 9", "name": "TDR premium/discount irregularity",
     "computable": False,
     "data_required": ["TDR reference price", "TDR premium/discount %"]},
    {"article": "Art 10", "name": "Sustained volume surge",
     "computable": True,
     "thresholds": {"6d_avg_vol": ">= 5x 60d avg (diverge market >= 4x)",
                    "1d_vol": ">= 5x 60d avg (diverge market >= 4x)"},
     "exceptions": ["Turnover < 0.1%", "Volume < 500", "Value < NT$30M"]},
    {"article": "Art 11", "name": "High cumulative turnover rate",
     "computable": False, "computable_note": "Needs shares outstanding for turnover rate",
     "thresholds": {"6d_turnover": "> 50% (diverge market >= 40%)",
                    "1d_turnover": ">= 10% (diverge market >= 5%)"},
     "exceptions": ["Value < NT$500M"]},
    {"article": "Art 12", "name": "Extreme 6-day NT$ price swing",
     "computable": True,
     "thresholds": {"price_diff": ">= NT$100 (sliding scale for >= NT$500)",
                    "must_be_6d_high_or_low": True}},
    {"article": "Art 13", "name": "High borrowed securities sales",
     "computable": False,
     "data_required": ["Borrowed securities sales volume", "60d avg borrowed sales"]},
    {"article": "Art 14", "name": "Extremely high day trading volume",
     "computable": False,
     "data_required": ["Day trading volume breakdown"]},
]
