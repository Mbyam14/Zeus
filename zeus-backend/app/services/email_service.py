import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def _reset_email_html(code: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #2C3E50; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h1 style="color: #FF6B35; font-size: 24px; margin-bottom: 16px;">Reset your Zeus password</h1>
        <p>Enter this code in the app to set a new password. It expires in 15 minutes.</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #F8F9FA; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
          {code}
        </div>
        <p style="color: #7F8C8D; font-size: 14px;">If you didn't request this, ignore this email — your password won't change.</p>
      </body>
    </html>
    """.strip()


async def send_password_reset_email(to_email: str, code: str) -> None:
    """Send a password reset code via Resend.

    Failures are logged but never raise — the caller must still return a generic
    success response to avoid leaking whether an email is registered.
    """
    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY not configured; would have sent reset code to %s (code=%s)",
            to_email, code,
        )
        return

    payload = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": "Your Zeus password reset code",
        "html": _reset_email_html(code),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                logger.error("Resend send failed (%s): %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.exception("Resend send raised: %s", exc)
