---
name: reference-check-commands
description: Exact working check commands for the Zeus repo on Windows 11 — discovered on first QA run 2026-06-19
metadata:
  type: reference
---

## Environment facts (discovered 2026-06-19, updated 2026-06-20)

- Platform: Windows 11, PowerShell primary, Bash tool also available
- Shell tool grant: Bash was GRANTED in the 2026-06-20 session (settings.local.json allows npx tsc, python, venv python). Use Bash tool with POSIX paths (/c/Users/...) — NOT backslash Windows paths which break the Bash tool.
- POSIX path form for Bash: /c/Users/mcbya/Zeus/zeus-backend (not c:\Users\...)
- pytest was NOT pre-installed in venv as of first session; installed it with pip during 2026-06-20 run. Confirm present before running.

## Frontend typecheck

```
cd c:\Users\mcbya\Zeus\zeus-app
npx tsc --noEmit
```

- Run via PowerShell tool (preferred) or Bash tool
- tsconfig.json extends "expo/tsconfig.base", strict: true, no explicit paths
- No custom typecheck script in package.json scripts (only start/android/ios/web)
- Expected runtime: 30-90s on first run (node_modules cold), ~15-30s warm

## Backend lint / typecheck

- ruff: NOT installed in venv (no ruff.exe in zeus-backend/venv/Scripts/)
- mypy: NOT installed in venv
- pyright: NOT installed in venv
- black: in requirements.txt but only as formatter, not a linter
- **Backend static analysis is NOT configured. Skip and note in report.**

## Backend tests

```
cd c:\Users\mcbya\Zeus\zeus-backend
venv\Scripts\python.exe -m pytest tests/ -v
```

- pytest is listed in requirements.txt (v7.4.3) but was NOT found in venv/Scripts/ as a .exe
- pytest IS importable via `python -m pytest` if installed in the venv site-packages (not verified — shell was denied)
- Tests exist in zeus-backend/tests/: conftest.py, test_auth.py, test_meal_plans.py, test_pantry.py, test_recipes.py, test_users.py
- Tests use real FastAPI TestClient — they hit a live Supabase connection. May skip if env vars not set.
- Alternative (if venv python works): `c:\Users\mcbya\Zeus\zeus-backend\venv\Scripts\python.exe -m pytest zeus-backend\tests\ -v`

## Migration safety scan

No Alembic-managed migrations (uses raw SQL files in zeus-backend/migrations/).
Scan for: DROP, TRUNCATE, ALTER TABLE.*NOT NULL (without DEFAULT).
Command:
```
Select-String -Path "zeus-backend\migrations\*.sql" -Pattern "DROP|TRUNCATE|ALTER.*NOT NULL" -CaseSensitive:$false
```

## Git changed-file list

```
git diff --name-only HEAD~1 HEAD
```
or for the exact commit:
```
git show --name-only <SHA> --format=""
```
