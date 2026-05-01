import math
import os
from datetime import datetime

from scrape import fetch_historical_5y, fetch_twse_tickers


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def normalize_symbol(ticker: str) -> str:
    symbol = ticker.strip()
    if symbol.endswith(".TW") or symbol.endswith(".TWO"):
        symbol = symbol.rsplit(".", 1)[0]
    return symbol


def load_ticker_name(symbol: str) -> str:
    filepath = os.path.join(DATA_DIR, "twse_tickers.txt")
    if not os.path.exists(filepath):
        try:
            fetch_twse_tickers()
        except Exception:
            return "Unknown Company"

    if not os.path.exists(filepath):
        return "Unknown Company"

    with open(filepath, "r", encoding="utf-8") as file_handle:
        for line in file_handle.read().splitlines():
            if not line.strip():
                continue
            parts = [part.strip() for part in line.split(",") if part.strip()]
            if len(parts) < 2:
                continue
            line_symbol = parts[0]
            line_name = ",".join(parts[1:-1]).strip() if len(parts) > 2 else parts[1].strip()
            if line_symbol == symbol:
                return line_name

    return "Unknown Company"


def find_historical_file(symbol: str) -> tuple[str, str]:
    for suffix in [".TW", ".TWO"]:
        filepath = os.path.join(DATA_DIR, f"{symbol}{suffix}_historical_5y.txt")
        if os.path.exists(filepath):
            return filepath, f"{symbol}{suffix}"

    fetched_ticker = f"{symbol}.TW"
    fetch_historical_5y(fetched_ticker)

    for suffix in [".TW", ".TWO"]:
        filepath = os.path.join(DATA_DIR, f"{symbol}{suffix}_historical_5y.txt")
        if os.path.exists(filepath):
            return filepath, f"{symbol}{suffix}"

    raise FileNotFoundError(f"No historical file found for {symbol}")


def sma(values: list[float], period: int) -> list[float | None]:
    results: list[float | None] = []
    for index in range(len(values)):
        if index + 1 < period:
            results.append(None)
            continue
        window = values[index + 1 - period:index + 1]
        results.append(sum(window) / period)
    return results


def ema(values: list[float], period: int) -> list[float | None]:
    if not values:
        return []

    multiplier = 2 / (period + 1)
    results: list[float | None] = []
    previous_ema: float | None = None

    for index, value in enumerate(values):
        if index + 1 < period:
            results.append(None)
            continue

        if previous_ema is None:
            window = values[index + 1 - period:index + 1]
            previous_ema = sum(window) / period
        else:
            previous_ema = ((value - previous_ema) * multiplier) + previous_ema

        results.append(previous_ema)

    return results


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    if len(values) <= period:
        return [None for _ in values]

    results: list[float | None] = [None for _ in values]
    gains = 0.0
    losses = 0.0

    for index in range(1, period + 1):
        change = values[index] - values[index - 1]
        if change >= 0:
            gains += change
        else:
            losses += abs(change)

    avg_gain = gains / period
    avg_loss = losses / period
    results[period] = 100 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / avg_loss))

    for index in range(period + 1, len(values)):
        change = values[index] - values[index - 1]
        gain = max(change, 0)
        loss = max(-change, 0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        results[index] = 100 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / avg_loss))

    return results


def mfi(highs: list[float], lows: list[float], closes: list[float], volumes: list[float], period: int = 14) -> list[float | None]:
    if len(closes) <= period:
        return [None for _ in closes]

    typical_prices = [(highs[index] + lows[index] + closes[index]) / 3 for index in range(len(closes))]
    money_flow = [typical_prices[index] * volumes[index] for index in range(len(closes))]
    positive_flow = [0.0 for _ in closes]
    negative_flow = [0.0 for _ in closes]

    for index in range(1, len(closes)):
        if typical_prices[index] > typical_prices[index - 1]:
            positive_flow[index] = money_flow[index]
        elif typical_prices[index] < typical_prices[index - 1]:
            negative_flow[index] = money_flow[index]

    results: list[float | None] = [None for _ in closes]
    for index in range(period, len(closes)):
        positive_sum = sum(positive_flow[index + 1 - period:index + 1])
        negative_sum = sum(negative_flow[index + 1 - period:index + 1])
        if negative_sum == 0:
            results[index] = 100.0
            continue

        money_ratio = positive_sum / negative_sum
        results[index] = 100 - (100 / (1 + money_ratio))

    return results


def volatility(values: list[float], period: int = 20) -> float:
    if len(values) < 2:
        return 0.0

    start_index = max(1, len(values) - period)
    returns: list[float] = []
    for index in range(start_index, len(values)):
        previous = values[index - 1]
        current = values[index]
        if previous > 0:
            returns.append((current - previous) / previous)

    if not returns:
        return 0.0

    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / len(returns)
    return math.sqrt(variance) * math.sqrt(252) * 100


def format_date_label(raw_date: str) -> str:
    try:
        parsed = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        return parsed.strftime("%b %d, %y")
    except Exception:
        return raw_date


def build_analysis_payload(ticker: str) -> dict:
    symbol = normalize_symbol(ticker)
    company_name = load_ticker_name(symbol)
    filepath, used_ticker = find_historical_file(symbol)

    with open(filepath, "r", encoding="utf-8") as file_handle:
        rows = [row for row in file_handle.read().splitlines() if row.strip()]

    if len(rows) < 2:
        raise ValueError("Historical data file is empty.")

    records = []
    for row in rows[1:]:
        cols = row.split("\t")
        if len(cols) < 6:
            continue

        try:
            records.append({
                "date": cols[0],
                "dateLabel": format_date_label(cols[0]),
                "open": float(cols[1]),
                "high": float(cols[2]),
                "low": float(cols[3]),
                "close": float(cols[4]),
                "volume": float(cols[5] or 0),
            })
        except ValueError:
            continue

    closes = [record["close"] for record in records]
    highs = [record["high"] for record in records]
    lows = [record["low"] for record in records]
    volumes = [record["volume"] for record in records]

    sma5 = sma(closes, 5)
    ema5 = ema(closes, 5)
    rsi14 = rsi(closes, 14)
    mfi14 = mfi(highs, lows, closes, volumes, 14)

    chart_data = []
    for index, record in enumerate(records):
        chart_data.append({
            **record,
            "sma5": sma5[index],
            "ema5": ema5[index],
            "rsi14": rsi14[index],
            "mfi14": mfi14[index],
        })

    latest = chart_data[-1]
    previous = chart_data[-2] if len(chart_data) >= 2 else None
    recent_percent_change = None
    if previous and previous["close"]:
        recent_percent_change = ((latest["close"] - previous["close"]) / previous["close"]) * 100

    last_five_volumes = volumes[-5:] if volumes else []
    average_volume_5 = sum(last_five_volumes) / len(last_five_volumes) if last_five_volumes else 0.0

    return {
        "symbol": symbol,
        "ticker": used_ticker,
        "companyName": company_name,
        "recentPercentChange": recent_percent_change,
        "latestClose": latest["close"],
        "latestVolume": latest["volume"],
        "averageVolume5": average_volume_5,
        "volatility": volatility(closes),
        "latestSma5": latest["sma5"],
        "latestEma5": latest["ema5"],
        "latestRsi14": latest["rsi14"],
        "latestMfi14": latest["mfi14"],
        "chartData": chart_data,
    }