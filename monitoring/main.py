from contextlib import suppress

from fastapi import FastAPI, HTTPException, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from scrape.scrape import fetch_intraday, fetch_historical_5y, fetch_twse_tickers, fetch_all_intraday, fetch_all_sectors, fetch_all_indices, get_index_constituents, fetch_index_history
from analysis_utils import build_analysis_payload
from db.database import (
    create_db_pool, create_user, get_user_by_username,
    get_watchlist, add_to_watchlist, remove_from_watchlist,
    create_trade, get_trades, get_net_position, get_holdings,
    update_trade, delete_trade,
)
from db.redis_client import (
    get_meta, get_all_meta,
    save_pending_order, get_user_pending_orders, remove_pending_order,
    get_all_pending_orders, update_pending_order,
)
from auth import (
    verify_password, create_access_token, create_refresh_token,
    decode_token, get_current_user,
    RegisterRequest, LoginRequest, RefreshRequest, TokenResponse, UserOut,
    WatchlistAddRequest, TradeRequest, EditTradeRequest,
)
import json
import os
import re
import asyncio
import uuid
from datetime import datetime, timedelta
from supervision.supervision_utils import (
    run_supervision_scan, score_stock, scan_all_stocks,
    refresh_scan_cache, ARTICLE_DEFINITIONS,
    backtest_stock_30d, backtest_all_30d,
)
from scrape.fundamentals import fetch_fundamentals_batch, get_fundamentals

app = FastAPI(title="Taiwan Stock Monitor API", description="Backend for fetching and serving stock data")

# Compress large payloads (like the huge tickers list) so it transfers instantly
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, adjust if needed
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
INTRADAY_REFRESH_BATCH_SIZE = int(os.getenv("INTRADAY_REFRESH_BATCH_SIZE", "5"))
INTRADAY_REFRESH_PAUSE_SECONDS = float(os.getenv("INTRADAY_REFRESH_PAUSE_SECONDS", "2.0"))
INTRADAY_REFRESH_INTERVAL_SECONDS = int(os.getenv("INTRADAY_REFRESH_INTERVAL_SECONDS", "10800"))
INTRADAY_STALE_THRESHOLD_SECONDS = int(os.getenv("INTRADAY_STALE_THRESHOLD_SECONDS", "7200"))


def _get_latest_intraday_cache_time() -> datetime | None:
    cache_candidates = []

    tickers_file = os.path.join(DATA_DIR, "twse_tickers.txt")
    if os.path.exists(tickers_file):
        cache_candidates.append(tickers_file)

    for filename in os.listdir(DATA_DIR):
        if filename.endswith("_intraday.txt"):
            cache_candidates.append(os.path.join(DATA_DIR, filename))

    if not cache_candidates:
        return None

    latest_path = max(cache_candidates, key=os.path.getmtime)
    return datetime.fromtimestamp(os.path.getmtime(latest_path))


async def _bootstrap_data():
    """Ensure ticker list and a starter batch of intraday data exists on first run."""
    tickers_file = os.path.join(DATA_DIR, "twse_tickers.txt")
    if not os.path.exists(tickers_file):
        print("No ticker cache found — generating ticker list...")
        try:
            fetch_twse_tickers()
        except Exception as e:
            print(f"Ticker list generation failed: {e}")

    # If no intraday data at all, scrape a fast starter batch
    latest = _get_latest_intraday_cache_time()
    if latest is None:
        print("No intraday cache found — seeding with all available stocks...")
        try:
            await _run_intraday_refresh()
        except Exception as e:
            print(f"Starter batch failed: {e}")


async def _refresh_intraday_if_stale() -> bool:
    latest_cache_time = _get_latest_intraday_cache_time()
    if latest_cache_time is None:
        print("No intraday cache found; running initial intraday refresh.")
        await _run_intraday_refresh()
        return True

    age_seconds = (datetime.now() - latest_cache_time).total_seconds()
    if age_seconds > INTRADAY_STALE_THRESHOLD_SECONDS:
        print(f"Intraday cache is stale by {age_seconds / 3600:.2f} hours; refreshing now.")
        await _run_intraday_refresh()
        return True

    return False


async def _run_intraday_refresh(limit: int | None = None, force: bool = False):
    if not hasattr(app.state, "intraday_refresh_lock"):
        app.state.intraday_refresh_lock = asyncio.Lock()

    async with app.state.intraday_refresh_lock:
        return await fetch_all_intraday(
            limit=limit,
            batch_size=INTRADAY_REFRESH_BATCH_SIZE,
            pause_seconds=INTRADAY_REFRESH_PAUSE_SECONDS,
            force=force,
        )


async def _hourly_intraday_refresh_loop():
    """Background task: refresh intraday data on a fixed interval (default 3 hours)."""
    # Wait 2 minutes for other startup tasks to finish first
    await asyncio.sleep(120)
    try:
        await _refresh_intraday_if_stale()
    except Exception as e:
        print(f"Initial intraday freshness check failed: {e}")

    while True:
        await asyncio.sleep(INTRADAY_REFRESH_INTERVAL_SECONDS)
        try:
            print(f"Running scheduled intraday refresh (every {INTRADAY_REFRESH_INTERVAL_SECONDS // 3600}h)...")
            await _run_intraday_refresh()
        except Exception as e:
            print(f"Scheduled intraday refresh failed: {e}")


async def _ensure_sectors_cache():
    """Generate twse_sectors.txt if missing."""
    sectors_file = os.path.join(DATA_DIR, "twse_sectors.txt")
    if not os.path.exists(sectors_file):
        print("twse_sectors.txt missing, regenerating industry data...")
        try:
            await fetch_all_sectors()
        except Exception as e:
            print(f"Failed to regenerate sectors: {e}")


async def _fundamentals_refresh_loop():
    """Background task: refresh fundamentals cache every 6 hours."""
    await asyncio.sleep(120)
    while True:
        try:
            print("Refreshing fundamentals cache...")
            fetch_fundamentals_batch()
            print("Fundamentals cache refreshed.")
        except Exception as e:
            print(f"Fundamentals refresh failed: {e}")
        await asyncio.sleep(6 * 3600)


@app.on_event("startup")
async def startup_tasks():
    app.state.db_pool = await create_db_pool()
    app.state.intraday_refresh_lock = asyncio.Lock()
    app.state.hourly_intraday_refresh_task = asyncio.create_task(_hourly_intraday_refresh_loop())
    app.state.pending_order_checker_task = asyncio.create_task(_pending_order_checker())
    app.state.fundamentals_refresh_task = asyncio.create_task(_fundamentals_refresh_loop())
    asyncio.create_task(_ensure_sectors_cache())
    asyncio.create_task(_bootstrap_data())


@app.on_event("shutdown")
async def shutdown_tasks():
    for task_name in ("hourly_intraday_refresh_task", "pending_order_checker_task", "fundamentals_refresh_task"):
        task = getattr(app.state, task_name, None)
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
    pool = getattr(app.state, "db_pool", None)
    if pool is not None:
        await pool.close()


@app.get("/")
def read_root():
    return {"message": "Stock Monitor Backend is running."}


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/api/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    """Create a new user account."""
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user = await create_user(app.state.db_pool, body.username, body.email, body.password)
    return user


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """Authenticate and return access + refresh tokens."""
    user = await get_user_by_username(app.state.db_pool, body.username)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect username or password")
    token_data = {"sub": str(user["id"])}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@app.post("/api/auth/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    payload = decode_token(body.refresh_token, expected_type="refresh")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    token_data = {"sub": user_id}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@app.get("/api/auth/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user

@app.post("/api/refresh/tickers")
def refresh_tickers(_user: dict = Depends(get_current_user)):
    """Scrape and update the internal list of all available Taiwanese stocks."""
    try:
        tickers = fetch_twse_tickers()
        return {"status": "success", "count": len(tickers), "message": "Successfully refreshed the master ticker list"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/refresh/intraday/all")
async def refresh_all_intraday_data(limit: int = Query(None), force: bool = Query(False), _user: dict = Depends(get_current_user)):
    """Trigger a massive scrape of intraday data for all listed Taiwanese stocks."""
    try:
        results = await _run_intraday_refresh(limit=limit, force=force)
        success_count = sum(1 for r in results if r["status"] == "success")
        return {
            "status": "success", 
            "summary": f"Fetched {success_count}/{len(results)} stocks",
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/refresh/intraday/{ticker}")
def refresh_intraday(ticker: str, _user: dict = Depends(get_current_user)):
    """Trigger a scrape for the latest hourly intraday data."""
    try:
        filepath = fetch_intraday(ticker)
        return {"status": "success", "message": f"Intraday data recorded to text file", "filepath": filepath}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/refresh/historical/{ticker}")
def refresh_historical(ticker: str, _user: dict = Depends(get_current_user)):
    """Trigger a scrape for the past 5 years of daily data."""
    try:
        filepath = fetch_historical_5y(ticker)
        return {"status": "success", "message": f"5-year historical data recorded to text file", "filepath": filepath}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/data/tickers")
def get_tickers(_user: dict = Depends(get_current_user)):
    """Reads the cached ticker list and returns it along with latest intraday data and industry if available."""
    filepath = os.path.join(DATA_DIR, "twse_tickers.txt")
    if not os.path.exists(filepath):
        try:
            raw_tickers = fetch_twse_tickers()
        except Exception as e:
            raise HTTPException(status_code=404, detail="Tickers not found and auto-refresh failed.")
    
    # Load Redis meta cache (sync client, gracefully skips)
    redis_meta: dict[str, dict] = {}
    try:
        from redis import Redis as SyncRedis
        r = SyncRedis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True, socket_connect_timeout=2)
        r.ping()
        meta_keys = list(r.scan_iter("intraday:meta:*"))
        if meta_keys:
            for v in r.mget(meta_keys):
                if v:
                    try:
                        m = json.loads(v)
                        redis_meta[m["symbol"]] = m
                    except (json.JSONDecodeError, KeyError):
                        pass
    except Exception:
        pass

    # Load sector/industry data
    industry_map = {}
    sectors_file = os.path.join(DATA_DIR, "twse_sectors.txt")
    if os.path.exists(sectors_file):
        try:
            with open(sectors_file, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split("\t")
                    if len(parts) >= 3:
                        ticker = parts[0]
                        industry = parts[2] if len(parts) > 2 else "Unknown"
                        industry_map[ticker] = industry
        except (UnicodeDecodeError, UnicodeError):
            # File may be corrupt or in a different encoding — reset it
            print("Warning: industry data file corrupt, removing to force regeneration")
            try:
                os.remove(sectors_file)
            except OSError:
                pass
        except Exception as e:
            print(f"Warning: Failed to load industry data: {e}")
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read().splitlines()
        
    results = []
    for line in content:
        parts = [part.strip() for part in line.split(",") if part.strip()]
        if len(parts) >= 3:
            symbol = parts[0]
            market = parts[-1]
            name = ",".join(parts[1:-1]).strip() or "Unknown"
        elif len(parts) == 2:
            symbol, name = parts
            market = "Unknown"
        else:
            symbol, name, market = line, "Unknown", "Unknown"

        # Skip bonds and mutual funds
        if symbol.startswith("TW000T") or (len(symbol) >= 4 and symbol.endswith("B")):
            continue

        # Prefer Redis meta, fall back to .txt intraday files
        price = "-"
        change = "-"
        meta = redis_meta.get(symbol)
        if meta:
            price = f"{meta['lastPrice']:.2f}"
            pct = meta.get("changePct", 0)
            change = f"{'+' if pct > 0 else ''}{pct:.2f}%"
        else:
            suffix = ".TW" if market == "TWSE" else ".TWO" if market == "TPEx" else None
            suffixes = [suffix] if suffix else [".TW", ".TWO"]
            for candidate_suffix in suffixes:
                intra_file = os.path.join(DATA_DIR, f"{symbol}{candidate_suffix}_intraday.txt")
                if os.path.exists(intra_file):
                    try:
                        with open(intra_file, "r") as inf:
                            lines = inf.read().splitlines()
                            if len(lines) >= 2:
                                last_row = lines[-1].split('\t')
                                prev_row = lines[-2].split('\t') if len(lines) >= 3 else last_row
                                current_close = float(last_row[4])
                                prev_close = float(prev_row[4])
                                price = f"{current_close:.2f}"
                                if current_close != prev_close:
                                    pct_change = ((current_close - prev_close) / prev_close) * 100
                                    change = f"{'+' if pct_change > 0 else ''}{pct_change:.2f}%"
                                else:
                                    change = "0.00%"
                    except Exception:
                        pass
                    break
                
        # Determine industry: bonds, mutual funds, or from sector data
        if re.match(r'^\d{4,6}B', symbol):
            industry = "Bonds"
        elif symbol.startswith("TW000T"):
            industry = "Mutual Funds"
        else:
            industry = industry_map.get(symbol, "Unknown")

        results.append({
            "symbol": symbol,
            "name": name,
            "market": market,
            "price": price,
            "change": change,
            "industry": industry,
        })
        
    import zipfile
    import json
    import io
    from fastapi.responses import StreamingResponse
    
    # Send as JSON (if you want literal zip, we can return StreamingResponse)
    return {"tickers": results}


@app.get("/api/data/tickers-supervised")
def get_tickers_supervised(
    force: bool = Query(False),
    _user: dict = Depends(get_current_user)
):
    """
    Returns the ticker list with supervision scores merged in.
    Each ticker gets a `supervision_score` (0-100) and `supervision_risk` field.
    Set force=true to re-run the supervision scan instead of using cache.
    """
    # Get tickers (reuse logic from get_tickers)
    filepath = os.path.join(DATA_DIR, "twse_tickers.txt")
    if not os.path.exists(filepath):
        try:
            fetch_twse_tickers()
        except Exception as e:
            raise HTTPException(status_code=404, detail="Tickers not found and auto-refresh failed.")

    # Load tickers (simplified - just symbols and names)
    ticker_symbols = set()
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            parts = [p.strip() for p in line.split(",") if p.strip()]
            if parts:
                sym = parts[0]
                # Skip bonds and mutual funds
                if not sym.startswith("TW000T") and not (len(sym) >= 4 and sym.endswith("B")):
                    ticker_symbols.add(sym)

    # Load industry map
    industry_map = {}
    sectors_file = os.path.join(DATA_DIR, "twse_sectors.txt")
    if os.path.exists(sectors_file):
        try:
            with open(sectors_file, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split("\t")
                    if len(parts) >= 3:
                        industry_map[parts[0]] = parts[2] if len(parts) > 2 else "Unknown"
        except Exception:
            pass

    # Get supervision scores for all scanned stocks
    try:
        scan_results = run_supervision_scan(force_refresh=force)
        score_map: dict[str, dict] = {}
        for r in scan_results:
            score_map[r["symbol"]] = {
                "total_score": r["total_score"],
                "risk_level": r["risk_level"],
                "decision": r.get("decision", "N/A"),
                "triggered_articles": r.get("triggered_articles", []),
            }
    except Exception as e:
        print(f"Supervision scan failed in tickers-supervised: {e}")
        score_map = {}

    # Build merged list
    merged = []
    for symbol in sorted(ticker_symbols):
        sup = score_map.get(symbol, {})
        merged.append({
            "symbol": symbol,
            "has_supervision": symbol in score_map,
            "supervision_score": sup.get("total_score"),
            "supervision_risk": sup.get("risk_level", "N/A"),
            "supervision_decision": sup.get("decision"),
            "supervision_triggered": sup.get("triggered_articles", []),
        })

    return {
        "tickers": merged,
        "total": len(merged),
        "scanned": len(score_map),
        "scan_timestamp": datetime.now().isoformat(),
        "equations": {
            "sector_aggregation": {
                "description": "Sector averages are computed as the arithmetic mean of all stocks' metrics within each sector",
                "average_change": "mean(stock.change_6d_pct) for all stocks in sector",
                "average_volume_ratio": "mean(stock.vol_ratio_6d) for all stocks in sector",
                "average_turnover": "mean(stock.turnover_6d) for all stocks in sector",
                "average_pb": "mean(stock.price_to_book) for all stocks in sector with PB > 0",
                "market_weighted_pe": "sum(PE_i * market_cap_i) / sum(market_cap_i) for all stocks with PE > 0",
                "market_weighted_pb": "sum(PB_i * market_cap_i) / sum(market_cap_i) for all stocks with PB > 0",
                "sector_size": "count of stocks in sector from twse_sectors.txt",
            },
            "article_scoring": {
                "description": "Each article computes a 0-100 score contribution. The total score is a weighted average across all 13 articles",
                "article_weights": {
                    "Art 2": 2.0, "Art 3": 2.0, "Art 4": 2.5, "Art 5": 2.0,
                    "Art 6": 0.5, "Art 7": 2.5, "Art 8": 0.5, "Art 9": 0.5,
                    "Art 10": 1.5, "Art 11": 2.0, "Art 12": 1.5,
                    "Art 13": 0.5, "Art 14": 0.5,
                },
                "score_formula": "total = clamp(sum(score_i * weight_i) / sum(weight_i), 0, 100)",
                "risk_levels": {
                    "CRITICAL": "total_score >= 70",
                    "HIGH": "45 <= total_score < 70",
                    "MEDIUM": "20 <= total_score < 45",
                    "LOW": "total_score < 20",
                },
            },
            "market_divergence": {
                "description": "Market/sector divergence measures how much a stock's metric differs from the market or sector average",
                "formula": "|stock_metric - market_avg_metric| or |stock_metric - sector_avg_metric|",
                "example": "If stock 6d change = 40% and sector avg = 10%, divergence = |40 - 10| = 30 percentage points",
            },
        },
    }


@app.get("/api/analysis/{ticker}")
def get_analysis(ticker: str, _user: dict = Depends(get_current_user)):
    """Returns historical chart data plus server-side indicators for a ticker."""
    try:
        payload = build_analysis_payload(ticker)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Historical data not found: {str(e)}")
    return payload

@app.get("/api/data/intraday/{ticker}")
def get_intraday(ticker: str, _user: dict = Depends(get_current_user)):
    """Reads the temporary intraday text file and returns it."""
    if not ticker.endswith(".TW") and not ticker.endswith(".TWO"):
        ticker = f"{ticker}.TW"
        
    filepath = os.path.join(DATA_DIR, f"{ticker}_intraday.txt")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Data not found. Call the refresh endpoint first.")
        
    with open(filepath, "r") as f:
        content = f.read()
        
    return {"ticker": ticker, "data": content}

@app.get("/api/data/historical/{ticker}")
def get_historical(ticker: str, _user: dict = Depends(get_current_user)):
    """Reads the temporary 5-year historical text file and returns it."""
    if not ticker.endswith(".TW") and not ticker.endswith(".TWO"):
        ticker = f"{ticker}.TW"
        
    filepath = os.path.join(DATA_DIR, f"{ticker}_historical_5y.txt")
    if not os.path.exists(filepath):
        try:
            # Auto-fetch if not exists
            filepath = fetch_historical_5y(ticker)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Data not found and auto-fetch failed: {str(e)}")
        
    with open(filepath, "r") as f:
        content = f.read()
        
    return {"ticker": ticker, "data": content}


@app.post("/api/refresh/sectors")
async def refresh_sectors(_user: dict = Depends(get_current_user)):
    """Fetches and updates sector/industry information for all Taiwanese stocks."""
    try:
        sectors_data = await fetch_all_sectors()
        return {"status": "success", "count": len(sectors_data), "message": "Successfully refreshed sector data"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/data/sectors")
def get_sectors_overview(_user: dict = Depends(get_current_user)):
    """
    Returns a comprehensive overview of all sectors/industries with:
    - List of sectors and their counts
    - Average performance per sector
    - Top and worst performers per sector
    """
    sectors_file = os.path.join(DATA_DIR, "twse_sectors.txt")
    tickers_file = os.path.join(DATA_DIR, "twse_tickers.txt")
    
    if not os.path.exists(sectors_file):
        raise HTTPException(status_code=404, detail="Sector data not found. Call /api/refresh/sectors first.")
    
    # Load sectors data
    sectors_map = {}
    try:
        with open(sectors_file, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 3:
                    ticker = parts[0]
                    sector = parts[1] if parts[1] else "Unknown Sector"
                    industry = parts[2] if len(parts) > 2 else "Unknown Industry"
                    if sector not in sectors_map:
                        sectors_map[sector] = {"tickers": [], "industry": industry}
                    sectors_map[sector]["tickers"].append(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading sector data: {str(e)}")
    
    # Get current prices and performance for each ticker
    ticker_performance = {}
    try:
        with open(tickers_file, "r", encoding="utf-8") as f:
            for line in f:
                parts = [part.strip() for part in line.strip().split(",") if part.strip()]
                if len(parts) >= 3:
                    symbol = parts[0]
                    market = parts[-1]
                    name = ",".join(parts[1:-1]).strip() or "Unknown"
                elif len(parts) == 2:
                    symbol, name = parts
                    market = "Unknown"
                else:
                    symbol, name, market = line.strip(), "Unknown", "Unknown"
                
                price = None
                change = None
                
                # Try to get latest price and change from intraday data
                suffix = ".TW" if market == "TWSE" else ".TWO" if market == "TPEx" else None
                suffixes = [suffix] if suffix else [".TW", ".TWO"]

                for suffix in suffixes:
                    intra_file = os.path.join(DATA_DIR, f"{symbol}{suffix}_intraday.txt")
                    if os.path.exists(intra_file):
                        try:
                            with open(intra_file, "r") as inf:
                                lines = inf.read().splitlines()
                                if len(lines) >= 2:
                                    last_row = lines[-1].split('\t')
                                    prev_row = lines[-2].split('\t') if len(lines) >= 3 else last_row
                                    
                                    try:
                                        current_close = float(last_row[4])
                                        prev_close = float(prev_row[4])
                                        pct_change = ((current_close - prev_close) / prev_close) * 100 if prev_close != 0 else 0
                                        price = current_close
                                        change = pct_change
                                    except (ValueError, IndexError):
                                        pass
                        except:
                            pass
                        break
                
                ticker_performance[symbol] = {"name": name, "price": price, "change": change}
    except Exception as e:
        print(f"Error reading ticker performance: {e}")
    
    # Build sector overview with performance metrics
    sectors_overview = []
    for sector_name, sector_data in sorted(sectors_map.items()):
        sector_tickers = sector_data["tickers"]
        performance_data = [ticker_performance.get(t, {}).get("change") for t in sector_tickers if ticker_performance.get(t, {}).get("change") is not None]
        
        # Calculate average change
        avg_change = None
        if performance_data:
            avg_change = sum(performance_data) / len(performance_data)
        
        # Find top and worst performers
        top_performer = None
        worst_performer = None
        if performance_data:
            max_change = max(performance_data)
            min_change = min(performance_data)
            
            for t in sector_tickers:
                perf = ticker_performance.get(t, {})
                if perf.get("change") == max_change and not top_performer:
                    top_performer = {"symbol": t, "name": perf.get("name", "Unknown"), "change": round(max_change, 2)}
                if perf.get("change") == min_change and not worst_performer:
                    worst_performer = {"symbol": t, "name": perf.get("name", "Unknown"), "change": round(min_change, 2)}
        
        sectors_overview.append({
            "sector": sector_name,
            "industry": sector_data.get("industry", "Unknown"),
            "stock_count": len(sector_tickers),
            "available_data_count": len(performance_data),
            "average_change": round(avg_change, 2) if avg_change is not None else None,
            "top_performer": top_performer,
            "worst_performer": worst_performer
        })
    
    return {"sectors": sectors_overview, "total_sectors": len(sectors_overview)}


@app.get("/api/data/sectors/{sector_name}")
def get_sector_details(sector_name: str, _user: dict = Depends(get_current_user)):
    """
    Returns detailed information about a specific sector including:
    - All stocks in the sector
    - Performance of each stock
    - Sorted by best to worst performer
    """
    sectors_file = os.path.join(DATA_DIR, "twse_sectors.txt")
    tickers_file = os.path.join(DATA_DIR, "twse_tickers.txt")
    
    if not os.path.exists(sectors_file):
        raise HTTPException(status_code=404, detail="Sector data not found.")
    
    # Load sectors data
    sector_tickers = []
    try:
        with open(sectors_file, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 2 and parts[1] == sector_name:
                    sector_tickers.append(parts[0])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading sector data: {str(e)}")
    
    if not sector_tickers:
        raise HTTPException(status_code=404, detail=f"Sector '{sector_name}' not found or has no stocks.")
    
    # Get performance for all stocks in sector
    stocks_in_sector = []
    try:
        with open(tickers_file, "r", encoding="utf-8") as f:
            ticker_map = {}
            for line in f:
                parts = [part.strip() for part in line.strip().split(",") if part.strip()]
                if len(parts) >= 2:
                    ticker_map[parts[0]] = ",".join(parts[1:-1]).strip() if len(parts) > 2 else parts[1]
        
        for ticker in sector_tickers:
            name = ticker_map.get(ticker, "Unknown")
            price = None
            change = None
            
            # Get latest price and change
            for suffix in [".TW", ".TWO"]:
                intra_file = os.path.join(DATA_DIR, f"{ticker}{suffix}_intraday.txt")
                if os.path.exists(intra_file):
                    try:
                        with open(intra_file, "r") as inf:
                            lines = inf.read().splitlines()
                            if len(lines) >= 2:
                                last_row = lines[-1].split('\t')
                                prev_row = lines[-2].split('\t') if len(lines) >= 3 else last_row
                                
                                try:
                                    current_close = float(last_row[4])
                                    prev_close = float(prev_row[4])
                                    price = round(current_close, 2)
                                    change = round(((current_close - prev_close) / prev_close) * 100, 2) if prev_close != 0 else 0
                                except (ValueError, IndexError):
                                    pass
                    except:
                        pass
                    break
            
            stocks_in_sector.append({
                "symbol": ticker,
                "name": name,
                "price": price,
                "change": change
            })
        
        # Sort by performance (best to worst)
        stocks_in_sector.sort(key=lambda x: x.get("change") or -999, reverse=True)
        
        return {
            "sector": sector_name,
            "total_stocks": len(stocks_in_sector),
            "stocks": stocks_in_sector
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing sector data: {str(e)}")


@app.post("/api/refresh/indices")
async def refresh_indices(_user: dict = Depends(get_current_user)):
    """Fetches and updates Taiwan indices data."""
    try:
        indices_data = await fetch_all_indices()
        return {"status": "success", "count": len(indices_data), "message": "Successfully refreshed indices data"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/data/indices")
def get_indices(_user: dict = Depends(get_current_user)):
    """
    Returns the cached official Taiwan index list with current values and performance.
    """
    indices_file = os.path.join(DATA_DIR, "tw_indices.txt")
    
    if not os.path.exists(indices_file):
        raise HTTPException(status_code=404, detail="Indices data not found. Call /api/refresh/indices first.")
    
    indices = []
    try:
        with open(indices_file, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
            for line in lines[1:]:  # Skip header
                parts = line.split("\t")
                if len(parts) >= 7:
                    close_value = float(parts[4]) if parts[4] != "-" else None
                    change_points = float(parts[5]) if parts[5] != "-" else None
                    change_percent = float(parts[6]) if parts[6] != "-" else None
                    indices.append({
                        "symbol": parts[3],
                        "name": parts[3],
                        "group": parts[1],
                        "category": parts[2],
                        "description": parts[2],
                        "price": close_value,
                        "close": close_value,
                        "change": change_percent,
                        "change_points": change_points,
                        "change_percent": change_percent,
                    })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading indices data: {str(e)}")
    
    return {"indices": indices, "total_indices": len(indices)}


@app.get("/api/data/indices/{sector_or_index}")
def get_index_constituents_endpoint(sector_or_index: str, _user: dict = Depends(get_current_user)):
    """
    Returns constituent stocks for a given sector or index.
    Stocks are sorted by performance (best to worst).
    """
    constituents = get_index_constituents(sector_or_index)
    
    if not constituents:
        raise HTTPException(status_code=404, detail=f"No constituents found for '{sector_or_index}'")
    
    # Sort by performance (best to worst)
    constituents.sort(key=lambda x: x.get("change") or -999, reverse=True)
    
    # Calculate aggregate metrics
    performance_data = [s.get("change") for s in constituents if s.get("change") is not None]
    avg_change = sum(performance_data) / len(performance_data) if performance_data else None
    
    return {
        "name": sector_or_index,
        "total_constituents": len(constituents),
        "available_data_count": len(performance_data),
        "average_change": round(avg_change, 2) if avg_change is not None else None,
        "constituents": constituents
    }




# ---------------------------------------------------------------------------
# Supervision endpoints
# ---------------------------------------------------------------------------

@app.get("/api/supervision/scan")
def get_supervision_scan(
    limit: int = Query(50, ge=1, le=500),
    min_score: float = Query(0, ge=0, le=100),
    risk_level: str = Query(None),
    force: bool = Query(False),
    _user: dict = Depends(get_current_user)
):
    """
    Run full supervision scan across all stocks with cached data.
    Returns stocks sorted by total_score descending.
    Set force=true to bypass the in-memory cache and recompute.
    """
    try:
        results = run_supervision_scan(force_refresh=force)

        # Filter
        if min_score > 0:
            results = [r for r in results if r["total_score"] >= min_score]
        if risk_level:
            results = [r for r in results if r["risk_level"] == risk_level.upper()]

        total = len(results)
        results = results[:limit]

        # Count by risk level
        risk_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0}
        for r in results:
            rl = r.get("risk_level", "UNKNOWN")
            risk_counts[rl] = risk_counts.get(rl, 0) + 1

        return {
            "scan_timestamp": datetime.now().isoformat(),
            "total_scanned": total,
            "returned": len(results),
            "risk_counts": risk_counts,
            "stocks": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supervision scan failed: {str(e)}")


@app.get("/api/supervision/{symbol}")
def get_supervision_detail(
    symbol: str,
    _user: dict = Depends(get_current_user)
):
    """
    Get detailed supervision analysis for a single symbol.
    Returns full article-by-article breakdown.
    """
    try:
        result = score_stock(symbol)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supervision analysis failed: {str(e)}")


@app.post("/api/supervision/refresh-cache")
def refresh_supervision_cache(
    _user: dict = Depends(get_current_user)
):
    """Force refresh the in-memory supervision scan cache."""
    try:
        refresh_scan_cache()
        return {"status": "success", "message": "Supervision cache cleared. Next scan will recompute."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/supervision/articles")
def get_supervision_articles():
    """Return definitions and thresholds for all 14 supervision articles."""
    return {"articles": ARTICLE_DEFINITIONS, "total_articles": len(ARTICLE_DEFINITIONS)}


@app.get("/api/supervision/backtest-30d")
def get_backtest_30d(
    symbol: str = Query(None),
    _user: dict = Depends(get_current_user)
):
    """
    30-day backtest. If symbol is provided, returns daily detail for that stock.
    Otherwise returns a summary for all stocks, flagging any that triggered in the window.
    """
    try:
        if symbol:
            result = backtest_stock_30d(symbol)
            return result
        else:
            results = backtest_all_30d()
            flagged = [r for r in results if r["flagged_30d"]]
            return {
                "total": len(results),
                "flagged_count": len(flagged),
                "flagged": flagged,
                "all": results,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")


# ---------------------------------------------------------------------------
# Watchlist endpoints
# ---------------------------------------------------------------------------

@app.get("/api/watchlist")
async def get_user_watchlist(current_user: dict = Depends(get_current_user)):
    items = await get_watchlist(app.state.db_pool, current_user["id"])
    return {"items": items}


@app.post("/api/watchlist", status_code=status.HTTP_201_CREATED)
async def add_watchlist_item(body: WatchlistAddRequest, current_user: dict = Depends(get_current_user)):
    item = await add_to_watchlist(app.state.db_pool, current_user["id"], body.symbol, body.name, body.item_type)
    return item


@app.delete("/api/watchlist/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_watchlist_item(symbol: str, current_user: dict = Depends(get_current_user)):
    await remove_from_watchlist(app.state.db_pool, current_user["id"], symbol)


# ---------------------------------------------------------------------------
# Trade endpoints
# ---------------------------------------------------------------------------

@app.post("/api/trades", status_code=status.HTTP_201_CREATED)
async def submit_trade(body: TradeRequest, current_user: dict = Depends(get_current_user)):
    if body.side.upper() not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="side must be BUY or SELL")
    if body.volume <= 0:
        raise HTTPException(status_code=400, detail="volume must be positive")

    order_type = body.type.upper()
    user_id = current_user["id"]

    if order_type == "LIMIT":
        if body.limit_price is None:
            raise HTTPException(status_code=400, detail="limit_price is required for LIMIT orders")

        # Check if limit is met
        buy_met = body.side.upper() == "BUY" and body.price <= body.limit_price
        sell_met = body.side.upper() == "SELL" and body.price >= body.limit_price

        if not (buy_met or sell_met):
            # Queue as pending limit order
            if body.side.upper() == "SELL":
                net = await get_net_position(app.state.db_pool, user_id, body.symbol)
                if net < body.volume:
                    raise HTTPException(status_code=400, detail=f"Insufficient holdings: you hold {net} shares")

            order_id = str(uuid.uuid4())
            await save_pending_order(order_id, {
                "id": order_id,
                "user_id": user_id,
                "symbol": body.symbol,
                "name": body.name,
                "side": body.side.upper(),
                "type": order_type,
                "price": body.price,
                "volume": body.volume,
                "limit_price": body.limit_price,
                "created_at": datetime.now().isoformat(),
            })
            return {
                "status": "pending",
                "id": order_id,
                "message": f"Order queued. Will execute when price reaches NT${body.limit_price:.2f}",
            }

        execution_price = body.limit_price
    else:
        execution_price = body.price

    if body.side.upper() == "SELL":
        net = await get_net_position(app.state.db_pool, user_id, body.symbol)
        if net < body.volume:
            raise HTTPException(status_code=400, detail=f"Insufficient holdings: you hold {net} shares")

    trade = await create_trade(
        app.state.db_pool, user_id,
        body.symbol, body.name, body.side, order_type, execution_price, body.volume,
        body.limit_price, body.asset_type,
    )
    return trade


@app.get("/api/trades")
async def list_trades(current_user: dict = Depends(get_current_user)):
    trades = await get_trades(app.state.db_pool, current_user["id"])
    return {"trades": trades}


@app.get("/api/trades/position/{symbol}")
async def position(symbol: str, current_user: dict = Depends(get_current_user)):
    net = await get_net_position(app.state.db_pool, current_user["id"], symbol)
    return {"symbol": symbol, "net_position": net}


@app.get("/api/trades/holdings")
async def holdings(current_user: dict = Depends(get_current_user)):
    items = await get_holdings(app.state.db_pool, current_user["id"])
    return {"holdings": [
        {**h, "avg_buy_price": float(h["avg_buy_price"]) if h["avg_buy_price"] is not None else None}
        for h in items
    ]}


@app.get("/api/trades/history/{symbol}")
async def symbol_history(symbol: str, current_user: dict = Depends(get_current_user)):
    trades = await get_trades(app.state.db_pool, current_user["id"])
    filtered = [t for t in trades if t["symbol"].upper() == symbol.upper()]
    return {"trades": filtered}


@app.get("/api/trades/pending")
async def list_pending(current_user: dict = Depends(get_current_user)):
    orders = await get_user_pending_orders(current_user["id"])
    return {"pending": orders}


@app.delete("/api/trades/pending/{order_id}", status_code=204)
async def cancel_pending(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await get_user_pending_orders(current_user["id"])
    match = next((o for o in order if o["id"] == order_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Pending order not found")
    await remove_pending_order(order_id)
    return None


@app.put("/api/trades/pending/{order_id}")
async def edit_pending(order_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    order = await get_user_pending_orders(current_user["id"])
    match = next((o for o in order if o["id"] == order_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Pending order not found")
    allowed = {"limit_price", "volume"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update (limit_price, volume)")
    updated = await update_pending_order(order_id, updates)
    return updated


@app.put("/api/trades/{trade_id}")
async def edit_trade(trade_id: int, body: EditTradeRequest, current_user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    trade = await update_trade(app.state.db_pool, trade_id, current_user["id"], **updates)
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade


@app.delete("/api/trades/{trade_id}", status_code=204)
async def remove_trade(trade_id: int, current_user: dict = Depends(get_current_user)):
    ok = await delete_trade(app.state.db_pool, trade_id, current_user["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Trade not found")
    return None


async def _pending_order_checker():
    """Background loop: check pending limit orders every 30s and execute when limit is met."""
    await asyncio.sleep(10)  # wait for initial Redis connection
    while True:
        await asyncio.sleep(30)
        try:
            orders = await get_all_pending_orders()
            for order in orders:
                meta = await get_meta(order["symbol"])
                if meta is None:
                    continue
                current = meta["lastPrice"]
                side = order["side"]
                limit = order["limit_price"]
                if (side == "BUY" and current <= limit) or (side == "SELL" and current >= limit):
                    # Check sell holdings
                    if side == "SELL":
                        net = await get_net_position(app.state.db_pool, order["user_id"], order["symbol"])
                        if net < order["volume"]:
                            continue  # skip, holdings changed
                    try:
                        await create_trade(
                            app.state.db_pool, order["user_id"],
                            order["symbol"], order["name"], side, "LIMIT", limit,
                            order["volume"], limit,
                        )
                        await remove_pending_order(order["id"])
                        print(f"Pending LIMIT {side} for {order['symbol']} at NT${limit:.2f} executed.")
                    except Exception as e:
                        print(f"Failed to execute pending order {order['id']}: {e}")
        except Exception as e:
            print(f"Pending order checker error: {e}")


@app.get("/api/fundamentals/{symbol}")
def get_fundamentals_endpoint(symbol: str, _user: dict = Depends(get_current_user)):
    """Return cached fundamentals (P/E, P/B, shares outstanding, etc.) for a symbol."""
    # Try Redis first
    try:
        from redis import Redis as SyncRedis
        r = SyncRedis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True, socket_connect_timeout=2)
        r.ping()
        raw = r.get(f"fundamentals:{symbol}")
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    # Fall back to file cache
    try:
        result = get_fundamentals(symbol, use_cache=True)
        if result:
            return result
    except Exception:
        pass
    return {"symbol": symbol, "pe": None, "pb": None,
            "shares_outstanding": None, "market_cap": None, "beta": None}


@app.post("/api/refresh/fundamentals")
def refresh_fundamentals(force: bool = Query(False), _user: dict = Depends(get_current_user)):
    """Fetch and cache fundamentals (P/E, P/B, shares outstanding) for all tickers."""
    try:
        results = fetch_fundamentals_batch(force_refresh=force)
        return {"status": "success", "count": len(results),
                "message": f"Fundamentals cached for {len(results)} tickers"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/refresh/fundamentals/{symbol}")
def refresh_single_fundamentals(symbol: str, _user: dict = Depends(get_current_user)):
    """Fetch and cache fundamentals for a single symbol. Used as trap door when analysis page has no data."""
    try:
        result = get_fundamentals(symbol, use_cache=False)
        if result:
            return {"status": "success", "symbol": symbol, "data": result}
        return {"status": "empty", "symbol": symbol, "message": "No fundamentals data available from yfinance"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/index-history/{index_name}")
def get_index_history(index_name: str, _user: dict = Depends(get_current_user)):
    """
    Returns up to 60 daily closing prices for a named TWSE index.
    Fetches from TWSE MI_INDEX API and caches per index per day.
    """
    try:
        history = fetch_index_history(index_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch index history: {str(e)}")

    if not history:
        raise HTTPException(status_code=404, detail=f"No history found for index '{index_name}'")

    return {"name": index_name, "history": history}


@app.get("/api/data/index-list")
def get_index_list(_user: dict = Depends(get_current_user)):
    """
    Returns the official Taiwan index list cache. Refreshes it if missing.
    """
    indices_file = os.path.join(DATA_DIR, "tw_indices.txt")
    if not os.path.exists(indices_file):
        try:
            asyncio.run(fetch_all_indices())
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Index list not found and refresh failed: {str(e)}")

    return get_indices(_user)
