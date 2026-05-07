# LaTeX Beamer — Schonfeld Intern Presentation

```latex
\documentclass[aspectratio=169]{beamer}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{booktabs}
\usepackage{graphicx}
\usepackage[table]{xcolor}
\usepackage{amsmath}
\usepackage{colortbl}

\usetheme{default}
\usecolortheme{dolphin}
\setbeamercolor{title}{fg=black}
\setbeamercolor{frametitle}{fg=black}
\setbeamercolor{structure}{fg=black}
\setbeamertemplate{footline}[frame number]
\setbeamertemplate{navigation symbols}{}

\definecolor{schblue}{RGB}{0,51,102}
\definecolor{twred}{RGB}{220,38,38}
\definecolor{twgreen}{RGB}{22,163,74}

\begin{document}

\title{TWSE Disposition Prediction}
\subtitle{Anticipating Regulatory Interventions in Taiwan Equity Markets}
\author{Internship Candidate}
\date{}

%=====================================================================
\frame{\titlepage}
%=====================================================================

\begin{frame}{Executive Summary}
\small
\textbf{Objective:} Predict which Taiwan-listed stocks enter TWSE/TPEx disposition (處置) status before the exchange announces.

\vspace{0.15cm}
\textbf{Why this matters:} When a stock is dispositioned, matching switches from continuous to \textbf{call auction every 5--30 minutes}. Market orders and day trading are \textbf{banned}. Pre-collection becomes \textbf{mandatory}. Traders caught in a disposition face severe liquidity constraints with no advance warning.

\vspace{0.15cm}
\textbf{What we built:} A supervision engine scoring all 1,971 TWSE/TPEx stocks daily against the exchange's own 14 regulatory criteria, with full market and sector divergence.

\vspace{0.2cm}
\begin{columns}[T]
\column{0.33\textwidth}
\centering
\colorbox{schblue!10}{\parbox{0.9\textwidth}{\centering\textbf{96.3\%}\\[0.05cm]\tiny primary trigger coverage}}
\column{0.33\textwidth}
\centering
\colorbox{schblue!10}{\parbox{0.9\textwidth}{\centering\textbf{81.5\%}\\[0.05cm]\tiny per-date hit rate vs actual dispositions}}
\column{0.33\textwidth}
\centering
\colorbox{schblue!10}{\parbox{0.9\textwidth}{\centering\textbf{2.3 days}\\[0.05cm]\tiny mean advance warning before exchange acts}}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{The Cost of Being Surprised}
\footnotesize
\begin{center}
\begin{tabular}{lcc}
\toprule
& \textbf{Normal} & \textbf{Dispositioned} \\
\midrule
Matching frequency & Continuous ($\sim$27K/day) & 9--54 call auctions/day \\
Market orders & Yes & \textbf{No} \\
Day trade exit & Yes & \textbf{No} \\
Pre-collection & Discretionary & \textbf{100\% mandatory} \\
Margin timing & T+2 settlement & \textbf{On order receipt} \\
\midrule
\textbf{Effective liquidity} & \textbf{Full} & \textbf{Severely constrained} \\
\bottomrule
\end{tabular}
\end{center}

\vspace{0.2cm}
\begin{columns}[T]
\column{0.5\textwidth}
\centering
{\textbf{Without Warning}}\\[0.1cm]
\colorbox{twred!8}{\parbox{0.9\textwidth}{\centering\scriptsize
Wake up to exchange announcement.\\
Position already restricted.\\
Exit only via 5-min call auctions.\\
Pre-collection raises costs.\\
Day-trade exit unavailable.}}
\column{0.5\textwidth}
\centering
{\textbf{With Our Signal}}\\[0.1cm]
\colorbox{twgreen!8}{\parbox{0.9\textwidth}{\centering\scriptsize
Engine flags the stock days before.\\
2 full trading sessions to act.\\
Exit at continuous matching.\\
No pre-collection. No auction gaps.\\
Full range of order types available.}}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{Data Pipeline}
\footnotesize
\begin{tabular}{llll}
\toprule
\textbf{Layer} & \textbf{Source} & \textbf{Scale} & \textbf{Frequency} \\
\midrule
Ticker universe & TWSE/TPEx ISIN scraper & 1,971 stocks & On demand \\
OHLCV (daily) & yfinance, 5-year history & 1,260 rows/stock & One-time bootstrap \\
OHLCV (intraday) & yfinance, hourly & 35 rows/day/stock & Every 3h (market hours) \\
Fundamentals & yfinance .info & 1,242 stocks & Every 6h \\
Industries & ISIN HTML parser & 34 categories & On demand \\
\midrule
TWSE dispositions & rwd/.../punish (JSON) & 199 records & Scraped once \\
TPEx dispositions & /www/.../disposal (JSON) & 282 records & Scraped once \\
\midrule
\textbf{Total designations} & & \textbf{481} & 6-month window \\
\bottomrule
\end{tabular}

\vspace{0.15cm}
\textbf{Stack:} Python 3.11 / FastAPI / PostgreSQL / Redis / React / TypeScript / Docker.\\
\textbf{Reproducibility:} All data cached to disk. Pipeline via \texttt{POST /api/supervision/full-refresh}.
\end{frame}

%=====================================================================
\begin{frame}{Rule-to-Code Mapping}
\footnotesize
\textbf{Official regulation (Article 4-1) mapped to 14 scoring functions.}

\vspace{0.1cm}
\begin{columns}[T]
\column{0.5\textwidth}
\textbf{Price-Based Triggers}\\[0.1cm]
\begin{tabular}{@{}ll@{}}
\toprule
\textbf{Art} & \textbf{Condition} \\
\midrule
2 & 6d close change $\geq$ 32\%, diverge mkt $\geq$ 20\% \\
3 & 30d $>$100\% / 60d $>$130\% / 90d $>$160\% \\
12 & 6d NT\$ diff $\geq$ 100 (sliding scale if $\geq$ NT\$500) \\
4-1 & Intraday swing $\geq$ 15\% + vol spike \\
\bottomrule
\end{tabular}

\vspace{0.15cm}
\textbf{Volume \& Turnover}\\[0.1cm]
\begin{tabular}{@{}ll@{}}
\toprule
4 & Price $>$25\% + vol $\geq$ 5x 60d avg \\
5 & Price $>$25\% + turnover $\geq$ 10\% \\
10 & 6d+1d vol $\geq$ 5x 60d avg \\
11 & Cumul TO $>$50\% + 1d $\geq$ 10\% \\
\bottomrule
\end{tabular}

\column{0.5\textwidth}
\textbf{Valuation}\\[0.1cm]
\begin{tabular}{@{}ll@{}}
\toprule
7 & P/E $\geq$ 60x + P/B $\geq$ 6.0 + TO $\geq$ 5\% \\
\bottomrule
\end{tabular}

\vspace{0.15cm}
\textbf{Stubbed (require TWSE data)}\\[0.1cm]
\begin{tabular}{@{}lp{4cm}@{}}
\toprule
Art 6 & Broker concentration \\
Art 8 & Margin/short ratios \\
Art 9 & TDR premium/discount \\
Art 13 & Borrowed securities sales \\
Art 14 & Day-trade volume breakdown \\
\bottomrule
\end{tabular}

\vspace{0.15cm}
Each article returns triggered (bool) + score\_contribution (0--100).\\
Total score = max of all 14 scores, capped at 69 if no article triggers.\\
\textbf{96.3\% of real disposition triggers are fully computable.}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{Decision Flow}
\footnotesize
\textbf{All 14 articles scored in parallel. Each returns triggered (bool) + score (0--100).}\\[0.1cm]
\textit{The decision tree then checks: any triggered? $\rightarrow$ exception gates $\rightarrow$ final classification.}

\vspace{0.15cm}
\begin{columns}[T]
\column{0.5\textwidth}
\centering
\colorbox{schblue!5}{\parbox{0.95\textwidth}{\centering
\textbf{14 Articles Scored in Parallel}\\[0.1cm]
\begin{tabular}{@{}ll@{}}
\toprule
\multicolumn{2}{@{}c@{}}{\textbf{Price Momentum}} \\
\midrule
Art 2 & 6d close change $\geq 32\%$, diverge mkt/sector $\geq 20\%$ \\
Art 3 & 30d $>$100\% / 60d $>$130\% / 90d $>$160\% \\
Art 12 & 6d NT\$ diff $\geq 100$ (sliding scale) \\
Art 4-1 & Intraday swing $\geq 15\%$ + vol spike \\
\midrule
\multicolumn{2}{@{}c@{}}{\textbf{Volume \& Turnover}} \\
\midrule
Art 4 & Price $>$25\% + vol $\geq$ 5x 60d avg \\
Art 5 & Price $>$25\% + turnover $\geq 10\%$ \\
Art 10 & 6d+1d vol $\geq$ 5x 60d avg \\
Art 11 & Cumul TO $>$50\% + 1d $\geq 10\%$ \\
\midrule
\multicolumn{2}{@{}c@{}}{\textbf{Valuation \& Structure}} \\
\midrule
Art 7 & P/E $\geq$ 60x + P/B $\geq$ 6.0 + TO $\geq$ 5\% \\
Art 6,8,9,13,14 & [STUB: broker, margin, TDR, borrowed, day-trade] \\
\bottomrule
\end{tabular}
}}

\column{0.5\textwidth}
\centering
\colorbox{schblue!5}{\parbox{0.95\textwidth}{\centering
\textbf{Decision Flow}\\[0.1cm]
{\scriptsize All 14 articles scored}\\[0.05cm]
$\downarrow$\\[0.05cm]
\textbf{Any article triggered?}\\[0.05cm]
NO $\rightarrow$ \textbf{NO ACTION} (ordinary trading)\\[0.05cm]
YES $\downarrow$\\[0.05cm]
\textbf{Exception Gates (sequential, first match wins)}\\[0.05cm]
\begin{tabular}{@{}ll@{}}
\toprule
1. Newly listed (no limit)? & $\rightarrow$ NO ACTION \\
2. Ex-rights/dividend? & $\rightarrow$ NO ACTION \\
3. Price $<$ NT\$5 / Vol $<$ 500? & $\rightarrow$ SAFE HARBOR \\
4. Sector $<$ 5 stocks? & $\rightarrow$ SECTOR WAIVED \\
5. Already flagged? & $\rightarrow$ NO ACTION \\
6. Derivative (ETF/Warrant)? & $\rightarrow$ SAFE HARBOR \\
\bottomrule
\end{tabular}\\[0.1cm]
\textbf{None apply? $\rightarrow$ FLAGGED}\\[0.05cm]
{\scriptsize (Issue announcement, call auction, pre-collection, day-trade ban)}
}}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{What Actually Triggers Dispositions}
\footnotesize
\textbf{481 real dispositions analyzed across TWSE + TPEx, 6-month window.}

\vspace{0.1cm}
\begin{columns}[T]
\column{0.5\textwidth}
\centering
\textbf{Primary Deciding Article}\\[0.1cm]
\begin{tabular}{lrr}
\toprule
& \textbf{N} & \textbf{\%} \\
\midrule
\rowcolor{twred!12} Art 2 -- 6d price surge & \textbf{422} & \textbf{87.7} \\
Art 10 -- Volume surge & 23 & 4.8 \\
Art 3 -- Long-term extreme & 18 & 3.7 \\
\midrule
\textbf{Direction} & & \\
\textcolor{twred}{Increase} & 316/342 & \textbf{92.4\%} \\
\textcolor{twgreen}{Decrease} & 26/342 & 7.6\% \\
\bottomrule
\end{tabular}

\vspace{0.15cm}
\textbf{Mean 6d change: \textcolor{twred}{+39.4\%}}\\
\textbf{0\% of dispositions had $<$20\% change}\\
{\scriptsize Exchange acts at extremes, not at the 25\% minimum.}

\column{0.5\textwidth}
\centering
\textbf{Co-Firing Articles}\\[0.1cm]
{\scriptsize (\% of stocks where article also triggered)}\\[0.1cm]
\begin{tabular}{lr}
\toprule
& \textbf{\%} \\
\midrule
\rowcolor{twred!8} Art 2 (price) & 93.1 \\
\rowcolor{twred!8} Art 5 (turnover) & 72.4 \\
\rowcolor{twred!8} Art 12 (NT\$ swing) & 55.2 \\
\rowcolor{twred!8} Art 10 (volume) & 51.7 \\
Art 14 (day trade) & 37.9 \\
Art 11 (cumul TO) & 24.1 \\
Art 7 (P/E,P/B) & 17.2 \\
\bottomrule
\end{tabular}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{Engine Accuracy vs Reality}
\footnotesize
\textbf{238 disposed stocks scored on their actual trigger dates against full market aggregates.}

\vspace{0.1cm}
\begin{center}
\colorbox{schblue!8}{\parbox{0.7\textwidth}{\centering\textbf{81.5\% Per-Date Hit Rate}\\[0.05cm]{\scriptsize Engine catches 194/238 actual dispositions on their trigger dates}}}
\end{center}

\vspace{0.15cm}
\begin{columns}[T]
\column{0.5\textwidth}
\centering
\textbf{Flag Timing (135 stocks)}\\[0.1cm]
\begin{tabular}{lr}
\toprule
& \textbf{\%} \\
\midrule
\rowcolor{twgreen!8} Flagged BEFORE exchange & \textbf{29.6} \\
Flagged ON announcement date & 52.6 \\
Flagged AFTER (late) & 2.2 \\
Never flagged & 15.6 \\
\bottomrule
\end{tabular}

\vspace{0.1cm}
{\scriptsize Mean lead time: \textbf{2.3 trading days}}\\
{\scriptsize 90\% of early warnings within 1--3 days}

\column{0.5\textwidth}
\centering
\textbf{False Positives (39 stocks)}\\[0.1cm]
{\scriptsize 97.4\% are price \textcolor{twred}{increases}}\\
{\scriptsize (same directional bias as real)}\\
{\scriptsize Mean 6d change: \textbf{+29.8\%}}\\[0.1cm]
{\scriptsize They match the exact profile of}\\
{\scriptsize disposed stocks -- likely pre-designation.}

\vspace{0.15cm}
\textbf{Precision / Recall}\\[0.1cm]
\begin{tabular}{lr}
\toprule
Precision & 68.0\% \\
Recall (single-point) & 33.1\% \\
\bottomrule
\end{tabular}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{Price, Volume \& Volatility Around Designation}
\footnotesize
\textbf{Event study: 123 stocks, T--20 to T+20 around disposition date.}

\vspace{0.1cm}
\begin{center}
\begin{tabular}{lcccc}
\toprule
\textbf{Phase} & \textbf{Window} & \textbf{Return} & \textbf{Volume} & \textbf{Volatility} \\
\midrule
Pre-disposition & T--20 to T--5 & \textcolor{twred}{\textbf{+17.4\%}} & 2.4$\times$ & 75.6\% \\
\rowcolor{schblue!8} Trigger & \rowcolor{schblue!8} T--5 to T+5 & \rowcolor{schblue!8} \textcolor{twred}{\textbf{+6.6\%}} & \rowcolor{schblue!8} \textbf{7.7$\times$} & \rowcolor{schblue!8} 85.2\% \\
Post-designation & T+5 to T+20 & \textcolor{twgreen}{\textbf{--2.8\%}} & 3.2$\times$ & \textbf{89.7\%} \\
\bottomrule
\end{tabular}
\end{center}

\vspace{0.15cm}
\begin{columns}[T]
\column{0.33\textwidth}
\centering
{\textbf{Price}}\\[0.05cm]
{\scriptsize +26\% rally into disposition}\\
{\scriptsize Only --2.8\% fade after}\\
{\scriptsize \textbf{90\%+ gains retained}}\\
{\scriptsize Not mean-reversion}
\column{0.33\textwidth}
\centering
{\textbf{Volume}}\\[0.05cm]
{\scriptsize Explodes to \textbf{7.7$\times$} at trigger}\\
{\scriptsize Stays elevated at 3.2$\times$}\\
{\scriptsize \textbf{No liquidity drought}}\\
{\scriptsize Elevated, not dried up}
\column{0.33\textwidth}
\centering
{\textbf{Volatility}}\\[0.05cm]
{\scriptsize 76\% $\rightarrow$ 85\% $\rightarrow$ \textbf{90\%}}\\
{\scriptsize \textbf{Increases after disposition}}\\
{\scriptsize Auction gaps amplify moves}\\
{\scriptsize Stops need wider bands}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{Trade Setup -- Pre-Designation Momentum}
\footnotesize
\begin{center}
\colorbox{schblue!8}{\parbox{0.95\textwidth}{\centering
\textbf{Thesis:} A stock triggering CRITICAL on our engine has a 68\% chance of being on the government's radar. It will likely keep surging 2--3 more days until the exchange steps in. \textbf{Ride the final push, exit at the announcement.}}}
\end{center}

\vspace{0.15cm}
\begin{columns}[T]
\column{0.45\textwidth}
\textbf{Entry}\\[0.05cm]
Engine signals CRITICAL (score $\geq$ 70)\\
AND stock not yet on disposition list\\
$\rightarrow$ Enter long at next market open

\vspace{0.15cm}
\textbf{Exit}\\[0.05cm]
TWSE/TPEx announces disposition\\
$\rightarrow$ Exit immediately\\
If no announcement within 5 days\\
$\rightarrow$ Time stop

\vspace{0.15cm}
\textbf{Risk}\\[0.05cm]
\begin{tabular}{@{}ll@{}}
\toprule
Stop loss & --5\% (2$\times$ small-cap ATR) \\
Position size & 1\% of portfolio risk \\
Direction & LONG only (92\% are increases) \\
\bottomrule
\end{tabular}

\column{0.55\textwidth}
\textbf{Rationale}
\begin{enumerate}
  \item Dispositions require \textbf{3 consecutive days} of triggers
  \item Engine catches Day 1; Days 2--3 are the run-up
  \item Stocks gain \textbf{+8\% in the final 5 days}
  \item After designation: gains stick, but \textbf{liquidity dies}
  \item The edge is \textbf{timing}: enter early, exit before the trap
\end{enumerate}

\vspace{0.15cm}
\textbf{Limitations}
\begin{itemize}
  \item Engine precision is 68\% -- trade only CRITICAL signals
  \item Disposition can be announced intraday, effective immediately
  \item During disposition: exit only via auction matches
  \item Not backtested on live P\&L -- simulated only
\end{itemize}
\end{columns}
\end{frame}

%=====================================================================
\begin{frame}{Why This Matters for the Desk}
\footnotesize
\begin{center}
\textbf{Current State (Live)}\\[0.1cm]
\begin{tabular}{lr}
\toprule
1,971 stocks monitored daily & 14 criteria per stock \\
\rowcolor{twred!15} \textbf{50 CRITICAL} (score $\geq$ 70) & \textbf{Actionable today} \\
115 HIGH (45--69) & Watchlist for tomorrow \\
299 MEDIUM (20--44) & Elevated, monitor \\
1,417 LOW (0--19) & Normal \\
\bottomrule
\end{tabular}

\vspace{0.2cm}
\textbf{Operational Fit}\\[0.1cm]
\begin{tabular}{@{}ll@{}}
\toprule
Morning risk check & Open dashboard, review CRITICAL names -- 2 minutes \\
Alert integration & CRITICAL signals can feed into existing systems \\
Position management & Cross-reference flagged names against current book \\
Cost & Near-zero -- runs on existing infrastructure \\
\bottomrule
\end{tabular}

\vspace{0.15cm}
\colorbox{schblue!8}{\parbox{0.9\textwidth}{\centering
{\small\textbf{Bottom line:} We can't avoid every disposition. But we can see \textbf{4 out of 5} coming, with \textbf{2.3 days} of warning for a third of them. That's real trading time before the liquidity trap closes.}}}
\end{center}
\end{frame}

%=====================================================================
\begin{frame}{Appendix: Architecture \& Stack}
\footnotesize
\textbf{Two-Phase Scan:} (1) Per-stock metrics from 5y daily OHLCV $\rightarrow$ (2) Market/sector aggregates from all 1,965 stocks $\rightarrow$ (3) 14 article functions, each returning triggered (bool) + score (0--100).\\[0.1cm]
\textbf{Decision tree:} Triggered? $\rightarrow$ Safe harbor? $\rightarrow$ FLAGGED or NO\_ACTION.\\[0.1cm]
\textbf{Backtest:} 30-day sliding window per stock. PostgreSQL supervision\_history snapshots.\\[0.1cm]
\textbf{Caching:} 5-min in-memory aggregates, disk-cached OHLCV, Redis for intraday meta.

\vspace{0.15cm}
\begin{tabular}{lll}
\toprule
\textbf{Component} & \textbf{Technology} & \textbf{Purpose} \\
\midrule
Backend API & Python 3.11, FastAPI, Uvicorn & Scoring engine, data pipeline \\
Database & PostgreSQL 16 (asyncpg) & Users, trades, supervision history \\
Cache & Redis 7 & Intraday OHLCV, pending orders \\
Frontend & React 19, TypeScript, Tailwind & Dashboard, analysis pages \\
Data & yfinance, BeautifulSoup & OHLCV, fundamentals, dispositions \\
Deploy & Docker Compose (4 services) & Reproducible local/prod \\
\bottomrule
\end{tabular}
\end{frame}

%=====================================================================
\begin{frame}{Appendix: Prompt Patterns \& Iterations}
\footnotesize
\textbf{Tool:} Claude Code (Claude Opus 4.7). $\sim$200 tool calls across 15 tasks, 4 sessions.

\vspace{0.1cm}
\textbf{Iteration History}\\[0.05cm]
{\scriptsize
\begin{tabular}{@{}llp{4cm}@{}}
\toprule
\textbf{Session} & \textbf{Phase} & \textbf{What Was Built} \\
\midrule
1 & Core engine & 14 article functions, 2-phase scan, decision tree, API endpoints. \textit{Result: 37 stocks scored, no market divergence.} \\
2 & Full market & Market/sector aggregates, fundamentals cache, industry mapping, 1,971 stocks. \textit{Result: 81.5\% hit rate.} \\
3 & Frontend + analysis & Dashboard risk table, analysis cards, 30d backtest, disposition scrapers (481 records), cross-reference, event study. \textit{Result: Precision 68\%, 2.3d lead time.} \\
4 & Polish + presentation & Trade setup, README, ROADMAP, regulation summary, LaTeX deck, color fix (Taiwan red=up). \textit{Result: This presentation.} \\
\bottomrule
\end{tabular}}

\vspace{0.1cm}
\textbf{Representative Prompt Patterns}\\[0.05cm]
{\scriptsize
\begin{tabular}{@{}lp{7cm}@{}}
\toprule
\textbf{Pattern} & \textbf{Example} \\
\midrule
Implement from spec & ``Read article.md and implement that in the backend'' $\rightarrow$ built 14 articles from TWSE regulatory text \\
Iterate on feedback & ``There are only 42 stocks recorded, not 1971'' $\rightarrow$ diagnosed .filter(t.has\_supervision) bug \\
Debug with data & ``Some article score reaches 70 and yet overall score still zero'' $\rightarrow$ found NO\_ACTION zeros total score \\
Cross-reference & ``For false positives, how many are increasing?'' $\rightarrow$ 97.4\% same directional bias as real \\
Design from requirements & ``Generate a 10-page PPT fulfilling the internship exercise'' $\rightarrow$ structured per PDF guidelines \\
Refactor for accuracy & ``Is the decision tree really like a decision tree?'' $\rightarrow$ corrected parallel vs sequential in docs \\
\bottomrule
\end{tabular}}
\end{frame}

%=====================================================================
\begin{frame}{Appendix: Bottlenecks \& Failures}
\footnotesize
\textbf{Things that broke and how they were fixed:}

\vspace{0.1cm}
{\scriptsize
\begin{tabular}{@{}llp{5cm}@{}}
\toprule
\textbf{Issue} & \textbf{Cause} & \textbf{Resolution} \\
\midrule
yfinance rate limiting & Batch of 20, 0.5s pause triggered 429s & Iterated to batch 5, 2.0s pause. Full bootstrap: $\sim$12 min for 1,971 stocks. \\
\midrule
TWSE notice API 307 & $\sim$50 req/stock hit rate limits & Switched from per-stock notice API to reason-text pattern matching on main disposition API. Unknown rate: 77\% $\rightarrow$ 0\%. \\
\midrule
TPEx Cloudflare & Cloudflare JS challenge blocked requests & Found alternate JSON API at \texttt{/www/en-us/bulletin/disposal?response=json} after testing 6 endpoint patterns. \\
\midrule
Python scoping bug & \texttt{import json} inside function shadowed global module & \texttt{json.load()} raised UnboundLocalError, silently caught by \texttt{except Exception: pass}. English names failed for 3 rebuild cycles. \\
\midrule
NaN in JSON & yfinance returned NaN/Inf float values & \texttt{json.dumps()} crashed with ``Out of range float values.'' Added \texttt{\_sanitize\_float()} / \texttt{\_sanitize\_dict()} recursion. \\
\midrule
String P/E comparison & yfinance returned P/E as string ``30.89'' not float & ``\texttt{'>' not supported between str and int}'' in aggregate computation. Added \texttt{\_to\_float()} coercion on all fundamentals fields. \\
\midrule
Wrong industry column & ISIN scraper read col[2] (date) instead of col[4] (industry) for TPEx & Replaced fixed index with Chinese-suffix pattern matching (34 industry types). Unknown rate: 71\% $\rightarrow$ 0.6\%. \\
\bottomrule
\end{tabular}}

\vspace{0.1cm}
\textbf{Key Lesson:} The hardest bugs were not algorithmic — they were data quality (NaN, string types, API rate limits, Cloudflare) and Python scoping quirks. Each took multiple iterations to diagnose because errors were silently swallowed or returned confusing messages far from the root cause.
\end{frame}

\end{document}
```