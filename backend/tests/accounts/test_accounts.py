import jwt
import pytest
from sqlalchemy import select

from app import config
from app.models import Invite, Membership, PasswordReset, User
from tests.conftest import ADMIN, COORDINATOR, PASSWORD, STUDENT, auth


def login(client, email, password=PASSWORD):
    return client.post("/v1/auth/login", json={"email": email, "password": password})


def register(client, code, email="amina@example.com", name="Amina Tabi", password="Good-pass-2026"):
    return client.post("/v1/auth/register", json={"name": name, "email": email, "password": password, "code": code})


def roles(body):
    return {(m["role"], m["school_id"] or m["company_id"]) for m in body["user"]["memberships"]}


def test_login_returns_a_token_and_the_memberships(client):
    r = login(client, "co-1@example.com")
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == config.jwt_ttl_minutes() * 60
    assert body["user"]["name"] == "Julie Mbia" and roles(body) == {("coordinator", "S1")}
    claims = jwt.decode(body["access_token"], config.jwt_secret(), algorithms=["HS256"])
    assert set(claims) == {"sub", "iat", "exp"} and claims["sub"] == "co-1"   # no role inside the token


def test_email_login_ignores_case_and_spaces(client):
    assert login(client, "  CO-1@Example.com ").status_code == 200


def test_wrong_password_and_unknown_email_look_the_same(client):
    wrong, unknown = login(client, "co-1@example.com", "not-the-password"), login(client, "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() and wrong.json()["error"]["code"] == "invalid_credentials"


def test_missing_or_malformed_fields_are_422(client):
    assert client.post("/v1/auth/login", json={"email": "a@b.co"}).status_code == 422
    assert client.post("/v1/auth/login", json={"email": "not-an-email", "password": "x"}).status_code == 422


def test_the_old_demo_accounts_and_token_endpoint_are_gone(client):
    assert login(client, "stu-1", "Demo-stu-1-2026").status_code == 422
    assert client.post("/v1/auth/token", json={"sub": "co-1", "role": "coordinator"}).status_code in (404, 405)


def test_passwords_are_stored_only_as_salted_hashes(client):
    with client.session() as db:
        hashes = [u.password_hash for u in db.scalars(select(User))]
    assert all(h.startswith("pbkdf2_sha256$") and PASSWORD not in h for h in hashes)
    from app.security import hash_password
    assert hash_password(PASSWORD) != hash_password(PASSWORD)          # same password, different salt each time


# ---- sign-up with a school join code (students)
def test_student_signs_up_with_the_school_join_code(client):
    r = register(client, "join-one1")               # case and dashes do not matter
    assert r.status_code == 201
    assert roles(r.json()) == {("student", "S1")} and r.json()["user"]["email_verified"] is False
    token = {"Authorization": "Bearer " + r.json()["access_token"]}
    assert client.get("/v1/me", headers=token).json()["email"] == "amina@example.com"


def test_a_wrong_code_creates_no_account(client):
    r = register(client, "WRONGCODE")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_code"
    assert login(client, "amina@example.com", "Good-pass-2026").status_code == 401


def test_the_same_email_cannot_register_twice(client):
    assert register(client, "JOINONE1").status_code == 201
    r = register(client, "JOINTWO2")
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


def test_short_password_is_422(client):
    assert register(client, "JOINONE1", password="short").status_code == 422


def test_an_existing_user_joins_a_second_school_with_its_code(client):
    r = client.post("/v1/me/redeem", json={"code": "JOINTWO2"}, headers=STUDENT)
    assert r.status_code == 200
    assert {(m["role"], m["school_id"]) for m in r.json()["memberships"]} == {("student", "S1"), ("student", "S2")}
    again = client.post("/v1/me/redeem", json={"code": "JOINTWO2"}, headers=STUDENT)
    assert len(again.json()["memberships"]) == 2    # redeeming twice adds nothing


# ---- invites
def invite_for(client, email, role="academic_supervisor"):
    r = client.post("/v1/schools/S1/staff", json={"email": email, "role": role}, headers=COORDINATOR)
    assert r.status_code == 201, r.text
    return r.json()


def test_invited_person_signs_up_with_the_code_and_gets_verified(client):
    code = invite_for(client, "New.Teacher@School.example")["invite"]["code"]
    r = register(client, code, email="new.teacher@school.example")
    assert r.status_code == 201
    assert roles(r.json()) == {("academic_supervisor", "S1")} and r.json()["user"]["email_verified"] is True


def test_an_invite_code_only_works_for_the_invited_email(client):
    code = invite_for(client, "teacher@school.example")["invite"]["code"]
    r = register(client, code, email="someone.else@example.com")
    assert r.status_code == 403 and r.json()["error"]["code"] == "invite_email_mismatch"
    with client.session() as db:
        assert db.scalar(select(User).where(User.email == "someone.else@example.com")) is None   # rolled back


def test_an_invite_code_works_once(client):
    code = invite_for(client, "teacher@school.example")["invite"]["code"]
    assert register(client, code, email="teacher@school.example").status_code == 201
    other = register(client, code, email="teacher@school.example", name="Again")
    assert other.status_code in (409, 422)


def test_expired_invite_is_refused(client):
    from datetime import timedelta
    from app.models import now
    code = invite_for(client, "teacher@school.example")["invite"]["code"]
    with client.session() as db:
        inv = db.scalar(select(Invite).where(Invite.code == code))
        inv.expires_at = now() - timedelta(days=1)
        db.commit()
    r = register(client, code, email="teacher@school.example")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_code"


def test_a_verified_account_is_given_the_role_at_once(client):
    out = invite_for(client, "stu-2@example.com")       # stu-2 has a verified account
    assert out["status"] == "member" and out["invite"] is None
    me = client.get("/v1/me", headers=auth("stu-2")).json()
    assert ("academic_supervisor", "S1") in {(m["role"], m["school_id"]) for m in me["memberships"]}


def test_an_unverified_account_is_not_trusted_with_a_role(client):
    """Anyone can sign up with a school code and someone else's address; the role waits for the code."""
    register(client, "JOINONE1", email="victim@example.com")
    out = invite_for(client, "victim@example.com")
    assert out["status"] == "invited"
    with client.session() as db:
        user = db.scalar(select(User).where(User.email == "victim@example.com"))
        assert not db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.role == "academic_supervisor"))


# ---- passwords
def test_change_password(client):
    h = auth("stu-1")
    assert client.post("/v1/me/password", json={"current_password": "wrong-one", "new_password": "Brand-new-pass-1"}, headers=h).status_code == 403
    assert client.post("/v1/me/password", json={"current_password": PASSWORD, "new_password": "Brand-new-pass-1"}, headers=h).status_code == 204
    assert login(client, "stu-1@example.com", "Brand-new-pass-1").status_code == 200
    assert login(client, "stu-1@example.com").status_code == 401


def test_email_change_requires_a_password_and_verification_code(client, monkeypatch):
    sent = []
    monkeypatch.setattr("app.auth.mailer.enabled", lambda: True)
    monkeypatch.setattr("app.auth.mailer.send", lambda to, subject, text: sent.append((to, text)) or True)
    headers = auth("stu-1")

    wrong = client.post("/v1/me/email-change",
                        json={"current_password": "wrong", "new_email": "new@example.com"}, headers=headers)
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "wrong_password"

    requested = client.post("/v1/me/email-change",
                            json={"current_password": PASSWORD, "new_email": "New@Example.com"}, headers=headers)
    assert requested.status_code == 202 and requested.json()["status"] == "verification_sent"
    assert sent[0][0] == "new@example.com"
    code = sent[0][1].split("code is ", 1)[1].split(".", 1)[0]

    changed = client.post("/v1/me/email-change/confirm", json={"code": code}, headers=headers)
    assert changed.status_code == 200
    assert changed.json()["email"] == "new@example.com" and changed.json()["email_verified"] is True
    assert login(client, "new@example.com").status_code == 200
    assert login(client, "stu-1@example.com").status_code == 401
    assert client.post("/v1/me/email-change/confirm", json={"code": code}, headers=headers).status_code == 422


def test_email_change_refuses_an_email_already_in_use(client):
    response = client.post("/v1/me/email-change",
                           json={"current_password": PASSWORD, "new_email": "stu-2@example.com"}, headers=STUDENT)
    assert response.status_code == 409 and response.json()["error"]["code"] == "email_taken"


def test_forgot_password_never_reveals_whether_the_account_exists(client):
    a = client.post("/v1/auth/forgot", json={"email": "stu-1@example.com"})
    b = client.post("/v1/auth/forgot", json={"email": "nobody@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()


def _reset_code(client, user_id="stu-1", code="123456"):
    from app.auth import _hash_code
    from app.models import now
    from datetime import timedelta
    with client.session() as db:
        db.add(PasswordReset(user_id=user_id, code_hash=_hash_code(code), expires_at=now() + timedelta(minutes=10)))
        db.commit()


def test_reset_password_with_the_emailed_code(client):
    _reset_code(client)
    body = {"email": "stu-1@example.com", "code": "123456", "new_password": "Reset-pass-2026"}
    assert client.post("/v1/auth/reset", json=body).status_code == 204
    assert login(client, "stu-1@example.com", "Reset-pass-2026").status_code == 200
    assert client.post("/v1/auth/reset", json=body).status_code == 422        # a code works once


def test_five_wrong_codes_burn_the_reset(client):
    _reset_code(client)
    bad = {"email": "stu-1@example.com", "code": "000000", "new_password": "Reset-pass-2026"}
    for _ in range(5):
        assert client.post("/v1/auth/reset", json=bad).status_code == 422
    good = {**bad, "code": "123456"}
    assert client.post("/v1/auth/reset", json=good).status_code == 422
