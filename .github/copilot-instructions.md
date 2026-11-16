# AttachLog repository guidance

## Build, test, and validation commands

Run commands from the indicated directory.

**Backend (`backend/`)**

- Install development and test dependencies: `pip install -r requirements-dev.txt`
- Run the API locally: `uvicorn app.main:app --reload`
- Run the full test suite: `pytest`
- Run one test file: `pytest tests/logbook/test_reviews.py`
- Run one test: `pytest tests/logbook/test_reviews.py::test_rejection_needs_a_comment`
- Generate a migration after changing SQLAlchemy models: `alembic revision --autogenerate -m "describe the change"`; inspect the generated file under `migrations/versions/`. Migrations run at startup unless `AUTO_MIGRATE=0`.

**Mobile (`mobile/`)**

- Install dependencies (Node 22+): `npm install`
- Start Expo: `npx expo start`
- Type-check: `npm run typecheck`
- Run all tests: `npm test`
- Run one test file: `node --experimental-strip-types --import ./tests/register.mjs --test tests/client.test.ts`
- Build an Android preview APK: `npx eas-cli build -p android --profile preview` (production builds use `--profile production`).

There is no repository-defined lint command.

**Local stack (repository root)**

- Start the API, admin panel, and Postgres: `docker compose up --build`

## Architecture

- `backend/` is a FastAPI service and the web admin panel. `app/main.py` registers the API routers and serves `app/static/admin.html` at `/admin`; routes are grouped by authentication, schools/admin, placements, and logbook entries. The API is under `/v1`, with `/health` and `/docs` also available.
- SQLAlchemy models in `backend/app/models.py` represent users, schools, shared companies, memberships, invitations, placements, weekly entries, reviews, and audit events. A user has one account but gets roles through memberships scoped to a school or company. A placement joins one student and school to a company and its company and academic supervisors; entries and reviews belong to that placement workflow.
- Authorization is centralized in `backend/app/access.py` and applied by route handlers. The platform administrator manages schools and coordinators but does not get logbook access. School isolation and placement membership are core access boundaries.
- The Expo app in `mobile/` is a single React Native app for all roles. Screens use the centralized API client in `mobile/src/api/client.ts`; account context and the currently active membership are resolved in `mobile/src/state/account.ts`. API types live in `mobile/src/api/types.ts`.
- Database configuration supports SQLite, Postgres, and Turso/libSQL. `backend/app/config.py` reads environment settings (real environment variables take precedence over `.env`), `backend/app/database.py` creates the SQLAlchemy engine, and Alembic migrations are in `backend/migrations/versions/`.

## Repository-specific conventions

- Roles are never selected by a user: they come from memberships granted through school join codes or email-bound invitations. Keep these rules and school/placement authorization enforced on the API; client form checks are for early feedback and must mirror, not replace, server validation.
- Preserve the API error envelope `{"error":{"code","message","details"}}`. The mobile client maps stable error codes to user-facing text; do not make client behavior depend on server message wording.
- Mobile translation keys are English user-facing strings. Add corresponding entries to `mobile/src/i18n/fr.ts` when adding user-visible text; missing French entries fall back to English.
- If changing SQLAlchemy models, add and review the corresponding Alembic migration. Do not treat `backend/attachlog.db` as disposable.
- Tests set up their own backend database; use `ATTACHLOG_SKIP_DOTENV=1` when a test run must not load a developer's `backend/.env`.
- `EXPO_PUBLIC_API_URL` in the mobile environment or EAS profile fixes the API server and hides the in-app server settings. Restart Expo with `npx expo start -c` after changing local environment configuration.
