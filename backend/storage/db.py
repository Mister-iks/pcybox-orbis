import json
import os
import sqlite3
import sys
import threading
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

def _get_db_path() -> Path:
    if getattr(sys, 'frozen', False):
        # PyInstaller bundle: write to %LOCALAPPDATA%\NetGraph\ (always writable)
        appdata = Path(os.environ.get('LOCALAPPDATA', Path.home()))
        db_dir = appdata / 'PCYBOXOrbis'
    else:
        db_dir = Path(__file__).parent.parent.parent / 'data'
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / 'netgraph.db'

DB_PATH = _get_db_path()

_conn: sqlite3.Connection | None = None
_conn_lock = threading.Lock()

# In-memory accumulator — flushed every N seconds
_pending: dict[tuple, list] = defaultdict(lambda: [0, 0])  # (minute, category) -> [pkts, bytes]
_pending_lock = threading.Lock()


# ── Connection & schema ───────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _init_schema(_conn)
    return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS traffic (
            minute   TEXT NOT NULL,
            category TEXT NOT NULL,
            packets  INTEGER DEFAULT 0,
            bytes    INTEGER DEFAULT 0,
            PRIMARY KEY (minute, category)
        );
        CREATE INDEX IF NOT EXISTS idx_traffic_minute ON traffic(minute);

        CREATE TABLE IF NOT EXISTS alerts_log (
            id       TEXT PRIMARY KEY,
            ts       TEXT NOT NULL,
            type     TEXT,
            severity TEXT,
            message  TEXT,
            node_id  TEXT,
            details  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts_log(ts);
    """)
    conn.commit()


# ── Write helpers ────────────────────────────────────────────────────────────

def accumulate(minute: str, category: str, size: int) -> None:
    """Fast, lock-minimal accumulator called per packet."""
    with _pending_lock:
        _pending[(minute, category)][0] += 1
        _pending[(minute, category)][1] += size


def flush() -> None:
    """Batch-write accumulated traffic to SQLite. Called by background thread."""
    with _pending_lock:
        if not _pending:
            return
        batch = dict(_pending)
        _pending.clear()

    rows = [(m, c, v[0], v[1]) for (m, c), v in batch.items()]
    with _conn_lock:
        conn = get_conn()
        conn.executemany("""
            INSERT INTO traffic (minute, category, packets, bytes)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(minute, category) DO UPDATE SET
                packets = packets + excluded.packets,
                bytes   = bytes   + excluded.bytes
        """, rows)
        conn.commit()


def log_alert(alert: dict) -> None:
    with _conn_lock:
        conn = get_conn()
        conn.execute("""
            INSERT OR IGNORE INTO alerts_log (id, ts, type, severity, message, node_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            alert["id"], alert["timestamp"], alert["type"],
            alert["severity"], alert["message"],
            alert.get("node_id"), json.dumps(alert.get("details", {})),
        ))
        conn.commit()


# ── Read helpers ─────────────────────────────────────────────────────────────

def get_timeline(minutes: int = 60) -> list[dict]:
    cutoff = (datetime.utcnow() - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M")

    with _conn_lock:
        conn = get_conn()
        traffic_rows = conn.execute("""
            SELECT minute, SUM(packets), SUM(bytes)
            FROM traffic
            WHERE minute >= ?
            GROUP BY minute
            ORDER BY minute ASC
        """, (cutoff,)).fetchall()

        alert_rows = conn.execute("""
            SELECT substr(ts, 1, 16) AS minute, COUNT(*) AS cnt
            FROM alerts_log
            WHERE ts >= ?
            GROUP BY minute
        """, (cutoff,)).fetchall()

    alert_map = {r[0]: r[1] for r in alert_rows}

    return [
        {
            "minute":  r[0],
            "packets": r[1],
            "bytes":   r[2],
            "alerts":  alert_map.get(r[0], 0),
        }
        for r in traffic_rows
    ]


def cleanup_old_data(hours: int = 24) -> None:
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M")
    with _conn_lock:
        conn = get_conn()
        conn.execute("DELETE FROM traffic WHERE minute < ?", (cutoff,))
        conn.execute("DELETE FROM alerts_log WHERE ts < ?", (cutoff,))
        conn.commit()
