"""
Combined TWSE + TPEx disposition analysis.
"""
import json
import os
from collections import Counter
from datetime import datetime


def load(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def analyze():
    twse = load("twse_dispositions.json")
    tpex = load("tpex_dispositions.json")
    # Filter TPEx to stocks only
    tpex = [d for d in tpex if "BOND" not in d.get("name", "").upper() and len(d["symbol"]) <= 6]
    # Normalize TPEx primary article
    for d in tpex:
        if d.get("primary_article") == "Art 2/4":
            d["primary_article"] = "Art 2"

    all_disp = twse + tpex
    total = len(all_disp)
    if total == 0:
        print("No data. Run scrape_twse.py and scrape_tpex.py first.")
        return

    print(f"TWSE: {len(twse)}   TPEx: {len(tpex)}   Total: {total}")
    print(f"Date range: TWSE {twse[-1]['date'] if twse else '?'} to {twse[0]['date'] if twse else '?'}")
    print()

    # ---- Primary deciding article ----
    primary = Counter()
    twse_pri = Counter()
    tpex_pri = Counter()
    for d in twse:
        art = d.get("primary_article", "Unknown")
        primary[art] += 1
        twse_pri[art] += 1
    for d in tpex:
        art = d.get("primary_article", "Unknown")
        primary[art] += 1
        tpex_pri[art] += 1

    print("PRIMARY DECIDING ARTICLE")
    print("=" * 70)
    print(f"  {'Article':14s} {'Total':>6s} {'%':>6s}  {'TWSE':>6s} {'TPEx':>6s}  Dist")
    print(f"  {'-'*14} {'-'*6} {'-'*6}  {'-'*6} {'-'*6}  {'-'*30}")
    for art, count in primary.most_common(12):
        pct = count / total * 100
        tw = twse_pri.get(art, 0)
        tp = tpex_pri.get(art, 0)
        bar = chr(0x2588) * int(pct / 2)
        print(f"  {art:14s} {count:6d} {pct:5.1f}%  {tw:6d} {tp:6d}  {bar}")

    # ---- All articles mentioned (TWSE detail) ----
    all_arts = Counter()
    for d in twse:
        for art in d.get("triggered_articles", []):
            all_arts[art] += 1
    for d in tpex:
        for art in d.get("triggered_articles", []):
            clean = art.replace("Art 2/4", "Art 2")
            all_arts[clean] += 1

    if all_arts:
        print(f"\nALL ARTICLES MENTIONED (N={len(twse)} TWSE + {len(tpex)} TPEx)")
        print("=" * 70)
        for art, count in all_arts.most_common():
            pct = count / total * 100
            bar = chr(0x2588) * int(pct)
            print(f"  {art:14s} {count:6d}  {pct:5.1f}%  {bar}")

    # ---- Engine coverage ----
    covered = {"Art 2", "Art 3", "Art 4", "Art 5", "Art 7", "Art 10", "Art 11", "Art 12", "Art 4-1"}
    stubs = {"Art 6", "Art 8", "Art 9", "Art 13", "Art 14"}
    cov_count = sum(c for a, c in all_arts.items() if a in covered) if all_arts else 0
    stub_count = sum(c for a, c in all_arts.items() if a in stubs) if all_arts else 0
    total_m = sum(all_arts.values()) if all_arts else 1
    unknown_pri = primary.get("Unknown", 0)

    print(f"\nENGINE COVERAGE")
    print("=" * 70)
    print(f"  Computable primary triggers: {(total - unknown_pri)}/{total} ({(total-unknown_pri)/total*100:.1f}%)")
    print(f"  Computable article mentions:  {cov_count}/{total_m} ({cov_count/total_m*100:.1f}%)")
    print(f"  Stubbed article mentions:      {stub_count}/{total_m} ({stub_count/total_m*100:.1f}%)")

    # ---- Repeat offenders ----
    stock_counter = Counter()
    for d in all_disp:
        stock_counter[(d["symbol"], d.get("exchange", "?"))] += 1

    repeat = [(s, e, c) for (s, e), c in stock_counter.most_common() if c > 1]
    if repeat:
        print(f"\nREPEAT OFFENDERS ({len(repeat)} stocks)")
        print("=" * 70)
        for sym, ex, count in repeat[:12]:
            names = [d["name"] for d in all_disp if d["symbol"] == sym]
            name = names[0][:30] if names else "?"
            print(f"  {sym:8s} [{ex}] {name:32s} {count} dispositions")

    # ---- Key findings ----
    top3 = primary.most_common(3)
    print(f"\nKEY FINDINGS")
    print("=" * 70)
    for i, (art, count) in enumerate(top3, 1):
        pct = count / total * 100
        print(f"  {i}. {art} explains {pct:.1f}% of designations ({count}/{total})")
    print(f"\n  Per-exchange:")
    for art, _ in top3:
        tw = twse_pri.get(art, 0)
        tp = tpex_pri.get(art, 0)
        d1 = len(twse) if twse else 1
        d2 = len(tpex) if tpex else 1
        print(f"    {art}: TWSE {tw}/{len(twse)} ({tw/d1*100:.1f}%)  TPEx {tp}/{len(tpex)} ({tp/d2*100:.1f}%)")


if __name__ == "__main__":
    analyze()
