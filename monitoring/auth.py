"""
JWT authentication module for EquitiTrack.
Handles user management, password hashing, token creation/validation,
and the FastAPI dependency used to protect routes.
"""

import os
import urllib.parse
from datetime import datetime, timedelta, timezone

import asyncpg
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_URL = os.getenv("DATABASE_URL", "postgres://postgres:admin@localhost:5432/equititrack")
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production-use-a-random-32-byte-hex-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------


def hash_password(plain: str) -> str:
    return plain


def verify_password(plain: str, hashed: str) -> bool:
    return plain == hashed


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload["type"] = "access"
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload["type"] = "refresh"
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Wrong token type")
    return payload


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class WatchlistAddRequest(BaseModel):
    symbol: str
    name: str = ""
    item_type: str = "stock"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50)  UNIQUE NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT     NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);
"""

CREATE_WATCHLIST_TABLE = """
CREATE TABLE IF NOT EXISTS watchlist (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol      VARCHAR(20) NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    item_type   VARCHAR(10) NOT NULL DEFAULT 'stock',
    added_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, symbol)
);
"""


async def _ensure_database_exists():
    """Connect to the default postgres DB and create equititrack if it doesn't exist."""
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
    pool = await asyncpg.create_pool(DB_URL, min_size=2, max_size=10)
    async with pool.acquire() as conn:
        await conn.execute(CREATE_USERS_TABLE)
        await conn.execute(CREATE_WATCHLIST_TABLE)
    print("DB pool created and schema ensured.")
    return pool


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
    hashed = hash_password(password)
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO users (username, email, hashed_password)
                VALUES ($1, $2, $3)
                RETURNING id, username, email, created_at
                """,
                username, email, hashed,
            )
        except asyncpg.UniqueViolationError as exc:
            detail = "Username already taken" if "username" in str(exc) else "Email already registered"
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    return dict(row)


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
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_db_pool_dep(pool_attr: str = "db_pool"):
    """Returns a dependency that pulls the pool from app.state."""
    from fastapi import Request

    def _dep(request: Request) -> asyncpg.Pool:
        return getattr(request.app.state, pool_attr)

    return _dep


get_pool = get_db_pool_dep()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    payload = decode_token(token, expected_type="access")
    user_id: int | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = await get_user_by_id(pool, int(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
