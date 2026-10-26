
"""Email delivery service supporting Resend API and Gmail SMTP."""

import html
import json
import logging
import smtplib
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple

from fastapi import HTTPException, status
from app.config import settings

logger = logging.getLogger("app.email")


class EmailService:
    """Dispatch support, feedback, and password-reset emails."""

    @classmethod
    def _provider(cls) -> str:
        return getattr(settings, "EMAIL_PROVIDER", "smtp").strip().lower()

    @classmethod
    def is_smtp_configured(cls) -> bool:
        user = (
            getattr(settings, "SMTP_USERNAME", None)
            or getattr(settings, "SMTP_USER", None)
            or ""
        ).strip()
        password = (getattr(settings, "SMTP_PASSWORD", None) or "").strip()
        host = (getattr(settings, "SMTP_HOST", None) or "").strip()
        return bool(host and user and password)

    @classmethod
    def _dispatch_resend(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Send email through the Resend HTTP API without exposing the API key."""
        api_key = (getattr(settings, "RESEND_API_KEY", None) or "").strip()
        from_email = (
            getattr(settings, "RESEND_FROM_EMAIL", None) or ""
        ).strip()

        if not api_key or not from_email:
            logger.error("Resend provider is selected but configuration is incomplete.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery is not configured correctly.",
            )

        payload = {
            "from": f"{settings.SMTP_FROM_NAME} <{from_email}>",
            "to": [to_email],
            "subject": subject,
            "text": text_content,
            "html": html_content,
        }
        if reply_to:
            payload["reply_to"] = reply_to

        request = urllib.request.Request(
            url="https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                if not 200 <= response.status < 300:
                    logger.error("Resend returned a non-success HTTP status.")
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Email could not be sent. Please try again later.",
                    )

                # Read the response but never log its contents or credentials.
                response.read()

            logger.info("Email successfully accepted by Resend.")
            return True

        except urllib.error.HTTPError as exc:
            # Do not log the response body, which may contain sensitive details.
            logger.error("Resend API rejected the email (HTTP %s).", exc.code)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery failed. Please check the email provider configuration.",
            ) from None

        except (urllib.error.URLError, TimeoutError, OSError):
            logger.error("Resend API connection failed.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach the email service. Please try again later.",
            ) from None

    @classmethod
    def _dispatch_smtp(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Send email through Gmail SMTP."""
        if not cls.is_smtp_configured():
            logger.error("SMTP provider is selected but configuration is incomplete.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery is not configured on this server.",
            )

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = (
            f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        )
        message["To"] = to_email

        if reply_to:
            message["Reply-To"] = reply_to

        message.attach(MIMEText(text_content, "plain", "utf-8"))
        message.attach(MIMEText(html_content, "html", "utf-8"))

        server = None
        try:
            server = smtplib.SMTP(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=12,
            )
            if settings.SMTP_TLS:
                server.starttls()

            username = (
                getattr(settings, "SMTP_USERNAME", None)
                or getattr(settings, "SMTP_USER", None)
                or ""
            ).strip()
            password = (getattr(settings, "SMTP_PASSWORD", None) or "").strip()

            if len(password.replace(" ", "")) == 16 and password.replace(
                " ", ""
            ).isalnum():
                password = password.replace(" ", "")

            server.login(username, password)
            server.sendmail(
                settings.SMTP_FROM_EMAIL,
                [to_email],
                message.as_string(),
            )
            logger.info("Email successfully dispatched via SMTP.")
            return True

        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP authentication was rejected.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email service authentication failed.",
            ) from None

        except (smtplib.SMTPException, TimeoutError, OSError):
            logger.error("SMTP email delivery failed due to a connection or server error.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach the email service. Please try again later.",
            ) from None

        except Exception:
            logger.exception("Unexpected SMTP email delivery error.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery failed. Please try again later.",
            ) from None

        finally:
            if server is not None:
                try:
                    server.quit()
                except Exception:
                    pass

    @classmethod
    def _dispatch_email(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Route emails to the explicitly selected provider."""
        provider = cls._provider()

        if provider == "resend":
            return cls._dispatch_resend(
                to_email, subject, text_content, html_content, reply_to
            )

        if provider == "smtp":
            return cls._dispatch_smtp(
                to_email, subject, text_content, html_content, reply_to
            )

        logger.error("Unsupported email provider selected.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email provider configuration is invalid.",
        )

    @classmethod
    def send_support_email(
        cls,
        full_name: str,
        email: str,
        subject: str,
        message: str,
        timestamp: Optional[datetime] = None,
    ) -> bool:
        """Send a support request to the configured support inbox."""
        received = timestamp or datetime.now(timezone.utc)
        formatted_ts = received.strftime("%Y-%m-%d %H:%M:%S UTC")
        email_subject = f"[Support Request] {subject}"

        text_content = f"""New Support Request

From: {full_name}
Email: {email}
Subject: {subject}
Date: {formatted_ts}

Message:
{message}
"""

        safe_name = html.escape(full_name)
        safe_email = html.escape(email)
        safe_subject = html.escape(subject)
        safe_message = html.escape(message)

        html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Support Request</title></head>
<body style="font-family:Arial,sans-serif;background:#F8FAFC;padding:24px;color:#0F172A">
<table width="100%" style="max-width:580px;margin:auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px">
<tr><td style="background:#2563EB;padding:20px;color:#FFFFFF">
<strong>AI Data Analyst Agent — Support Request</strong>
</td></tr>
<tr><td style="padding:28px">
<h2>{safe_subject}</h2>
<p><strong>Name:</strong> {safe_name}</p>
<p><strong>Email:</strong> <a href="mailto:{safe_email}">{safe_email}</a></p>
<p><strong>Received:</strong> {formatted_ts}</p>
<div style="background:#F8FAFC;padding:16px;white-space:pre-wrap">{safe_message}</div>
</td></tr></table></body></html>"""

        return cls._dispatch_email(
            to_email=settings.SUPPORT_EMAIL,
            subject=email_subject,
            text_content=text_content,
            html_content=html_content,
            reply_to=email,
        )

    @classmethod
    def send_feedback_email(
        cls,
        feedback_type: str,
        message: str,
        rating: Optional[int] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ) -> bool:
        """Send user feedback to the configured support inbox."""
        received = timestamp or datetime.now(timezone.utc)
        formatted_ts = received.strftime("%Y-%m-%d %H:%M:%S UTC")
        rating_display = f"{rating}/5" if rating else "Not provided"
        email_subject = f"[Feedback - {feedback_type}] Rating: {rating_display}"

        display_name = name or "Anonymous"
        contact_email = email or "Not provided"

        text_content = f"""New User Feedback

Type: {feedback_type}
Rating: {rating_display}
Name: {display_name}
Email: {contact_email}
Date: {formatted_ts}

Message:
{message}
"""

        safe_type = html.escape(feedback_type)
        safe_name = html.escape(display_name)
        safe_email = html.escape(contact_email)
        safe_message = html.escape(message)
        stars = (
            "★" * max(0, min(rating, 5))
            + "☆" * (5 - max(0, min(rating, 5)))
            if rating is not None
            else "Not provided"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>User Feedback</title></head>
<body style="font-family:Arial,sans-serif;background:#F8FAFC;padding:24px;color:#0F172A">
<table width="100%" style="max-width:580px;margin:auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px">
<tr><td style="background:#4778E8;padding:20px;color:#FFFFFF">
<strong>AI Data Analyst Agent — User Feedback</strong>
</td></tr>
<tr><td style="padding:28px">
<p><strong>Feedback Type:</strong> {safe_type}</p>
<p><strong>Rating:</strong> {stars} ({rating_display})</p>
<p><strong>Submitted By:</strong> {safe_name}</p>
<p><strong>Contact Email:</strong> {safe_email}</p>
<p><strong>Received:</strong> {formatted_ts}</p>
<div style="background:#F8FAFC;padding:16px;white-space:pre-wrap">{safe_message}</div>
</td></tr></table></body></html>"""

        reply_to = email.strip() if email and email.strip() else None

        return cls._dispatch_email(
            to_email=settings.SUPPORT_EMAIL,
            subject=email_subject,
            text_content=text_content,
            html_content=html_content,
            reply_to=reply_to,
        )

    @classmethod
    def send_password_reset_email(
        cls,
        to_email: str,
        reset_token: str,
        user_name: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Send a password reset email and return (sent, reset_url)."""
        display_name = user_name or "Data Analyst"
        reset_url = (
            f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        )
        expire_minutes = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        project_name = settings.PROJECT_NAME
        subject = f"Reset your password - {project_name}"

        safe_name = html.escape(display_name)
        safe_email = html.escape(to_email)
        safe_project = html.escape(project_name)
        safe_url = html.escape(reset_url, quote=True)

        text_content = f"""Hello {display_name},

We received a request to reset your password for {project_name} ({to_email}).

Use the link below within {expire_minutes} minutes:
{reset_url}

If you did not request this, you can ignore this email.

Best regards,
The {project_name} Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Reset Your Password</title></head>
<body style="font-family:Arial,sans-serif;background:#F8FAFC;padding:24px;color:#0F172A">
<table width="100%" style="max-width:560px;margin:auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px">
<tr><td style="background:#2563EB;padding:24px;color:#FFFFFF">
<strong>{safe_project}</strong>
</td></tr>
<tr><td style="padding:32px">
<h2>Password Reset Request</h2>
<p>Hello <strong>{safe_name}</strong>,</p>
<p>We received a password reset request for <strong>{safe_email}</strong>.
This link is valid for {expire_minutes} minutes.</p>
<p style="margin:28px 0">
<a href="{safe_url}" style="background:#2563EB;color:#FFFFFF;padding:12px 28px;text-decoration:none;border-radius:8px">
Reset Password</a></p>
<p>If the button does not work, copy this URL:</p>
<p style="word-break:break-all">{safe_url}</p>
<p>If you did not request a reset, ignore this email.</p>
</td></tr></table></body></html>"""

        try:
            sent = cls._dispatch_email(
                to_email=to_email,
                subject=subject,
                text_content=text_content,
                html_content=html_content,
            )
            return sent, reset_url
        except HTTPException:
            logger.warning("Password reset email delivery failed.")
            return False, reset_url


email_service = EmailService()
