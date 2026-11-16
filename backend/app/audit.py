"""Append-only activity trail for key actions."""
from sqlalchemy.orm import Session

from app.models import AuditEvent


def record(db: Session, *, actor_id: str, action: str, placement_id: str | None = None,
           school_id: str | None = None, detail: str | None = None) -> None:
    db.add(AuditEvent(actor_id=actor_id, action=action, placement_id=placement_id,
                      school_id=school_id, detail=detail))
