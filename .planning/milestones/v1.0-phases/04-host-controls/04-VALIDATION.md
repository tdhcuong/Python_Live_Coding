---
phase: 4
slug: host-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | pytest.ini or pyproject.toml |
| **Quick run command** | `pytest tests/ -x -q` |
| **Full suite command** | `pytest tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/ -x -q`
- **After every plan wave:** Run `pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | HOST-01 | unit | `pytest tests/ -x -q -k problem_description` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | HOST-01 | integration | `pytest tests/ -x -q -k host_controls` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | HOST-02 | unit | `pytest tests/ -x -q -k timer` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | HOST-03 | manual | N/A — audio alert | N/A | ⬜ pending |
| 4-04-01 | 04 | 2 | HOST-04 | integration | `pytest tests/ -x -q -k reset_editor` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_host_controls.py` — stubs for HOST-01, HOST-02, HOST-04
- [ ] `tests/conftest.py` — shared fixtures (if not already present)

*Existing infrastructure may cover some requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Audio alert fires at countdown zero | HOST-03 | Browser AudioContext requires user gesture; can't be automated headlessly | Start timer, wait for expiry, verify sound plays in Chrome and Safari |
| Visual alert fires at countdown zero | HOST-03 | Visual/DOM animation requires browser rendering | Start timer, verify countdown flashes/changes color at zero |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
