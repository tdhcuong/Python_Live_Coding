---
phase: quick
plan: 260402-pnu
subsystem: frontend/editor
tags: [codemirror, indentation, keybindings, editor-ux]
dependency_graph:
  requires: [Phase 02 collaborative editor — setup.js createEditor function]
  provides: [Auto-indentation on Enter after colon, Tab key indentation, standard editor keybindings]
  affects: [frontend/src/editor/setup.js]
tech_stack:
  added: ["@codemirror/commands ^6.10.3", "@codemirror/language ^6.12.3"]
  patterns: [indentOnInput extension, keymap.of with defaultKeymap and indentWithTab]
key_files:
  modified:
    - frontend/src/editor/setup.js
    - frontend/package.json
    - frontend/package-lock.json
decisions:
  - indentWithTab appended after defaultKeymap to ensure Tab always triggers indent (not focus switch)
  - indentOnInput placed after EditorView.theme to keep existing extension order intact
metrics:
  duration: "< 5 minutes"
  completed: "2026-04-02"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260402-pnu: Add Auto-Indentation to CodeMirror Editor Summary

**One-liner:** Auto-indentation and standard keybindings added via indentOnInput + keymap.of([...defaultKeymap, indentWithTab]) from @codemirror/commands and @codemirror/language.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install @codemirror/commands and @codemirror/language | 62d7a88 | frontend/package.json, frontend/package-lock.json |
| 2 | Add indentOnInput and keymap extensions to createEditor | f6e8e16 | frontend/src/editor/setup.js |

## What Was Built

Added two CodeMirror 6 extensions to the `createEditor` function in `setup.js`:

1. `indentOnInput()` — triggers automatic indentation when Enter is pressed after a Python colon or opening bracket, sourced from `@codemirror/language`
2. `keymap.of([...defaultKeymap, indentWithTab])` — registers standard editor keybindings (Ctrl+Z undo, Ctrl+A select-all, etc.) plus overrides Tab to insert indentation instead of switching browser focus, sourced from `@codemirror/commands`

Both packages were added as explicit dependencies in `package.json` (they were previously transitive deps only).

## Verification

- Vite build completes in 510ms, 67 modules transformed, no errors
- `indentOnInput` appears in both import line 8 and extensions array line 28
- `indentWithTab` appears in both import line 7 and extensions array line 29
- `@codemirror/commands ^6.10.3` and `@codemirror/language ^6.12.3` listed in `package.json` dependencies

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- frontend/src/editor/setup.js: FOUND
- frontend/package.json contains @codemirror/commands: FOUND
- frontend/package.json contains @codemirror/language: FOUND
- Commit 62d7a88: FOUND
- Commit f6e8e16: FOUND
