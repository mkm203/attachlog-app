import jwt
import pytest

from app import config
from tests.conftest import (ACADEMIC, COORDINATOR, COORDINATOR_S2, OTHER_STUDENT, OTHER_SUPERVISOR, STUDENT,
                            STUDENT_S2, SUPERVISOR, submit)

BODY = {"week": 1, "tasks": "t", "hours": 5}

OPERATIONS = [
    ("post", "/v1/placements/P1/entries", BODY),
    ("put", "/v1/entries/x", {"tasks": "t", "hours": 5}),
    ("post", "/v1/entries/x/reviews", {"decision": "approved"}),
    ("get", "/v1/entries", None),
    ("get", "/v1/entries/x", None),
    ("get", "/v1/entries/x/reviews", None),
    ("get", "/v1/placements/P1/progress", None),
]


@pytest.mark.parametrize("method,url,body", OPERATIONS)
def test_no_token_is_401(client, method, url, body):
    r = getattr(client, method)(url, **({"json": body} if body else {}))
    assert r.status_code == 401 and r.json()["error"]["code"] == "not_authenticated"


def test_forged_and_malformed_tokens_are_401(client):
    forged = {"Authorization": "Bearer " + jwt.encode({"sub": "stu-1"}, "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256")}
    assert submit(client, headers=forged).status_code == 401
    assert submit(client, headers={"Authorization": "Bearer garbage"}).status_code == 401
    no_sub = {"Authorization": "Bearer " + jwt.encode({"x": 1}, config.jwt_secret(), algorithm="HS256")}
    assert submit(client, headers=no_sub).status_code == 401
    ghost = {"Authorization": "Bearer " + jwt.encode({"sub": "deleted-user"}, config.jwt_secret(), algorithm="HS256")}
    assert submit(client, headers=ghost).status_code == 401


# only the student of the placement can write; the others are 403
@pytest.mark.parametrize("who", [SUPERVISOR, ACADEMIC, COORDINATOR, OTHER_STUDENT, STUDENT_S2])
def test_only_the_placements_student_can_write(client, who):
    r = submit(client, headers=who)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_your_placement"


@pytest.mark.parametrize("who", [OTHER_SUPERVISOR, ACADEMIC, COORDINATOR, STUDENT])
def test_only_the_assigned_supervisor_can_review(client, who):
    eid = submit(client).json()["id"]
    r = client.post(f"/v1/entries/{eid}/reviews", json={"decision": "approved"}, headers=who)
    assert r.status_code == 403


def test_a_coordinator_of_another_school_sees_nothing(client):
    eid = submit(client).json()["id"]
    for url in (f"/v1/entries/{eid}", f"/v1/entries/{eid}/reviews", "/v1/placements/P1/progress"):
        assert client.get(url, headers=COORDINATOR_S2).status_code == 403
    assert client.get("/v1/entries", headers=COORDINATOR_S2).json()["total"] == 0
    assert client.get("/v1/entries", headers=STUDENT_S2).json()["total"] == 0


def test_the_admin_cannot_read_logbooks(client):
    from tests.conftest import ADMIN
    eid = submit(client).json()["id"]
    assert client.get(f"/v1/entries/{eid}", headers=ADMIN).status_code == 403


def test_everyone_on_the_placement_can_read_it(client):
    eid = submit(client).json()["id"]
    for who in (STUDENT, SUPERVISOR, ACADEMIC, COORDINATOR):
        assert client.get(f"/v1/entries/{eid}", headers=who).status_code == 200
