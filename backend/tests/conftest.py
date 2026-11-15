"""Shared test helpers. Each test folder defines its own `client` fixture (with or without placements).

The seeded world: school S1 (coordinator co-1, academic supervisor as-1, students stu-1 and stu-2) and school S2
(coordinator co-2, student stu-3); company C1 with supervisors cs-1 and cs-2; an administrator `admin`.
Test users have readable ids, so a token is just make_token(id)."""
import os
from datetime import date

os.environ.setdefault("ATTACHLOG_SKIP_DOTENV", "1")
os.environ.setdefault("AUTO_MIGRATE", "0")   # the tests build their own in-memory database
os.environ.setdefault("JWT_SECRET", "dev-secret-change-me-use-32-chars-min")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import ratelimit
from app.database import Base, get_db
from app.main import app
from app.models import Company, Membership, Placement, School, User
from app.security import hash_password, make_token as _token

PASSWORD = "Correct-horse-2026"


@pytest.fixture(autouse=True)
def _fresh_limits():
    ratelimit.reset_all()
    yield


def auth(user_id: str) -> dict:
    return {"Authorization": "Bearer " + _token(user_id)[0]}


STUDENT, OTHER_STUDENT, STUDENT_S2 = auth("stu-1"), auth("stu-2"), auth("stu-3")
SUPERVISOR, OTHER_SUPERVISOR = auth("cs-1"), auth("cs-2")
ACADEMIC, COORDINATOR, COORDINATOR_S2, ADMIN = auth("as-1"), auth("co-1"), auth("co-2"), auth("admin")


def _world(db):
    pw = hash_password(PASSWORD)
    for uid, name in [("stu-1", "Clarisse Ngo"), ("stu-2", "Arnaud Tchoupe"), ("stu-3", "Rose Biya"),
                      ("cs-1", "Paul Mbarga"), ("cs-2", "Sandrine Fotso"), ("as-1", "Elise Ngono"),
                      ("co-1", "Julie Mbia"), ("co-2", "Marc Eto"), ("admin", "Administrator")]:
        db.add(User(id=uid, email=f"{uid}@example.com", name=name, password_hash=pw, email_verified=True,
                    is_admin=uid == "admin"))
    db.add_all([School(id="S1", name="Univ One", city="Douala", join_code="JOINONE1", term_start=date(2026, 9, 1), term_end=date(2027, 2, 28)),
                School(id="S2", name="Univ Two", city="Yaounde", join_code="JOINTWO2", term_start=date(2026, 9, 1), term_end=date(2027, 2, 28)),
                Company(id="C1", name="Acme", city="Douala")])
    db.flush()
    for uid, role, school, company in [("co-1", "coordinator", "S1", None), ("as-1", "academic_supervisor", "S1", None),
                                       ("stu-1", "student", "S1", None), ("stu-2", "student", "S1", None),
                                       ("co-2", "coordinator", "S2", None), ("stu-3", "student", "S2", None),
                                       ("cs-1", "company_supervisor", None, "C1"), ("cs-2", "company_supervisor", None, "C1")]:
        db.add(Membership(user_id=uid, role=role, school_id=school, company_id=company))


def _placement(pid, student, cs, status="open"):
    return Placement(id=pid, school_id="S1", company_id="C1", student_id=student, student_name=student,
                     company_name="Acme", company_city="Douala", company_supervisor_id=cs,
                     company_supervisor_name=cs, company_supervisor_email=f"{cs}@example.com",
                     academic_supervisor_id="as-1", academic_supervisor_name="Elise Ngono",
                     start_date=date(2026, 9, 7), end_date=date(2026, 10, 4), total_weeks=4, status=status)


def client_with(placements: bool):
    """A TestClient on a fresh in-memory database. `client.session()` opens a session on it.
    With placements=True it holds P1 (stu-1, cs-1), P2 (stu-2, cs-2) and P3 (stu-1, closed)."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as db:
        _world(db)
        if placements:
            db.add_all([_placement("P1", "stu-1", "cs-1"), _placement("P2", "stu-2", "cs-2"),
                        _placement("P3", "stu-1", "cs-1", status="closed")])
        db.commit()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    client.session = Session
    yield client
    app.dependency_overrides.clear()


def submit(client, week=1, placement="P1", headers=STUDENT, **extra):
    return client.post(f"/v1/placements/{placement}/entries",
                       json={"week": week, "tasks": "Fixed bugs", "hours": 35, **extra}, headers=headers)
