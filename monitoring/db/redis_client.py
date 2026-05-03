"""
Redis helpers for intraday data caching and pending limit order queue.
Falls back gracefully to None if Redis is unavailable (dev without Docker).
"""

import json
import os
import asyncio

from redis.asyncio import Redis
from redis.exceptions import RedisError

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

_redis: Redis | None = None


async def get_redis() -> Redis | None:
    """Return a connected Redis client, or None if unavailable."""
    global _redis
    if _redis is not None:
        try:
            await _redis.ping()
            return _redis
        except (RedisError, ConnectionRefusedError, OSError):
            _redis = None
    for attempt in range(3):
        try:
            _redis = Redis.from_url(REDIS_URL, decode_responses=True)
            await _redis.ping()
            return _redis
        except (RedisError, ConnectionRefusedError, OSError) as e:
            _redis = None
            if attempt < 2:
                await asyncio.sleep(1)
            else:
                print(f"Redis unavailable: {e}")
    return None


async def save_intraday(symbol: str, records: list[dict]) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.set(f"intraday:{symbol}", json.dumps(records, default=str))


async def get_intraday(symbol: str) -> list[dict] | None:
    r = await get_redis()
    if r is None:
        return None
    raw = await r.get(f"intraday:{symbol}")
    return json.loads(raw) if raw else None


async def save_meta(symbol: str, meta: dict) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.set(f"intraday:meta:{symbol}", json.dumps(meta, default=str))


async def get_meta(symbol: str) -> dict | None:
    r = await get_redis()
    if r is None:
        return None
    raw = await r.get(f"intraday:meta:{symbol}")
    return json.loads(raw) if raw else None


async def get_all_meta() -> list[dict]:
    r = await get_redis()
    if r is None:
        return []
    keys = [k async for k in r.scan_iter("intraday:meta:*")]
    if not keys:
        return []
    vals = await r.mget(keys)
    return [json.loads(v) for v in vals if v]


# ---------------------------------------------------------------------------
# Pending limit order helpers
# ---------------------------------------------------------------------------

async def save_pending_order(order_id: str, order: dict) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.set(f"pending:order:{order_id}", json.dumps(order, default=str))
    await r.sadd("pending:index", order_id)


async def get_pending_order(order_id: str) -> dict | None:
    r = await get_redis()
    if r is None:
        return None
    raw = await r.get(f"pending:order:{order_id}")
    return json.loads(raw) if raw else None


async def get_all_pending_orders() -> list[dict]:
    r = await get_redis()
    if r is None:
        return []
    ids = await r.smembers("pending:index")
    if not ids:
        return []
    results = []
    for oid in ids:
        raw = await r.get(f"pending:order:{oid}")
        if raw:
            try:
                results.append(json.loads(raw))
            except json.JSONDecodeError:
                pass
    return results


async def remove_pending_order(order_id: str) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.delete(f"pending:order:{order_id}")
    await r.srem("pending:index", order_id)


async def get_user_pending_orders(user_id: int) -> list[dict]:
    all_orders = await get_all_pending_orders()
    return [o for o in all_orders if o.get("user_id") == user_id]


async def update_pending_order(order_id: str, updates: dict) -> dict | None:
    order = await get_pending_order(order_id)
    if order is None:
        return None
    order.update(updates)
    await save_pending_order(order_id, order)
    return order
