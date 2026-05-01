import yfinance as yf
import pandas as pd
import os
import requests
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


MARKET_SUFFIXES = {
    "TWSE": ".TW",
    "TPEx": ".TWO",
}


def _parse_ticker_cache_line(line: str) -> tuple[str, str, str | None]:
    parts = [part.strip() for part in line.split(",") if part.strip()]
    if len(parts) >= 3:
        symbol = parts[0]
        market = parts[-1]
        name = ",".join(parts[1:-1]).strip() or "Unknown"
        return symbol, name, market
    if len(parts) == 2:
        return parts[0], parts[1], None
    cleaned = line.strip()
    return cleaned, "Unknown", None


def fetch_twse_tickers() -> list:
    """
    Scrapes the official list of Taiwanese stocks from TWSE and TPEx.
    Returns a combined list of 4-digit stock tickers with format: symbol,name
    """
    print("Fetching list of all Taiwanese stocks (TWSE and TPEx)...")
    
    # Needs spoofed user agent as some official sites block python requests
    headers = {"User-Agent": "Mozilla/5.0"}
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    tickers = {}
    
    # strMode=2 is TWSE (Listed), strMode=4 is TPEx (OTC)
    for mode in [2, 4]:
        url = f"https://isin.twse.com.tw/isin/C_public.jsp?strMode={mode}"
        res = requests.get(url, headers=headers, verify=False)
        
        # Extract 4 digit identifiers using regex (pattern is usually like '2330 台積電' inside a cell)
        matches = re.findall(r'>([0-9]{4})\s+([^<]+)</td>', res.text)
        for t, n in matches:
            market = "TWSE" if mode == 2 else "TPEx"
            tickers[t] = (n.strip(), market)
        
    # Remove duplicates and sort
    tickers = sorted([(symbol, meta[0], meta[1]) for symbol, meta in tickers.items()], key=lambda item: item[0])
    
    # Save the list to a text file for reference
    list_path = os.path.join(DATA_DIR, "twse_tickers.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        f.write("\n".join(f"{symbol},{name},{market}" for symbol, name, market in tickers))
        
    print(f"Successfully scraped {len(tickers)} Taiwanese tickers.")
    return tickers


def fetch_industry_map() -> dict:
    """
    Scrapes industry/category information from the official ISIN pages (TWSE/TPEx)
    and writes a small cache file `twse_industries.txt` mapping symbol -> industry.
    Returns a dict of symbol -> industry (string or None).
    """
    print("Fetching industry map from official ISIN pages...")
    headers = {"User-Agent": "Mozilla/5.0"}
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    from bs4 import BeautifulSoup

    industries = {}
    for mode in [2, 4]:
        url = f"https://isin.twse.com.tw/isin/C_public.jsp?strMode={mode}"
        try:
            res = requests.get(url, headers=headers, verify=False, timeout=30)
            res.raise_for_status()
        except Exception as e:
            print(f"Failed to fetch ISIN page for mode {mode}: {e}")
            continue

        soup = BeautifulSoup(res.text, "html.parser")
        # Walk rows and extract columns heuristically
        for tr in soup.find_all("tr"):
            tds = [td.get_text(separator=" ", strip=True) for td in tr.find_all("td")]
            if not tds:
                continue

            # Try to find a 4-digit ticker in the row
            symbol = None
            for td in tds:
                m = re.match(r"^([0-9]{4})$", td)
                if m:
                    symbol = m.group(1)
                    break
                # sometimes the code and name are in one cell like '2330 台積電'
                m2 = re.match(r"^([0-9]{4})\b", td)
                if m2:
                    symbol = m2.group(1)
                    break

            if not symbol:
                continue

            # Heuristic: industry/category is often the 3rd column (index 2)
            industry = None
            if len(tds) >= 3:
                industry = tds[2]
            elif len(tds) >= 4:
                industry = tds[3]

            if industry:
                industries[symbol] = industry

    # Cache to file
    industries_path = os.path.join(DATA_DIR, "twse_industries.txt")
    try:
        with open(industries_path, "w", encoding="utf-8") as f:
            for sym, ind in sorted(industries.items()):
                f.write(f"{sym}\t{ind}\n")
    except Exception as e:
        print(f"Failed to write industry cache: {e}")

    print(f"Fetched industries for {len(industries)} tickers")
    return industries


def get_ticker_sector_info(ticker: str | tuple) -> dict:
    """
    Fetches sector and industry info for a single ticker from yfinance.
    Returns dict with keys: name, sector, industry
    """
    if isinstance(ticker, tuple):
        base_ticker = ticker[0]
        company_name = ticker[1]
    else:
        base_ticker, company_name, _ = _parse_ticker_cache_line(ticker)
    
    # Try both .TW and .TWO suffixes
    for suffix in [".TW", ".TWO"]:
        try:
            t = yf.Ticker(f"{base_ticker}{suffix}")
            info = t.info
            sector = info.get("sector", "Unknown Sector")
            industry = info.get("industry", "Unknown Industry")
            return {
                "name": company_name,
                "sector": sector,
                "industry": industry
            }
        except Exception as e:
            print(f"Failed to fetch sector for {base_ticker}{suffix}: {e}")
            continue
    
    # Fallback if both fail
    return {"name": company_name, "sector": "Unknown Sector", "industry": "Unknown Industry"}


async def fetch_all_sectors(retry_on_attribute_error: bool = True):
    """
    Fetches sector/industry information for all Taiwanese stocks.
    Caches results to twse_sectors.txt for quick retrieval.
    Returns a dict mapping ticker to {name, sector, industry}.
    """
    tickers = fetch_twse_tickers()
    print(f"Fetching sector information for {len(tickers)} tickers...")
    
    sectors_data = {}
    loop = asyncio.get_running_loop()
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        tasks = [
            loop.run_in_executor(executor, get_ticker_sector_info, ticker)
            for ticker in tickers
        ]
        completed_results = await asyncio.gather(*tasks, return_exceptions=True, timeout=600)

    attribute_error_seen = any(isinstance(result, AttributeError) for result in completed_results if isinstance(result, Exception))
    
    # Save results to file
    sectors_path = os.path.join(DATA_DIR, "twse_sectors.txt")
    with open(sectors_path, "w", encoding="utf-8") as f:
        for ticker, result in zip(tickers, completed_results):
            if isinstance(result, Exception):
                print(f"Failed to fetch sector for {ticker}: {result}")
                symbol = ticker.split(",", 1)[0]
                f.write(f"{symbol}\tUnknown Sector\tUnknown Industry\n")
            else:
                name = result.get("name", "Unknown")
                sector = result.get("sector", "Unknown Sector")
                industry = result.get("industry", "Unknown Industry")
                symbol = ticker.split(",", 1)[0]
                sectors_data[symbol] = result
                f.write(f"{symbol}\t{sector}\t{industry}\n")
    
    if attribute_error_seen and retry_on_attribute_error:
        print("AttributeError detected during sector fetch; refreshing ticker list and retrying once.")
        fetch_twse_tickers()
        return await fetch_all_sectors(retry_on_attribute_error=False)
    
    print(f"Saved sector information for {len(sectors_data)} tickers.")
    return sectors_data

def _load_market_map() -> dict:
    filepath = os.path.join(DATA_DIR, "twse_tickers.txt")
    market_map = {}
    if not os.path.exists(filepath):
        return market_map

    with open(filepath, "r", encoding="utf-8") as file_handle:
        for line in file_handle.read().splitlines():
            if not line.strip():
                continue
            symbol, _, market = _parse_ticker_cache_line(line)
            if market:
                market_map[symbol] = market
    return market_map


def _resolve_market_suffix(symbol: str, market: str | None = None) -> str | None:
    resolved_market = market
    if not resolved_market:
        resolved_market = _load_market_map().get(symbol)

    return MARKET_SUFFIXES.get(resolved_market or "")


def _split_ticker_cache_entry(entry: str) -> tuple[str, str | None]:
    symbol, _, market = _parse_ticker_cache_line(entry)
    return symbol, market


def _read_intraday_frame(filepath: str) -> pd.DataFrame:
    frame = pd.read_csv(filepath, sep="\t", index_col=0)
    frame.index = pd.to_datetime(frame.index, errors="coerce")
    frame = frame[~frame.index.isna()].copy()
    frame.sort_index(inplace=True)
    return frame


def _frames_align(existing_frame: pd.DataFrame, recent_frame: pd.DataFrame) -> bool:
    if len(existing_frame) < 2 or len(recent_frame) < 2:
        return False

    existing_tail = existing_frame.tail(2).copy()
    recent_head = recent_frame.head(2).copy()

    compare_columns = [column for column in ["Open", "High", "Low", "Close", "Volume"] if column in existing_tail.columns and column in recent_head.columns]
    if not compare_columns:
        return False

    existing_tail = existing_tail[compare_columns].round(2)
    recent_head = recent_head[compare_columns].round(2)
    return existing_tail.index.equals(recent_head.index) and existing_tail.equals(recent_head)


def _rewrite_intraday_file(filepath: str, frame: pd.DataFrame) -> str:
    frame = frame.copy()
    frame.sort_index(inplace=True)
    frame.to_csv(filepath, sep='\t')
    return filepath


async def fetch_all_intraday(limit=None, batch_size: int = 20, pause_seconds: int = 2, retry_on_attribute_error: bool = True):
    """
    Scrapes all Taiwanese stocks and fetches their intraday data.
    Takes an optional 'limit' to prevent long scraping times during testing.
    Uses ThreadPoolExecutor to run yfinance fetching asynchronously in batches.
    """
    tickers = fetch_twse_tickers()
    if limit:
        tickers = tickers[:limit]

    results = []
    attribute_error_seen = False
    loop = asyncio.get_running_loop()

    with ThreadPoolExecutor(max_workers=max(1, batch_size)) as executor:
        for batch_start in range(0, len(tickers), batch_size):
            batch = tickers[batch_start:batch_start + batch_size]
            tasks = []
            for ticker in batch:
                symbol, market = _split_ticker_cache_entry(ticker)
                tasks.append(loop.run_in_executor(executor, fetch_intraday, symbol, market))

            completed_results = await asyncio.gather(*tasks, return_exceptions=True, timeout=300)

            for ticker, result in zip(batch, completed_results):
                if isinstance(result, Exception):
                    print(f"Failed to fetch {ticker}: {result}")
                    results.append({"ticker": ticker, "status": "failed", "error": str(result)})
                    if isinstance(result, AttributeError):
                        attribute_error_seen = True
                else:
                    results.append({"ticker": ticker, "status": "success", "file": result})

            if pause_seconds and batch_start + batch_size < len(tickers):
                await asyncio.sleep(pause_seconds)

    if attribute_error_seen and retry_on_attribute_error:
        print("AttributeError detected during intraday fetch; refreshing ticker list and retrying once.")
        fetch_twse_tickers()
        return await fetch_all_intraday(limit=limit, batch_size=batch_size, pause_seconds=pause_seconds, retry_on_attribute_error=False)

    return results

def fetch_intraday(ticker: str, market: str | None = None) -> str:
    """
    Fetches intraday data for the given ticker.
    Uses the cached exchange code to avoid redundant fallback attempts.
    Tries to append only the newest hourly data when the last two rows align.
    """
    base_ticker = ticker
    if base_ticker.endswith(".TW") or base_ticker.endswith(".TWO"):
        base_ticker = base_ticker.split(".")[0]
        
    print(f"Fetching hourly intraday data for {base_ticker}...")
    
    suffix = _resolve_market_suffix(base_ticker, market)
    if suffix is None:
        raise ValueError(f"No market code found for {base_ticker}. Refresh the ticker list first.")

    used_ticker = f"{base_ticker}{suffix}"
    filepath = os.path.join(DATA_DIR, f"{used_ticker}_intraday.txt")
    tkr = yf.Ticker(used_ticker)

    if os.path.exists(filepath):
        try:
            existing_frame = _read_intraday_frame(filepath)
            recent_frame = tkr.history(period="3d", interval="1h").round(2)
            recent_frame = recent_frame.tail(3).copy()

            if not existing_frame.empty and not recent_frame.empty and _frames_align(existing_frame, recent_frame):
                latest_existing = existing_frame.index.max()
                append_frame = recent_frame[recent_frame.index > latest_existing]
                if not append_frame.empty:
                    combined = pd.concat([existing_frame, append_frame])
                    combined = combined[~combined.index.duplicated(keep="last")]
                    _rewrite_intraday_file(filepath, combined)
                    print(f"Appended {len(append_frame)} new hourly rows to {filepath}")
                    return filepath
                
                print(f"Intraday data already up to date for {used_ticker}")
                return filepath
        except Exception as e:
            print(f"Incremental intraday update failed for {used_ticker}, rescraping full file: {e}")

    df = tkr.history(period="1mo", interval="1h").round(2)
    if df.empty:
        raise ValueError(f"No intraday data found for {base_ticker} on market {suffix}")

    _rewrite_intraday_file(filepath, df)
    print(f"Saved intraday data to {filepath}")
    return filepath

def fetch_historical_5y(ticker: str) -> str:
    """
    Fetches daily historical data for the past 5 years.
    Saves the output to a temporary .txt file.
    """
    # For Yahoo Finance, Taiwanese stocks use '.TW' (Taiwan Stock Exchange) 
    # or '.TWO' (Taipei Exchange / TPEx). If not specified, we will default to trying .TW
    # and if it fails, fallback to .TWO.
    
    base_ticker = ticker
    if base_ticker.endswith(".TW") or base_ticker.endswith(".TWO"):
        base_ticker = base_ticker.split(".")[0]

    print(f"Fetching 5-year historical data for {base_ticker}...")
    
    # Try TWSE first (.TW)
    df = pd.DataFrame()
    try_tickers = [f"{base_ticker}.TW", f"{base_ticker}.TWO"]
    used_ticker = None
    
    for t in try_tickers:
        print(f"Trying {t}...")
        tkr = yf.Ticker(t)
        df = tkr.history(period="5y", interval="1d")
        if not df.empty:
            used_ticker = t
            break
    
    if df.empty:
        raise ValueError(f"No historical data found for {base_ticker} on either TWSE or TPEx")

    filepath = os.path.join(DATA_DIR, f"{used_ticker}_historical_5y.txt")
    df.to_csv(filepath, sep='\t')
    print(f"Saved historical data to {filepath}")
    
    return filepath


TWSE_INDEX_API_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={date}&type=ALLBUT0999"


def _parse_twse_number(value):
    if value is None:
        return None
    cleaned = str(value).replace(',', '').strip()
    if not cleaned or cleaned in {'-', '--'}:
        return None
    cleaned = re.sub(r'<[^>]+>', '', cleaned).strip()
    cleaned = cleaned.replace('+', '').replace('%', '')
    try:
        return float(cleaned)
    except ValueError:
        return None


def _classify_twse_index_group(table_title: str, row_name: str, table_index: int) -> str:
    """
    Splits TWSE index rows into the two dashboard groups the user asked for.
    This is a best-effort classification based on the official table layout.
    """
    title = table_title or ""
    name = row_name or ""

    if table_index in (0, 3):
        return "industry"

    concept_keywords = (
        "高息", "低波動", "藍籌", "智慧", "科技龍頭", "電動車", "ESG", "永續",
        "中小型", "IPO", "創新", "上櫃", "成長", "特選", "主動", "存股", "半導體"
    )

    if any(keyword in title for keyword in ("跨市場", "台灣指數公司")):
        return "concept"

    if any(keyword in name for keyword in concept_keywords):
        return "concept"

    return "industry"


def _fetch_twse_index_snapshot(target_date: datetime) -> dict | None:
    url = TWSE_INDEX_API_URL.format(date=target_date.strftime('%Y%m%d'))
    headers = {"User-Agent": "Mozilla/5.0"}
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    try:
        response = requests.get(url, headers=headers, verify=False, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if payload.get('stat') != 'OK':
            return None
        return payload
    except Exception as e:
        print(f"Failed to fetch TWSE index snapshot for {target_date:%Y-%m-%d}: {e}")
        return None


def fetch_taiwan_index_list(max_lookback_days: int = 7) -> list:
    """
    Fetches the official TWSE market index list from the daily MI_INDEX response.
    Returns a list of index rows with category, name, close, change, and change_percent.
    """
    print("Fetching official Taiwan index list from TWSE...")

    snapshot = None
    snapshot_date = None
    for offset in range(max_lookback_days + 1):
        candidate_date = datetime.now() - timedelta(days=offset)
        candidate_snapshot = _fetch_twse_index_snapshot(candidate_date)
        if candidate_snapshot:
            snapshot = candidate_snapshot
            snapshot_date = candidate_date
            break

    if not snapshot:
        raise ValueError("Unable to fetch TWSE index list from the official API.")

    index_rows = []
    for table_index, table in enumerate(snapshot.get('tables', [])[:6]):
        category = table.get('title', '').strip() or f"Table {table_index + 1}"
        fields = table.get('fields', [])
        rows = table.get('data', [])

        for row in rows:
            if not row or not row[0].strip():
                continue

            name = row[0].strip()
            close = _parse_twse_number(row[1] if len(row) > 1 else None)
            change_points = _parse_twse_number(row[3] if len(row) > 3 else None)
            change_percent = _parse_twse_number(row[4] if len(row) > 4 else None)
            group = _classify_twse_index_group(category, name, table_index)

            index_rows.append({
                "symbol": name,
                "name": name,
                "category": category,
                "group": group,
                "description": category,
                "close": close,
                "price": close,
                "change_points": change_points,
                "change": change_percent,
                "change_percent": change_percent,
                "special_note": row[5].strip() if len(row) > 5 and row[5] else "",
                "source_fields": fields,
                "source_date": snapshot.get('date'),
            })

    indices_path = os.path.join(DATA_DIR, "tw_indices.txt")
    with open(indices_path, "w", encoding="utf-8") as f:
        f.write("date\tgroup\tcategory\tname\tclose\tchange_points\tchange_percent\n")
        for row in index_rows:
            f.write(
                f"{row['source_date']}\t{row['group']}\t{row['category']}\t{row['name']}\t"
                f"{row['close'] if row['close'] is not None else '-'}\t"
                f"{row['change_points'] if row['change_points'] is not None else '-'}\t"
                f"{row['change_percent'] if row['change_percent'] is not None else '-'}\n"
            )

    print(f"Saved official TWSE index list with {len(index_rows)} rows from {snapshot_date:%Y-%m-%d}")
    return index_rows


async def fetch_all_indices():
    """
    Fetches the official Taiwan index list and caches it.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fetch_taiwan_index_list)


def fetch_index_history(index_name: str, trading_days: int = 60) -> list:
    """
    Returns up to `trading_days` daily closing prices for a named TWSE index.
    Loops back through calendar days calling _fetch_twse_index_snapshot until
    enough trading-day snapshots are collected, then caches the result.

    Returns a list of {"date": "YYYYMMDD", "close": float} dicts, oldest first.
    """
    safe_name = re.sub(r'[^\w\-]', '_', index_name)
    cache_file = os.path.join(DATA_DIR, f"tw_index_history_{safe_name}.txt")

    # Use cache if it exists and was written today
    if os.path.exists(cache_file):
        mtime = datetime.fromtimestamp(os.path.getmtime(cache_file))
        if mtime.date() == datetime.now().date():
            rows = []
            with open(cache_file, "r", encoding="utf-8") as f:
                for line in f.read().splitlines()[1:]:  # skip header
                    parts = line.split("\t")
                    if len(parts) == 2:
                        try:
                            rows.append({"date": parts[0], "close": float(parts[1])})
                        except ValueError:
                            pass
            if rows:
                return rows

    print(f"Fetching 60-day history for index '{index_name}'...")
    collected = []
    # Look back far enough to collect trading_days worth of trading days.
    # Taiwan market is open ~22 days/month; 85 calendar days covers ~60 trading days.
    lookback_calendar_days = max(trading_days * 2, 85)

    snapshots_cache: dict[str, dict | None] = {}

    for offset in range(lookback_calendar_days + 1):
        if len(collected) >= trading_days:
            break
        candidate = datetime.now() - timedelta(days=offset)
        date_key = candidate.strftime('%Y%m%d')

        if date_key not in snapshots_cache:
            snapshots_cache[date_key] = _fetch_twse_index_snapshot(candidate)

        snapshot = snapshots_cache[date_key]
        if not snapshot:
            continue

        for table in snapshot.get('tables', [])[:6]:
            for row in table.get('data', []):
                if not row or not row[0].strip():
                    continue
                if row[0].strip() == index_name:
                    close = _parse_twse_number(row[1] if len(row) > 1 else None)
                    if close is not None:
                        collected.append({"date": date_key, "close": close})

    # collected is newest-first; reverse to oldest-first and trim
    collected = list(reversed(collected))[-trading_days:]

    # Write cache
    with open(cache_file, "w", encoding="utf-8") as f:
        f.write("date\tclose\n")
        for row in collected:
            f.write(f"{row['date']}\t{row['close']}\n")

    print(f"Cached {len(collected)} trading days for '{index_name}'")
    return collected


def get_index_constituents(sector_or_index: str) -> list:
    """
    Returns constituent stocks for a given sector/index.
    This reads from the sectors cache and filters by sector.
    """
    sectors_file = os.path.join(DATA_DIR, "twse_sectors.txt")
    tickers_file = os.path.join(DATA_DIR, "twse_tickers.txt")
    
    constituent_stocks = []
    
    if not os.path.exists(sectors_file):
        print(f"Sectors file not found. Cannot get constituents for {sector_or_index}")
        return []
    
    # Load ticker names
    ticker_names = {}
    try:
        with open(tickers_file, "r", encoding="utf-8") as f:
            for line in f:
                parts = [part.strip() for part in line.strip().split(",") if part.strip()]
                if len(parts) >= 2:
                    ticker_names[parts[0]] = ",".join(parts[1:-1]).strip() if len(parts) > 2 else parts[1] 
    except:
        pass
    # Load industry map (try cached file, otherwise refresh from ISIN)
    industries_map = {}
    industries_file = os.path.join(DATA_DIR, "twse_industries.txt")
    if os.path.exists(industries_file):
        try:
            with open(industries_file, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split("\t")
                    if len(parts) >= 2:
                        industries_map[parts[0]] = parts[1]
        except Exception:
            industries_map = {}
    else:
        try:
            industries_map = fetch_industry_map()
        except Exception:
            industries_map = {}
    
    # Get stocks in sector
    try:
        # Check both sector and industry files to see what stocks belong to this group
        matched_tickers = set()
        
        if os.path.exists(sectors_file):
            with open(sectors_file, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split("\t")
                    if len(parts) >= 2 and parts[1] == sector_or_index:
                        matched_tickers.add(parts[0])

        if os.path.exists(industries_file):
            with open(industries_file, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split("\t")
                    if len(parts) >= 2 and parts[1] == sector_or_index:
                        matched_tickers.add(parts[0])

        for ticker in matched_tickers:
            name = ticker_names.get(ticker, "Unknown")
            
            # Try to get current price/change from intraday
            price = None
            change = None
            for suffix in [".TW", ".TWO"]:
                intra_file = os.path.join(DATA_DIR, f"{ticker}{suffix}_intraday.txt")
                if os.path.exists(intra_file):
                    try:
                        with open(intra_file, "r") as inf:
                            lines = inf.read().splitlines()
                            if len(lines) >= 2:
                                last_row = lines[-1].split('\t')
                                prev_row = lines[-2].split('\t') if len(lines) >= 3 else last_row
                                current_close = float(last_row[4])
                                prev_close = float(prev_row[4])
                                price = round(current_close, 2)
                                change = round(((current_close - prev_close) / prev_close) * 100, 2) if prev_close != 0 else 0
                    except:
                        pass
                    break
            
            # Build a 60-day minigraph from available historical or yfinance data
            minigraph = None
            try:
                # Try reading cached historical daily file first
                daily_df = None
                for suffix in [".TW", ".TWO"]:
                    hist_file = os.path.join(DATA_DIR, f"{ticker}{suffix}_historical_5y.txt")
                    if os.path.exists(hist_file):
                        try:
                            df_hist = pd.read_csv(hist_file, sep="\t", index_col=0)
                            if "Close" in df_hist.columns:
                                daily_df = df_hist
                                break
                        except Exception:
                            pass

                if daily_df is None:
                    # fallback: fetch last 90 days daily via yfinance
                    for suffix in [".TW", ".TWO"]:
                        try:
                            t = yf.Ticker(f"{ticker}{suffix}")
                            df_hist = t.history(period="90d", interval="1d").round(4)
                            if not df_hist.empty and "Close" in df_hist.columns:
                                daily_df = df_hist
                                break
                        except Exception:
                            continue

                if daily_df is not None and not daily_df.empty:
                    closes = pd.Series(daily_df["Close"]).dropna()
                    # take the last 60 trading days
                    closes = closes.tail(60)
                    if len(closes) >= 2:
                        start = float(closes.iloc[0])
                        if start != 0:
                            # percent change relative to first point
                            minigraph = [round(((float(c) / start) - 1) * 100, 2) for c in closes.tolist()]
                        else:
                            minigraph = [0.0 for _ in closes.tolist()]
            except Exception:
                minigraph = None

            constituent_stocks.append({
                "symbol": ticker,
                "name": name,
                "price": price,
                "change": change,
                "industry": industries_map.get(ticker),
                "minigraph": minigraph,
            })
    except Exception as e:
        print(f"Error reading sector constituents: {e}")
    
    return constituent_stocks
