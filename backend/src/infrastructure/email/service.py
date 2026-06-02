"""Email sending service using Python stdlib smtplib (no extra deps).

Runs the blocking SMTP call in a thread via asyncio.to_thread so it
never blocks the event loop.
"""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from src.config import get_settings

log = structlog.get_logger(__name__)


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
) -> None:
    """Send an email asynchronously. Silently logs errors rather than crashing."""
    settings = get_settings()

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = settings.email_from
        msg["To"]      = to
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_user and settings.smtp_password:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()  # required again after STARTTLS upgrade
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.sendmail(settings.email_from, to, msg.as_string())

    try:
        await asyncio.to_thread(_send)
        log.info("email.sent", to=to, subject=subject)
    except Exception as exc:
        log.error("email.failed", to=to, subject=subject, error=str(exc))


# ── Email templates ────────────────────────────────────────────────────────────

def account_created_email(display_name: str, activate_url: str, created_by: str) -> tuple[str, str]:
    """Email sent when an admin creates an account for a new user."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">You've been added to FamilyRoots 🌳</h1>
    <p style="color:#64748b;margin:0 0 6px;">Hi {display_name},</p>
    <p style="color:#64748b;margin:0 0 24px;">
      <strong>{created_by}</strong> has created a FamilyRoots account for you.
      Click the button below to set your password and activate your account.
    </p>
    <a href="{activate_url}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
      Set password &amp; activate account
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
      This link expires in 1 hour. If you weren't expecting this, you can safely ignore it.
    </p>
    <p style="color:#94a3b8;font-size:11px;margin:8px 0 0;word-break:break-all;">
      Or copy this URL: {activate_url}
    </p>
  </div>
</body>
</html>
"""
    text = (
        f"Hi {display_name},\n\n"
        f"{created_by} has created a FamilyRoots account for you.\n\n"
        f"Set your password and activate your account by visiting:\n\n"
        f"{activate_url}\n\n"
        f"This link expires in 1 hour."
    )
    return html, text


def password_reset_email(display_name: str, reset_url: str) -> tuple[str, str]:
    """Returns (html_body, text_body) for the password-reset email."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">Reset your password</h1>
    <p style="color:#64748b;margin:0 0 6px;">Hi {display_name},</p>
    <p style="color:#64748b;margin:0 0 24px;">
      We received a request to reset your FamilyRoots password.
      Click the button below to choose a new one.
    </p>
    <a href="{reset_url}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
      Reset password
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
      This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.
    </p>
    <p style="color:#94a3b8;font-size:11px;margin:8px 0 0;word-break:break-all;">
      Or copy this URL: {reset_url}
    </p>
  </div>
</body>
</html>
"""
    text = (
        f"Hi {display_name},\n\n"
        f"We received a request to reset your FamilyRoots password.\n\n"
        f"Reset your password by visiting:\n\n"
        f"{reset_url}\n\n"
        f"This link expires in 1 hour. If you didn't request a reset, ignore this email."
    )
    return html, text


def account_deactivated_email(display_name: str) -> tuple[str, str]:
    """Email sent when an admin deactivates a user's account."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">Your account has been deactivated</h1>
    <p style="color:#64748b;margin:0 0 6px;">Hi {display_name},</p>
    <p style="color:#64748b;margin:0 0 24px;">
      An administrator has deactivated your FamilyRoots account.
      You will no longer be able to sign in. If you believe this is a mistake,
      please contact your administrator.
    </p>
  </div>
</body>
</html>
"""
    text = (
        f"Hi {display_name},\n\n"
        f"An administrator has deactivated your FamilyRoots account.\n\n"
        f"You will no longer be able to sign in. If you believe this is a mistake, "
        f"please contact your administrator.\n"
    )
    return html, text


def account_verified_by_admin_email(display_name: str, login_url: str) -> tuple[str, str]:
    """Email sent when an admin manually verifies a user's account."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">Your account is verified 🎉</h1>
    <p style="color:#64748b;margin:0 0 6px;">Hi {display_name},</p>
    <p style="color:#64748b;margin:0 0 24px;">
      An administrator has verified your FamilyRoots account.
      You can now sign in and start building your family tree.
    </p>
    <a href="{login_url}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
      Sign in now
    </a>
  </div>
</body>
</html>
"""
    text = (
        f"Hi {display_name},\n\n"
        f"An administrator has verified your FamilyRoots account.\n\n"
        f"You can now sign in at:\n\n{login_url}\n"
    )
    return html, text


def account_unverified_by_admin_email(display_name: str) -> tuple[str, str]:
    """Email sent when an admin revokes a user's email verification."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">Account verification removed</h1>
    <p style="color:#64748b;margin:0 0 6px;">Hi {display_name},</p>
    <p style="color:#64748b;margin:0 0 24px;">
      An administrator has removed the email verification from your FamilyRoots account.
      You will not be able to sign in until your account is verified again.
      Please contact your administrator if you believe this is a mistake.
    </p>
  </div>
</body>
</html>
"""
    text = (
        f"Hi {display_name},\n\n"
        f"An administrator has removed the email verification from your FamilyRoots account.\n\n"
        f"You will not be able to sign in until your account is verified again.\n"
        f"Please contact your administrator if you believe this is a mistake.\n"
    )
    return html, text


def tree_invitation_email(
    invitee_email: str,
    inviter_name: str,
    tree_name: str,
    role: str,
    accept_url: str,
    message: str | None = None,
) -> tuple[str, str]:
    """Email sent when a user is invited to join a family tree."""
    role_label = {"VIEWER": "Viewer", "EDITOR": "Editor", "ADMIN": "Admin"}.get(role, role.capitalize())
    message_block = (
        f'<p style="color:#64748b;margin:0 0 16px;padding:12px 16px;'
        f'background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;">'
        f'"{message}"</p>'
    ) if message else ""
    message_text = f'\n"{message}"\n' if message else ""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">You've been invited to a family tree 🌳</h1>
    <p style="color:#64748b;margin:0 0 16px;">
      <strong>{inviter_name}</strong> has invited you to join
      <strong>{tree_name}</strong> as a <strong>{role_label}</strong>.
    </p>
    {message_block}
    <a href="{accept_url}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
      Accept invitation
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
      This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.
    </p>
    <p style="color:#94a3b8;font-size:11px;margin:8px 0 0;word-break:break-all;">
      Or copy this URL: {accept_url}
    </p>
  </div>
</body>
</html>
"""
    text = (
        f"You've been invited to a family tree!\n\n"
        f"{inviter_name} has invited you to join {tree_name} as a {role_label}.\n"
        f"{message_text}\n"
        f"Accept the invitation by visiting:\n\n{accept_url}\n\n"
        f"This invitation expires in 7 days. If you weren't expecting this, ignore this email."
    )
    return html, text


def verification_email(display_name: str, verify_url: str) -> tuple[str, str]:
    """Returns (html_body, text_body) for the email-verification email."""
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h1 style="font-size:22px;font-weight:700;color:#1e293b;margin:0 0 8px;">Welcome to FamilyRoots 🌳</h1>
    <p style="color:#64748b;margin:0 0 24px;">Hi {display_name}, please verify your email address to activate your account and start building your family tree.</p>
    <a href="{verify_url}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
      Verify email address
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
      This link expires in 1 hour. If you didn't create an account, you can ignore this email.
    </p>
    <p style="color:#94a3b8;font-size:11px;margin:8px 0 0;word-break:break-all;">
      Or copy this URL: {verify_url}
    </p>
  </div>
</body>
</html>
"""
    text = (
        f"Welcome to FamilyRoots!\n\n"
        f"Hi {display_name}, please verify your email address by visiting:\n\n"
        f"{verify_url}\n\n"
        f"This link expires in 1 hour."
    )
    return html, text
