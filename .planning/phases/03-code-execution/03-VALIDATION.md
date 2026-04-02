---
phase: 3
slug: code-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing, pyproject.toml configured) |
| **Config file** | `backend/pyproject.toml` — `testpaths = ["tests"]`, `asyncio_mode = "auto"` |
| **Quick run command** | `cd backend && python3 -m pytest tests/test_executor.py -q` |
| **Full suite command** | `cd backend && python3 -m pytest tests/ -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && python3 -m pytest tests/test_executor.py -q`
- **After every plan wave:** Run `cd backend && python3 -m pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| executor unit | 01 | 1 | EXEC-03 | unit | `pytest tests/test_executor.py -q` | ❌ W0 | ⬜ pending |
| WS integration | 02 | 2 | EXEC-01, EXEC-02 | integration (WS) | `pytest tests/test_execution_ws.py -q` | ❌ W0 | ⬜ pending |
| broadcast | 02 | 2 | EXEC-02 | integration (multi-client) | `pytest tests/test_execution_ws.py::test_broadcast_to_all -q` | ❌ W0 | ⬜ pending |
| execution_start | 02 | 2 | UI-03 | integration (WS) | `pytest tests/test_execution_ws.py::test_execution_start_broadcast -q` | ❌ W0 | ⬜ pending |
| clear button | 03 | 3 | EXEC-04 | manual | Manual — DOM interaction only | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_executor.py` — stubs for EXEC-03 (sandbox limits, timeout)
- [ ] `tests/test_execution_ws.py` — stubs for EXEC-01, EXEC-02, UI-03
- [ ] `tests/conftest.py` — shared async WS fixtures (extend existing)

*Existing infrastructure: 4 tests in `test_yjs_relay.py` passing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clear button empties output panel | EXEC-04 | DOM interaction only; no backend state | 1. Join room 2. Run code 3. Click Clear 4. Verify output panel is empty |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
