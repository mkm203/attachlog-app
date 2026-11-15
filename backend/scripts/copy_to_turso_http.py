"""Copy a local SQLite database (attachlog.db) into an EMPTY Turso database, with no extra packages.

It talks to Turso over HTTPS, so it runs anywhere Python runs, including Windows. Only the standard library.

    PowerShell:   $env:DATABASE_URL="libsql://<db>.turso.io"; $env:TURSO_AUTH_TOKEN="<token>"
                  python scripts/copy_to_turso_http.py attachlog.db
    Git Bash:     export DATABASE_URL=... TURSO_AUTH_TOKEN=...; python scripts/copy_to_turso_http.py attachlog.db

Tables and indexes are copied exactly as they are in the local file. The API then adopts the database at its
first start (it notices the tables and marks them as migrated). If something fails halfway, the script removes
what it created, so you can run it again.
"""
import base64
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request

BATCH = 50


def endpoint() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url.startswith(("libsql://", "https://")):
        sys.exit("Set DATABASE_URL to your Turso address (libsql://...).")
    return "https://" + url.split("://", 1)[1].split("?")[0].rstrip("/") + "/v2/pipeline"


def encode(value) -> dict:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": str(int(value))}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, bytes):
        return {"type": "blob", "base64": base64.b64encode(value).decode()}
    return {"type": "text", "value": str(value)}


def run(statements: list[tuple[str, list]]) -> list:
    """Send statements in order on one connection; stop and raise on the first error. Returns the results."""
    token = os.getenv("TURSO_AUTH_TOKEN", "").strip()
    if not token:
        sys.exit("Set TURSO_AUTH_TOKEN.")
    requests = [{"type": "execute", "stmt": {"sql": sql, "args": [encode(a) for a in args]}}
                for sql, args in statements] + [{"type": "close"}]
    req = urllib.request.Request(
        endpoint(), data=json.dumps({"requests": requests}).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as exc:
        sys.exit(f"Turso answered {exc.code}: {exc.read().decode(errors='replace')[:300]}")
    results = body["results"]
    for item in results:
        if item["type"] == "error":
            raise RuntimeError(item["error"].get("message", str(item["error"])))
    return results


def rows_of(result) -> list[list]:
    cols = result["response"]["result"]["rows"]
    return [[cell.get("value") for cell in row] for row in cols]


def table_order(src: sqlite3.Connection, tables: list[str]) -> list[str]:
    """Parents before children, from the foreign keys."""
    deps = {t: {r[2] for r in src.execute(f'PRAGMA foreign_key_list("{t}")') if r[2] != t} for t in tables}
    ordered: list[str] = []
    while deps:
        ready = sorted(t for t, d in deps.items() if d <= set(ordered))
        if not ready:
            ready = sorted(deps)  # a cycle: fall back to name order
        for t in ready:
            ordered.append(t)
            del deps[t]
    return ordered


def main(path: str) -> int:
    if not os.path.exists(path):
        sys.exit(f"{path} not found.")
    src = sqlite3.connect(path)
    schema = src.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL "
                         "AND name NOT LIKE 'sqlite_%'").fetchall()
    tables = [n for t, n, _ in schema if t == "table"]
    existing = rows_of(run([("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [])])[0])
    if existing:
        print("The Turso database is not empty:", ", ".join(r[0] for r in existing))
        print("Use a new, empty database (or delete these tables) and try again.")
        return 1

    created: list[str] = []
    try:
        for kind, name, sql in schema:          # tables first, then indexes
            if kind == "table":
                run([(sql, [])])
                created.append(name)
        for kind, name, sql in schema:
            if kind == "index":
                run([(sql, [])])
        for table in table_order(src, tables):
            cur = src.execute(f'SELECT * FROM "{table}"')
            cols = [d[0] for d in cur.description]
            insert = f'INSERT INTO "{table}" ({", ".join(chr(34) + c + chr(34) for c in cols)}) ' \
                     f'VALUES ({", ".join("?" * len(cols))})'
            rows = cur.fetchall()
            for i in range(0, len(rows), BATCH):
                run([("BEGIN", [])] + [(insert, list(r)) for r in rows[i:i + BATCH]] + [("COMMIT", [])])
            print(f"{table}: {len(rows)}")
    except Exception as exc:  # noqa: BLE001
        print("Copy failed:", exc)
        print("Removing what was created...")
        for name in reversed(created):
            try:
                run([(f'DROP TABLE IF EXISTS "{name}"', [])])
            except Exception:  # noqa: BLE001
                pass
        return 1
    print("Done. Deploy the API: it adopts these tables at start-up.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
