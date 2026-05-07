"""
Scrape TPEx disposition lists via JSON API.
Classifies each disposition by the triggering article using keyword matching.
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

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "tpex_dispositions.json")
HEADERS = {"User-Agent": "Mozilla/5.0"}

# Keyword → article mapping for the "Reasons of Disposition" field
REASON_KEYWORDS = [
    (r"cumulative (increase|decrease).*closing price.*(six|most recent).*business days", "Art 2"),
    (r"(thirty|sixty|ninety).*business days.*(increase|decrease).*closing price", "Art 3"),
    (r"intraday turnover", "Art 5"),
    (r"price-to-earnings.*price-to-book", "Art 7"),
    (r"trading volume.*(exceed|surge|most recent).*average", "Art 10"),
    (r"cumulative.*turnover rate", "Art 11"),
    (r"(difference|change).*closing price.*(initial|final).*business days", "Art 12"),
    (r"day trading.*(concentrated|exceed|account)", "Art 6"),
    (r"margin.*(trading|purchase|ratio)", "Art 8"),
    (r"(borrowed|short).*securit", "Art 13"),
    (r"day trading.*(ratio|volume)", "Art 14"),
    # Generic: "met Attention Securities criteria" → check for specific patterns
    (r"for a period of.*consecutive business days.*attention", "Art 2/4"),  # consecutive trigger
    (r"for.*days in the preceding.*business days.*attention", "Art 10/11"),  # intermittent trigger
    (r"attention.*price-to-earnings|P/E.*attention", "Art 7"),
]

# Also check the "Disposal Condition" field (index 7) which has more detail
CONDITION_KEYWORDS = [
    (r"The cumulative (increase|decrease).*closing price.*six.*business days", "Art 2"),
    (r"The cumulative (increase|decrease).*closing price.*(thirty|sixty|ninety)", "Art 3"),
    (r"trading volume.*at least.*average", "Art 10"),
    (r"cumulative.*turnover.*six.*business days", "Art 11"),
    (r"The difference between.*closing price.*initial.*final.*six.*business days", "Art 12"),
    (r"intraday turnover.*at least", "Art 5"),
    (r"price-to-earnings.*price-to-book", "Art 7"),
    (r"single securities firm.*accounted.*day trading", "Art 6"),
    (r"(margin|long/short).*ratio", "Art 8"),
    (r"borrowed securities sales", "Art 13"),
    (r"day trading.*accounted.*(more|over|above)", "Art 14"),
]


def classify_text(text: str, keywords: list[tuple]) -> list[str]:
    """Classify text against keyword list, returning matched article names."""
    if not text:
        return []
    text_lower = text.lower()
    articles = []
    for pattern, article in keywords:
        if re.search(pattern, text_lower):
            if article not in articles:
                articles.append(article)
    return articles


def fetch_tpex_disposals(start_date: str, end_date: str) -> list[dict]:
    """
    Fetch TPEx disposition list for a date range.
    Dates in YYYY/MM/DD format.
    """
    start_enc = start_date.replace("/", "%2F")
    end_enc = end_date.replace("/", "%2F")
    url = (
        f"https://www.tpex.org.tw/www/en-us/bulletin/disposal"
        f"?startDate={start_enc}&endDate={end_enc}"
        f"&code=&cate=&type=all&reason=-1&measure=-1"
        f"&order=date&id=&response=json"
    )
    try:
        r = requests.get(url, headers=HEADERS, verify=False, timeout=30)
        data = r.json()
        if data.get("stat") != "ok" or not data.get("tables"):
            return []
        table = data["tables"][0]
        results = []
        for row in table.get("data", []):
            if len(row) < 8:
                continue
            sym = str(row[2]).strip()
            # Strip HTML from name
            name_raw = str(row[3])
            name = re.sub(r"<[^>]+>", "", name_raw).strip()
            # Remove trailing URL
            name = re.sub(r"\(\.\..*\)$", "", name).strip()
            date = str(row[1]).strip()
            reason = str(row[6]).strip() if len(row) > 6 else ""
            condition = str(row[7]).strip() if len(row) > 7 else ""
            period = str(row[5]).strip() if len(row) > 5 else ""

            # Classify from both reason and condition fields
            reason_articles = classify_text(reason, REASON_KEYWORDS)
            condition_articles = classify_text(condition, CONDITION_KEYWORDS)
            all_articles = list(dict.fromkeys(reason_articles + condition_articles))

            results.append({
                "symbol": sym,
                "name": name,
                "date": date,
                "reason": reason,
                "condition": condition[:300],
                "period": period,
                "exchange": "TPEx",
                "triggered_articles": all_articles,
                "primary_article": all_articles[0] if all_articles else "Unknown",
            })
        return results
    except Exception as e:
        print(f"  Error fetching TPEx {start_date}~{end_date}: {e}")
        return []


def scrape_tpex(months_back: int = 12):
    """Scrape TPEx disposition history going back N months in 1-month chunks."""
    all_dispositions = []
    seen = set()

    end_date = datetime.now()
    for i in range(months_back):
        chunk_end = end_date - timedelta(days=i * 30)
        chunk_start = chunk_end - timedelta(days=30)

        start_str = chunk_start.strftime("%Y/%m/%d")
        end_str = chunk_end.strftime("%Y/%m/%d")

        print(f"Fetching TPEx {start_str} to {end_str}...")
        dispos = fetch_tpex_disposals(start_str, end_str)
        new = 0
        for d in dispos:
            key = f"{d['symbol']}_{d['date']}"
            if key not in seen:
                seen.add(key)
                all_dispositions.append(d)
                new += 1
        print(f"  Got {len(dispos)} rows, {new} new (total: {len(all_dispositions)})")
        time.sleep(0.5)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_dispositions, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(all_dispositions)} TPEx dispositions to {OUTPUT_FILE}")
    return all_dispositions


def analyze():
    """Quick analysis of scraped TPEx data."""
    if not os.path.exists(OUTPUT_FILE):
        print(f"No data file. Run scrape_tpex() first.")
        return
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        dispositions = json.load(f)

    total = len(dispositions)
    primary = Counter(d["primary_article"] for d in dispositions)
    all_arts = Counter()
    for d in dispositions:
        for a in d["triggered_articles"]:
            all_arts[a] += 1

    print(f"\nTPEx Dispositions: {total}")
    print(f"\nPrimary Trigger:")
    for art, count in primary.most_common(10):
        print(f"  {art:12s} {count:4d}  {count/total*100:5.1f}%")
    print(f"\nAll Articles:")
    for art, count in all_arts.most_common():
        print(f"  {art:12s} {count:4d}  {count/total*100:5.1f}%")


if __name__ == "__main__":
    scrape_tpex(months_back=6)
    analyze()
