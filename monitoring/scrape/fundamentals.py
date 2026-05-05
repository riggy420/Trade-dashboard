"""
Batch yfinance fundamentals fetcher.
Extracts shares outstanding, P/E, P/B, market cap, beta and caches to JSON file + Redis.
"""
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import yfinance as yf

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

FUNDAMENTALS_FILE = os.path.join(DATA_DIR, "twse_fundamentals.json")

FIELDS = ("sharesOutstanding", "trailingPE", "forwardPE", "priceToBook",
          "marketCap", "beta", "bookValue", "returnOnEquity")


def _is_bond_or_fund(symbol: str) -> bool:
    if symbol.startswith("TW000T"):
        return True
    if len(symbol) >= 4 and symbol.endswith("B"):
        return True
    return False


def _load_ticker_symbols() -> list[str]:
    """Load all ticker symbols from cache, skipping bonds and mutual funds."""
    path = os.path.join(DATA_DIR, "twse_tickers.txt")
    if not os.path.exists(path):
        return []
    symbols = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                parts = [p.strip() for p in line.split(",") if p.strip()]
                if parts and not _is_bond_or_fund(parts[0]):
                    symbols.append(parts[0])
    except (UnicodeDecodeError, UnicodeError):
        pass
    return symbols


def _cache_to_redis(symbol: str, data: dict) -> None:
    try:
        from redis import Redis as SyncRedis
        r = SyncRedis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"),
                               decode_responses=True, socket_connect_timeout=2)
        r.ping()
        r.setex(f"fundamentals:{symbol}", 86400, json.dumps(data, default=str))
    except Exception:
        pass


def _fetch_one(symbol: str) -> tuple[str, dict | None, str | None]:
    """Fetch fundamentals for one symbol. Returns (symbol, data, error)."""
    tries = [f"{symbol}.TW", f"{symbol}.TWO"]
    for ticker_suffix in tries:
        try:
            t = yf.Ticker(ticker_suffix)
            info = t.info
            if not info or info.get("trailingPE") is None and info.get("marketCap") is None:
                continue
            result = {}
            for field in FIELDS:
                val = info.get(field)
                if val is not None:
                    result[field] = val
            if result:
                result["sector"] = info.get("sector", "")
                result["industry"] = info.get("industry", "")
                return symbol, result, None
        except Exception as e:
            return symbol, None, str(e)
    return symbol, {}, None


def fetch_fundamentals_batch(symbols: list[str] | None = None,
                             max_workers: int = 10,
                             force_refresh: bool = False) -> dict[str, dict]:
    """
    Batch fetch yfinance .info for a list of symbols.
    Caches to twse_fundamentals.json and Redis per symbol.
    """
    if symbols is None:
        symbols = _load_ticker_symbols()
    if not symbols:
        return {}

    existing = {}
    if not force_refresh and os.path.exists(FUNDAMENTALS_FILE):
        try:
            with open(FUNDAMENTALS_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            existing = {}

    to_fetch = [s for s in symbols if force_refresh or s not in existing]
    if not to_fetch:
        return {s: existing[s] for s in symbols if s in existing}

    results = dict(existing)
    success = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_fetch_one, s): s for s in to_fetch}
        for future in as_completed(futures):
            symbol, data, error = future.result()
            if data:
                results[symbol] = data
                _cache_to_redis(symbol, data)
                success += 1
            elif error:
                failed += 1
            else:
                results[symbol] = {}
            time.sleep(0.1)

    with open(FUNDAMENTALS_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, default=str)

    print(f"Fundamentals: {success} fetched, {failed} failed, {len(results)} total cached")
    return results


def get_fundamentals(symbol: str, use_cache: bool = True) -> dict | None:
    """Return cached fundamentals for a single symbol. Redis first, then file."""
    if use_cache:
        try:
            from redis import Redis as SyncRedis
            r = SyncRedis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"),
                                   decode_responses=True, socket_connect_timeout=2)
            r.ping()
            raw = r.get(f"fundamentals:{symbol}")
            if raw:
                return json.loads(raw)
        except Exception:
            pass

    if use_cache and os.path.exists(FUNDAMENTALS_FILE):
        try:
            with open(FUNDAMENTALS_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            return cached.get(symbol)
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

    result, _ = _fetch_one(symbol)
    if result:
        _cache_to_redis(symbol, result)
    return result if result else None


def load_fundamentals_map() -> dict[str, dict]:
    """Load all cached fundamentals from the JSON file."""
    if not os.path.exists(FUNDAMENTALS_FILE):
        return {}
    try:
        with open(FUNDAMENTALS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}
