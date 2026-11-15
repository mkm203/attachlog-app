"""Optional email through Resend (https://resend.com, free tier). Without RESEND_API_KEY nothing is sent
and the callers show the codes on screen instead."""
import json
import logging
import urllib.request

from app import config

log = logging.getLogger("attachlog.mail")


def enabled() -> bool:
    return bool(config.resend_api_key())


def send(to: str, subject: str, text: str) -> bool:
    """Returns True when the provider accepted the message. Never raises."""
    if not enabled():
        return False
    body = json.dumps({"from": config.mail_from(), "to": [to], "subject": subject, "text": text}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=body, method="POST", headers={
        "Authorization": f"Bearer {config.resend_api_key()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except Exception as exc:  # network down, bad key, provider error: the code is still shown on screen
        log.warning("email to %s failed: %s", to, exc)
        return False
