#!/usr/bin/env python3
"""
Remediation Step 1 (BACKUP) — AllRecipes contamination cleanup.

Logical backup of the recipes table and FK-dependent rows BEFORE any delete.
pg_dump/psql are not installed and there is no DATABASE_URL, so we page through
the Supabase Python client (service-role key, bypasses RLS) and write JSON.

Writes timestamped files under scripts/remediation/backups/ (gitignored).
Read-only against the DB. Run from zeus-backend/.

Usage: python scripts/remediation/backup_recipes.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from app.database import get_database

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
BACKUP_DIR = Path(__file__).parent / "backups"
PAGE = 500


def dump_table(db, table, select="*", page=PAGE):
    """Page through an entire table via range() and return all rows."""
    rows = []
    start = 0
    while True:
        resp = (
            db.table(table)
            .select(select)
            .range(start, start + page - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
        print(f"  {table}: {len(rows)} rows...")
    return rows


def main():
    db = get_database()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    print("=" * 60)
    print(f"Recipe backup — {ts}")
    print("=" * 60)

    # Full recipes table (125 MB; paged)
    print("Backing up recipes (paged)...")
    recipes = dump_table(db, "recipes")
    # Tiny FK-dependent + meal_plans tables (full)
    print("Backing up recipe_likes, recipe_saves, meal_plans...")
    likes = dump_table(db, "recipe_likes")
    saves = dump_table(db, "recipe_saves")
    meal_plans = dump_table(db, "meal_plans")

    payload = {
        "backed_up_at": ts,
        "counts": {
            "recipes": len(recipes),
            "recipe_likes": len(likes),
            "recipe_saves": len(saves),
            "meal_plans": len(meal_plans),
        },
        "recipes": recipes,
        "recipe_likes": likes,
        "recipe_saves": saves,
        "meal_plans": meal_plans,
    }

    out = BACKUP_DIR / f"recipes_backup_{ts}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    size_mb = out.stat().st_size / (1024 * 1024)
    print("=" * 60)
    print(f"Backup written: {out}")
    print(f"  size: {size_mb:.1f} MB")
    for k, v in payload["counts"].items():
        print(f"  {k}: {v}")
    print("=" * 60)
    # Sanity gate: recipes must match expected scale
    if len(recipes) < 36000:
        print("WARNING: recipe count lower than expected (36,089). Investigate before delete.")
        sys.exit(1)
    print("BACKUP OK — safe to proceed to delete step.")


if __name__ == "__main__":
    main()
