"""
Caching layer for Zeus backend.

Uses in-memory TTLCache for development. Can be swapped to Redis for production
by setting REDIS_URL in environment and updating this module.

Cache keys follow the pattern: {namespace}:{identifier}
TTLs are in seconds.
"""

import hashlib
import json
import logging
from typing import Any, Optional
from cachetools import TTLCache
from threading import Lock

logger = logging.getLogger(__name__)

# Cache TTLs (seconds)
TTL_RECIPE_FEED = 300       # 5 minutes
TTL_RECIPE = 600            # 10 minutes
TTL_AI_RESPONSE = 3600      # 1 hour
TTL_USER_PREFS = 300        # 5 minutes
TTL_MACRO_SUMMARY = 300     # 5 minutes
TTL_SHORT = 60              # 1 minute (for rapidly changing data)


class CacheService:
    """In-memory cache with TTL support. Thread-safe."""

    def __init__(self, maxsize: int = 2048):
        self._caches: dict[int, TTLCache] = {}
        self._lock = Lock()
        self._maxsize = maxsize
        self._hits = 0
        self._misses = 0

    def _get_cache(self, ttl: int) -> TTLCache:
        """Get or create a TTLCache for the given TTL."""
        if ttl not in self._caches:
            with self._lock:
                if ttl not in self._caches:
                    self._caches[ttl] = TTLCache(maxsize=self._maxsize, ttl=ttl)
        return self._caches[ttl]

    def get(self, key: str, ttl: int = TTL_RECIPE_FEED) -> Optional[Any]:
        """Get a cached value. Returns None if not found or expired."""
        cache = self._get_cache(ttl)
        value = cache.get(key)
        if value is not None:
            self._hits += 1
            return value
        self._misses += 1
        return None

    def set(self, key: str, value: Any, ttl: int = TTL_RECIPE_FEED) -> None:
        """Set a cached value with the specified TTL."""
        cache = self._get_cache(ttl)
        cache[key] = value

    def delete(self, key: str) -> None:
        """Delete a key from all TTL caches."""
        with self._lock:
            for cache in self._caches.values():
                cache.pop(key, None)

    def invalidate_pattern(self, prefix: str) -> int:
        """Invalidate all keys matching a prefix. Returns count of removed keys."""
        removed = 0
        with self._lock:
            for cache in self._caches.values():
                keys_to_remove = [k for k in cache if k.startswith(prefix)]
                for k in keys_to_remove:
                    cache.pop(k, None)
                    removed += 1
        return removed

    def clear(self) -> None:
        """Clear all caches."""
        with self._lock:
            for cache in self._caches.values():
                cache.clear()

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{(self._hits / total * 100):.1f}%" if total > 0 else "0%",
            "total_cached": sum(len(c) for c in self._caches.values()),
        }


def make_cache_key(*parts: Any) -> str:
    """Build a deterministic cache key from parts."""
    raw = ":".join(str(p) for p in parts)
    return raw


def hash_dict(d: dict) -> str:
    """Create a short hash of a dictionary for cache keying."""
    serialized = json.dumps(d, sort_keys=True, default=str)
    return hashlib.md5(serialized.encode()).hexdigest()[:12]


# Global cache instance
cache = CacheService()
