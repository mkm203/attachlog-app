from datetime import date

import pytest
from sqlalchemy import select

from app.bootstrap import ensure_admin
from app.models import School, User
from tests.conftest import ADMIN, COORDINATOR, STUDENT, auth

SCHOOL = {"name": "Lycee Moderne", "city": "Bafoussam", "term_start": "2026-09-01", "term_end": "2027-06-30",
          "coordinator_email": "head@lycee.example"}


@pytest.mark.parametrize("method,url,body", [
    ("get", "/v1/admin/schools", None), ("post", "/v1/admin/schools", SCHOOL),
    ("get", "/v1/admin/schools/S1", None), ("put", "/v1/admin/schools/S1", {k: v for k, v in SCHOOL.items() if k != "coordinator_email"}),
    ("post", "/v1/admin/schools/S1/coordinators", {"email": "x@y.zz"}), ("post", "/v1/admin/schools/S1/join-code", None),
    ("post", "/v1/admin/users/reset-password", {"email": "stu-1@example.com"}),
])
def test_only_the_administrator_may_use_the_admin_api(client, method, url, body):
    call = getattr(client, method)
    kw = {"json": body} if body else {}
    assert call(url, **kw).status_code == 401
    for who in (STUDENT, COORDINATOR):
        r = call(url, headers=who, **kw)
        assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


def test_register_a_school_and_its_first_coordinator(client):
    r = client.post("/v1/admin/schools", json=SCHOOL, headers=ADMIN)
    assert r.status_code == 201
    out = r.json()
    assert out["school"]["name"] == "Lycee Moderne" and len(out["school"]["join_code"]) == 8
    assert out["coordinator"]["status"] == "invited" and out["coordinator"]["email_sent"] is False
    code = out["coordinator"]["invite"]["code"]
    # the coordinator creates their account with the code and becomes coordinator of this school only
    reg = client.post("/v1/auth/register", json={"name": "Head Teacher", "email": "head@lycee.example",
                                                 "password": "Good-pass-2026", "code": code})
    assert reg.status_code == 201
    assert [(m["role"], m["school_id"]) for m in reg.json()["user"]["memberships"]] == [("coordinator", out["school"]["id"])]
    token = {"Authorization": "Bearer " + reg.json()["access_token"]}
    assert client.get(f"/v1/schools/{out['school']['id']}", headers=token).status_code == 200
    assert client.get("/v1/schools/S1", headers=token).status_code == 403


def test_school_term_must_end_after_it_starts(client):
    r = client.post("/v1/admin/schools", json={**SCHOOL, "term_end": "2026-08-01"}, headers=ADMIN)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_dates"


def test_list_shows_counts_per_school(client):
    rows = {s["id"]: s for s in client.get("/v1/admin/schools", headers=ADMIN).json()}
    assert (rows["S1"]["coordinators"], rows["S1"]["academic_supervisors"], rows["S1"]["students"]) == (1, 1, 2)
    assert (rows["S2"]["coordinators"], rows["S2"]["students"]) == (1, 1)


def test_school_detail_lists_members_and_waiting_invites(client):
    client.post("/v1/admin/schools/S1/coordinators", json={"email": "second@lycee.example"}, headers=ADMIN)
    d = client.get("/v1/admin/schools/S1", headers=ADMIN).json()
    assert {m["email"] for m in d["members"]} >= {"co-1@example.com", "as-1@example.com", "stu-1@example.com"}
    assert [i["email"] for i in d["invites"]] == ["second@lycee.example"]


def test_update_school_and_unknown_school(client):
    body = {k: v for k, v in SCHOOL.items() if k != "coordinator_email"}
    assert client.put("/v1/admin/schools/S1", json=body, headers=ADMIN).json()["name"] == "Lycee Moderne"
    assert client.get("/v1/admin/schools/nope", headers=ADMIN).json()["error"]["code"] == "school_not_found"


def test_a_new_join_code_replaces_the_old_one(client):
    old = "JOINONE1"
    new = client.post("/v1/admin/schools/S1/join-code", headers=ADMIN).json()["join_code"]
    assert new != old
    bad = client.post("/v1/auth/register", json={"name": "Late Comer", "email": "late@example.com", "password": "Good-pass-2026", "code": old})
    assert bad.status_code == 422


def test_temporary_password_for_someone_who_is_locked_out(client):
    r = client.post("/v1/admin/users/reset-password", json={"email": "stu-1@example.com"}, headers=ADMIN)
    temp = r.json()["temporary_password"]
    assert client.post("/v1/auth/login", json={"email": "stu-1@example.com", "password": temp}).status_code == 200
    assert client.post("/v1/admin/users/reset-password", json={"email": "ghost@example.com"}, headers=ADMIN).status_code == 404


def test_the_admin_account_comes_from_the_environment(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "Boss@Example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "First-admin-pass-1")
    with client.session() as db:
        assert ensure_admin(db) is True
        boss = db.scalar(select(User).where(User.email == "boss@example.com"))
        assert boss.is_admin and boss.email_verified
    assert client.post("/v1/auth/login", json={"email": "boss@example.com", "password": "First-admin-pass-1"}).status_code == 200
    monkeypatch.setenv("ADMIN_PASSWORD", "Second-admin-pass-2")           # changing it and restarting resets it
    with client.session() as db:
        ensure_admin(db)
    assert client.post("/v1/auth/login", json={"email": "boss@example.com", "password": "First-admin-pass-1"}).status_code == 401
    assert client.post("/v1/auth/login", json={"email": "boss@example.com", "password": "Second-admin-pass-2"}).status_code == 200


def test_no_admin_is_created_without_settings(client, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with client.session() as db:
        assert ensure_admin(db) is False


def test_the_admin_page_and_its_logo_are_served(client):
    page = client.get("/admin")
    assert page.status_code == 200 and "AttachLog Admin" in page.text
    assert client.get("/admin/static/logo.png").status_code == 200
