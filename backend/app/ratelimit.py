"""A small in-memory attempt limiter for login, codes and password resets.

It lives in the process, which is right for one instance (Render's free plan, docker compose). With several
instances each one counts on its own; put the limits in Redis or at a proxy if you ever scale out.
"""
import time
from collections import defaultdict, deque

from app.errors import ApiError


class Limiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def _trim(self, key: str, now: float) -> deque:
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)
        return hits

    def retry_after(self, key: str, now: float | None = None) -> int:
        """Seconds to wait before this key may try again, 0 when it may."""
        now = time.monotonic() if now is None else now
        hits = self._trim(key, now)
        if len(hits) < self.limit:
            return 0
        return max(1, int(hits[0] + self.window - now) + 1)

    def hit(self, key: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        self._trim(key, now)
        self._hits[key].append(now)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def clear(self) -> None:
        self._hits.clear()

    def guard(self, key: str) -> None:
        """Raise 429 (with Retry-After) when the key is over its limit."""
        wait = self.retry_after(key)
        if wait:
            raise ApiError(429, "rate_limited", f"Too many attempts. Try again in {wait} seconds.",
                           headers={"Retry-After": str(wait)})


# wrong passwords: per address+email, and per address overall
login_by_email = Limiter(limit=8, window_seconds=300)
login_by_ip = Limiter(limit=30, window_seconds=300)
# wrong or reused codes (sign-up, join, reset), and reset-code requests
code_attempts = Limiter(limit=10, window_seconds=600)
reset_requests = Limiter(limit=5, window_seconds=900)
email_change_requests = Limiter(limit=5, window_seconds=900)

ALL = (login_by_email, login_by_ip, code_attempts, reset_requests, email_change_requests)


def reset_all() -> None:
    for limiter in ALL:
        limiter.clear()
