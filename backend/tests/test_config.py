import pytest

from app import config


@pytest.mark.parametrize("given,expected", [
    ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("postgresql://u:p@host:5432/db?sslmode=require", "postgresql+psycopg://u:p@host:5432/db?sslmode=require"),
    ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("sqlite:///./x.db", "sqlite:///./x.db"),
])
def test_database_url_gets_the_psycopg_driver(monkeypatch, given, expected):
    monkeypatch.setenv("DATABASE_URL", given)
    assert config.database_url() == expected


def test_default_database_is_a_local_sqlite_file(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert config.database_url().startswith("sqlite:///")


def test_admin_email_is_trimmed_and_lowercased(monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "  Me@Example.COM ")
    assert config.admin_email() == "me@example.com"


def test_email_provider_is_optional(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert config.resend_api_key() == ""
