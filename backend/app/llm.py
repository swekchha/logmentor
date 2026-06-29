import hashlib
import json
import os
import re
import time

from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

from .prompts import (
    CHALLENGE_FEEDBACK_PROMPT,
    FOLLOW_UP_PROMPT,
    ISSUE_PROMPT,
    SYSTEM_PROMPT,
)
from .schemas import ChallengeResult, DiagnosisResponse, LearnMoreItem

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ── Simple in-memory cache ────────────────────────────────────────────────────
# Key: SHA256 hash of (log fingerprint + context)
# Value: (DiagnosisResponse, timestamp)
# Cache expires after 24 hours. In production, replace with Redis.

_diagnosis_cache: dict[str, tuple[DiagnosisResponse, float]] = {}
_CACHE_TTL_SECONDS = 86400  # 24 hours


def _make_cache_key(log_text: str, context: Optional[str]) -> str:
    """
    Create a fingerprint from only the error/warning lines.
    This means two logs with the same errors but different INFO lines
    get the same cache key — which is correct because the diagnosis
    would be the same.
    """
    error_lines = [
        line.strip()
        for line in log_text.splitlines()
        if any(level in line.upper() for level in ["ERROR", "CRITICAL", "WARNING"])
    ]
    fingerprint = "\n".join(sorted(set(error_lines)))
    context_part = (context or "").strip().lower()
    raw = f"{fingerprint}||{context_part}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key: str) -> Optional[DiagnosisResponse]:
    entry = _diagnosis_cache.get(key)
    if entry is None:
        return None
    result, timestamp = entry
    if time.time() - timestamp > _CACHE_TTL_SECONDS:
        del _diagnosis_cache[key]
        return None
    return result


def _cache_set(key: str, value: DiagnosisResponse) -> None:
    _diagnosis_cache[key] = (value, time.time())


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _normalize_uncertainty(value: object) -> str:
    if isinstance(value, str) and value.strip() and value.strip().lower() not in {"none", "n/a", "-"}:
        return value.strip()
    return "The exact root cause cannot be fully confirmed from these logs alone — check the service logs directly for more detail."


def _call_diagnosis_api(
    prompt: str,
    user_prompt: str,
) -> DiagnosisResponse:
    """
    Single place where all diagnosis API calls happen.
    Uses structured JSON output so the response is always valid.
    """
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,  # Low temperature = more consistent, factual responses
        max_tokens=1200,
    )

    raw = response.choices[0].message.content or "{}"
    data = _extract_json(raw)

    # Ensure required fields exist with sensible defaults
    data.setdefault("root_cause", "Unable to determine root cause from these logs.")
    data.setdefault("explanation", "No explanation available.")
    data.setdefault("fix_steps", [])
    data.setdefault("learn_more", [])
    data.setdefault("less_likely_clues", [])
    data["uncertainty"] = _normalize_uncertainty(data.get("uncertainty"))

    # Normalise learn_more items
    learn_more = []
    for item in data.get("learn_more", []):
        if isinstance(item, dict) and "term" in item and "explanation" in item:
            learn_more.append(LearnMoreItem(term=item["term"], explanation=item["explanation"]))
    data["learn_more"] = learn_more

    return DiagnosisResponse(**data)


# ── Public API ────────────────────────────────────────────────────────────────

def diagnose_log(
    log_text: str,
    context: Optional[str],
    summary: dict,
    truncated_log: str,
) -> DiagnosisResponse:
    """
    Main diagnosis. Uses cache — if the same errors were seen before,
    return the cached result instantly without an API call.
    """
    cache_key = _make_cache_key(log_text, context)
    cached = _cache_get(cache_key)
    if cached:
        return cached

    user_prompt = f"""
Context from user:
{context or "No extra context provided."}

Log Summary (use this as your primary guide):
{json.dumps(summary, indent=2)}

Log (truncated to important lines):
{truncated_log}

Instructions:
- Base your diagnosis mainly on the summary.
- Use the log only to confirm specific details.
- Keep root_cause to one short, factual sentence.
- Order fix_steps from most likely to work to least likely.
- In learn_more, define every technical term you use. Minimum 2 definitions.
- Return valid JSON with fields: root_cause, explanation, fix_steps, learn_more, less_likely_clues, uncertainty.
"""

    result = _call_diagnosis_api(SYSTEM_PROMPT, user_prompt)
    _cache_set(cache_key, result)
    return result


def explain_selected_issue(
    log_text: str,
    context: Optional[str],
    selected_issue: str,
    summary: Optional[dict] = None,
) -> DiagnosisResponse:
    """
    Focused diagnosis on a specific issue the user clicked on.
    Not cached because the selected issue changes the response significantly.
    """
    summary_text = f"\nLog Summary:\n{json.dumps(summary, indent=2)}\n" if summary else ""

    user_prompt = f"""
Context from user:
{context or "No extra context provided."}

Selected Issue (focus on this):
{selected_issue}
{summary_text}
Raw Log (for reference):
{log_text[:3000]}

Instructions:
- Focus entirely on the selected issue.
- Tell the user if this is likely the main cause or a secondary issue.
- Explain what this specific error means in plain English.
- Return valid JSON with fields: root_cause, explanation, fix_steps, learn_more, less_likely_clues, uncertainty.
"""

    return _call_diagnosis_api(ISSUE_PROMPT, user_prompt)


def answer_follow_up(
    log_text: str,
    context: Optional[str],
    question: str,
    summary: Optional[dict] = None,
    diagnosis: Optional[dict] = None,
    selected_issue: Optional[str] = None,
) -> str:
    """
    Answer a follow-up chat question.
    Sends a compressed summary instead of the full log on follow-up turns
    to save tokens.
    """
    # Build context block — compressed, not full log
    context_parts: list[str] = []

    if summary:
        # Only send the most relevant summary fields — not the full dump
        compact_summary = {
            "primary_issue": summary.get("primary_issue"),
            "risk_level": summary.get("risk_level"),
            "error_count": summary.get("error_count"),
            "categories": summary.get("categories"),
        }
        context_parts.append(f"Log Summary:\n{json.dumps(compact_summary, indent=2)}")

    if diagnosis:
        # Only send root cause and fix steps — not the full diagnosis
        compact_diagnosis = {
            "root_cause": diagnosis.get("root_cause"),
            "fix_steps": diagnosis.get("fix_steps"),
            "uncertainty": diagnosis.get("uncertainty"),
        }
        context_parts.append(f"Diagnosis:\n{json.dumps(compact_diagnosis, indent=2)}")

    if selected_issue:
        context_parts.append(f"Issue the user is looking at:\n{selected_issue}")

    user_prompt = f"""
Context:
{context or "No extra context provided."}

{chr(10).join(context_parts)}

User question:
{question}

Answer the question directly and clearly. Plain text only, no markdown, no asterisks.
"""

    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": FOLLOW_UP_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=400,  # Keep follow-up answers short and focused
    )

    return (response.choices[0].message.content or "").strip()


def grade_challenge_attempt(
    scenario_log: str,
    correct_root_cause: str,
    correct_explanation: str,
    correct_fix_steps: list[str],
    correct_learn_more: list[dict],
    user_answer: str,
) -> ChallengeResult:
    """
    Compare the student's diagnosis attempt to the correct answer
    and return personalised feedback.
    """
    user_prompt = f"""
The student was shown this log:
{scenario_log}

The correct answer is:
Root cause: {correct_root_cause}
Explanation: {correct_explanation}
Fix steps: {json.dumps(correct_fix_steps)}

The student answered:
{user_answer}

Give the student personalised feedback.
Then on the last line, write exactly one of these three words: good / close / missed
"""

    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": CHALLENGE_FEEDBACK_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.4,
        max_tokens=300,
    )

    raw_feedback = (response.choices[0].message.content or "").strip()

    # Extract score from last line
    lines = raw_feedback.strip().splitlines()
    score = "close"
    feedback_lines = lines

    if lines:
        last = lines[-1].strip().lower()
        if last in {"good", "close", "missed"}:
            score = last
            feedback_lines = lines[:-1]

    feedback_text = "\n".join(feedback_lines).strip()

    return ChallengeResult(
        correct_root_cause=correct_root_cause,
        correct_explanation=correct_explanation,
        fix_steps=correct_fix_steps,
        learn_more=[LearnMoreItem(**item) for item in correct_learn_more],
        feedback=feedback_text,
        score=score,
    )