"""
Regulatory supervision scoring based on TWSE monitoring criteria.
Computes per-article risk signals from available OHLCV data.

Articles fully computable from OHLCV:
  Art 2  — 6-day cumulative price change vs market/sector
  Art 3  — 30/60/90-day cumulative price change vs market/sector
  Art 4  — 6-day price change + volume surge vs 60-day avg
  Art 10 — 6-day avg volume vs 60-day avg volume
  Art 12 — 6-day raw NT$ price difference (sliding scale for >NT$500)

Articles partially computable (flagged with caveats):
  Art 5  — price change computable; turnover needs shares outstanding
  Art 11 — volume surge computable; turnover needs shares outstanding

Articles requiring external data (not scored):
  Art 6  — broker concentration data
  Art 7  — P/E, P/B, broker/investor concentration
  Art 8  — margin/short lending ratios
  Art 9  — TDR premium/discount
  Art 13 — borrowed securities sales data
  Art 14 — day trading volume breakdown
"""

import os
import math
from dataclasses import dataclass, field

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _read_lines(filepath: str) -> list[str]:
    """Read a text file with encoding fallback. Returns lines or empty list."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read().splitlines()
    except (UnicodeDecodeError, UnicodeError):
        print(f"Warning: {filepath} has invalid UTF-8, removing to force regeneration")
        try:
            os.remove(filepath)
        except OSError:
            pass
        return []


@dataclass
class ArticleSignal:
    article: str
    description: str
    triggered: bool
    score_contribution: float          # 0–100 partial contribution
    details: dict = field(default_factory=dict)
    caveat: str = ""                   # data limitation note


@dataclass
class SupervisionResult:
    symbol: str
    name: str
    total_score: float                 # 0–100 aggregate risk score
    risk_level: str                    # LOW / MEDIUM / HIGH / CRITICAL
    signals: list[ArticleSignal] = field(default_factory=list)
    triggered_articles: list[str] = field(default_factory=list)
    safe_harbor: bool = False          # True if global exception applies
    safe_harbor_reason: str = ""


def _load_ohlcv(symbol: str) -> list[dict] | None:
    """Load daily OHLCV records for a symbol. Returns None if no file found."""
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


def _load_sector_map() -> dict[str, str]:
    """Returns symbol -> sector mapping."""
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


def _pct_change(start: float, end: float) -> float:
    if start == 0:
        return 0.0
    return ((end - start) / abs(start)) * 100


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _score_article_2(closes: list[float]) -> ArticleSignal:
    """
    Art 2: 6-day cumulative price change >= 25% or 32%.
    Market/sector comparison omitted (no cross-stock data at call time).
    Score scales with how far past the 25% threshold the stock is.
    """
    if len(closes) < 6:
        return ArticleSignal("Art 2", "6-day price surge", False, 0.0,
                             caveat="Insufficient history")

    start = closes[-6]
    end = closes[-1]
    change = abs(_pct_change(start, end))

    triggered = change >= 25.0
    # Score: 0 at 0%, 50 at 25%, 100 at 50%+
    score = _clamp((change / 50.0) * 100)

    return ArticleSignal(
        article="Art 2",
        description="6-day cumulative price change",
        triggered=triggered,
        score_contribution=score,
        details={
            "6d_change_pct": round(change, 2),
            "threshold_25pct": change >= 25.0,
            "threshold_32pct": change >= 32.0,
            "start_price": round(start, 2),
            "end_price": round(end, 2),
        },
        caveat="Market/sector divergence not computed (requires cross-stock scan)"
    )


def _score_article_3(closes: list[float]) -> ArticleSignal:
    """
    Art 3: Long-term price extremes — 30/60/90-day windows.
    Thresholds: 100% / 130% / 160%.
    """
    windows = [(30, 100.0), (60, 130.0), (90, 160.0)]
    best_change = 0.0
    best_window = 0
    triggered = False

    for days, threshold in windows:
        if len(closes) < days:
            continue
        change = abs(_pct_change(closes[-days], closes[-1]))
        if change > best_change:
            best_change = change
            best_window = days
        if change >= threshold:
            triggered = True

    # Score: 0 at 0%, 50 at 100%, 100 at 200%+
    score = _clamp((best_change / 200.0) * 100)

    return ArticleSignal(
        article="Art 3",
        description="Long-term price extreme (30/60/90d)",
        triggered=triggered,
        score_contribution=score,
        details={
            "best_window_days": best_window,
            "best_change_pct": round(best_change, 2),
            "30d_change": round(abs(_pct_change(closes[-30], closes[-1])), 2) if len(closes) >= 30 else None,
            "60d_change": round(abs(_pct_change(closes[-60], closes[-1])), 2) if len(closes) >= 60 else None,
            "90d_change": round(abs(_pct_change(closes[-90], closes[-1])), 2) if len(closes) >= 90 else None,
        },
        caveat="Market/sector divergence not computed"
    )


def _score_article_4(closes: list[float], volumes: list[float]) -> ArticleSignal:
    """
    Art 4: 6-day price change > 25% AND today's volume >= 5x 60-day avg volume.
    """
    if len(closes) < 6 or len(volumes) < 60:
        return ArticleSignal("Art 4", "Price surge + volume spike", False, 0.0,
                             caveat="Insufficient history")

    price_change = abs(_pct_change(closes[-6], closes[-1]))
    avg_vol_60 = sum(volumes[-60:]) / 60
    today_vol = volumes[-1]
    vol_ratio = today_vol / avg_vol_60 if avg_vol_60 > 0 else 0.0

    price_ok = price_change >= 25.0
    vol_ok = vol_ratio >= 5.0
    triggered = price_ok and vol_ok

    # Score: weighted combination
    price_score = _clamp((price_change / 50.0) * 100)
    vol_score = _clamp(((vol_ratio - 1) / 9.0) * 100)  # 1x=0, 5x=44, 10x=100
    score = (price_score * 0.5 + vol_score * 0.5) if price_ok else vol_score * 0.3

    return ArticleSignal(
        article="Art 4",
        description="Price surge + volume spike",
        triggered=triggered,
        score_contribution=_clamp(score),
        details={
            "6d_price_change_pct": round(price_change, 2),
            "today_volume": int(today_vol),
            "avg_volume_60d": round(avg_vol_60, 0),
            "volume_ratio": round(vol_ratio, 2),
        },
        caveat="Market-wide volume comparison not computed"
    )


def _score_article_10(volumes: list[float]) -> ArticleSignal:
    """
    Art 10: 6-day avg volume >= 5x 60-day avg volume.
    """
    if len(volumes) < 60:
        return ArticleSignal("Art 10", "Sustained volume surge", False, 0.0,
                             caveat="Insufficient history")

    avg_vol_60 = sum(volumes[-60:]) / 60
    avg_vol_6 = sum(volumes[-6:]) / 6
    today_vol = volumes[-1]

    ratio_6d = avg_vol_6 / avg_vol_60 if avg_vol_60 > 0 else 0.0
    ratio_1d = today_vol / avg_vol_60 if avg_vol_60 > 0 else 0.0

    triggered = ratio_6d >= 5.0 and ratio_1d >= 5.0

    # Score: 0 at 1x, 50 at 5x, 100 at 10x+
    score = _clamp(((max(ratio_6d, ratio_1d) - 1) / 9.0) * 100)

    return ArticleSignal(
        article="Art 10",
        description="Sustained volume surge (6d avg vs 60d avg)",
        triggered=triggered,
        score_contribution=score,
        details={
            "6d_avg_volume": round(avg_vol_6, 0),
            "60d_avg_volume": round(avg_vol_60, 0),
            "6d_vs_60d_ratio": round(ratio_6d, 2),
            "1d_vs_60d_ratio": round(ratio_1d, 2),
        },
        caveat="Market-wide volume comparison not computed"
    )


def _score_article_12(closes: list[float]) -> ArticleSignal:
    """
    Art 12: 6-day raw NT$ price difference >= NT$100 (sliding scale for >NT$500).
    """
    if len(closes) < 6:
        return ArticleSignal("Art 12", "Extreme NT$ price swing", False, 0.0,
                             caveat="Insufficient history")

    window = closes[-6:]
    price_diff = abs(closes[-1] - closes[-6])
    current_price = closes[-1]
    is_high = closes[-1] == max(window)
    is_low = closes[-1] == min(window)

    # Sliding scale threshold
    if current_price < 500:
        threshold = 100.0
    else:
        brackets = math.floor((current_price - 500) / 500) + 1
        threshold = 100.0 + brackets * 25.0

    triggered = price_diff >= threshold and (is_high or is_low)

    # Score: 0 at 0, 50 at threshold, 100 at 2x threshold
    score = _clamp((price_diff / (threshold * 2)) * 100)

    return ArticleSignal(
        article="Art 12",
        description="Extreme 6-day NT$ price swing",
        triggered=triggered,
        score_contribution=score,
        details={
            "6d_price_diff_ntd": round(price_diff, 2),
            "threshold_ntd": round(threshold, 2),
            "current_price": round(current_price, 2),
            "is_6d_high": is_high,
            "is_6d_low": is_low,
        }
    )


def _score_article_5_partial(closes: list[float]) -> ArticleSignal:
    """
    Art 5: 6-day price change > 25% (turnover component requires shares outstanding).
    Partial signal only.
    """
    if len(closes) < 6:
        return ArticleSignal("Art 5", "Price surge + high turnover (partial)", False, 0.0,
                             caveat="Turnover rate requires shares outstanding data")

    change = abs(_pct_change(closes[-6], closes[-1]))
    triggered = False  # Can't fully trigger without turnover data
    score = _clamp((change / 50.0) * 50)  # Max 50 since partial

    return ArticleSignal(
        article="Art 5",
        description="Price surge + high intraday turnover (partial)",
        triggered=triggered,
        score_contribution=score,
        details={"6d_change_pct": round(change, 2), "price_threshold_met": change >= 25.0},
        caveat="Turnover rate requires shares outstanding — price signal only"
    )


def _apply_safe_harbors(closes: list[float], volumes: list[float]) -> tuple[bool, str]:
    """Check global safe harbor conditions we can evaluate from OHLCV."""
    if not closes:
        return False, ""
    # Price < NT$5
    if closes[-1] < 5.0:
        return True, "Price < NT$5"
    # Volume < 500 units
    if volumes and volumes[-1] < 500:
        return True, "Volume < 500 units"
    return False, ""


def score_stock(symbol: str, name: str = "") -> SupervisionResult:
    """Compute full supervision score for a single stock."""
    records = _load_ohlcv(symbol)
    if not records:
        return SupervisionResult(symbol=symbol, name=name, total_score=0.0,
                                 risk_level="UNKNOWN")

    closes = [r["close"] for r in records]
    volumes = [r["volume"] for r in records]

    safe_harbor, reason = _apply_safe_harbors(closes, volumes)

    signals = [
        _score_article_2(closes),
        _score_article_3(closes),
        _score_article_4(closes, volumes),
        _score_article_10(volumes),
        _score_article_12(closes),
        _score_article_5_partial(closes),
    ]

    triggered = [s.article for s in signals if s.triggered]

    if safe_harbor:
        total_score = 0.0
    else:
        # Weighted average: fully-computable articles weighted higher
        weights = {"Art 2": 2.0, "Art 3": 2.0, "Art 4": 2.5, "Art 10": 1.5,
                   "Art 12": 1.5, "Art 5": 0.5}
        total_weight = sum(weights.values())
        weighted_sum = sum(s.score_contribution * weights.get(s.article, 1.0) for s in signals)
        total_score = _clamp(weighted_sum / total_weight)

    if total_score >= 70:
        risk_level = "CRITICAL"
    elif total_score >= 45:
        risk_level = "HIGH"
    elif total_score >= 20:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return SupervisionResult(
        symbol=symbol,
        name=name,
        total_score=round(total_score, 1),
        risk_level=risk_level,
        signals=signals,
        triggered_articles=triggered,
        safe_harbor=safe_harbor,
        safe_harbor_reason=reason,
    )


def scan_all_stocks() -> list[dict]:
    """
    Scan all stocks with cached historical data.
    Returns list of result dicts sorted by score descending.
    """
    names = _load_ticker_names()
    results = []

    for filename in os.listdir(DATA_DIR):
        if not filename.endswith("_historical_5y.txt"):
            continue
        # Extract symbol from filename like "2330.TW_historical_5y.txt"
        ticker_part = filename.replace("_historical_5y.txt", "")
        symbol = ticker_part.split(".")[0]
        name = names.get(symbol, "Unknown")

        try:
            result = score_stock(symbol, name)
            results.append({
                "symbol": result.symbol,
                "name": result.name,
                "total_score": result.total_score,
                "risk_level": result.risk_level,
                "triggered_articles": result.triggered_articles,
                "safe_harbor": result.safe_harbor,
                "safe_harbor_reason": result.safe_harbor_reason,
                "signals": [
                    {
                        "article": s.article,
                        "description": s.description,
                        "triggered": s.triggered,
                        "score_contribution": round(s.score_contribution, 1),
                        "details": s.details,
                        "caveat": s.caveat,
                    }
                    for s in result.signals
                ],
            })
        except Exception as e:
            print(f"Supervision scan failed for {symbol}: {e}")

    results.sort(key=lambda x: x["total_score"], reverse=True)
    return results
