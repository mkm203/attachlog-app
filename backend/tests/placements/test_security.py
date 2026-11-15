import pytest

from tests.conftest import (ACADEMIC, ADMIN, COORDINATOR, COORDINATOR_S2, STUDENT, STUDENT_S2, SUPERVISOR, client_with)

BODY = {"student_id": "stu-1", "academic_supervisor_id": "as-1", "company_name": "Acme", "company_city": "Douala",
        "company_supervisor_email": "cs-1@example.com", "start_date": "2026-09-07", "end_date": "2026-11-29"}

PROTECTED = [
    ("post", "/v1/placements", BODY),
    ("put", "/v1/placements/x", {"academic_supervisor_id": "as-1", "company_supervisor_email": "cs-1@example.com"}),
    ("post", "/v1/placements/x/close", {"score": 10, "comment": "ok"}),
    ("get", "/v1/placements", None),
    ("get", "/v1/placements/x", None),
]


@pytest.mark.parametrize("method,url,body", PROTECTED)
def test_no_token_is_401(client, method, url, body):
    r = getattr(client, method)(url, **({"json": body} if body else {}))
    assert r.status_code == 401 and r.json()["error"]["code"] == "not_authenticated"


@pytest.mark.parametrize("who", [STUDENT, SUPERVISOR, ACADEMIC, ADMIN])
def test_only_a_coordinator_can_create(client, who):
    r = client.post("/v1/placements", json=BODY, headers=who)
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


def test_a_coordinator_of_another_school_cannot_use_this_school(client):
    assert client.post("/v1/placements", json={**BODY, "school_id": "S1"}, headers=COORDINATOR_S2).status_code == 403
    pid = client.post("/v1/placements", json=BODY, headers=COORDINATOR).json()["id"]
    assert client.get(f"/v1/placements/{pid}", headers=COORDINATOR_S2).status_code == 403
    assert client.post(f"/v1/placements/{pid}/close", json={"score": 10, "comment": "x"}, headers=COORDINATOR_S2).status_code == 403
    assert client.put(f"/v1/placements/{pid}", headers=COORDINATOR_S2,
                      json={"academic_supervisor_id": "as-1", "company_supervisor_email": "cs-1@example.com"}).status_code == 403
    assert client.get("/v1/placements", headers=COORDINATOR_S2).json()["total"] == 0


def test_each_person_lists_only_their_own_placements():
    for client in client_with(placements=True):
        total = lambda who: client.get("/v1/placements", headers=who).json()["total"]  # noqa: E731
        assert total(COORDINATOR) == 3
        assert total(STUDENT) == 2             # P1 and P3
        assert total(SUPERVISOR) == 2
        assert total(ACADEMIC) == 3
        assert total(STUDENT_S2) == 0 and total(ADMIN) == 0
        assert client.get("/v1/placements/P2", headers=STUDENT).status_code == 403


def test_a_coordinator_of_two_schools_must_say_which(client):
    from app.models import Membership
    with client.session() as db:
        db.add(Membership(user_id="co-1", role="coordinator", school_id="S2"))
        db.commit()
    r = client.post("/v1/placements", json=BODY, headers=COORDINATOR)
    assert r.status_code == 422 and r.json()["error"]["code"] == "school_required"
    assert client.post("/v1/placements", json={**BODY, "school_id": "S1"}, headers=COORDINATOR).status_code == 201
