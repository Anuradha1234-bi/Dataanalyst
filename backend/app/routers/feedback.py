"""User Feedback API Router."""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, status
from app.auth.rate_limiter import InMemoryRateLimiter
from app.schemas.feedback import FeedbackSubmitRequest, FeedbackSubmitResponse
from app.services.email_service import email_service

logger = logging.getLogger("app.feedback")

router = APIRouter(tags=["Feedback"])
feedback_rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP from headers or client socket."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post(
    "/v1/feedback",
    response_model=FeedbackSubmitResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit User Feedback",
)
@router.post(
    "/feedback",
    response_model=FeedbackSubmitResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def submit_feedback(request: Request, payload: FeedbackSubmitRequest):
    """Public endpoint to submit user feedback or bug reports.

    Dispatches an email to dataanalystagent@gmail.com with optional reply-to.
    """
    client_ip = get_client_ip(request)

    # 1. Anti-abuse Honeypot check (hidden field bot trap)
    if payload.website:
        logger.info(f"Honeypot triggered for feedback from IP {client_ip}. Dropping silently.")
        return FeedbackSubmitResponse(
            success=True,
            message="Thank you for your feedback! It has been received.",
            timestamp=datetime.now(timezone.utc),
        )

    # 2. Rate Limiting per IP (5 requests per 10 minutes)
    if not feedback_rate_limiter.is_allowed(f"feedback:{client_ip}", max_requests=5, window_seconds=600):
        logger.warning(f"Rate limit exceeded for feedback from IP {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many feedback submissions from this connection. Please wait a few minutes before trying again.",
        )

    now = datetime.now(timezone.utc)

    # 3. Dispatch Email via Shared SMTP Service
    try:
        email_service.send_feedback_email(
            feedback_type=payload.feedback_type,
            message=payload.message,
            rating=payload.rating,
            name=payload.name,
            email=payload.email,
            timestamp=now,
        )
    except HTTPException:
        # Re-raise already-safe HTTPExceptions (e.g. 503 for unconfigured/unreachable SMTP)
        raise
    except Exception as exc:
        logger.error(f"Unexpected error in submit_feedback endpoint: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your feedback. Please try again later.",
        )

    return FeedbackSubmitResponse(
        success=True,
        message="Thank you! Your feedback has been received and will help improve our platform.",
        timestamp=now,
    )
