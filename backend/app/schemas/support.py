"""Pydantic schemas for Contact Support."""

from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class SupportContactRequest(BaseModel):
    """Payload schema for Contact Support requests."""

    full_name: str = Field(..., min_length=2, max_length=100, description="Full name of requester")
    email: EmailStr = Field(..., max_length=255, description="Valid return email address")
    subject: str = Field(..., min_length=3, max_length=200, description="Support subject line")
    message: str = Field(..., min_length=10, max_length=5000, description="Detailed support request body")
    website: Optional[str] = Field(None, max_length=100, description="Spam honeypot trap field (must be empty)")

    @field_validator("full_name")
    @classmethod
    def sanitize_full_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must contain at least 2 characters.")
        return cleaned

    @field_validator("subject")
    @classmethod
    def sanitize_subject(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 3:
            raise ValueError("Subject must contain at least 3 characters.")
        return cleaned

    @field_validator("message")
    @classmethod
    def sanitize_message(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 10:
            raise ValueError("Message must contain at least 10 characters.")
        return cleaned


class SupportContactResponse(BaseModel):
    """Response schema for Contact Support submission."""

    success: bool = True
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
