from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional


# ── Log format patterns ───────────────────────────────────────────────────────

# 2026-06-09 09:00:01 ERROR Some message
TIMESTAMP_LEVEL = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})\s+"
    r"(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<level>INFO|WARNING|ERROR|DEBUG|CRITICAL)\s+"
    r"(?P<message>.+)$",
    re.IGNORECASE,
)

# [ERROR] Some message
BRACKET_LEVEL = re.compile(
    r"^\[(?P<level>INFO|WARNING|ERROR|DEBUG|CRITICAL)\]\s+"
    r"(?P<message>.+)$",
    re.IGNORECASE,
)

# ERROR: Some message  or  ERROR - Some message
LEVEL_COLON = re.compile(
    r"^(?P<level>INFO|WARNING|ERROR|DEBUG|CRITICAL)[:\-\s]+"
    r"(?P<message>.+)$",
    re.IGNORECASE,
)

# Django/Python style: [09/Jun/2026 09:00:01] ERROR Some message
DJANGO_STYLE = re.compile(
    r"^\[(?P<date>\d{2}/\w+/\d{4})\s+(?P<time>\d{2}:\d{2}:\d{2})\]\s+"
    r"(?P<level>INFO|WARNING|ERROR|DEBUG|CRITICAL)\s+"
    r"(?P<message>.+)$",
    re.IGNORECASE,
)

# Node.js style: 2026-06-09T09:00:01.123Z ERROR Some message
NODE_STYLE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?)\s+"
    r"(?P<level>INFO|WARNING|ERROR|DEBUG|CRITICAL)\s+"
    r"(?P<message>.+)$",
    re.IGNORECASE,
)

VALID_LEVELS = {"INFO", "WARNING", "ERROR", "DEBUG", "CRITICAL"}


def normalize_level(level: Optional[str]) -> str:
    if not level:
        return "UNKNOWN"
    value = level.strip().upper()
    return value if value in VALID_LEVELS else "UNKNOWN"


def _parse_json_line(line: str) -> Optional[dict]:
    """Parse a single JSON log line."""
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    timestamp = (
        data.get("timestamp")
        or data.get("time")
        or data.get("date")
        or data.get("@timestamp")
    )
    level = normalize_level(
        data.get("level")
        or data.get("severity")
        or data.get("log_level")
        or data.get("lvl")
    )
    message = (
        data.get("message")
        or data.get("msg")
        or data.get("event")
        or data.get("text")
        or data.get("body")
        or ""
    )

    if not message:
        return None

    date = None
    if isinstance(timestamp, str):
        # ISO format: 2026-06-09T...
        if "T" in timestamp and len(timestamp) >= 10:
            date = timestamp[:10]
        # Space format: 2026-06-09 09:00:01
        elif " " in timestamp and len(timestamp) >= 10:
            date = timestamp.split(" ")[0]

    return {
        "timestamp": str(timestamp) if timestamp else None,
        "date": date,
        "level": level,
        "message": str(message).strip(),
        "raw_line": line,
        "format": "json",
    }


def _parse_line(line: str) -> dict:
    """Try all known patterns against a single log line."""
    stripped = line.strip()

    # Try JSON first
    json_result = _parse_json_line(stripped)
    if json_result:
        return json_result

    # Node.js ISO timestamp
    m = NODE_STYLE.match(stripped)
    if m:
        ts = m.group("timestamp")
        date = ts[:10] if len(ts) >= 10 else None
        return {
            "timestamp": ts,
            "date": date,
            "level": normalize_level(m.group("level")),
            "message": m.group("message").strip(),
            "raw_line": line,
            "format": "node_iso",
        }

    # Standard timestamp + level
    m = TIMESTAMP_LEVEL.match(stripped)
    if m:
        return {
            "timestamp": f"{m.group('date')} {m.group('time')}",
            "date": m.group("date"),
            "level": normalize_level(m.group("level")),
            "message": m.group("message").strip(),
            "raw_line": line,
            "format": "timestamp_level",
        }

    # Django style
    m = DJANGO_STYLE.match(stripped)
    if m:
        return {
            "timestamp": f"{m.group('date')} {m.group('time')}",
            "date": m.group("date"),
            "level": normalize_level(m.group("level")),
            "message": m.group("message").strip(),
            "raw_line": line,
            "format": "django",
        }

    # [LEVEL] message
    m = BRACKET_LEVEL.match(stripped)
    if m:
        return {
            "timestamp": None,
            "date": None,
            "level": normalize_level(m.group("level")),
            "message": m.group("message").strip(),
            "raw_line": line,
            "format": "bracket_level",
        }

    # LEVEL: message
    m = LEVEL_COLON.match(stripped)
    if m:
        return {
            "timestamp": None,
            "date": None,
            "level": normalize_level(m.group("level")),
            "message": m.group("message").strip(),
            "raw_line": line,
            "format": "level_colon",
        }

    # Unknown format — guess the level from the content
    upper = stripped.upper()
    guessed = "UNKNOWN"
    for lvl in ["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"]:
        if lvl in upper:
            guessed = lvl
            break

    return {
        "timestamp": None,
        "date": None,
        "level": guessed,
        "message": stripped,
        "raw_line": line,
        "format": "unknown",
    }


def parse_log_text(log_text: str) -> list[dict]:
    """
    Parse raw log text into structured entries.

    Features:
    - Supports JSON, timestamp, bracket, colon, Django, and Node.js formats
    - Attaches indented continuation lines (stack traces) to the previous entry
    - Keeps unrecognised lines rather than dropping them
    """
    entries: list[dict] = []

    for line in log_text.splitlines():
        if not line.strip():
            continue

        # Indented line = stack trace continuation
        if line.startswith((" ", "\t")) and entries:
            entries[-1]["message"] += "\n" + line.rstrip()
            entries[-1]["raw_line"] += "\n" + line
            continue

        entries.append(_parse_line(line))

    return entries


def parse_log_file(file_path: str) -> list[dict]:
    """Read and parse a log file from disk."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    content = path.read_text(encoding="utf-8", errors="ignore")
    return parse_log_text(content)