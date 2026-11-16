from datetime import datetime, timedelta, timezone

import pytest

from app.models import Entry, PushToken
from tests.conftest import COORDINATOR, STUDENT, SUPERVISOR, auth, client_with, submit


@pytest.fixture
def client():
    yield from client_with(placements=True)


def test_entry_submission_notifies_supervisor_and_coordinator_and_read_is_private(client):
    submitted = submit(client)
    assert submitted.status_code == 201
    entry_id = submitted.json()["id"]

    supervisor_items = client.get("/v1/notifications", headers=SUPERVISOR).json()["items"]
    coordinator_items = client.get("/v1/notifications", headers=COORDINATOR).json()["items"]
    supervisor_alert = next(item for item in supervisor_items if item["kind"] == "entry_submitted")
    coordinator_alert = next(item for item in coordinator_items if item["kind"] == "entry_submitted")
    assert supervisor_alert["entry_id"] == entry_id
    assert coordinator_alert["entry_id"] == entry_id

    assert client.post(f"/v1/notifications/{coordinator_alert['id']}/read", headers=STUDENT).status_code == 404
    assert client.post(f"/v1/notifications/{coordinator_alert['id']}/read", headers=COORDINATOR).status_code == 204
    inbox = client.get("/v1/notifications", headers=COORDINATOR).json()
    assert next(item for item in inbox["items"] if item["id"] == coordinator_alert["id"])["read_at"]

    review = client.post(f"/v1/entries/{entry_id}/reviews", headers=SUPERVISOR,
                         json={"decision": "approved", "comment": None})
    assert review.status_code == 201
    academic_items = client.get("/v1/notifications", headers=auth("as-1")).json()["items"]
    assert any(item["kind"] == "academic_review_ready" and item["entry_id"] == entry_id for item in academic_items)


def test_student_signup_notifies_school_coordinators(client):
    registered = client.post("/v1/auth/register", json={
        "name": "New Student", "email": "new.student@example.com",
        "password": "Correct-horse-2026", "code": "JOINONE1",
    })
    assert registered.status_code == 201
    coordinator_items = client.get("/v1/notifications", headers=COORDINATOR).json()["items"]
    assert any(item["kind"] == "student_joined" for item in coordinator_items)


def test_overdue_review_reminder_is_created_once(client):
    created = datetime.now(timezone.utc) - timedelta(days=4)
    with client.session() as db:
        db.add(Entry(
            id="old-entry", placement_id="P1", student_id="stu-1", week=1,
            tasks="Work completed", hours=30, status="pending", created_at=created, updated_at=created,
        ))
        db.commit()

    first = client.get("/v1/notifications", headers=SUPERVISOR).json()
    second = client.get("/v1/notifications", headers=SUPERVISOR).json()
    reminders = [item for item in first["items"] if item["kind"] == "review_reminder"]
    assert len(reminders) == 1
    assert reminders[0]["entry_id"] == "old-entry"
    assert sum(item["kind"] == "review_reminder" for item in second["items"]) == 1


def test_push_token_registration_updates_language_and_logout_disables_token(client):
    headers = auth("cs-1")
    token = "ExponentPushToken[test-device-token-123456]"
    registered = client.post("/v1/notifications/push-token", headers=headers,
                             json={"token": token, "language": "en"})
    assert registered.status_code == 204
    updated = client.post("/v1/notifications/push-token", headers=headers,
                          json={"token": token, "language": "fr"})
    assert updated.status_code == 204
    with client.session() as db:
        rows = db.query(PushToken).filter(PushToken.token == token).all()
        assert len(rows) == 1
        assert rows[0].language == "fr"
        assert rows[0].active

    removed = client.post("/v1/notifications/push-token/remove", headers=headers, json={"token": token})
    assert removed.status_code == 204
    with client.session() as db:
        row = db.query(PushToken).filter(PushToken.token == token).one()
        assert not row.active
