# add_agent_columns.py
# Run this ONCE on your Railway PostgreSQL database
# to add agent analysis columns to the healing_logs table.
#
# Run with:
#   cd D:\devops-orchestrator\backend
#   python add_agent_columns.py

import os
import sys
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    # Try loading from .env file
    try:
        with open(".env") as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    DATABASE_URL = line.strip().split("=", 1)[1]
                    break
    except FileNotFoundError:
        pass

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in environment or .env file")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

COLUMNS_TO_ADD = [
    ("agent_analysed",       "BOOLEAN DEFAULT FALSE"),
    ("agent_summary",        "TEXT"),
    ("agent_root_cause",     "TEXT"),
    ("agent_proposed_fix",   "TEXT"),
    ("agent_fix_type",       "VARCHAR(50)"),
    ("agent_affected_file",  "VARCHAR(500)"),
    ("agent_fix_code",       "TEXT"),
    ("agent_confidence",     "VARCHAR(20)"),
    ("agent_fix_time",       "VARCHAR(50)"),
    ("agent_can_auto_apply", "BOOLEAN DEFAULT FALSE"),
    ("agent_explanation",    "TEXT"),
]

with engine.connect() as conn:
    for col_name, col_type in COLUMNS_TO_ADD:
        try:
            conn.execute(text(
                f"ALTER TABLE healing_logs ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
            ))
            conn.commit()
            print(f"✓ Added column: {col_name}")
        except Exception as e:
            print(f"✗ Column {col_name}: {e}")
            conn.rollback()

print("\nDone. All agent columns added to healing_logs table.")