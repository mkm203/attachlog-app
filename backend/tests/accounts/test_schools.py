from tests.conftest import ACADEMIC, COORDINATOR, COORDINATOR_S2, STUDENT


def test_coordinator_sees_join_code_members_and_pending_invites(client):
    client.post("/v1/schools/S1/staff", json={"email": "t@school.example"}, headers=COORDINATOR)
    d = client.get("/v1/schools/S1", headers=COORDINATOR).json()
    assert d["school"]["join_code"] == "JOINONE1"
    assert {m["role"] for m in d["members"]} == {"coordinator", "academic_supervisor", "student"}
    assert [i["email"] for i in d["invites"]] == ["t@school.example"]


def test_member_pick_lists_are_filtered_by_role(client):
    students = client.get("/v1/schools/S1/members?role=student", headers=COORDINATOR).json()
    assert sorted(m["user_id"] for m in students) == ["stu-1", "stu-2"]
    staff = client.get("/v1/schools/S1/members?role=academic_supervisor", headers=COORDINATOR).json()
    assert [m["user_id"] for m in staff] == ["as-1"]
    assert client.get("/v1/schools/S1/members?role=bogus", headers=COORDINATOR).status_code == 422


def test_only_the_schools_own_coordinator_can_see_or_invite(client):
    for who in (STUDENT, ACADEMIC, COORDINATOR_S2):
        assert client.get("/v1/schools/S1", headers=who).status_code == 403
        assert client.get("/v1/schools/S1/members", headers=who).status_code == 403
        assert client.post("/v1/schools/S1/staff", json={"email": "x@y.zz"}, headers=who).status_code == 403


def test_a_coordinator_can_invite_academic_supervisors_but_not_other_coordinators(client):
    assert client.post("/v1/schools/S1/staff", json={"email": "x@y.zz", "role": "coordinator"}, headers=COORDINATOR).status_code == 422
    assert client.post("/v1/schools/S1/staff", json={"email": "bad"}, headers=COORDINATOR).status_code == 422


def test_reinviting_the_same_email_reuses_the_code(client):
    a = client.post("/v1/schools/S1/staff", json={"email": "t@school.example"}, headers=COORDINATOR).json()
    b = client.post("/v1/schools/S1/staff", json={"email": "t@school.example"}, headers=COORDINATOR).json()
    assert a["invite"]["code"] == b["invite"]["code"]
