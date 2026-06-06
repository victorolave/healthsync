# Tasks: Phase 3 — Language NLU

Delivery strategy: `single-pr` (cached).
Test mode: Standard Mode (NOT strict TDD — language only; strict TDD is scheduling-only).
Test runner: `cd apps/language && .venv/bin/pytest`

---

## Review Workload Forecast

| Metric | Estimate |
|---|---|
| New files | 14 (config.py, schemas.py, errors.py, interpreter/__init__.py, port.py, prompt.py, openrouter.py, fake.py, tests/__init__.py, conftest.py, test_schemas.py, test_interpret_route.py, test_openrouter_live.py, .env.example) |
| Edited files | 3 (pyproject.toml, app/main.py, Makefile) |
| Removed files | 1 (apps/language/build/ — git rm if tracked) |
| New ADR file | 1 (docs/adr/0014-llm-provider.md) |
| Total files touched | 19 |
| Estimated changed lines | ~320–360 |
| 400-line budget risk | **Low-Medium** (under budget; prompt.py + adapter are the longest units ~80 lines combined) |
| Chained PRs recommended | No — fits comfortably in a single PR |
| Decision needed before apply | No |

---

## Summary

| # | Task | Work Unit | Type | Blocking dep |
|---|---|---|---|---|
| T1 | Edit pyproject.toml | 1 | Edit | — |
| T2 | Create app/schemas.py | 2 | New | T1 |
| T3 | Create app/errors.py | 2 | New | — |
| T4 | Create app/config.py | 2 | New | T1 |
| T5 | Create interpreter/__init__.py + port.py + fake.py | 2 | New | T2, T3 |
| T6 | Create interpreter/prompt.py | 3 | New | T5 |
| T7 | Create interpreter/openrouter.py | 4 | New | T2, T3, T4, T5, T6 |
| T8 | Rewrite app/main.py | 5 | Rewrite | T2, T3, T4, T5, T7 |
| T9 | Create tests/ + conftest.py + test_schemas.py + test_interpret_route.py | 6 | New | T5, T8 |
| T10 | Create test_openrouter_live.py | 6 | New | T4, T7 |
| T11 | Add .env.example | 7 | New | T1 |
| T12 | Clean up build/ artifact | 7 | Delete/git rm | — |
| T13 | Write docs/adr/0014-llm-provider.md | 8 | New | — |
| T14 | Edit Makefile | 9 | Edit | T9 |

**Total: 14 tasks across 9 work units.**
Sequential spine: T1 → T2/T3/T4 → T5 → T6 → T7 → T8 → T9 → T14.
Fully parallel: T3, T11, T12, T13 (no blocking dependencies).
