"""The tables.

people and places:  users, schools, companies, memberships, invites, password_resets
the logbook:        placements, entries, reviews

A user has no role of their own. They get roles through memberships:
coordinator, academic_supervisor and student belong to a school; company_supervisor belongs to a company.
"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

ROLES = ("coordinator", "academic_supervisor", "student", "company_supervisor")
SCHOOL_ROLES = ("coordinator", "academic_supervisor", "student")


def now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they were stored as UTC, so say so."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # true once the person proved they own the address (redeemed an invite code sent to it, or reset by email)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    field_of_study: Mapped[str | None] = mapped_column(String(120), nullable=True)
    specialty: Mapped[str | None] = mapped_column(String(120), nullable=True)
    teaching_field: Mapped[str | None] = mapped_column(String(120), nullable=True)  # academic supervisors
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)  # small data URI or URL
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class School(Base):
    __tablename__ = "schools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    city: Mapped[str] = mapped_column(String(80))
    join_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)  # students sign up with it
    term_start: Mapped[date] = mapped_column(Date)
    term_end: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Company(Base):
    """Shared by all schools, so one supervisor can host interns from several of them."""
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "role", "school_id", "company_id", name="uq_membership"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    school_id: Mapped[str | None] = mapped_column(ForeignKey("schools.id"), index=True, nullable=True)
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Invite(Base):
    """A code sent to one email address. Redeeming it creates the membership."""
    __tablename__ = "invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    role: Mapped[str] = mapped_column(String(20))
    school_id: Mapped[str | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailChange(Base):
    __tablename__ = "email_changes"
    __table_args__ = (UniqueConstraint("user_id", name="uq_email_change_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    new_email: Mapped[str] = mapped_column(String(254))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Placement(Base):
    """The hub: one student, one school, one company, two supervisors."""
    __tablename__ = "placements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    school_id: Mapped[str] = mapped_column(ForeignKey("schools.id"), index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    company_name: Mapped[str] = mapped_column(String(120))
    company_city: Mapped[str] = mapped_column(String(80))
    # empty until the invited supervisor creates an account (the email says who is expected)
    company_supervisor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    company_supervisor_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    company_supervisor_email: Mapped[str] = mapped_column(String(254), index=True)
    academic_supervisor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    academic_supervisor_name: Mapped[str] = mapped_column(String(120))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    total_weeks: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="open")
    final_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_comment: Mapped[str | None] = mapped_column(Text, nullable=True)


class Entry(Base):
    __tablename__ = "entries"
    # Rule 1: one entry per placement (so per student) per week, enforced by the database too
    __table_args__ = (UniqueConstraint("placement_id", "week", name="uq_entry_placement_week"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    placement_id: Mapped[str] = mapped_column(ForeignKey("placements.id"), index=True)
    student_id: Mapped[str] = mapped_column(String(36), index=True)
    week: Mapped[int] = mapped_column(Integer)
    tasks: Mapped[str] = mapped_column(Text)
    hours: Mapped[int] = mapped_column(Integer)
    reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills: Mapped[str | None] = mapped_column(String(400), nullable=True)  # comma-separated tags
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    entry_id: Mapped[str] = mapped_column(ForeignKey("entries.id"), index=True)
    reviewer_id: Mapped[str] = mapped_column(String(36))
    decision: Mapped[str] = mapped_column(String(10))
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    school_id: Mapped[str | None] = mapped_column(ForeignKey("schools.id"), index=True, nullable=True)
    placement_id: Mapped[str | None] = mapped_column(ForeignKey("placements.id"), index=True, nullable=True)
    actor_id: Mapped[str] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
