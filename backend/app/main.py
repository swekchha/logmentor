import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .analyzer import summarize_entries, truncate_log_for_llm
from .llm import (
    answer_follow_up,
    diagnose_log,
    explain_selected_issue,
    grade_challenge_attempt,
)
from .parser import parse_log_text
from .schemas import (
    AnalysisResponse,
    ChallengeAttemptRequest,
    ChallengeResult,
    ChallengeScenario,
    DiagnosisResponse,
    FollowUpRequest,
    IssueExplainRequest,
    LogRequest,
)

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="LogMentor API",
    description="AI-powered log analysis and debugging education for junior developers.",
    version="2.0.0",
)

# CORS: read allowed origins from environment variable.
# In development: ALLOWED_ORIGINS=http://localhost:3000
# In production: ALLOWED_ORIGINS=https://yourdomain.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Challenge scenarios (loaded once at startup) ───────────────────────────────

_SCENARIOS_PATH = Path(__file__).with_name("challenge_scenarios.json")

def _load_scenarios() -> list[dict]:
    if not _SCENARIOS_PATH.exists():
        return []
    return json.loads(_SCENARIOS_PATH.read_text(encoding="utf-8"))

_SCENARIOS: list[dict] = _load_scenarios()
_SCENARIOS_BY_ID: dict[str, dict] = {s["id"]: s for s in _SCENARIOS}


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "LogMentor API",
        "version": "2.0.0",
    }


# ── Main log analysis ─────────────────────────────────────────────────────────

@app.post("/diagnose", response_model=AnalysisResponse)
def diagnose(request: LogRequest):
    """
    Full log analysis: parse → summarise → AI diagnosis.
    Uses in-memory cache — identical error patterns return instantly.
    """
    if not request.log_text.strip():
        raise HTTPException(status_code=400, detail="log_text cannot be empty.")

    try:
        entries = parse_log_text(request.log_text)
        summary = summarize_entries(entries)
        truncated = truncate_log_for_llm(request.log_text)
        diagnosis = diagnose_log(
            log_text=request.log_text,
            context=request.context,
            summary=summary.model_dump(),
            truncated_log=truncated,
        )
        return AnalysisResponse(summary=summary, diagnosis=diagnosis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Drill-down on a specific issue ────────────────────────────────────────────

@app.post("/explain-issue", response_model=DiagnosisResponse)
def explain_issue(request: IssueExplainRequest):
    """
    Deep explanation of one specific issue the user clicked on.
    """
    if not request.log_text.strip():
        raise HTTPException(status_code=400, detail="log_text cannot be empty.")
    if not request.selected_issue.strip():
        raise HTTPException(status_code=400, detail="selected_issue cannot be empty.")

    try:
        entries = parse_log_text(request.log_text)
        summary = summarize_entries(entries)
        diagnosis = explain_selected_issue(
            log_text=request.log_text,
            context=request.context,
            selected_issue=request.selected_issue,
            summary=summary.model_dump(),
        )
        return diagnosis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Follow-up chat ────────────────────────────────────────────────────────────

@app.post("/follow-up")
def follow_up(request: FollowUpRequest):
    """
    Answer a follow-up question about the log.
    Sends compressed context to the LLM to save tokens.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question cannot be empty.")

    try:
        answer = answer_follow_up(
            log_text=request.log_text,
            context=request.context,
            question=request.question,
            summary=request.summary,
            diagnosis=request.diagnosis,
            selected_issue=request.selected_issue,
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Debug Challenge Mode ──────────────────────────────────────────────────────

@app.get("/challenge/scenarios", response_model=list[ChallengeScenario])
def list_scenarios(difficulty: str | None = None, framework: str | None = None):
    """
    List available challenge scenarios.
    Optional filters: difficulty (beginner/intermediate/advanced), framework (django/node/generic)
    """
    scenarios = _SCENARIOS

    if difficulty:
        scenarios = [s for s in scenarios if s.get("difficulty") == difficulty.lower()]

    if framework:
        scenarios = [s for s in scenarios if s.get("framework") == framework.lower()]

    return [
        ChallengeScenario(
            id=s["id"],
            title=s["title"],
            difficulty=s["difficulty"],
            framework=s["framework"],
            log_text=s["log_text"],
            hint=s["hint"],
        )
        for s in scenarios
    ]


@app.post("/challenge/attempt", response_model=ChallengeResult)
def attempt_challenge(request: ChallengeAttemptRequest):
    """
    Grade a student's diagnosis attempt against the correct answer.
    Returns personalised feedback and a score.
    """
    scenario = _SCENARIOS_BY_ID.get(request.scenario_id)
    if not scenario:
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{request.scenario_id}' not found."
        )

    if not request.user_answer.strip():
        raise HTTPException(status_code=400, detail="user_answer cannot be empty.")

    try:
        result = grade_challenge_attempt(
            scenario_log=scenario["log_text"],
            correct_root_cause=scenario["root_cause"],
            correct_explanation=scenario["explanation"],
            correct_fix_steps=scenario["fix_steps"],
            correct_learn_more=scenario["learn_more"],
            user_answer=request.user_answer,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))