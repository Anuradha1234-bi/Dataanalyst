"""Contact Support API Router."""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, status
from app.auth.rate_limiter import InMemoryRateLimiter
from app.schemas.support import SupportContactRequest, SupportContactResponse
from app.services.email_service import email_service

logger = logging.getLogger("app.support")

router = APIRouter(tags=["Support"])
support_rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP from headers or client socket."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post(
    "/v1/support/contact",
    response_model=SupportContactResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit Contact Support Request",
)
@router.post(
    "/support/contact",
    response_model=SupportContactResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def contact_support(request: Request, payload: SupportContactRequest):
    """Public endpoint to submit a support request.

    Dispatches an email with reply-to set to the requester and abuse protections applied.
    """
    client_ip = get_client_ip(request)

    # 1. Anti-abuse Honeypot check (hidden field bot trap)
    if payload.website:
        logger.info(f"Honeypot triggered for support contact from IP {client_ip}. Dropping silently.")
        return SupportContactResponse(
            success=True,
            message="Your support request has been received. Our team will review it shortly.",
            timestamp=datetime.now(timezone.utc),
        )

    # 2. Rate Limiting per IP (5 requests per 10 minutes)
    if not support_rate_limiter.is_allowed(f"support:{client_ip}", max_requests=5, window_seconds=600):
        logger.warning(f"Rate limit exceeded for support contact from IP {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many support requests from this connection. Please wait a few minutes before trying again.",
        )

    now = datetime.now(timezone.utc)

    # 3. Dispatch Email via Shared SMTP Service
    try:
        email_service.send_support_email(
            full_name=payload.full_name,
            email=payload.email,
            subject=payload.subject,
            message=payload.message,
            timestamp=now,
        )
    except HTTPException:
        # Re-raise already-safe HTTPExceptions (e.g. 503 for unconfigured/unreachable SMTP)
        raise
    except Exception as exc:
        logger.error(f"Unexpected error in contact_support endpoint: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your support request. Please try again later.",
        )

    return SupportContactResponse(
        success=True,
        message="Your support request has been sent successfully. Our team will contact you shortly.",
        timestamp=now,
    )
