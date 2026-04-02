import { EditorView, lineNumbers, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'
import * as Y from 'yjs'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { indentOnInput } from '@codemirror/language'

export function createEditor(container, ytext, awareness, myUser) {
  const undoManager = new Y.UndoManager(ytext)

  // D-07: Set awareness user info — drives cursor color/label in remote views
  awareness.setLocalStateField('user', {
    name: myUser.name,
    color: myUser.color,
    colorLight: myUser.color + '40',  // 25% opacity for selection highlight
  })

  const state = EditorState.create({
    doc: ytext.toString(),
    extensions: [
      lineNumbers(),                                    // EDIT-04: line numbers
      oneDark,                                          // Dark theme matching gray-900 palette
      python(),                                         // EDIT-02: Python syntax highlighting
      yCollab(ytext, awareness, { undoManager }),        // EDIT-01/EDIT-03: CRDT sync + remote cursors
      EditorView.theme({ '&': { height: '100%' } }),    // Pitfall 6: explicit height
      indentOnInput(),                                    // Auto-indent on Enter after colon/bracket
      keymap.of([...defaultKeymap, indentWithTab]),       // Standard keybindings + Tab indents
    ],
  })

  return new EditorView({ state, parent: container })
}
