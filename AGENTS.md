# AGENTS.md

## Project shape
- `mobile/`: Expo (React Native, TypeScript) app for all roles. Entry `index.ts` -> `App.tsx`; API access is centralized in `mobile/src/api/client.ts`; role/membership resolution in `mobile/src/state/account.ts`.
- `backend/`: FastAPI API + web admin panel (`/admin`, static `app/static/admin.html`). Routers: `app/auth.py`, `schools.py`, `placements.py`, `entries.py`; domain/access logic in `models.py`, `access.py`, `people.py`, `security.py`, `errors.py`; config/env loading in `app/config.py` (`backend/.env` and `/etc/secrets/.env` read automatically, real env wins). DB: SQLite, Turso/libSQL (`libsql://` + `TURSO_AUTH_TOKEN`), or Postgres; tables managed by Alembic (`migrations/`, `alembic.ini`).
- Deploy/config: `docker-compose.yml` (local API+Postgres), `render.yaml` (single Render web service), `mobile/eas.json` build profiles.

## Commands
Run from the directory shown.

**Backend (`backend/`)**
- Install (dev/tests): `pip install -r requirements-dev.txt` (prod deps in `requirements.txt`; Turso driver in `requirements-turso.txt`, experimental and not for Windows).
- Run API (SQLite by default): `uvicorn app.main:app --reload` (docs `/docs`, health `/health`, admin `/admin`).
- Tests (all): `pytest` (configured in `pytest.ini`: `pythonpath = .`, `testpaths = tests`).
- Focused tests: `pytest tests/test_auth.py`, `pytest -k "invite"`, `pytest tests/test_placements.py::test_name`.
- Migrations: `alembic revision --autogenerate -m "..."` then review `migrations/versions/` and commit. Auto-migrate runs on start unless `AUTO_MIGRATE=0`. `ATTACHLOG_SKIP_DOTENV=1` prevents loading `.env` (used by tests).

**Mobile (`mobile/`)**
- Install: `npm install` (Node 22+). Expo alignment when needed: `npx expo install --fix`.
- Dev: `npx expo start` (Expo Go). `npx expo start -c` after changing `.env`.
- Typecheck: `npm run typecheck` (`tsc --noEmit`).
- Tests (all): `npm test` (runs `node --experimental-strip-types --import ./tests/register.mjs --test tests/*.test.ts`).
- Focused test file: `node --experimental-strip-types --import ./tests/register.mjs --test tests/client.test.ts` (replace file as needed; tests use a stub server in `tests/stub.ts`).
- Build: `npx eas-cli build -p android --profile preview` (APK) or `--profile production` (store). Set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` for builds.

**Local stack**
- `docker compose up --build` from repo root: API+admin at `http://localhost:8000` (`/admin`, `/docs`), Postgres db (default admin `admin@example.com` / `local-admin-password-123` per `docker-compose.yml`).

## Behavior and gotchas
- API errors are `{"error":{"code","message","details"}}`; keep client handling/messages consistent with `mobile/src/api/client.ts` and existing patterns. Authorization/business rules are enforced server-side (`access.py`, route modules) and mirrored in app forms—change both sides when rules change.
- Roles come from memberships/codes (no self-selected roles). Accounts, invites, and school isolation are core invariants (see `backend/app/people.py`, `schools.py`, `auth.py`).
- `EXPO_PUBLIC_API_URL` in `mobile/.env` locks the app to that server and hides server settings (README notes this); builds read it from `mobile/eas.json` profiles. Do not commit secrets in `.env`.
- Turso driver is Linux/macOS only; on Windows use Docker/WSL (or SQLite/Postgres). On Render, SQLite without `ALLOW_EPHEMERAL_DB=1` is refused at startup to avoid data loss. Rate limits are in-memory per process.
- `backend/attachlog.db` is a local SQLite file that may be present; avoid treating it as a disposable artifact unless intentional.
- Mobile i18n: strings keyed by English in `mobile/src/i18n/` (French in `fr.ts`); add keys consistently when introducing user-facing text. There is no project CI workflow in-repo; run `pytest` and `npm test`/`npm run typecheck` locally for changes in those areas.
