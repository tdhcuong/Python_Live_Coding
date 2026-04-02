---
phase: quick
plan: 260402-pnu
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/package.json
  - frontend/src/editor/setup.js
autonomous: true
requirements: [QUICK-260402-pnu]

must_haves:
  truths:
    - "Tab key inserts indentation (not switches focus)"
    - "Pressing Enter after a colon auto-indents the next line"
    - "Standard editor keybindings (Ctrl+Z undo, Ctrl+A select-all) work"
  artifacts:
    - path: "frontend/src/editor/setup.js"
      provides: "Editor with auto-indentation and default keymap extensions"
      contains: "indentOnInput"
    - path: "frontend/package.json"
      provides: "Package manifest with @codemirror/commands and @codemirror/language"
      contains: "@codemirror/commands"
  key_links:
    - from: "frontend/src/editor/setup.js"
      to: "@codemirror/commands"
      via: "import { defaultKeymap, indentWithTab }"
      pattern: "indentWithTab"
    - from: "frontend/src/editor/setup.js"
      to: "@codemirror/language"
      via: "import { indentOnInput }"
      pattern: "indentOnInput"
---

<objective>
Add auto-indentation and standard keyboard bindings to the CodeMirror 6 editor.

Purpose: Without indentOnInput and a keymap, the editor has no auto-indent-on-Enter and Tab either inserts a literal tab or does nothing useful. Python code is nearly unwritable without proper indentation support.
Output: setup.js with two new extensions (indentOnInput and keymap.of([...defaultKeymap, indentWithTab])), backed by two new package dependencies.
</objective>

<execution_context>
@/Users/tdhcuong/Desktop/Personal_Projects/Python_Live_Coding/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tdhcuong/Desktop/Personal_Projects/Python_Live_Coding/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@frontend/src/editor/setup.js
@frontend/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install @codemirror/commands and @codemirror/language</name>
  <files>frontend/package.json</files>
  <action>
    From the frontend/ directory, run:

      npm install @codemirror/commands @codemirror/language

    This adds both packages to dependencies in package.json. Do not pin to an exact version — let npm resolve the latest compatible ^6.x for each. Verify both appear under "dependencies" after install.
  </action>
  <verify>
    <automated>cd /Users/tdhcuong/Desktop/Personal_Projects/Python_Live_Coding/frontend && node -e "require('./node_modules/@codemirror/commands/dist/index.cjs'); require('./node_modules/@codemirror/language/dist/index.cjs'); console.log('ok')"</automated>
  </verify>
  <done>Both @codemirror/commands and @codemirror/language present in node_modules and listed in package.json dependencies.</done>
</task>

<task type="auto">
  <name>Task 2: Add indentOnInput and keymap extensions to createEditor</name>
  <files>frontend/src/editor/setup.js</files>
  <action>
    Modify frontend/src/editor/setup.js as follows:

    1. Change the @codemirror/view import to add `keymap`:
       BEFORE: import { EditorView, lineNumbers } from '@codemirror/view'
       AFTER:  import { EditorView, lineNumbers, keymap } from '@codemirror/view'

    2. Add two new import lines after the existing imports:
       import { defaultKeymap, indentWithTab } from '@codemirror/commands'
       import { indentOnInput } from '@codemirror/language'

    3. In the extensions array inside EditorState.create(), add after the existing extensions:
       indentOnInput(),                                    // Auto-indent on Enter after colon/bracket
       keymap.of([...defaultKeymap, indentWithTab]),       // Standard keybindings + Tab indents

    The final extensions array order should be:
      lineNumbers(),
      oneDark,
      python(),
      yCollab(ytext, awareness, { undoManager }),
      EditorView.theme({ '&': { height: '100%' } }),
      indentOnInput(),
      keymap.of([...defaultKeymap, indentWithTab]),

    Do not remove or reorder any existing extensions.
  </action>
  <verify>
    <automated>cd /Users/tdhcuong/Desktop/Personal_Projects/Python_Live_Coding/frontend && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Vite build completes without errors. setup.js imports indentWithTab and indentOnInput, and both appear in the extensions array.</done>
</task>

</tasks>

<verification>
After both tasks complete:
- npm run build passes (no import errors, no missing modules)
- grep indentOnInput frontend/src/editor/setup.js returns a match
- grep indentWithTab frontend/src/editor/setup.js returns a match
- Both @codemirror/commands and @codemirror/language appear in frontend/package.json dependencies
</verification>

<success_criteria>
Vite build succeeds. The editor extensions array in setup.js contains indentOnInput() and keymap.of([...defaultKeymap, indentWithTab]). Tab key indents in the running editor and Enter after a Python colon auto-indents.
</success_criteria>

<output>
After completion, create .planning/quick/260402-pnu-add-auto-indentation-to-codemirror-edito/260402-pnu-SUMMARY.md
</output>
