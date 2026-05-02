import asyncio
import os
import urllib.parse

import asyncpg
from fastapi import HTTPException, status

DB_URL = os.getenv("DATABASE_URL", "postgres://postgres:admin@localhost:5432/equititrack")

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50)  UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);
"""

CREATE_WATCHLIST_TABLE = """
CREATE TABLE IF NOT EXISTS watchlist (
    id        SERIAL PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol    VARCHAR(20) NOT NULL,
    name      TEXT NOT NULL DEFAULT '',
    item_type VARCHAR(10) NOT NULL DEFAULT 'stock',
    added_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, symbol)
);
"""

CREATE_TRADES_TABLE = """
CREATE TABLE IF NOT EXISTS trades (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol       VARCHAR(20) NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    side         VARCHAR(4) NOT NULL,
    type         VARCHAR(10) NOT NULL DEFAULT 'MARKET',
    price        NUMERIC(12,2) NOT NULL,
    volume       INTEGER NOT NULL,
    total_value  NUMERIC(14,2) NOT NULL,
    limit_price  NUMERIC(12,2),
    traded_at    TIMESTAMPTZ DEFAULT NOW()
);
"""

MIGRATE_TRADES_LIMIT_PRICE = """
ALTER TABLE trades ADD COLUMN IF NOT EXISTS limit_price NUMERIC(12,2);
"""

# ---------------------------------------------------------------------------
# Pool bootstrap
# ---------------------------------------------------------------------------

async def _ensure_database_exists():
    parsed = urllib.parse.urlparse(DB_URL)
    db_name = parsed.path.lstrip('/')
    bootstrap_url = parsed._replace(path='/postgres').geturl()

    conn = await asyncpg.connect(bootstrap_url)
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )
        if not exists:
            # CREATE DATABASE cannot run inside a transaction block
            await conn.execute(f'CREATE DATABASE "{db_name}"')
            print(f"Database '{db_name}' created.")
        else:
            print(f"Database '{db_name}' already exists.")
    finally:
        await conn.close()


async def create_db_pool() -> asyncpg.Pool:
    await _ensure_database_exists()
    last_err = None
    for attempt in range(5):
        try:
            pool = await asyncpg.create_pool(DB_URL, min_size=2, max_size=10)
            async with pool.acquire() as conn:
                await conn.execute(CREATE_USERS_TABLE)
                await conn.execute(CREATE_WATCHLIST_TABLE)
                await conn.execute(CREATE_TRADES_TABLE)
                await conn.execute(MIGRATE_TRADES_LIMIT_PRICE)
            print("DB pool created and schema ensured.")
            return pool
        except (ConnectionRefusedError, OSError) as e:
            last_err = e
            if attempt < 4:
                print(f"DB not ready, retrying in 2s (attempt {attempt + 1}/5)...")
                await asyncio.sleep(2)
    raise last_err  # type: ignore[misc]

# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------

async def get_user_by_username(pool: asyncpg.Pool, username: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, email, hashed_password, created_at FROM users WHERE username = $1",
            username,
        )
    return dict(row) if row else None


async def get_user_by_id(pool: asyncpg.Pool, user_id: int) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, email, created_at FROM users WHERE id = $1",
            user_id,
        )
    return dict(row) if row else None


async def create_user(pool: asyncpg.Pool, username: str, email: str, password: str) -> dict:
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO users (username, email, hashed_password)
                VALUES ($1, $2, $3)
                RETURNING id, username, email, created_at
                """,
                username, email, password,
            )
        except asyncpg.UniqueViolationError as exc:
            detail = "Username already taken" if "username" in str(exc) else "Email already registered"
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    return dict(row)

# ---------------------------------------------------------------------------
# Watchlist helpers
# ---------------------------------------------------------------------------

async def get_watchlist(pool: asyncpg.Pool, user_id: int) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, symbol, name, item_type, added_at FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC",
            user_id,
        )
    return [dict(r) for r in rows]


async def add_to_watchlist(pool: asyncpg.Pool, user_id: int, symbol: str, name: str, item_type: str) -> dict:
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO watchlist (user_id, symbol, name, item_type)
                VALUES ($1, $2, $3, $4)
                RETURNING id, symbol, name, item_type, added_at
                """,
                user_id, symbol, name, item_type,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already in watchlist")
    return dict(row)


async def remove_from_watchlist(pool: asyncpg.Pool, user_id: int, symbol: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM watchlist WHERE user_id = $1 AND symbol = $2",
            user_id, symbol,
        )

# ---------------------------------------------------------------------------
# Trade helpers
# ---------------------------------------------------------------------------

async def create_trade(pool: asyncpg.Pool, user_id: int, symbol: str, name: str,
                       side: str, trade_type: str, price: float, volume: int,
                       limit_price: float | None = None) -> dict:
    total_value = round(price * volume, 2)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO trades (user_id, symbol, name, side, type, price, volume, total_value, limit_price)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, symbol, name, side, type, price, volume, total_value, limit_price, traded_at
            """,
            user_id, symbol, name, side.upper(), trade_type.upper(),
            price, volume, total_value, limit_price,
        )
    return dict(row)


async def get_trades(pool: asyncpg.Pool, user_id: int) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, symbol, name, side, type, price, volume, total_value, limit_price, traded_at "
            "FROM trades WHERE user_id = $1 ORDER BY traded_at DESC",
            user_id,
        )
    return [dict(r) for r in rows]


async def get_net_position(pool: asyncpg.Pool, user_id: int, symbol: str) -> int:
    async with pool.acquire() as conn:
        buy_vol = await conn.fetchval(
            "SELECT COALESCE(SUM(volume), 0) FROM trades WHERE user_id=$1 AND symbol=$2 AND side='BUY'",
            user_id, symbol,
        )
        sell_vol = await conn.fetchval(
            "SELECT COALESCE(SUM(volume), 0) FROM trades WHERE user_id=$1 AND symbol=$2 AND side='SELL'",
            user_id, symbol,
        )
    return int(buy_vol) - int(sell_vol)


async def get_holdings(pool: asyncpg.Pool, user_id: int) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                symbol,
                MAX(name) AS name,
                SUM(CASE WHEN side='BUY' THEN volume ELSE -volume END) AS net_position,
                SUM(CASE WHEN side='BUY' THEN price * volume ELSE 0 END)
                    / NULLIF(SUM(CASE WHEN side='BUY' THEN volume ELSE 0 END), 0) AS avg_buy_price
            FROM trades
            WHERE user_id = $1
            GROUP BY symbol
            HAVING SUM(CASE WHEN side='BUY' THEN volume ELSE -volume END) > 0
            ORDER BY symbol
            """,
            user_id,
        )
    return [dict(r) for r in rows]
