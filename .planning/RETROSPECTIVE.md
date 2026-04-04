# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-05
**Phases:** 5 | **Plans:** 10 | **Sessions:** ~8

### What Was Built
- Real-time collaborative Python coding platform with Y.js CRDT editor sync
- Sandboxed Python execution with output broadcast to all participants
- Host controls: problem panel, countdown timer, editor reset
- Single-port deployment with cloudflared tunnel for public access
- Polished dark-theme UI with copy-link, custom scrollbars, responsive layout

### What Worked
- Phase ordering was correct: infrastructure → editor → execution → host controls → polish. Each phase built cleanly on the previous one.
- Y.js CRDT from day one (Phase 2) avoided the full-document-replacement pitfall entirely
- GSD workflow kept execution focused — each plan had clear tasks and atomic commits
- UAT verification caught tunnel-related issues (SPA routing, host disconnect) during Phase 5
- Tailwind CSS v4 zero-config setup worked perfectly with Vite

### What Was Inefficient
- Phase 5 tunnel setup required 4 post-checkpoint fixes (SPA routing collision, host disconnect, relay loop crash, tunnel provider switch). These could have been anticipated in the plan.
- REQUIREMENTS.md checkboxes weren't kept in sync as phases completed (TUNA-01/02/03 discovered unchecked at milestone completion)
- Some duplicate decisions logged in STATE.md (two copies of Phase 01 WebSocket handler decisions)

### Patterns Established
- IS_DEV sentinel pattern for dev/prod URL detection (reliable, zero build config)
- API routes under `/api/` prefix to avoid SPA catch-all collision
- host_token threaded through join_room for host identification on disconnect
- Copy link with clipboard API + execCommand fallback for HTTP contexts
- Flexible panel heights: min-height + max-height + flex-shrink:0 over fixed percentages

### Key Lessons
1. Starlette StaticFiles(html=True) catch-all intercepts overlapping API routes — always use explicit SPA fallback with `/api/` prefix
2. Test tunnel scenarios early — WebSocket upgrade behavior varies significantly between providers (cloudflared > localtunnel)
3. Keep REQUIREMENTS.md checkboxes in sync during phase execution, not just at milestone completion
4. Host disconnect requires explicit host identification in the join protocol — WebSocket disconnect events don't carry enough context alone
5. RLIMIT_AS doesn't work on macOS (virtual address space ~400GB) — rely on RLIMIT_CPU + TimeoutExpired instead

### Cost Observations
- Model mix: ~60% opus, ~30% sonnet, ~10% haiku
- Sessions: ~8 (across 5 days)
- Notable: Phase 5 tunnel debugging took ~60 min, the longest single plan. Most other plans completed in 2-15 min.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~8 | 5 | Initial development — established tech stack, GSD workflow, and deployment pattern |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 8 backend tests + 13 UAT | Critical paths covered | aiofiles (only runtime dep added) |

### Top Lessons (Verified Across Milestones)

1. Phase ordering matters — dependency order prevents rework
2. Keep requirements checkboxes in sync during execution, not retroactively
3. Test deployment scenarios (tunnel, prod builds) as a dedicated phase, not an afterthought
