"""Email delivery service supporting production Gmail SMTP, Support, Feedback, and safe local development fallback."""

import html
import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple
from fastapi import HTTPException, status
from app.config import settings

logger = logging.getLogger("app.email")


class EmailService:
    """Service for dispatching transactional authentication, support, and feedback emails."""

    @classmethod
    def is_smtp_configured(cls) -> bool:
        """Verify whether SMTP host and credentials are fully specified."""
        user = (getattr(settings, "SMTP_USERNAME", None) or getattr(settings, "SMTP_USER", None) or "").strip()
        pwd = (getattr(settings, "SMTP_PASSWORD", None) or "").strip()
        host = (getattr(settings, "SMTP_HOST", None) or "").strip()
        return bool(host and user and pwd)

    @classmethod
    def _dispatch_smtp(
        cls,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        reply_to: Optional[str] = None,
    ) -> bool:
        """Core SMTP transmission handler using STARTTLS on port 587.

        Raises safe HTTP 503 exceptions without leaking credentials or raw stack traces.
        """
        if not cls.is_smtp_configured():
            logger.warning("SMTP not configured. Email dispatch aborted.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery service is currently not configured on this server.",
            )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to

        part1 = MIMEText(text_content, "plain", "utf-8")
        part2 = MIMEText(html_content, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        try:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12)
            if settings.SMTP_TLS:
                server.starttls()
            login_user = (getattr(settings, "SMTP_USERNAME", None) or getattr(settings, "SMTP_USER", None) or "").strip()
            login_pwd = (getattr(settings, "SMTP_PASSWORD", None) or "").strip()
            if len(login_pwd.replace(" ", "")) == 16 and login_pwd.replace(" ", "").isalnum():
                login_pwd = login_pwd.replace(" ", "")
            server.login(login_user, login_pwd)
            server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
            server.quit()
            logger.info(f"Email successfully dispatched to {to_email}")
            return True
        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP delivery failed: Authentication rejected.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email service authentication failed. Please verify SMTP credentials.",
            )
        except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError, OSError) as e:
            logger.error(
                f"SMTP delivery failed: Connection or server disconnect error ({type(e).__name__}: {e}). "
                "Diagnostic: If using Gmail SMTP (smtp.gmail.com:587), Google actively drops the connection "
                "when a standard account password is used instead of a 16-character App Password, or if network connectivity is blocked."
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach the email server. Please try again later.",
            )
        except Exception as e:
            logger.error(f"SMTP delivery failed: Unexpected error ({type(e).__name__}).")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to send message via email server. Please try again later.",
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
        """Dispatch Contact Support email to configured support inbox with Reply-To set."""
        ts = timestamp or datetime.now(timezone.utc)
        formatted_ts = ts.strftime("%Y-%m-%d %H:%M:%S UTC")
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
<head>
  <meta charset="utf-8">
  <title>Support Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #0F172A;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <tr>
      <td style="background-color: #2563EB; padding: 20px 28px; text-align: left;">
        <span style="font-size: 18px; font-weight: 700; color: #FFFFFF;">AI Data Analyst Agent — Support Request</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 16px; color: #0F172A;">{safe_subject}</h2>
        <table width="100%" style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td style="color: #64748B; width: 100px; padding: 4px 0;"><strong>Name:</strong></td>
            <td style="color: #0F172A; padding: 4px 0;">{safe_name}</td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;"><strong>Email:</strong></td>
            <td style="color: #2563EB; padding: 4px 0;"><a href="mailto:{safe_email}" style="color: #2563EB;">{safe_email}</a></td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;"><strong>Received:</strong></td>
            <td style="color: #475569; padding: 4px 0;">{formatted_ts}</td>
          </tr>
        </table>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #1E293B; white-space: pre-wrap;">{safe_message}</div>
      </td>
    </tr>
  </table>
</body>
</html>
"""
        return cls._dispatch_smtp(
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
        """Dispatch User Feedback email to configured support inbox."""
        ts = timestamp or datetime.now(timezone.utc)
        formatted_ts = ts.strftime("%Y-%m-%d %H:%M:%S UTC")

        rating_display = f"{rating}/5" if rating else "Not provided"
        email_subject = f"[Feedback - {feedback_type}] Rating: {rating_display}"

        text_content = f"""New User Feedback

Type: {feedback_type}
Rating: {rating_display}
Name: {name or 'Anonymous'}
Email: {email or 'Not provided'}
Date: {formatted_ts}

Message:
{message}
"""
        safe_type = html.escape(feedback_type)
        safe_name = html.escape(name or "Anonymous")
        safe_email = html.escape(email or "Not provided")
        safe_message = html.escape(message)
        stars = "★" * rating + "☆" * (5 - rating) if rating else "None"

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>User Feedback</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #0F172A;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <tr>
      <td style="background-color: #4778E8; padding: 20px 28px; text-align: left;">
        <span style="font-size: 18px; font-weight: 700; color: #FFFFFF;">AI Data Analyst Agent — User Feedback</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px;">
        <table width="100%" style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td style="color: #64748B; width: 110px; padding: 4px 0;"><strong>Feedback Type:</strong></td>
            <td style="color: #0F172A; padding: 4px 0;"><strong>{safe_type}</strong></td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;"><strong>Rating:</strong></td>
            <td style="color: #F59E0B; padding: 4px 0; font-size: 15px;">{stars} ({rating_display})</td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;"><strong>Submitted By:</strong></td>
            <td style="color: #0F172A; padding: 4px 0;">{safe_name}</td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;"><strong>Contact Email:</strong></td>
            <td style="color: #475569; padding: 4px 0;">{safe_email}</td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;"><strong>Received:</strong></td>
            <td style="color: #475569; padding: 4px 0;">{formatted_ts}</td>
          </tr>
        </table>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #1E293B; white-space: pre-wrap;">{safe_message}</div>
      </td>
    </tr>
  </table>
</body>
</html>
"""
        reply_to_addr = email.strip() if (email and email.strip()) else None

        return cls._dispatch_smtp(
            to_email=settings.SUPPORT_EMAIL,
            subject=email_subject,
            text_content=text_content,
            html_content=html_content,
            reply_to=reply_to_addr,
        )

    @classmethod
    def send_password_reset_email(
        cls, to_email: str, reset_token: str, user_name: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Dispatch a single-use password reset link via SMTP or log safe development link.

        Returns:
            Tuple[bool, str]: (sent_via_smtp, reset_url)
        """
        display_name = user_name or "Data Analyst"
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        expire_minutes = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        subject = f"Reset your password - {settings.PROJECT_NAME}"

        text_content = f"""Hello {display_name},

We received a request to reset your password for {settings.PROJECT_NAME} ({to_email}).

To choose a new password, click the link below (valid for {expire_minutes} minutes):
{reset_url}

If you did not make this request, you can safely ignore this email. Your password will not change.

Best regards,
The {settings.PROJECT_NAME} Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #0F172A;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <tr>
      <td style="background-color: #2563EB; padding: 24px 32px; text-align: left;">
        <span style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">{settings.PROJECT_NAME}</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 16px; color: #0F172A;">Password Reset Request</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
          Hello <strong>{display_name}</strong>,<br><br>
          We received a request to reset your password for your account (<strong>{to_email}</strong>). Click the button below to set a new password. This link is valid for <strong>{expire_minutes} minutes</strong> and can only be used once.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{reset_url}" style="background-color: #2563EB; color: #FFFFFF; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">Reset Password</a>
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: #64748B; margin-bottom: 8px;">
          If the button above does not work, copy and paste this URL into your browser:
        </p>
        <p style="font-size: 12px; word-break: break-all; color: #2563EB; background: #F1F5F9; padding: 10px; border-radius: 6px;">
          {reset_url}
        </p>
        <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 24px 0;">
        <p style="font-size: 12px; color: #94A3B8; margin-bottom: 0;">
          If you did not request a password reset, you can safely ignore this message. Your account remains completely secure.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""

        if cls.is_smtp_configured():
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
                msg["To"] = to_email

                part1 = MIMEText(text_content, "plain", "utf-8")
                part2 = MIMEText(html_content, "html", "utf-8")
                msg.attach(part1)
                msg.attach(part2)

                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
                if settings.SMTP_TLS:
                    server.starttls()
                login_user = (getattr(settings, "SMTP_USERNAME", None) or getattr(settings, "SMTP_USER", None) or "").strip()
                login_pwd = (getattr(settings, "SMTP_PASSWORD", None) or "").strip()
                if len(login_pwd.replace(" ", "")) == 16 and login_pwd.replace(" ", "").isalnum():
                    login_pwd = login_pwd.replace(" ", "")
                server.login(login_user, login_pwd)
                server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
                server.quit()

                logger.info(f"Password reset email dispatched via SMTP to {to_email}")
                return True, reset_url
            except Exception as e:
                logger.error(f"Failed to dispatch password reset email via SMTP to {to_email}: {e}")
                return False, reset_url
        else:
            logger.info(f"[DEV WORKFLOW] SMTP not configured. Password reset link for {to_email}: {reset_url}")
            return False, reset_url


email_service = EmailService()
