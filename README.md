# Taiwan Stock Monitor Dashboard (EquitiTrack)

This project contains a **FastAPI** backend for scraping/serving Taiwanese stock data (TWSE and TPEx) and a **React + Vite** frontend mimicking a professional institutional trading terminal.

## 🚀 Quick Start Guide

### 1. Start the Backend (FastAPI)

The backend handles all the heavy lifting: scraping Yahoo Finance, parsing the Taiwan Stock Exchange master lists, and caching everything into isolated `.txt` tab-separated files.

Open a terminal and run the following commands:
```bash
# Navigate to the backend directory
cd monitoring

# Install required Python packages (if you haven't already)
pip install fastapi uvicorn yfinance pandas requests

# Start the local ASGI server
uvicorn main:app --reload --port 8000
```
*The backend will now be available at `http://localhost:8000`*

### 2. Start the Frontend (React + Vite)

The frontend visualizes the backend `.txt` data chunks using Recharts and Tailwind CSS.

Open a **separate** terminal and run:
```bash
# Navigate to the frontend directory
cd frontend

# Start the Vite development server
npm run dev
```
*Access the dashboard in your browser at `http://localhost:5173`*


---


## 📡 API Endpoints Reference

The backend exposes several routes mapped under `/api/`. You can invoke these directly via the frontend dashboard, or manually hit them using tools like `curl`, Postman, or Python `requests`.

### Refresh & Scrape Actions (POST)
These endpoints trigger the server to go out and fetch new data, saving it structurally into `monitoring/data/`.

| Endpoint | Description | Example cURL |
|----------|-------------|--------------|
| **`POST /api/refresh/tickers`** | Scrapes the master list of all available Taiwanese stocks (TWSE+TPEx) natively from the government sites. | `curl -X POST http://localhost:8000/api/refresh/tickers` |
| **`POST /api/refresh/intraday/all`** | Triggers massive concurrent fetching of intraday data for *all* stocks in the master list. Supports `?limit=` to prevent locking up or getting IP banned during tests. | `curl -X POST "http://localhost:8000/api/refresh/intraday/all?limit=10"` |
| **`POST /api/refresh/intraday/{ticker}`** | Fetches the latest 1-month / hourly intervals for a single specified ticker (e.g., `2330.TW`). | `curl -X POST http://localhost:8000/api/refresh/intraday/2330.TW` |
| **`POST /api/refresh/historical/{ticker}`**| Fetches the past 5 years of daily historical data for a specific ticker. | `curl -X POST http://localhost:8000/api/refresh/historical/2330.TW` |


### Data Retrieval Actions (GET)
These endpoints read the cached `.txt` files saved by the refresh endpoints and stream them directly back to the client (used by your React charts).

| Endpoint | Description | Example cURL |
|----------|-------------|--------------|
| **`GET /`** | Basic health check. Ensures API is alive. | `curl http://localhost:8000/` |
| **`GET /api/data/intraday/{ticker}`** | Returns the cached intraday raw text data for a target ticker. **Requires corresponding refresh action first.** | `curl http://localhost:8000/api/data/intraday/2330.TW` |
| **`GET /api/data/historical/{ticker}`** | Returns the stacked 5-year text data cache for a target ticker. | `curl http://localhost:8000/api/data/historical/2330.TW` |

> **Note:** If you attempt to `GET` data for a ticker that has not been `POST` refreshed yet, the server will correctly return a `404 Data not found` error directing you to call the refresh endpoint first.
