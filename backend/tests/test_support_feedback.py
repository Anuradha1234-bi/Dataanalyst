"""Automated unit and integration tests for Contact Support & User Feedback endpoints."""

import email as email_pkg
import smtplib
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.routers.support import support_rate_limiter
from app.routers.feedback import feedback_rate_limiter
from app.services.email_service import email_service, EmailService


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Ensure clean rate limiting state before every test."""
    support_rate_limiter.reset()
    feedback_rate_limiter.reset()


def parse_raw_email(raw_email_str: str):
    """Helper to parse raw MIME email string into message object and decoded payloads."""
    msg = email_pkg.message_from_string(raw_email_str)
    text_body = ""
    html_body = ""
    for part in msg.walk():
        decoded = part.get_payload(decode=True)
        if decoded:
            text = decoded.decode("utf-8", errors="replace")
            if part.get_content_type() == "text/plain":
                text_body += text
            elif part.get_content_type() == "text/html":
                html_body += text
    return msg, text_body, html_body


# ==============================================================================
# CONTACT SUPPORT ENDPOINT TESTS (/api/v1/support/contact)
# ==============================================================================

def test_support_valid_submission_mocked_smtp(client: TestClient):
    """Test 1: Valid support request with mocked SMTP dispatches email with correct headers."""
    mock_smtp_instance = MagicMock()
    sent_messages = []

    def mock_sendmail(from_addr, to_addrs, msg_str):
        sent_messages.append((from_addr, to_addrs, msg_str))

    mock_smtp_instance.sendmail.side_effect = mock_sendmail

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance), \
         patch.object(settings, "SMTP_PASSWORD", "mock_secure_password_never_leak"):

        payload = {
            "full_name": "Alice Analyst",
            "email": "alice@example.com",
            "subject": "Issue with CSV upload",
            "message": "I am having an issue uploading my sales data CSV with 500 rows.",
        }

        response = client.post("/api/v1/support/contact", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "sent successfully" in data["message"]

        # Verify SMTP interaction
        assert mock_smtp_instance.starttls.called
        assert mock_smtp_instance.login.called
        assert mock_smtp_instance.sendmail.called
        assert mock_smtp_instance.quit.called

        # Verify recipient, sender, Reply-To and decoded content
        from_addr, to_addrs, raw_email = sent_messages[0]
        assert to_addrs == [settings.SUPPORT_EMAIL]
        assert settings.SUPPORT_EMAIL == "dataanalystagent@gmail.com"

        msg, text_body, html_body = parse_raw_email(raw_email)
        assert msg["Reply-To"] == "alice@example.com"
        assert "Alice Analyst" in text_body
        assert "Alice Analyst" in html_body
        assert "Issue with CSV upload" in text_body


def test_support_missing_required_fields(client: TestClient):
    """Test 2: Validation fails when required fields are missing."""
    res = client.post(
        "/api/v1/support/contact",
        json={"full_name": "Bob", "subject": "Help"},
    )
    assert res.status_code == 422


def test_support_invalid_email(client: TestClient):
    """Test 3: Validation fails on invalid email format."""
    res = client.post(
        "/api/v1/support/contact",
        json={
            "full_name": "Charlie",
            "email": "not-an-email-address",
            "subject": "General Query",
            "message": "Valid message with sufficient length.",
        },
    )
    assert res.status_code == 422


def test_support_missing_smtp_configuration(client: TestClient):
    """Test 4: Missing SMTP credentials safely returns 503 without leaking system details."""
    with patch.object(EmailService, "is_smtp_configured", return_value=False):
        res = client.post(
            "/api/v1/support/contact",
            json={
                "full_name": "Diana Prince",
                "email": "diana@example.com",
                "subject": "Feature Request",
                "message": "Please add support for Parquet files in future releases.",
            },
        )
        assert res.status_code == 503
        assert "not configured" in res.json()["detail"].lower()
        assert "password" not in str(res.json()).lower()


def test_support_smtp_authentication_failure(client: TestClient):
    """Test 5: SMTP auth rejection returns safe 503 error without leaking credentials."""
    mock_smtp_instance = MagicMock()
    mock_smtp_instance.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Authentication failed")

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance), \
         patch.object(settings, "SMTP_PASSWORD", "super_secret_app_password"):

        res = client.post(
            "/api/v1/support/contact",
            json={
                "full_name": "Ethan Hunt",
                "email": "ethan@example.com",
                "subject": "Login issues",
                "message": "Encountering intermittent authentication problems.",
            },
        )
        assert res.status_code == 503
        assert "authentication failed" in res.json()["detail"].lower()
        assert "super_secret_app_password" not in res.text


def test_support_smtp_connection_failure(client: TestClient):
    """Test 6: SMTP connection timeout/failure returns safe 503 error."""
    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", side_effect=smtplib.SMTPConnectError(421, b"Connection refused")):

        res = client.post(
            "/api/v1/support/contact",
            json={
                "full_name": "Fiona Gallagher",
                "email": "fiona@example.com",
                "subject": "Platform inquiry",
                "message": "Testing connection failure handling with sufficient length.",
            },
        )
        assert res.status_code == 503
        assert "reach the email server" in res.json()["detail"]


def test_support_unauthenticated_access(client: TestClient):
    """Test 7: Public access works without Authorization header."""
    mock_smtp_instance = MagicMock()
    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        res = client.post(
            "/api/v1/support/contact",
            headers={},
            json={
                "full_name": "George Clark",
                "email": "george@example.com",
                "subject": "Public Access Check",
                "message": "Valid support request sent as an unauthenticated guest visitor.",
            },
        )
        assert res.status_code == 200
        assert res.json()["success"] is True


def test_support_honeypot_bot_protection(client: TestClient):
    """Test 8: Spam honeypot field silently drops request without invoking SMTP."""
    mock_smtp_instance = MagicMock()

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        res = client.post(
            "/api/v1/support/contact",
            json={
                "full_name": "Spam Bot",
                "email": "spambot@malicious.com",
                "subject": "Buy crypto now",
                "message": "Spam marketing message sent through an automated script.",
                "website": "https://spamlink.com",
            },
        )
        assert res.status_code == 200
        assert not mock_smtp_instance.sendmail.called


def test_support_rate_limiting(client: TestClient):
    """Test 9: Rate limiting triggers HTTP 429 when threshold exceeded."""
    mock_smtp_instance = MagicMock()
    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        for i in range(5):
            res = client.post(
                "/api/v1/support/contact",
                json={
                    "full_name": f"User {i}",
                    "email": f"user{i}@example.com",
                    "subject": "Help Request",
                    "message": "Testing rate limit threshold with a valid message body.",
                },
            )
            assert res.status_code == 200

        res_blocked = client.post(
            "/api/v1/support/contact",
            json={
                "full_name": "User 6",
                "email": "user6@example.com",
                "subject": "Help Request",
                "message": "Testing rate limit threshold with a valid message body.",
            },
        )
        assert res_blocked.status_code == 429
        assert "too many support requests" in res_blocked.json()["detail"].lower()


# ==============================================================================
# USER FEEDBACK ENDPOINT TESTS (/api/v1/feedback)
# ==============================================================================

def test_feedback_valid_submission_all_fields(client: TestClient):
    """Test 10: Valid feedback with name, email, rating, and message sends email with Reply-To."""
    mock_smtp_instance = MagicMock()
    sent_messages = []

    def mock_sendmail(from_addr, to_addrs, msg_str):
        sent_messages.append((from_addr, to_addrs, msg_str))

    mock_smtp_instance.sendmail.side_effect = mock_sendmail

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        payload = {
            "name": "Hannah Abbott",
            "email": "hannah@example.com",
            "feedback_type": "Suggestion",
            "rating": 5,
            "message": "The automated cleaning module saved me 3 hours of manual pandas work!",
        }

        res = client.post("/api/v1/feedback", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "feedback has been received" in data["message"].lower()

        # Check raw email
        from_addr, to_addrs, raw_email = sent_messages[0]
        assert to_addrs == ["dataanalystagent@gmail.com"]

        msg, text_body, html_body = parse_raw_email(raw_email)
        assert msg["Reply-To"] == "hannah@example.com"
        assert "Hannah Abbott" in text_body
        assert "Hannah Abbott" in html_body
        assert "Suggestion" in text_body
        assert "5/5" in text_body


def test_feedback_optional_fields_anonymous_no_reply_to(client: TestClient):
    """Test 11: Feedback submitted anonymously without name/email/rating works and omits Reply-To."""
    mock_smtp_instance = MagicMock()
    sent_messages = []

    def mock_sendmail(from_addr, to_addrs, msg_str):
        sent_messages.append((from_addr, to_addrs, msg_str))

    mock_smtp_instance.sendmail.side_effect = mock_sendmail

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        payload = {
            "feedback_type": "General Feedback",
            "message": "Great interface, clean design, and super intuitive workflow.",
        }

        res = client.post("/api/v1/feedback", json=payload)
        assert res.status_code == 200
        assert res.json()["success"] is True

        from_addr, to_addrs, raw_email = sent_messages[0]
        msg, text_body, html_body = parse_raw_email(raw_email)
        # Reply-To header must NOT be present when user did not provide an email
        assert msg.get("Reply-To") is None
        assert "Anonymous" in text_body
        assert "Not provided" in text_body


def test_feedback_invalid_feedback_type(client: TestClient):
    """Test 12: Invalid feedback category is rejected with 422."""
    res = client.post(
        "/api/v1/feedback",
        json={
            "feedback_type": "PraiseOrRandomThing",
            "message": "Valid length feedback message text here.",
        },
    )
    assert res.status_code == 422


def test_feedback_invalid_optional_email(client: TestClient):
    """Test 13: Invalid optional email format is rejected."""
    res = client.post(
        "/api/v1/feedback",
        json={
            "email": "not-valid-email",
            "feedback_type": "Bug Report",
            "message": "Found a small visual glitch in dark mode.",
        },
    )
    assert res.status_code == 422


def test_feedback_invalid_rating(client: TestClient):
    """Test 14: Rating outside 1-5 range is rejected."""
    res1 = client.post(
        "/api/v1/feedback",
        json={"feedback_type": "Suggestion", "rating": 6, "message": "Rating too high test."},
    )
    assert res1.status_code == 422

    res2 = client.post(
        "/api/v1/feedback",
        json={"feedback_type": "Suggestion", "rating": 0, "message": "Rating too low test."},
    )
    assert res2.status_code == 422


def test_feedback_missing_message(client: TestClient):
    """Test 15: Missing message is rejected."""
    res = client.post(
        "/api/v1/feedback",
        json={"feedback_type": "Complaint"},
    )
    assert res.status_code == 422


def test_feedback_missing_smtp_configuration(client: TestClient):
    """Test 16: Missing SMTP config returns 503."""
    with patch.object(EmailService, "is_smtp_configured", return_value=False):
        res = client.post(
            "/api/v1/feedback",
            json={
                "feedback_type": "Complaint",
                "message": "Chart tooltips overlap on small resolution screens.",
            },
        )
        assert res.status_code == 503
        assert "not configured" in res.json()["detail"].lower()


def test_feedback_smtp_failure(client: TestClient):
    """Test 17: SMTP delivery failure safely returns 503 without leaking stack traces."""
    mock_smtp_instance = MagicMock()
    mock_smtp_instance.login.side_effect = smtplib.SMTPServerDisconnected("Connection unexpectedly lost")

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        res = client.post(
            "/api/v1/feedback",
            json={
                "feedback_type": "Bug Report",
                "message": "Export button threw an intermittent error on large file.",
            },
        )
        assert res.status_code == 503
        assert "unable to reach the email server" in res.json()["detail"].lower()


def test_feedback_unauthenticated_access(client: TestClient):
    """Test 18: Feedback endpoint works unauthenticated."""
    mock_smtp_instance = MagicMock()
    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        res = client.post(
            "/api/v1/feedback",
            headers={},
            json={
                "feedback_type": "Suggestion",
                "message": "Keep adding more automated machine learning metrics!",
            },
        )
        assert res.status_code == 200
        assert res.json()["success"] is True


def test_feedback_honeypot_bot_protection(client: TestClient):
    """Test 19: Spam honeypot silently returns success without calling SMTP."""
    mock_smtp_instance = MagicMock()
    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        res = client.post(
            "/api/v1/feedback",
            json={
                "feedback_type": "Suggestion",
                "message": "Spam bot feedback advertising external links.",
                "website": "https://malicious-bot-domain.com",
            },
        )
        assert res.status_code == 200
        assert not mock_smtp_instance.sendmail.called


def test_feedback_rate_limiting(client: TestClient):
    """Test 20: Rate limiting triggers HTTP 429 when threshold exceeded."""
    mock_smtp_instance = MagicMock()
    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        for i in range(5):
            res = client.post(
                "/api/v1/feedback",
                json={
                    "feedback_type": "Suggestion",
                    "message": f"Valid feedback iteration {i} with sufficient text length.",
                },
            )
            assert res.status_code == 200

        res_blocked = client.post(
            "/api/v1/feedback",
            json={
                "feedback_type": "Suggestion",
                "message": "Valid feedback iteration 6 which should be blocked.",
            },
        )
        assert res_blocked.status_code == 429


# ==============================================================================
# HTML SAFETY & CREDENTIAL ISOLATION TESTS
# ==============================================================================

def test_html_escaping_in_support_and_feedback_emails():
    """Test 21: Malicious HTML and script tags are strictly escaped in generated HTML emails."""
    mock_smtp_instance = MagicMock()
    dispatched_raw_emails = []

    def mock_sendmail(from_addr, to_addrs, msg_str):
        dispatched_raw_emails.append(msg_str)

    mock_smtp_instance.sendmail.side_effect = mock_sendmail

    with patch.object(EmailService, "is_smtp_configured", return_value=True), \
         patch("smtplib.SMTP", return_value=mock_smtp_instance):

        malicious_input = "<script>alert('XSS')</script><b>injection</b>"
        email_service.send_support_email(
            full_name=malicious_input,
            email="victim@example.com",
            subject="Harmless Subject",
            message=malicious_input,
        )

        raw_email = dispatched_raw_emails[0]
        msg, text_body, html_body = parse_raw_email(raw_email)

        # Verify unescaped script tag is strictly NOT in the HTML email body
        assert "<script>" not in html_body
        assert "&lt;script&gt;alert(&#x27;XSS&#x27;)&lt;/script&gt;" in html_body
        assert "&lt;b&gt;injection&lt;/b&gt;" in html_body
