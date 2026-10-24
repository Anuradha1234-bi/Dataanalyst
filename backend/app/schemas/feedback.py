"""Pydantic schemas for User Feedback submission."""

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class FeedbackTypeEnum(str, Enum):
    """Allowed feedback categories."""

    SUGGESTION = "Suggestion"
    BUG_REPORT = "Bug Report"
    COMPLAINT = "Complaint"
    GENERAL_FEEDBACK = "General Feedback"


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class FeedbackSubmitRequest(BaseModel):
    """Payload schema for Feedback submission."""

    name: Optional[str] = Field(None, max_length=100, description="Optional visitor name")
    email: Optional[str] = Field(None, max_length=255, description="Optional visitor email")
    feedback_type: str = Field(..., description="Category of feedback")
    rating: Optional[int] = Field(None, ge=1, le=5, description="Optional satisfaction rating (1-5)")
    message: str = Field(..., min_length=5, max_length=5000, description="Feedback message")
    website: Optional[str] = Field(None, max_length=100, description="Spam honeypot trap field (must be empty)")

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            return cleaned if cleaned else None
        return None

    @field_validator("email")
    @classmethod
    def validate_optional_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().lower()
            if not cleaned:
                return None
            if not EMAIL_REGEX.match(cleaned):
                raise ValueError("Please provide a valid email address.")
            return cleaned
        return None

    @field_validator("feedback_type")
    @classmethod
    def validate_feedback_type(cls, v: str) -> str:
        cleaned = v.strip()
        allowed = {
            "suggestion": FeedbackTypeEnum.SUGGESTION.value,
            "bug report": FeedbackTypeEnum.BUG_REPORT.value,
            "bug_report": FeedbackTypeEnum.BUG_REPORT.value,
            "complaint": FeedbackTypeEnum.COMPLAINT.value,
            "general feedback": FeedbackTypeEnum.GENERAL_FEEDBACK.value,
            "general_feedback": FeedbackTypeEnum.GENERAL_FEEDBACK.value,
        }
        lower_v = cleaned.lower()
        if lower_v in allowed:
            return allowed[lower_v]
        raise ValueError(
            f"Invalid feedback type '{cleaned}'. Must be one of: Suggestion, Bug Report, Complaint, General Feedback."
        )

    @field_validator("message")
    @classmethod
    def sanitize_message(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 5:
            raise ValueError("Message must contain at least 5 characters.")
        return cleaned


class FeedbackSubmitResponse(BaseModel):
    """Response schema for Feedback submission."""

    success: bool = True
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
