import sqlite3
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "logmentor.db"


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS diagnoses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            log_hash TEXT NOT NULL,
            log_preview TEXT,
            diagnosis_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_log_hash ON diagnoses(log_hash);
        CREATE INDEX IF NOT EXISTS idx_session_id ON diagnoses(session_id);
    """)
    conn.commit()
    conn.close()


def make_log_hash(log_text: str) -> str:
    """
    Hash error lines + INFO lines within 5 lines before each error.
    This captures deployment events and config changes near errors
    without including irrelevant startup noise.
    """
    lines = log_text.splitlines()
    important: set[str] = set()

    for i, line in enumerate(lines):
        upper = line.upper()
        if any(level in upper for level in ["ERROR", "CRITICAL", "WARNING"]):
            # Add the error line itself
            important.add(line.strip())
            # Add INFO lines within 5 lines before this error
            for j in range(max(0, i - 5), i):
                prev = lines[j].strip()
                if prev and any(
                    level in prev.upper() for level in ["INFO", "WARNING"]
                ):
                    important.add(prev)

    fingerprint = "\n".join(sorted(important))
    return hashlib.sha256(fingerprint.encode()).hexdigest()


def get_cached_diagnosis(log_hash: str) -> dict | None:
    """Check if we already have a diagnosis for this log pattern."""
    conn = get_db()
    row = conn.execute(
        "SELECT diagnosis_json FROM diagnoses WHERE log_hash = ? LIMIT 1",
        (log_hash,)
    ).fetchone()
    conn.close()
    if row:
        return json.loads(row["diagnosis_json"])
    return None


def save_diagnosis(
    session_id: str,
    log_hash: str,
    log_text: str,
    diagnosis: dict,
):
    """Save a diagnosis to the database."""
    # Preview = first 200 chars of log
    log_preview = log_text[:200].strip()
    conn = get_db()
    conn.execute(
        """INSERT INTO diagnoses
           (session_id, log_hash, log_preview, diagnosis_json, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (
            session_id,
            log_hash,
            log_preview,
            json.dumps(diagnosis),
            datetime.utcnow().isoformat(),
        )
    )
    conn.commit()
    conn.close()


def get_session_history(session_id: str, limit: int = 10) -> list[dict]:
    """Get past diagnoses for a specific session."""
    conn = get_db()
    rows = conn.execute(
        """SELECT id, log_preview, diagnosis_json, created_at
           FROM diagnoses
           WHERE session_id = ?
           ORDER BY created_at DESC
           LIMIT ?""",
        (session_id, limit)
    ).fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "log_preview": row["log_preview"],
            "diagnosis": json.loads(row["diagnosis_json"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def delete_session_history(session_id: str):
    """Delete all diagnoses for a session."""
    conn = get_db()
    conn.execute(
        "DELETE FROM diagnoses WHERE session_id = ?",
        (session_id,)
    )
    conn.commit()
    conn.close()