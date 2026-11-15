"""Request and response models, with the examples shown in /docs."""
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _clean_email(value):
    return value.strip().lower() if isinstance(value, str) else value


# a light check (one @, a dot after it); the real proof of an address is the code sent to it
Email = Annotated[str, BeforeValidator(_clean_email),
                  Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
                        examples=["amina@example.com"])]
Password = Annotated[str, Field(min_length=8, max_length=100)]
Role = Literal["coordinator", "academic_supervisor", "student", "company_supervisor"]


# ---------- placements ----------
class PlacementCreate(BaseModel):
    """The coordinator picks the student and the academic supervisor from the school's members;
    the company supervisor is named by email (they may not have an account yet)."""
    school_id: str | None = Field(default=None, description="Only needed when you coordinate several schools")
    student_id: str = Field(min_length=1, max_length=36)
    academic_supervisor_id: str = Field(min_length=1, max_length=36)
    company_name: str = Field(min_length=1, max_length=120)
    company_city: str = Field(min_length=1, max_length=80)
    company_supervisor_email: Email
    start_date: date
    end_date: date

    model_config = ConfigDict(json_schema_extra={"examples": [{
        "student_id": "9f0c...", "academic_supervisor_id": "3b7a...", "company_name": "Douala Tech SARL",
        "company_city": "Douala", "company_supervisor_email": "paul@doualatech.example",
        "start_date": "2026-09-07", "end_date": "2026-11-29"}]})


class PlacementUpdate(BaseModel):
    """Only the supervisors can be changed after creation."""
    academic_supervisor_id: str = Field(min_length=1, max_length=36)
    company_supervisor_email: Email


class FinalEvaluation(BaseModel):
    score: int = Field(ge=0, le=20)
    comment: str = Field(min_length=1, max_length=1000)

    model_config = ConfigDict(json_schema_extra={"examples": [{"score": 16, "comment": "Reliable and curious."}]})


class PlacementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    school_id: str
    company_id: str
    student_id: str
    student_name: str
    company_name: str
    company_city: str
    company_supervisor_id: str | None = None
    company_supervisor_name: str | None = None
    company_supervisor_email: str
    academic_supervisor_id: str
    academic_supervisor_name: str
    start_date: date
    end_date: date
    total_weeks: int
    status: Literal["open", "closed"]
    final_score: int | None = None
    final_comment: str | None = None


class PlacementPage(BaseModel):
    items: list[PlacementOut]
    page: int
    page_size: int
    total: int


class EntryCreate(BaseModel):
    week: int = Field(ge=1, le=60)
    tasks: str = Field(min_length=1, max_length=2000)
    hours: int = Field(ge=1, le=60)

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"week": 1, "tasks": "Installed the dev environment and fixed two bugs.", "hours": 38}]})


class EntryUpdate(BaseModel):
    tasks: str = Field(min_length=1, max_length=2000)
    hours: int = Field(ge=1, le=60)

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"tasks": "Added tests and reviewed the deployment notes.", "hours": 40}]})


class ReviewCreate(BaseModel):
    decision: Literal["approved", "rejected"]
    comment: str | None = Field(default=None, max_length=1000)

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"decision": "approved"}, {"decision": "rejected", "comment": "Please detail the tasks."}]})


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_schema_extra={"examples": [{
        "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "placement_id": "5c1e6f2a-9b7d-4c3e-8a1f-2d6b9e4c7a10",
        "student_id": "stu-1", "week": 1, "tasks": "Installed the dev environment and fixed two bugs.",
        "hours": 38, "status": "pending",
        "created_at": "2026-09-14T10:00:00Z", "updated_at": "2026-09-14T10:00:00Z"}]})

    id: str
    placement_id: str
    student_id: str
    week: int
    tasks: str
    hours: int
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime
    updated_at: datetime


class EntryPage(BaseModel):
    items: list[EntryOut]
    page: int
    page_size: int
    total: int

    model_config = ConfigDict(json_schema_extra={"examples": [{
        "items": [{
            "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
            "placement_id": "5c1e6f2a-9b7d-4c3e-8a1f-2d6b9e4c7a10",
            "student_id": "stu-1", "week": 1, "tasks": "Fixed two bugs.",
            "hours": 38, "status": "pending",
            "created_at": "2026-09-14T10:00:00Z", "updated_at": "2026-09-14T10:00:00Z"}],
        "page": 1, "page_size": 10, "total": 1}]})


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_schema_extra={"examples": [{
        "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
        "entry_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "reviewer_id": "cs-1", "decision": "approved",
        "comment": None, "created_at": "2026-09-15T09:30:00Z"}]})

    id: str
    entry_id: str
    reviewer_id: str
    decision: Literal["approved", "rejected"]
    comment: str | None = None
    created_at: datetime


class ProgressComment(BaseModel):
    week: int
    decision: str
    comment: str
    reviewer_id: str

    model_config = ConfigDict(json_schema_extra={"examples": [{
        "week": 2, "decision": "rejected", "comment": "Please detail the tasks.",
        "reviewer_id": "cs-1"}]})


class Progress(BaseModel):
    placement_id: str
    total_weeks: int
    submitted: int
    approved: int
    pending: int
    rejected: int
    completion_percent: float
    comments: list[ProgressComment]

    model_config = ConfigDict(json_schema_extra={"examples": [{
        "placement_id": "5c1e6f2a-9b7d-4c3e-8a1f-2d6b9e4c7a10",
        "total_weeks": 12, "submitted": 3, "approved": 1, "pending": 1, "rejected": 1,
        "completion_percent": 8.3,
        "comments": [{"week": 2, "decision": "rejected",
                      "comment": "Please detail the tasks.", "reviewer_id": "cs-1"}]}]})


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list | None = None


class ErrorResponse(BaseModel):
    """The one error format of the API: {"error": {"code", "message", "details"}}."""
    error: ErrorBody

    model_config = ConfigDict(json_schema_extra={"examples": [{
        "error": {"code": "entry_exists", "message": "An entry already exists for week 2", "details": None}}]})


# ---------- accounts ----------
class LoginRequest(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=100)


class RegisterRequest(BaseModel):
    """A code is required: an invite code (sent to this email) or your school's join code (students)."""
    name: str = Field(min_length=2, max_length=120)
    email: Email
    password: Password
    code: str = Field(min_length=4, max_length=40)


class RedeemRequest(BaseModel):
    code: str = Field(min_length=4, max_length=40)


class ChangePassword(BaseModel):
    current_password: str = Field(min_length=1, max_length=100)
    new_password: Password


class ForgotRequest(BaseModel):
    email: Email


class ResetRequest(BaseModel):
    email: Email
    code: str = Field(min_length=4, max_length=12)
    new_password: Password


class MembershipOut(BaseModel):
    id: str
    role: Role
    school_id: str | None = None
    school_name: str | None = None
    company_id: str | None = None
    company_name: str | None = None


class MeOut(BaseModel):
    id: str
    name: str
    email: str
    is_admin: bool
    email_verified: bool
    memberships: list[MembershipOut]


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: MeOut


# ---------- schools ----------
class SchoolIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    city: str = Field(min_length=1, max_length=80)
    term_start: date
    term_end: date


class SchoolCreate(SchoolIn):
    coordinator_email: Email


class SchoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    city: str
    join_code: str
    term_start: date
    term_end: date


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    email: str
    role: Role
    expires_at: datetime
    accepted_at: datetime | None = None


class GrantOut(BaseModel):
    """`member`: they already had a verified account and now have the role. `invited`: give them the code."""
    status: Literal["member", "invited"]
    email: str
    invite: InviteOut | None = None
    email_sent: bool = False


class SchoolCreated(BaseModel):
    school: SchoolOut
    coordinator: GrantOut


class SchoolSummary(SchoolOut):
    coordinators: int
    academic_supervisors: int
    students: int
    placements: int


class MemberOut(BaseModel):
    user_id: str
    name: str
    email: str
    role: Role


class SchoolDetail(BaseModel):
    school: SchoolOut
    members: list[MemberOut]
    invites: list[InviteOut]


class StaffInvite(BaseModel):
    email: Email
    role: Literal["academic_supervisor"] = "academic_supervisor"


class AddCoordinator(BaseModel):
    email: Email


class AdminResetPassword(BaseModel):
    email: Email
