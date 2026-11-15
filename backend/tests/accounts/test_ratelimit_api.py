"""Rate limits seen through the API (the Limiter itself is tested in tests/test_ratelimit.py)."""
from tests.conftest import PASSWORD


def login(client, email, password):
    return client.post("/v1/auth/login", json={"email": email, "password": password})


def test_too_many_wrong_passwords_block_that_email(client):
    for _ in range(8):
        assert login(client, "stu-1@example.com", "wrong-password").status_code == 401
    blocked = login(client, "stu-1@example.com", PASSWORD)           # even the right password is refused now
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "rate_limited"
    assert int(blocked.headers["Retry-After"]) >= 1
    assert login(client, "stu-2@example.com", PASSWORD).status_code == 200      # another account still works


def test_a_good_login_clears_the_count(client):
    for _ in range(5):
        login(client, "stu-1@example.com", "wrong-password")
    assert login(client, "stu-1@example.com", PASSWORD).status_code == 200
    for _ in range(7):
        assert login(client, "stu-1@example.com", "wrong-password").status_code == 401   # a fresh count of 7 < 8


def test_guessing_codes_when_signing_up_is_limited(client):
    body = {"name": "Guess Work", "email": "guess@example.com", "password": "Good-pass-2026"}
    for i in range(10):
        assert client.post("/v1/auth/register", json={**body, "code": f"WRONG{i:03d}"}).status_code == 422
    r = client.post("/v1/auth/register", json={**body, "code": "JOINONE1"})        # even the right code waits
    assert r.status_code == 429


def test_guessing_codes_when_joining_is_limited_per_user(client):
    from tests.conftest import STUDENT
    for i in range(10):
        assert client.post("/v1/me/redeem", json={"code": f"WRONG{i:03d}"}, headers=STUDENT).status_code == 422
    assert client.post("/v1/me/redeem", json={"code": "JOINTWO2"}, headers=STUDENT).status_code == 429


def test_reset_code_requests_are_limited(client):
    for _ in range(5):
        assert client.post("/v1/auth/forgot", json={"email": "stu-1@example.com"}).status_code == 202
    assert client.post("/v1/auth/forgot", json={"email": "stu-1@example.com"}).status_code == 429
