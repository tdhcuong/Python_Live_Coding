# Phase 4: Host Controls - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-02
**Phase:** 04-host-controls
**Mode:** assumptions
**Areas analyzed:** Host Token Validation, Editor Reset Strategy, Late-Joiner State, Run Button + Output Panel Layout

## Assumptions Presented

### Host Token Validation
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Inline WS relay check, per-message `host_token` field | Confident | `main.py` flat `elif` relay loop; no middleware/decorator pattern; `host_token` on `Room` model |
| Per-message token (not join-time auth) | Likely | Join-time would require `is_host` on `Participant` and `room_state` changes — more surface area |

### Editor Reset Strategy
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Option A: client-side `ydoc.transact()` + server clears `yjs_updates` | Unclear | `CLAUDE.md` prohibits `editor.setValue`; `provider.js` uses `Y.applyUpdate` only; Option B requires `pycrdt` dependency |

### Late-Joiner State (Problem + Timer)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Include `problem` + `timer` in existing `room_state` message | Likely | `models.py` line 37 pre-annotates fields; `room_state` is already the "full state" message for new joiners |

### Run Button + Output Panel
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Full-width output panel below editor (vertical flex stack) | Likely | Phase 3 context D-07 decision; `renderRoomView()` flex layout supports sibling panel |

## Corrections Made

No corrections — all assumptions confirmed by user.

## External Research

No external research performed (editor reset Option A chosen; `pycrdt` research deferred to phase researcher with a flag in D-13).
