#!/usr/bin/env python3
"""
Remediation Steps 2-3 + 5 — delete AllRecipes contamination, re-seed TheMealDB.

Preconditions (enforced):
  - A backup JSON must exist under scripts/remediation/backups/ (Step 1).
  - Run from zeus-backend/ with service-role env (.env).

Sequence:
  Step 2  [DB WRITE] delete recipes where user_id=SYSTEM and image_url ~ allrecipes
                     (recipe_likes/recipe_saves cascade automatically)
  Step 3  [DB WRITE] re-seed the 595 TheMealDB recipes from app/data/default_recipes.py
  Step 5  [READ]     verify counts

The single non-AllRecipes user row ("Test", a real user's recipe) is preserved
by the WHERE clause and intentionally untouched.

Usage: python scripts/remediation/execute_remediation.py
"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from app.database import get_database
from app.data.default_recipes import get_default_recipes

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
BACKUP_DIR = Path(__file__).parent / "backups"


def require_backup():
    backups = sorted(BACKUP_DIR.glob("recipes_backup_*.json"))
    if not backups:
        print("ABORT: no backup found under scripts/remediation/backups/.")
        print("Run backup_recipes.py first.")
        sys.exit(1)
    latest = backups[-1]
    size_mb = latest.stat().st_size / (1024 * 1024)
    print(f"Backup present: {latest.name} ({size_mb:.1f} MB)")
    if size_mb < 10:
        print("ABORT: backup looks too small to be the full 36k corpus.")
        sys.exit(1)


def count(db, **eq):
    q = db.table("recipes").select("count", count="exact")
    for k, v in eq.items():
        q = q.eq(k, v)
    return q.execute().count or 0


def step2_delete(db):
    print("\n[STEP 2] Deleting AllRecipes rows (DB WRITE, batched)...")
    before = (
        db.table("recipes").select("count", count="exact")
        .eq("user_id", SYSTEM_USER_ID).ilike("image_url", "%allrecipes%")
        .execute().count or 0
    )
    print(f"  Targeted rows: {before}")
    # A single 36k-row delete exceeds Supabase's statement timeout, so page
    # through IDs in batches. Each batch is a small delete that stays under it.
    batch = 500
    deleted = 0
    while True:
        ids_resp = (
            db.table("recipes").select("id")
            .eq("user_id", SYSTEM_USER_ID).ilike("image_url", "%allrecipes%")
            .limit(batch).execute()
        )
        ids = [r["id"] for r in (ids_resp.data or [])]
        if not ids:
            break
        db.table("recipes").delete().in_("id", ids).execute()
        deleted += len(ids)
        print(f"  Deleted {deleted}/{before}")
    remaining = (
        db.table("recipes").select("count", count="exact")
        .ilike("image_url", "%allrecipes%").execute().count or 0
    )
    print(f"  AllRecipes rows remaining: {remaining}")
    if remaining != 0:
        print("  ABORT: deletion incomplete. Stop and investigate (backup intact).")
        sys.exit(1)
    print("  Step 2 OK.")


def step3_reseed(db):
    print("\n[STEP 3] Re-seeding TheMealDB corpus (DB WRITE)...")
    recipes = get_default_recipes()
    print(f"  Source recipes: {len(recipes)}")
    records = [{
        "user_id": SYSTEM_USER_ID,
        "title": r["title"],
        "description": r.get("description", ""),
        "image_url": r.get("image_url"),
        "ingredients": r.get("ingredients", []),
        "instructions": r.get("instructions", []),
        "servings": r.get("servings", 4),
        "prep_time": r.get("prep_time"),
        "cook_time": r.get("cook_time"),
        "cuisine_type": r.get("cuisine_type"),
        "difficulty": r.get("difficulty", "Medium"),
        "meal_type": r.get("meal_type", []),
        "dietary_tags": r.get("dietary_tags", []),
        "is_ai_generated": False,
        "likes_count": 0,
        "calories": r.get("calories"),
        "protein_grams": r.get("protein_grams"),
        "carbs_grams": r.get("carbs_grams"),
        "fat_grams": r.get("fat_grams"),
        "serving_size": r.get("serving_size"),
    } for r in recipes]

    batch = 50
    inserted = 0
    for i in range(0, len(records), batch):
        chunk = records[i:i + batch]
        db.table("recipes").insert(chunk).execute()
        inserted += len(chunk)
        print(f"  Inserted {inserted}/{len(records)}")
    print(f"  Step 3 OK — inserted {inserted}.")


def step5_verify(db):
    print("\n[STEP 5] Verifying...")
    allrecipes = count(db, user_id=SYSTEM_USER_ID)  # placeholder not used
    allrec = (
        db.table("recipes").select("count", count="exact")
        .ilike("image_url", "%allrecipes%").execute().count or 0
    )
    themealdb = (
        db.table("recipes").select("count", count="exact")
        .eq("user_id", SYSTEM_USER_ID).ilike("image_url", "%themealdb%")
        .execute().count or 0
    )
    total = db.table("recipes").select("count", count="exact").execute().count or 0
    print(f"  AllRecipes remaining: {allrec}  (expect 0)")
    print(f"  TheMealDB present:    {themealdb}  (expect 595)")
    print(f"  Total recipes:        {total}  (expect 596: 595 + 1 user 'Test')")
    ok = allrec == 0 and themealdb == 595
    print("  VERIFY OK." if ok else "  VERIFY FAILED — check above.")
    return ok


def main():
    print("=" * 60)
    print("  AllRecipes Remediation — EXECUTE (writes to production)")
    print("=" * 60)
    require_backup()
    db = get_database()
    step2_delete(db)
    step3_reseed(db)
    ok = step5_verify(db)
    print("\nDONE." if ok else "\nDONE WITH WARNINGS — review verify output.")
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
