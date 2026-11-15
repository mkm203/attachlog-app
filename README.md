# AttachLog

An internship logbook for **many schools**: students write a weekly log, company supervisors validate it, academic supervisors follow progress, coordinators run their school. You (the platform administrator) register schools from a web panel.

| Part | What it is |
|---|---|
| `mobile/` | The app (React Native, Expo, TypeScript). One app for all four roles |
| `backend/` | The API (FastAPI; Turso, SQLite or Postgres) **and** the web admin panel at `/admin` |
| `render.yaml` | Deploys the API and the admin panel to Render in one step |
| `docker-compose.yml` | Runs the same thing locally with its own Postgres |

## How people and schools relate

A person has **one account** (email and password) and no fixed role. They get roles through **memberships**, so the same person can be an academic supervisor at two schools, or a company supervisor hosting interns from three.

```
School   ── coordinators, academic supervisors, students
Company  ── company supervisors            (shared by all schools)
Placement = student + academic supervisor + company + company supervisor, in one school, inside its term
```

| Role | Sees | Can do |
|---|---|---|
| Student | their own placements | write and revise weekly entries |
| Company supervisor | placements assigned to them, from any school | approve, or reject with a comment |
| Academic supervisor | placements assigned to them | follow progress and comments |
| Coordinator | everything in their own school, nothing in other schools | create placements, invite supervisors, close with a score out of 20 |
| Platform administrator (you) | schools and their staff, **not** logbooks | register schools and coordinators |

**Nobody picks their own role.** Roles come only from codes:

1. You register a school in the admin panel and enter the coordinator's email. You get a one-time **invite code** for them (it is also emailed if email is set up).
2. The coordinator creates their account in the app with that code. They see the school's **student join code** and give it to students, who create accounts with it.
3. The coordinator invites academic supervisors by email (a code again), then creates placements by picking a student and an academic supervisor from the school's members and typing the company supervisor's email. A supervisor who has no account yet gets a code, and the placement links to them the moment they join.

An invite code only works for the email it was sent to. An address that was not confirmed (a student who signed up with a school code) is never given a supervisor role automatically: it must redeem a code sent to that address.

Business rules (enforced by the API, mirrored in the app's forms): one entry per student per week; an approved entry is locked; only the company supervisor assigned to a placement can review it; a rejection needs a comment; hours 1 to 60; final score 0 to 20; placement dates must lie inside the school's term.

---

## Deploy (free): Turso for the database, Render for the API and admin panel

Render's free Postgres expires after 30 days, so the database lives on **Turso** (libSQL, a hosted SQLite; the free plan has a generous storage and read/write quota, check [Turso's pricing](https://turso.tech/pricing) because it changes).

1. **Database.** Install the Turso CLI, then: `turso auth signup`, `turso db create attachlog`, `turso db show attachlog --url` (gives `libsql://attachlog-<you>.turso.io`) and `turso db tokens create attachlog` (the token).
2. **Push this repository to GitHub.**
3. **Render.** Dashboard, **New, Blueprint**, pick the repository. Fill in:
   - `DATABASE_URL`: the `libsql://…` address
   - `TURSO_AUTH_TOKEN`: the token
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: your administrator login (use a long password)
   - `RESEND_API_KEY` and `MAIL_FROM`: leave empty unless you set up email (see below)
4. When it is live, open `https://<your-service>.onrender.com/admin` and log in. Check `/health` and `/docs` too.
5. Put the address in `mobile/eas.json` (`EXPO_PUBLIC_API_URL`) before building the app.

The Turso driver (`requirements-turso.txt`) is experimental and only exists for Linux and macOS, so on Windows run the API with Docker (or WSL) if you want to try Turso locally; local SQLite and Postgres need nothing extra. If the Turso driver ever gives trouble, any Postgres (for example Neon) works by putting its `postgresql://…` string in `DATABASE_URL`: no code changes.

**Moving local data to Turso (optional).** With `DATABASE_URL` and `TURSO_AUTH_TOKEN` set to the Turso values, run `python scripts/copy_database.py sqlite:///./attachlog.db` from `backend` (Linux, macOS, Docker or WSL). The Turso database must be empty. On Windows (no Turso driver) use `python scripts/copy_to_turso_http.py attachlog.db` instead: it needs no packages and talks to Turso over HTTPS.

**Migrations.** The tables are managed by Alembic and updated automatically at start-up. After changing `models.py`: `cd backend && alembic revision --autogenerate -m "what changed"`, review the file in `migrations/versions`, commit it. Set `AUTO_MIGRATE=0` to skip the automatic step.

**Rate limits.** Login, sign-up/join codes and password reset are limited per address and per IP (HTTP 429, `rate_limited`). The counters are in memory, which suits a single server.

Render's free web service sleeps after about 15 idle minutes and takes up to a minute to wake: the first request after a pause is slow (the app waits up to 30 seconds). For an always-on service use a paid plan.

The administrator account is controlled by the environment: change `ADMIN_PASSWORD` and redeploy to reset it.

**Email (optional).** Invitations and password-reset codes are emailed when one of these is set (the first found is used):
- **Gmail:** turn on 2-step verification, create an App Password at myaccount.google.com/apppasswords, then set `SMTP_USER` (your address) and `SMTP_PASSWORD` (the 16 characters). Works on your own computer. **Render's free plan blocks SMTP**, so it will not work there.
- **Brevo** (free, HTTPS, works on Render free): create an API key, verify your sender address in Brevo, set `BREVO_API_KEY` and `MAIL_FROM` (for example `AttachLog <you@gmail.com>`).
- **Resend:** `RESEND_API_KEY`; its test sender only delivers to your own address until you verify a domain.

Without any of them everything still works: codes are shown on screen (and shareable by WhatsApp from the app) and, for someone locked out, the admin panel can create a temporary password. If sending fails the code is still shown, and the server log says why.

## Run the app

You need Node 22 or newer. Use the **Expo Go** app on your phone to try it.

```powershell
cd mobile
npm install
npx expo install expo-secure-store expo-status-bar expo-build-properties react-native-safe-area-context @react-native-community/datetimepicker
npx expo install --fix      # aligns every package with the Expo SDK
npx expo start
```

Scan the QR code with Expo Go. If Expo Go says the project is incompatible, set `expo` in `package.json` to the SDK it names and run `npx expo install --fix` again. The first time, under **Server settings** on the login screen, enter your API address and press **Test connection** (or build with the address in `eas.json`).

### Build the installable app with EAS (Android APK)

```powershell
cd mobile
npx eas-cli login
npx eas-cli build -p android --profile preview
```

Set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` to your real API address first. EAS gives a download link for the APK. For the Play Store use `--profile production` (an app bundle). The app icon and splash are in `mobile/assets` (`make_logo.py` redraws them with Pillow).

## Run everything locally

```powershell
docker compose up --build     # API and admin panel on http://localhost:8000/admin, docs at /docs
```

Log in at `/admin` with `admin@example.com` / `local-admin-password-123` (set in `docker-compose.yml`). To use it from a phone on the same Wi-Fi, open port 8000 once (PowerShell as Administrator) and type the computer's IP under Server settings:

```powershell
New-NetFirewallRule -DisplayName "AttachLog API" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

Without Docker: `cd backend`, create a virtual environment, `pip install -r requirements-dev.txt`, copy `.env.example` to `.env` values into your environment, then `uvicorn app.main:app --reload` (SQLite file, no Postgres needed).

## Tests

```powershell
cd backend && pip install -r requirements-dev.txt && pytest     # accounts, invites, schools, isolation, logbook
cd mobile  && npm test                                          # API client against a stub server, validation, sessions
```

## How it fits together

- `backend/app/`: `models.py` (users, schools, companies, memberships, invites, placements, entries, reviews), `security.py` (passwords, token with only the user id), `access.py` (who may see or change what, from memberships), `people.py` (codes, invites, roles), `auth.py` (sign-up, login, join, passwords), `schools.py` (admin and coordinator routes), `placements.py`, `entries.py`, `static/admin.html` (the panel).
- `mobile/src/api/client.ts` is the only code that talks to the API; `state/account.ts` works out the active role from the memberships; every error comes back as `{"error": {"code", "message", "details"}}` and the app shows a plain sentence for each code.

## Known limits (honest list)

- **No email verification at sign-up.** A student who joins with a school code is not verified; staff roles are only ever given through codes, which is what prevents impersonation. Password reset by email needs Resend.
- Companies are shared across schools and matched by name and city (typos create duplicates; there is no merge screen yet).
- The app is in English and French (Account, Language; it follows the phone's language at first). The French wording was written by an AI and should be reviewed by a native speaker. The admin panel and emails are English only.
- Rate-limit counters are per server process; with several servers use a shared store.
- A user cannot delete their account, and there is no screen for removing a member from a school yet.
- The token lasts eight hours; the app then returns to the login screen.
