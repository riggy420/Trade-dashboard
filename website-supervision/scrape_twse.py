"""
Scrape TWSE disposition lists via RWD JSON API.
Uses date-range queries to get full historical data, then fetches
per-stock attention notices for article-level classification.
"""
import json
import os
import re
import time
from datetime import datetime, timedelta
from collections import Counter

import requests
import urllib3

urllib3.disable_warnings()

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "twse_dispositions.json")
HEADERS = {"User-Agent": "Mozilla/5.0"}

NOTICE_KEYWORDS = [
    (r"cumulative percentage of (increase|decrease) in the closing price.*six.*business days", "Art 2"),
    (r"cumulative (increase|decrease).*closing price.*(six|recent).*business days", "Art 2"),
    (r"thirty.*business days.*(increase|decrease).*closing price", "Art 3"),
    (r"sixty.*business days.*(increase|decrease).*closing price", "Art 3"),
    (r"ninety.*business days.*(increase|decrease).*closing price", "Art 3"),
    (r"intraday turnover.*\d+\.?\d*%", "Art 5"),
    (r"price-to-earnings rate.*\d+\.?\d* times.*price-to-book ratio.*\d+\.?\d* times", "Art 7"),
    (r"price-to-earnings rate.*and.*price-to-book ratio", "Art 7"),
    (r"trading volume.*most recent.*business days.*exceed.*average", "Art 10"),
    (r"volume.*\d+\.?\d* times.*average", "Art 10"),
    (r"cumulative total turnover rate.*six.*business days.*\d+\.?\d*%", "Art 11"),
    (r"turnover rate.*most recent.*business days", "Art 11"),
    (r"difference between.*closing price.*initial.*final.*six.*business days", "Art 12"),
    (r"closing price.*difference.*NT\$?\s*\d+", "Art 12"),
    (r"single securities firm.*\d+\.?\d*%", "Art 6"),
    (r"day trading.*concentrated", "Art 6"),
    (r"margin.*(trading|purchase|ratio).*\d+\.?\d*%", "Art 8"),
    (r"long/short ratio", "Art 8"),
    (r"(borrowed|short).*securit.*\d+\.?\d*%", "Art 13"),
    (r"day trading.*accounted.*\d+\.?\d*%", "Art 14"),
]


def classify_notice_text(text: str) -> list[str]:
    if not text:
        return []
    text_lower = text.lower()
    articles = []
    for pattern, article in NOTICE_KEYWORDS:
        if re.search(pattern, text_lower):
            if article not in articles:
                articles.append(article)
    return articles or ["Unknown"]


def fetch_dispositions_range(start_date: str, end_date: str) -> list[dict]:
    """
    Fetch TWSE dispositions for a date range using the RWD API.
    Dates in YYYYMMDD format.
    """
    url = (
        f"https://www.twse.com.tw/rwd/en/announcement/punish"
        f"?startDate={start_date}&endDate={end_date}"
        f"&querytype=3&stockNo=&selectType=&proceType=&remarkType="
        f"&sortKind=STKNO&response=json"
    )
    try:
        r = requests.get(url, headers=HEADERS, verify=False, timeout=30)
        data = r.json()
        if data.get("stat") != "OK" or not data.get("data"):
            return []
        results = []
        for row in data["data"]:
            if len(row) < 8:
                continue
            sym = str(row[2]).strip()
            name = str(row[3]).strip()
            reason = str(row[5]).strip() if len(row) > 5 else ""
            period = str(row[6]).strip() if len(row) > 6 else ""
            ann_date = str(row[1]).strip() if len(row) > 1 else ""

            # Skip empty/warrant/bond codes
            if not sym or len(sym) > 6:
                continue

            results.append({
                "symbol": sym,
                "name": name if name else "Unknown",
                "date": ann_date,
                "reason": reason,
                "period": period,
                "exchange": "TWSE",
            })
        return results
    except Exception as e:
        print(f"  Error fetching {start_date}~{end_date}: {e}")
        return []


def fetch_attention_notices(symbol: str, start_date: str, end_date: str) -> list[str]:
    """Fetch attention notice details for article-level classification."""
    url = (
        f"https://www.twse.com.tw/en/announcement/notice?response=json"
        f"&querytype=2&startDate={start_date}&endDate={end_date}&stockNo={symbol}"
    )
    try:
        r = requests.get(url, headers=HEADERS, verify=False, timeout=30)
        data = r.json()
        if data.get("stat") != "OK" or not data.get("data"):
            return []
        notices = []
        for row in data["data"]:
            trading_info = str(row[4]) if len(row) > 4 else ""
            if trading_info:
                notices.append(trading_info)
        return notices
    except Exception:
        return []


def scrape_twse(months_back: int = 6):
    """Scrape TWSE disposition history in 1-month chunks."""
    all_dispositions = []
    seen = set()

    end_date = datetime.now()
    for i in range(months_back):
        chunk_end = end_date - timedelta(days=i * 30)
        chunk_start = chunk_end - timedelta(days=30)

        start_str = chunk_start.strftime("%Y%m%d")
        end_str = chunk_end.strftime("%Y%m%d")

        print(f"Fetching TWSE {start_str} to {end_str}...")
        dispos = fetch_dispositions_range(start_str, end_str)
        new = 0
        for d in dispos:
            key = f"{d['symbol']}_{d['date']}"
            if key not in seen:
                seen.add(key)
                new += 1
                all_dispositions.append(d)
        print(f"  Got {len(dispos)} rows, {new} new (total: {len(all_dispositions)})")
        time.sleep(0.3)

    # Fetch attention notices for article-level classification
    print(f"\nFetching attention notices for {len(all_dispositions)} dispositions...")
    for i, d in enumerate(all_dispositions):
        try:
            d_date = datetime.strptime(d["date"], "%Y/%m/%d")
        except ValueError:
            continue
        start_dt = (d_date - timedelta(days=40)).strftime("%Y%m%d")
        end_dt = d_date.strftime("%Y%m%d")
        notices = fetch_attention_notices(d["symbol"], start_dt, end_dt)
        time.sleep(0.15)

        all_articles = []
        for notice in notices:
            articles = classify_notice_text(notice)
            all_articles.extend(articles)

        unique_arts = list(dict.fromkeys(all_articles))
        d["triggered_articles"] = unique_arts
        d["primary_article"] = unique_arts[0] if unique_arts else "Unknown"
        d["notice_count"] = len(notices)

        if (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{len(all_dispositions)} notices fetched")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_dispositions, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(all_dispositions)} TWSE dispositions to {OUTPUT_FILE}")

    # Quick summary
    primary = Counter(d.get("primary_article", "Unknown") for d in all_dispositions)
    print(f"\nPrimary trigger distribution:")
    for art, count in primary.most_common():
        print(f"  {art:12s} {count:4d}  {count/len(all_dispositions)*100:5.1f}%")

    return all_dispositions


if __name__ == "__main__":
    scrape_twse(months_back=6)
