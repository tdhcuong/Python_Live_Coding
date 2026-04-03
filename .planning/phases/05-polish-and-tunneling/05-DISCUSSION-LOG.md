# Phase 5: Polish and Tunneling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-04
**Phase:** 05-polish-and-tunneling
**Mode:** discuss

## Gray Areas Presented

1. Tunnel deployment model
2. Copy link button
3. UI polish scope
4. Responsive behavior

## User Selected for Discussion

- Tunnel deployment model only (copy link, UI polish, responsive left to Claude's discretion)

## Discussion

### Tunnel Deployment Model

**Options presented:**
1. Build + FastAPI serves static (Recommended)
2. Vite proxy — tunnel Vite only
3. Two separate tunnels

**User chose:** Option 1 — Build + FastAPI serves static

Follow-up questions on URL detection:

**Options presented:**
1. `window.location.origin` with IS_DEV sentinel (Recommended)
2. Vite env variable (VITE_API_BASE)
3. Keep hardcoded localhost:8000

**User chose:** Option 1 — `window.location.origin` with IS_DEV sentinel

Follow-up on startup packaging:

**Options presented:**
1. Shell script (start-tunnel.sh) (Recommended)
2. npm scripts only
3. Just README documentation

**User chose:** Option 1 — Shell script (start-tunnel.sh)

## Non-Discussed Areas (Claude's Discretion)

- **Copy link**: All participants, header placement, label-change confirmation
- **UI polish scope**: Fix rough edges only, no redesign; ensure home page matches room view quality
- **Responsive behavior**: Laptop/desktop target (1024px+), no sidebar collapse, no horizontal scroll

## Corrections Made

None — user confirmed recommended options throughout.
