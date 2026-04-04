---
phase: 2
slug: collaborative-editor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | `tests/conftest.py` (Wave 0 installs) |
| **Quick run command** | `pytest tests/test_collaborative_editor.py -x -q` |
| **Full suite command** | `pytest tests/ -x -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_collaborative_editor.py -x -q`
- **After every plan wave:** Run `pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | EDIT-01 | integration | `pytest tests/test_collaborative_editor.py::test_yjs_update_relay -x -q` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 0 | EDIT-01 | integration | `pytest tests/test_collaborative_editor.py::test_late_joiner_state -x -q` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 0 | EDIT-01 | integration | `pytest tests/test_collaborative_editor.py::test_echo_prevention -x -q` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | EDIT-02 | manual | — | n/a | ⬜ pending |
| 2-03-01 | 03 | 1 | EDIT-03 | manual | — | n/a | ⬜ pending |
| 2-04-01 | 04 | 1 | EDIT-04 | manual | — | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_collaborative_editor.py` — stubs for EDIT-01 (relay, late-joiner, echo prevention)
- [ ] `tests/conftest.py` — shared fixtures (async WS test client, room setup helpers)
- [ ] `pip install pytest pytest-asyncio httpx` — if not already installed

*Wave 0 must complete before any Wave 1 tasks begin.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Python syntax highlighting visible | EDIT-02 | Visual rendering — CodeMirror applies CSS classes; no automated pixel check | Open room in browser, type `def foo():`, verify keywords appear highlighted in a distinct color |
| Multi-cursor with name label visible | EDIT-03 | Visual awareness rendering — cursor DOM injected by y-codemirror.next | Open two browser tabs in same room, move cursor in tab 1, verify colored cursor with name label appears in tab 2 |
| Line numbers in gutter | EDIT-04 | Visual DOM check — `lineNumbers()` extension renders gutter | Open room in browser, verify numeric gutter visible on left side of editor |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
