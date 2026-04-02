import sqlite3
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def sqlite_conn(db_path: Path):
    conn = sqlite3.connect(db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def ensure_predictions_table(conn: sqlite3.Connection):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS order_predictions_fraud (
            order_id INTEGER PRIMARY KEY,
            fraud_probability REAL,
            predicted_fraud INTEGER,
            prediction_timestamp TEXT
        )
    """)
    conn.commit()
