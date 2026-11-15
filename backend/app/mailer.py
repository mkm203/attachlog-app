"""Optional email. The first provider that is configured is used:

1. Gmail or any SMTP server:  SMTP_USER + SMTP_PASSWORD (a Google App Password), optional SMTP_HOST / SMTP_PORT
2. Brevo (HTTPS API):         BREVO_API_KEY (verify your sender address in Brevo first)
3. Resend (HTTPS API):        RESEND_API_KEY (its test sender only delivers to your own address)

Without any of them nothing is sent and the callers show the codes on screen instead.
Note: Render's free web services block SMTP ports, so on Render free use Brevo or Resend; SMTP works
on your own computer and on paid hosting.
"""
import json
import logging
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from email.utils import parseaddr

from app import config

log = logging.getLogger("attachlog.mail")


def provider() -> str | None:
    if config.smtp_user() and config.smtp_password():
        return "smtp"
    if config.brevo_api_key():
        return "brevo"
    if config.resend_api_key():
        return "resend"
    return None


def enabled() -> bool:
    return provider() is not None


def _post_json(url: str, headers: dict, payload: dict) -> bool:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return 200 <= resp.status < 300


def _send_smtp(to: str, subject: str, text: str) -> bool:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = config.mail_from(), to, subject
    msg.set_content(text)
    host, port = config.smtp_host(), config.smtp_port()
    context = ssl.create_default_context()
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=15, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=15)
    with server:
        if port != 465:
            server.starttls(context=context)
        server.login(config.smtp_user(), config.smtp_password())
        server.send_message(msg)
    return True


def _send_brevo(to: str, subject: str, text: str) -> bool:
    name, address = parseaddr(config.mail_from())
    return _post_json("https://api.brevo.com/v3/smtp/email", {"api-key": config.brevo_api_key()}, {
        "sender": {"name": name or "AttachLog", "email": address}, "to": [{"email": to}],
        "subject": subject, "textContent": text})


def _send_resend(to: str, subject: str, text: str) -> bool:
    return _post_json("https://api.resend.com/emails", {"Authorization": f"Bearer {config.resend_api_key()}"},
                      {"from": config.mail_from(), "to": [to], "subject": subject, "text": text})


def send(to: str, subject: str, text: str) -> bool:
    """Returns True when the provider accepted the message. Never raises."""
    chosen = provider()
    if chosen is None:
        return False
    try:
        return {"smtp": _send_smtp, "brevo": _send_brevo, "resend": _send_resend}[chosen](to, subject, text)
    except Exception as exc:  # network down, blocked port, bad key: the code is still shown on screen
        log.warning("email to %s via %s failed: %s", to, chosen, exc)
        return False
