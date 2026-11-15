import smtplib

import pytest

from app import mailer


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for k in ("SMTP_USER", "SMTP_PASSWORD", "BREVO_API_KEY", "RESEND_API_KEY", "MAIL_FROM", "SMTP_PORT"):
        monkeypatch.delenv(k, raising=False)


def test_nothing_configured_sends_nothing():
    assert not mailer.enabled() and mailer.send("a@b.co", "s", "t") is False


def test_gmail_smtp_is_used_and_app_password_spaces_are_ignored(monkeypatch):
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcd efgh ijkl mnop")
    seen = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout, **_): seen["server"] = (host, port)
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self, context): seen["tls"] = True
        def login(self, user, password): seen["login"] = (user, password)
        def send_message(self, msg): seen["msg"] = msg

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    assert mailer.provider() == "smtp"
    assert mailer.send("student@x.co", "Hello", "Your code") is True
    assert seen["server"] == ("smtp.gmail.com", 587) and seen["tls"]
    assert seen["login"] == ("me@gmail.com", "abcdefghijklmnop")
    assert seen["msg"]["From"] == "AttachLog <me@gmail.com>" and seen["msg"]["To"] == "student@x.co"


def test_a_failing_provider_returns_false_instead_of_raising(monkeypatch):
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "pw")
    monkeypatch.setattr(smtplib, "SMTP", lambda *a, **k: (_ for _ in ()).throw(OSError("Network is unreachable")))
    assert mailer.send("a@b.co", "s", "t") is False


def test_brevo_payload(monkeypatch):
    monkeypatch.setenv("BREVO_API_KEY", "key")
    monkeypatch.setenv("MAIL_FROM", "AttachLog <me@gmail.com>")
    sent = {}
    monkeypatch.setattr(mailer, "_post_json", lambda url, headers, payload: sent.update(url=url, h=headers, p=payload) or True)
    assert mailer.provider() == "brevo" and mailer.send("a@b.co", "S", "T") is True
    assert sent["h"] == {"api-key": "key"} and sent["p"]["sender"] == {"name": "AttachLog", "email": "me@gmail.com"}
    assert sent["p"]["to"] == [{"email": "a@b.co"}]
