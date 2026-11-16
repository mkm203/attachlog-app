from tests.conftest import ACADEMIC, COORDINATOR, COORDINATOR_S2, PASSWORD, STUDENT, SUPERVISOR, ADMIN
from app.models import User

PLACEMENT = {"student_id": "stu-1", "academic_supervisor_id": "as-1", "company_name": "Douala Tech SARL",
             "company_city": "Douala", "company_supervisor_email": "cs-1@example.com",
             "start_date": "2026-09-07", "end_date": "2026-11-29"}


def make(client, **changes):
    return client.post("/v1/placements", json={**PLACEMENT, **changes}, headers=COORDINATOR)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_create_and_get(client):
    r = make(client)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "open" and body["total_weeks"] == 12 and body["school_id"] == "S1"
    assert body["student_name"] == "Clarisse Ngo" and body["academic_supervisor_name"] == "Elise Ngono"
    assert client.get(f"/v1/placements/{body['id']}", headers=COORDINATOR).json() == body


def test_placement_responses_include_current_profile_photos(client):
    body = make(client).json()
    changed = client.put("/v1/me", headers=STUDENT, json={
        "name": "Clarisse Updated", "avatar": "data:image/jpeg;base64,student",
    })
    assert changed.status_code == 200
    with client.session() as db:
        db.get(User, "as-1").avatar = "data:image/jpeg;base64,academic"
        db.get(User, "cs-1").avatar = "data:image/jpeg;base64,company"
        db.commit()

    body = client.get(f"/v1/placements/{body['id']}", headers=COORDINATOR).json()
    assert body["student_name"] == "Clarisse Updated"
    assert body["student_avatar"] == "data:image/jpeg;base64,student"
    assert body["academic_supervisor_avatar"] == "data:image/jpeg;base64,academic"
    assert body["company_supervisor_avatar"] == "data:image/jpeg;base64,company"
    listed = client.get("/v1/placements", headers=COORDINATOR).json()["items"][0]
    assert listed["student_avatar"] == body["student_avatar"]


def test_company_supervisor_email_change_updates_linked_placements(client, monkeypatch):
    placement = make(client).json()
    sent = []
    monkeypatch.setattr("app.auth.mailer.enabled", lambda: True)
    monkeypatch.setattr("app.auth.mailer.send", lambda to, subject, text: sent.append((to, text)) or True)
    requested = client.post("/v1/me/email-change",
                            json={"current_password": PASSWORD, "new_email": "paul.new@example.com"},
                            headers=SUPERVISOR)
    assert requested.status_code == 202
    code = sent[0][1].split("code is ", 1)[1].split(".", 1)[0]
    changed = client.post("/v1/me/email-change/confirm", json={"code": code}, headers=SUPERVISOR)
    assert changed.status_code == 200 and changed.json()["email"] == "paul.new@example.com"
    updated = client.get(f"/v1/placements/{placement['id']}", headers=COORDINATOR).json()
    assert updated["company_supervisor_email"] == "paul.new@example.com"


def test_known_company_supervisor_is_linked_at_once(client):
    body = make(client).json()          # cs-1@example.com has a verified account
    assert body["company_supervisor_id"] == "cs-1" and body["company_supervisor_name"] == "Paul Mbarga"


def test_unknown_company_supervisor_gets_an_invite_and_is_linked_when_they_join(client):
    body = make(client, company_supervisor_email="New.Person@Firm.example").json()
    assert body["company_supervisor_id"] is None and body["company_supervisor_email"] == "new.person@firm.example"
    from app.models import Invite
    from sqlalchemy import select
    with client.session() as db:
        invite = db.scalar(select(Invite).where(Invite.email == "new.person@firm.example"))
    assert invite is not None and invite.role == "company_supervisor"
    r = client.post("/v1/auth/register", json={"name": "New Person", "email": "new.person@firm.example",
                                               "password": "Another-pass-1", "code": invite.code})
    assert r.status_code == 201
    token = {"Authorization": "Bearer " + r.json()["access_token"]}
    placement = client.get(f"/v1/placements/{body['id']}", headers=token).json()
    assert placement["company_supervisor_name"] == "New Person"


def test_the_company_is_shared_not_duplicated(client):
    a = make(client, company_name="ACME", company_city="douala").json()
    b = make(client, student_id="stu-2", company_name="acme", company_city="Douala").json()
    assert a["company_id"] == b["company_id"] == "C1"


def test_student_and_academic_supervisor_must_belong_to_the_school(client):
    r = make(client, student_id="stu-3")                # a student of school S2
    assert r.status_code == 422 and r.json()["error"]["code"] == "student_not_in_school"
    r = make(client, academic_supervisor_id="stu-1")
    assert r.status_code == 422 and r.json()["error"]["code"] == "supervisor_not_in_school"


def test_unknown_placement_is_404_with_error_schema(client):
    r = client.get("/v1/placements/nope", headers=COORDINATOR)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "placement_not_found"


def test_dates_must_be_ordered_and_inside_the_schools_term(client):
    assert make(client, end_date="2026-09-01", start_date="2026-09-07").status_code == 422
    r = make(client, start_date="2026-01-05")
    assert r.status_code == 422 and r.json()["error"]["code"] == "outside_term"


def test_missing_field_is_422_with_details(client):
    r = client.post("/v1/placements", json={"student_id": "x"}, headers=COORDINATOR)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error" and r.json()["error"]["details"]


def test_list_filters_and_pages(client):
    make(client)
    make(client, student_id="stu-2")
    make(client, student_id="stu-2", start_date="2026-10-05")
    page = client.get("/v1/placements?page=1&page_size=2", headers=COORDINATOR).json()
    assert page["total"] == 3 and len(page["items"]) == 2
    assert client.get("/v1/placements?student_id=stu-1", headers=COORDINATOR).json()["total"] == 1
    assert client.get("/v1/placements?status=closed", headers=COORDINATOR).json()["total"] == 0
    assert client.get("/v1/placements?page_size=500", headers=COORDINATOR).status_code == 422


def test_update_supervisors(client):
    pid = make(client).json()["id"]
    r = client.put(f"/v1/placements/{pid}", headers=COORDINATOR,
                   json={"academic_supervisor_id": "as-1", "company_supervisor_email": "cs-2@example.com"})
    assert r.status_code == 200 and r.json()["company_supervisor_id"] == "cs-2"


def test_close_records_evaluation_and_locks(client):
    pid = make(client).json()["id"]
    r = client.post(f"/v1/placements/{pid}/close", json={"score": 16, "comment": "Reliable."}, headers=COORDINATOR)
    assert r.status_code == 200 and r.json()["status"] == "closed" and r.json()["final_score"] == 16
    again = client.post(f"/v1/placements/{pid}/close", json={"score": 10, "comment": "x"}, headers=COORDINATOR)
    assert again.status_code == 409
    upd = client.put(f"/v1/placements/{pid}", headers=COORDINATOR,
                     json={"academic_supervisor_id": "as-1", "company_supervisor_email": "cs-1@example.com"})
    assert upd.status_code == 409


def test_closed_placement_report_includes_entries_reviews_and_closure_date(client):
    placement = make(client).json()
    entry = client.post(f"/v1/placements/{placement['id']}/entries", headers=STUDENT, json={
        "week": 1, "tasks": "Prepared a deployment", "hours": 35,
        "reflection": "Learned release testing.", "skills": "testing, deployment",
    })
    assert entry.status_code == 201
    reviewed = client.post(f"/v1/entries/{entry.json()['id']}/reviews", headers=SUPERVISOR,
                           json={"decision": "approved", "comment": "Good work."})
    assert reviewed.status_code == 201
    feedback = client.post(f"/v1/entries/{entry.json()['id']}/feedback", headers=ACADEMIC,
                           json={"decision": "approved", "comment": "Strong reflection."})
    assert feedback.status_code == 201
    closed = client.post(f"/v1/placements/{placement['id']}/close", headers=COORDINATOR,
                         json={"score": 16, "comment": "Reliable."})
    assert closed.status_code == 200

    report = client.get(f"/v1/placements/{placement['id']}/report", headers=COORDINATOR)
    assert report.status_code == 200
    body = report.json()
    assert body["school_name"] == "Univ One"
    assert body["placement"]["start_date"] == "2026-09-07"
    assert body["placement"]["end_date"] == "2026-11-29"
    assert body["placement"]["final_score"] == 16
    assert body["placement"]["final_comment"] == "Reliable."
    assert body["closed_at"]
    assert len(body["entries"]) == 1
    report_entry = body["entries"][0]
    assert report_entry["tasks"] == "Prepared a deployment"
    assert report_entry["reflection"] == "Learned release testing."
    assert report_entry["skills"] == "testing, deployment"
    assert report_entry["created_at"] and report_entry["updated_at"]
    assert [(r["reviewer_name"], r["comment"]) for r in report_entry["reviews"]] == [
        ("Paul Mbarga", "Good work."),
        ("Elise Ngono", "Strong reflection."),
    ]
    assert all(r["created_at"] for r in report_entry["reviews"])


def test_placement_report_is_coordinator_only_and_closed_only(client):
    closed_id = make(client).json()["id"]
    closed = client.post(f"/v1/placements/{closed_id}/close", headers=COORDINATOR,
                         json={"score": 12, "comment": "Completed."})
    assert closed.status_code == 200
    for headers in (STUDENT, SUPERVISOR, ACADEMIC, COORDINATOR_S2, ADMIN):
        response = client.get(f"/v1/placements/{closed_id}/report", headers=headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "forbidden"

    open_id = make(client).json()["id"]
    response = client.get(f"/v1/placements/{open_id}/report", headers=COORDINATOR)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "placement_not_closed"


def test_score_out_of_range_is_422(client):
    pid = make(client).json()["id"]
    assert client.post(f"/v1/placements/{pid}/close", json={"score": 25, "comment": "x"},
                       headers=COORDINATOR).status_code == 422
