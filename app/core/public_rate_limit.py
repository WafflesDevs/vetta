"""Simple in-memory IP rate limits for anonymous public endpoints."""
from __future__ import annotations

import time
from threading import Lock


class IpRateLimiter:
    def __init__(self, max_hits: int, window_seconds: int):
        self.max_hits = max(1, int(max_hits))
        self.window = max(1, int(window_seconds))
        self._hits: dict[str, list[float]] = {}
        self._lock = Lock()
        self._prune_at = 0.0

    def check(self, key: str) -> tuple[bool, str]:
        now = time.time()
        kid = (key or "unknown").strip() or "unknown"
        with self._lock:
            times = [t for t in self._hits.get(kid, []) if now - t < self.window]
            if len(times) >= self.max_hits:
                retry = int(max(1, self.window - (now - times[0])))
                return False, f"Too many requests. Try again in about {retry}s."
            times.append(now)
            self._hits[kid] = times
            if now >= self._prune_at:
                self._prune(now)
                self._prune_at = now + 120
            return True, ""

    def _prune(self, now: float) -> None:
        dead = [
            k
            for k, times in self._hits.items()
            if not any(now - t < self.window for t in times)
        ]
        for k in dead:
            self._hits.pop(k, None)


def client_ip(request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"
