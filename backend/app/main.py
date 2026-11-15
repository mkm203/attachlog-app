"""AttachLog API: run with  uvicorn app.main:app --port 8000"""
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.bootstrap import ensure_admin
from app import config, migrate
from app.database import SessionLocal
from app.entries import router as entries_router
from app.errors import register_handlers
from app.placements import router as placements_router
from app.schools import admin as admin_router, schools as schools_router

STATIC = Path(__file__).parent / "static"

if os.getenv("AUTO_MIGRATE", "1") == "1":
    kind = config.database_kind()
    print(f"AttachLog: database = {kind}")
    if kind == "sqlite" and config.on_render() and os.getenv("ALLOW_EPHEMERAL_DB") != "1":
        # A SQLite file on Render's disk is erased at every restart and deploy: refuse instead of losing data silently.
        raise RuntimeError("DATABASE_URL is not set (or is a local SQLite file) on Render, so every user would be "
                           "lost at the next restart. Set DATABASE_URL (and TURSO_AUTH_TOKEN) in the Render dashboard.")      # the tests switch it off and build their own database
    migrate.upgrade()
    with SessionLocal() as session:
        if ensure_admin(session):
            print("AttachLog: administrator account ready.")
        else:
            print("AttachLog: WARNING no administrator account (ADMIN_EMAIL / ADMIN_PASSWORD not set), "
                  "so nobody can log in to /admin.")

app = FastAPI(title="AttachLog API", version="3.1.0",
              description="Internship logbooks for many schools: accounts, schools, placements, weekly entries and "
                          "reviews. Log in with POST /v1/auth/login, then click Authorize. "
                          "The administrator panel is at /admin.")
register_handlers(app)
app.include_router(auth_router)
app.include_router(schools_router)
app.include_router(admin_router)
app.include_router(placements_router)
app.include_router(entries_router)
app.mount("/admin/static", StaticFiles(directory=STATIC), name="admin-static")


@app.get("/admin", include_in_schema=False)
def admin_page():
    """The web panel for the platform administrator (everything it does goes through /v1/admin)."""
    return HTMLResponse((STATIC / "admin.html").read_text(encoding="utf-8"))


@app.get("/health", tags=["health"])
def health():
    """Liveness probe, also used by the app's connection test."""
    return {"status": "ok"}


@app.get("/health/database", tags=["health"])
def health_database():
    """Which kind of database the server is really using, and whether it answers. No address, no secrets."""
    from sqlalchemy import text
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        reachable = True
    except Exception:  # noqa: BLE001
        reachable = False
    return {"database": config.database_kind(), "reachable": reachable}
