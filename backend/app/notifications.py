"""Persistent in-app notifications, push-token registration, and due reminders."""
import json
import logging
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.access import school_ids
from app.database import get_db
from app.errors import ApiError
from app.models import AppNotification, Entry, Membership, Placement, PushToken, User, as_utc, now
from app.schemas import ErrorResponse, NotificationPage, PushTokenIn
from app.security import current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/notifications", tags=["notifications"])
DB = Annotated[Session, Depends(get_db)]
Anyone = Annotated[User, Depends(current_user)]
MESSAGES = {
    "placement_assigned": ("A placement was assigned", "Your placement details are ready to view."),
    "entry_submitted": ("A weekly entry needs review", "A student submitted an entry that is waiting for your review."),
    "entry_reviewed": ("Your entry was reviewed", "A company supervisor reviewed your weekly entry."),
    "academic_review_ready": ("Entry ready for academic review", "A company supervisor approved an entry for your academic feedback."),
    "academic_feedback": ("Academic feedback received", "Your academic supervisor added feedback to a weekly entry."),
    "placement_closed": ("Placement completed", "The coordinator closed a placement and added the final evaluation."),
    "student_joined": ("A student joined the school", "A new student account is available for placement assignment."),
    "review_reminder": ("Review waiting", "A weekly entry has been waiting for your review for more than three days."),
    "missing_entry": ("Weekly logbook reminder", "A completed placement week is missing its weekly entry."),
    "placement_ending": ("Placement ending soon", "An open placement ends within the next week."),
}
FRENCH_MESSAGES = {
    "placement_assigned": ("Un stage a été attribué", "Les détails de votre stage sont disponibles."),
    "entry_submitted": ("Un rapport hebdomadaire attend une révision", "Un étudiant a soumis un rapport à réviser."),
    "entry_reviewed": ("Votre rapport a été révisé", "Un superviseur en entreprise a révisé votre rapport hebdomadaire."),
    "academic_review_ready": ("Rapport prêt pour la révision académique", "Un superviseur en entreprise a approuvé un rapport pour votre commentaire académique."),
    "academic_feedback": ("Commentaire académique reçu", "Votre superviseur académique a commenté un rapport hebdomadaire."),
    "placement_closed": ("Stage terminé", "Le coordinateur a clôturé un stage et ajouté l'évaluation finale."),
    "student_joined": ("Un étudiant a rejoint l'école", "Un nouveau compte étudiant est disponible pour l'attribution d'un stage."),
    "review_reminder": ("Révision en attente", "Un rapport hebdomadaire attend une révision depuis plus de trois jours."),
    "missing_entry": ("Rappel de journal hebdomadaire", "Une semaine de stage terminée n'a pas encore de rapport hebdomadaire."),
    "placement_ending": ("Stage bientôt terminé", "Un stage ouvert se termine dans la prochaine semaine."),
}


def notify_users(
    db: Session,
    user_ids: list[str] | set[str],
    kind: str,
    *,
    placement_id: str | None = None,
    entry_id: str | None = None,
    dedupe_key: str | None = None,
) -> list[AppNotification]:
    title, body = MESSAGES[kind]
    created = []
    for user_id in set(user_ids):
        if dedupe_key and db.scalar(select(AppNotification.id).where(
            AppNotification.user_id == user_id, AppNotification.dedupe_key == dedupe_key
        )):
            continue
        item = AppNotification(user_id=user_id, kind=kind, title=title, body=body,
                               placement_id=placement_id, entry_id=entry_id, dedupe_key=dedupe_key)
        db.add(item)
        created.append(item)
    if created:
        db.flush()
    return created


def send_push_notifications(db: Session, notifications: list[AppNotification]) -> None:
    """Best-effort Expo delivery; durable in-app alerts remain available if push delivery fails."""
    if not notifications:
        return
    recipient_ids = {item.user_id for item in notifications}
    tokens = db.scalars(select(PushToken).where(
        PushToken.user_id.in_(recipient_ids), PushToken.active.is_(True)
    )).all()
    by_user: dict[str, list[PushToken]] = {}
    for token in tokens:
        by_user.setdefault(token.user_id, []).append(token)
    messages = []
    owners: list[PushToken] = []
    for item in notifications:
        for token in by_user.get(item.user_id, []):
            title, body = (FRENCH_MESSAGES if token.language == "fr" else MESSAGES)[item.kind]
            messages.append({
                "to": token.token,
                "title": title,
                "body": body,
                "sound": "default",
                "data": {"notificationId": item.id, "kind": item.kind,
                         "placementId": item.placement_id, "entryId": item.entry_id},
            })
            owners.append(token)

    for start in range(0, len(messages), 100):
        chunk = messages[start:start + 100]
        try:
            request = Request(
                "https://exp.host/--/api/v2/push/send",
                data=json.dumps(chunk).encode("utf-8"),
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=8) as response:
                result = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError, OSError) as exc:
            logger.warning("Expo push request failed: %s", exc)
            continue
        if not isinstance(result, dict):
            logger.warning("Expo push request returned an invalid response")
            continue
        tickets = result.get("data", [])
        if isinstance(tickets, dict):
            tickets = [tickets]
        if not isinstance(tickets, list):
            logger.warning("Expo push request returned invalid delivery tickets")
            continue
        for token, ticket in zip(owners[start:start + len(chunk)], tickets):
            if not isinstance(ticket, dict):
                logger.warning("Expo push request returned an invalid delivery ticket")
                continue
            details = ticket.get("details") or {}
            if details.get("error") == "DeviceNotRegistered":
                token.active = False
    if any(not token.active for token in tokens):
        db.commit()


def _due_reminders(db: Session, user: User) -> list[AppNotification]:
    """Create deduplicated reminders on inbox refresh, avoiding a fragile in-process scheduler."""
    today = datetime.now(timezone.utc).date()
    created: list[AppNotification] = []
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    roles = {membership.role for membership in memberships}
    if "student" in roles:
        placements = db.scalars(select(Placement).where(
            Placement.student_id == user.id, Placement.status == "open",
        )).all()
        for placement in placements:
            elapsed_weeks = min(placement.total_weeks, max(0, (today - placement.start_date).days // 7))
            submitted = set(db.scalars(select(Entry.week).where(Entry.placement_id == placement.id)).all())
            for week in range(1, elapsed_weeks + 1):
                if week not in submitted:
                    created.extend(notify_users(db, [user.id], "missing_entry", placement_id=placement.id,
                                                dedupe_key=f"missing:{placement.id}:{week}"))
    if "company_supervisor" in roles:
        placements = db.scalars(select(Placement).where(
            Placement.company_supervisor_id == user.id, Placement.status == "open",
        )).all()
        for placement in placements:
            pending = db.scalars(select(Entry).where(
                Entry.placement_id == placement.id, Entry.status == "pending",
            )).all()
            for entry in pending:
                if as_utc(entry.created_at) <= now() - timedelta(days=3):
                    created.extend(notify_users(db, [user.id], "review_reminder", placement_id=placement.id,
                                                entry_id=entry.id, dedupe_key=f"review:{entry.id}"))
    ending_conditions = [
        Placement.student_id == user.id,
        Placement.company_supervisor_id == user.id,
        Placement.academic_supervisor_id == user.id,
    ]
    coordinated_schools = school_ids(db, user.id, "coordinator")
    if coordinated_schools:
        ending_conditions.append(Placement.school_id.in_(coordinated_schools))
    placements = db.scalars(select(Placement).where(
        Placement.status == "open", or_(*ending_conditions),
    )).all()
    for placement in placements:
        days_left = (placement.end_date - today).days
        if 0 <= days_left <= 7:
            created.extend(notify_users(db, [user.id], "placement_ending", placement_id=placement.id,
                                        dedupe_key=f"ending:{placement.id}"))
    return created


@router.get("", response_model=NotificationPage, responses={401: {"model": ErrorResponse}})
def list_notifications(db: DB, user: Anyone):
    created = _due_reminders(db, user)
    if created:
        db.commit()
        send_push_notifications(db, created)
    items = db.scalars(select(AppNotification).where(
        AppNotification.user_id == user.id
    ).order_by(AppNotification.created_at.desc(), AppNotification.id.desc()).limit(100)).all()
    unread_count = db.scalar(select(func.count()).select_from(AppNotification).where(
        AppNotification.user_id == user.id, AppNotification.read_at.is_(None)
    ))
    total = db.scalar(select(func.count()).select_from(AppNotification).where(AppNotification.user_id == user.id))
    return {"items": items, "total": total or 0, "unread_count": unread_count or 0}


@router.post("/push-token", status_code=204, responses={401: {"model": ErrorResponse}})
def register_push_token(data: PushTokenIn, db: DB, user: Anyone):
    token = db.scalar(select(PushToken).where(PushToken.token == data.token))
    if token is None:
        token = PushToken(user_id=user.id, token=data.token, language=data.language)
        db.add(token)
    else:
        token.user_id = user.id
        token.language = data.language
        token.active = True
        token.updated_at = now()
    db.commit()


@router.post("/push-token/remove", status_code=204, responses={401: {"model": ErrorResponse}})
def remove_push_token(data: PushTokenIn, db: DB, user: Anyone):
    token = db.scalar(select(PushToken).where(PushToken.token == data.token, PushToken.user_id == user.id))
    if token is not None and token.active:
        token.active = False
        token.updated_at = now()
        db.commit()


@router.post("/{notification_id}/read", status_code=204,
             responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def mark_notification_read(notification_id: Annotated[str, Path(min_length=1)], db: DB, user: Anyone):
    item = db.scalar(select(AppNotification).where(
        AppNotification.id == notification_id, AppNotification.user_id == user.id
    ))
    if item is None:
        raise ApiError(404, "notification_not_found", "Notification not found")
    if item.read_at is None:
        item.read_at = now()
        db.commit()


@router.post("/read-all", status_code=204, responses={401: {"model": ErrorResponse}})
def mark_all_notifications_read(db: DB, user: Anyone):
    db.query(AppNotification).filter(
        AppNotification.user_id == user.id, AppNotification.read_at.is_(None)
    ).update({AppNotification.read_at: now()}, synchronize_session=False)
    db.commit()
