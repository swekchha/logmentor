from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────

class LogRequest(BaseModel):
    log_text: str
    context: Optional[str] = None


class FollowUpRequest(BaseModel):
    log_text: str
    context: Optional[str] = None
    question: str
    summary: Optional[Dict[str, Any]] = None
    diagnosis: Optional[Dict[str, Any]] = None
    selected_issue: Optional[str] = None


class IssueExplainRequest(BaseModel):
    log_text: str
    context: Optional[str] = None
    selected_issue: str


class ChallengeAttemptRequest(BaseModel):
    scenario_id: str
    user_answer: str


# ── Shared pieces ─────────────────────────────────────────────────────────────

class LearnMoreItem(BaseModel):
    term: str
    explanation: str


class IssueItem(BaseModel):
    message: str
    count: int


class CategoryItem(BaseModel):
    name: str
    count: int


# ── Responses ─────────────────────────────────────────────────────────────────

class DiagnosisResponse(BaseModel):
    root_cause: str
    explanation: str
    fix_steps: List[str]
    learn_more: List[LearnMoreItem]
    less_likely_clues: List[str] = Field(default_factory=list)
    uncertainty: str


class LogSummaryResponse(BaseModel):
    total_lines: int
    error_count: int
    warning_count: int
    info_count: int
    debug_count: int
    critical_count: int
    risk_level: str
    primary_issue: Optional[IssueItem] = None
    most_common_day: Optional[str] = None
    problem_issues: List[IssueItem] = Field(default_factory=list)
    context_events: List[IssueItem] = Field(default_factory=list)
    categories: List[CategoryItem] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    summary: LogSummaryResponse
    diagnosis: DiagnosisResponse


class ChallengeScenario(BaseModel):
    id: str
    title: str
    difficulty: str          # "beginner" | "intermediate" | "advanced"
    framework: str           # "django" | "node" | "generic"
    log_text: str
    hint: str                # shown before user answers


class ChallengeResult(BaseModel):
    correct_root_cause: str
    correct_explanation: str
    fix_steps: List[str]
    learn_more: List[LearnMoreItem]
    feedback: str            # personalised feedback on user's specific answer
    score: str               # "good" | "close" | "missed"