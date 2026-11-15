# Python 3.12: the Turso (libSQL) driver publishes wheels for it
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt requirements-turso.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# The Turso driver is installed separately so a problem with it cannot break the Postgres/SQLite build;
# if DATABASE_URL points to Turso and it is missing, the app stops at start-up and says so.
RUN pip install --no-cache-dir -r requirements-turso.txt || echo "WARNING: Turso driver not installed"

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

# Render and most hosts pass the port in $PORT; 8000 is the local default.
# --proxy-headers: behind Render's proxy the real client address is in X-Forwarded-For (used by the rate limits).
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
