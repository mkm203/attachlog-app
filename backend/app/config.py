"""Settings read from environment variables."""
import os
from datetime import date
from pathlib import Path


def _load_env_file() -> None:
    """Read backend/.env (KEY=value lines) into the environment. Real environment variables win over the file.
    Uvicorn does not read .env by itself, so without this the settings in it would be ignored."""
    if os.getenv("ATTACHLOG_SKIP_DOTENV") == "1":      # the tests must not pick up a developer's .env
        return
    # backend/.env on your computer; /etc/secrets/.env is where Render puts a "Secret File" named .env
    for path in (Path(__file__).resolve().parent.parent / ".env", Path("/etc/secrets/.env")):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip().removeprefix("export ").strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)


_load_env_file()


def term_start() -> date:
    """Default term start offered when a school is registered (each school stores its own)."""
    return date.fromisoformat(os.getenv("TERM_START", "2026-09-01"))


def term_end() -> date:
    return date.fromisoformat(os.getenv("TERM_END", "2027-02-28"))


def database_url() -> str:
    """Where the data lives: a local SQLite file, Turso (libSQL), or Postgres.

    Turso gives `libsql://<database>.turso.io`: it becomes SQLAlchemy's `sqlite+libsql://...?secure=true`
    (the access token travels separately, see turso_auth_token). Postgres hosts hand out `postgres://`
    or `postgresql://`; SQLAlchemy needs the driver name (psycopg 3) in them.
    """
    url = os.getenv("DATABASE_URL", "").strip().strip("'\"").strip() or "sqlite:///./attachlog.db"
    if url.startswith("libsql://"):
        host = url[len("libsql://"):]
        return f"sqlite+libsql://{host}" + ("&" if "?" in host else "?") + "secure=true"
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def turso_auth_token() -> str:
    """The database token created in the Turso dashboard or with `turso db tokens create`."""
    return os.getenv("TURSO_AUTH_TOKEN", "").strip().strip("'\"").strip()


def jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me-use-32-chars-min")


def jwt_ttl_minutes() -> int:
    return int(os.getenv("JWT_TTL_MINUTES", "480"))


def admin_email() -> str:
    """Email of the platform administrator (you). The account is created at start-up."""
    return os.getenv("ADMIN_EMAIL", "").strip().lower()


def admin_password() -> str:
    return os.getenv("ADMIN_PASSWORD", "")


def resend_api_key() -> str:
    """Optional. Without it no email is sent and invite codes are shown on screen instead."""
    return os.getenv("RESEND_API_KEY", "")


def brevo_api_key() -> str:
    """Optional. Brevo's email API (free plan) can send from your own verified address to anyone."""
    return os.getenv("BREVO_API_KEY", "")


def smtp_user() -> str:
    """Optional. For Gmail: your address, with an App Password in SMTP_PASSWORD."""
    return os.getenv("SMTP_USER", "").strip()


def smtp_password() -> str:
    return os.getenv("SMTP_PASSWORD", "").replace(" ", "")      # Google shows app passwords in groups of four


def smtp_host() -> str:
    return os.getenv("SMTP_HOST", "smtp.gmail.com").strip()


def smtp_port() -> int:
    return int(os.getenv("SMTP_PORT", "587"))


def mail_from() -> str:
    """The sender. With Gmail it defaults to your own address (Gmail rewrites any other one)."""
    explicit = os.getenv("MAIL_FROM", "").strip()
    if explicit:
        return explicit
    if smtp_user() and not resend_api_key():
        return f"AttachLog <{smtp_user()}>"
    return "AttachLog <onboarding@resend.dev>"


def database_kind() -> str:
    """'turso', 'postgres' or 'sqlite' (never includes the address or token, so it is safe to log)."""
    url = database_url()
    if url.startswith("sqlite+libsql"):
        return "turso"
    if url.startswith("sqlite"):
        return "sqlite"
    return "postgres"


def on_render() -> bool:
    return os.getenv("RENDER", "").lower() == "true"
