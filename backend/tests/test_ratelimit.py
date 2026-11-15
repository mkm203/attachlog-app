import pytest

from app.errors import ApiError
from app.ratelimit import Limiter


def test_allows_up_to_the_limit_then_waits():
    lim = Limiter(limit=3, window_seconds=60)
    for t in (0, 1, 2):
        assert lim.retry_after("k", now=t) == 0
        lim.hit("k", now=t)
    assert 55 <= lim.retry_after("k", now=3) <= 60          # blocked until the first hit leaves the window
    assert lim.retry_after("other", now=3) == 0              # other keys are not affected


def test_the_window_slides():
    lim = Limiter(limit=2, window_seconds=10)
    lim.hit("k", now=0)
    lim.hit("k", now=1)
    assert lim.retry_after("k", now=5) > 0
    assert lim.retry_after("k", now=10.5) == 0               # the first hit expired


def test_reset_forgets_a_key():
    lim = Limiter(limit=1, window_seconds=60)
    lim.hit("k", now=0)
    lim.reset("k")
    assert lim.retry_after("k", now=1) == 0


def test_guard_raises_429_with_retry_after():
    lim = Limiter(limit=1, window_seconds=60)
    lim.hit("k")
    with pytest.raises(ApiError) as caught:
        lim.guard("k")
    assert caught.value.status_code == 429 and caught.value.code == "rate_limited"
    assert int(caught.value.headers["Retry-After"]) >= 1
