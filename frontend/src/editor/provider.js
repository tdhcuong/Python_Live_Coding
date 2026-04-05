import * as Y from 'yjs'
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'

export const YTEXT_KEY = 'python-code'  // Single source of truth (Pitfall 5)

export class RoomProvider {
  constructor(ydoc, awareness, wsSend) {
    this._ydoc = ydoc
    this.awareness = awareness
    this._wsSend = wsSend

    this._updateHandler = (update, origin) => {
      if (origin !== this) {
        const b64 = btoa(String.fromCharCode(...update))
        wsSend({ type: 'yjs_update', update: b64 })
      }
    }
    ydoc.on('update', this._updateHandler)

    let _awarenessDebounce = null
    this._awarenessHandler = () => {
      if (_awarenessDebounce) return
      _awarenessDebounce = setTimeout(() => {
        _awarenessDebounce = null
        const update = encodeAwarenessUpdate(awareness, [awareness.clientID])
        const b64 = btoa(String.fromCharCode(...update))
        wsSend({ type: 'awareness_update', update: b64 })
      }, 50)
    }
    awareness.on('change', this._awarenessHandler)
  }

  applyRemoteUpdate(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    Y.applyUpdate(this._ydoc, bytes, this)
  }

  applyRemoteAwareness(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    applyAwarenessUpdate(this.awareness, bytes, this)
  }

  destroy() {
    this._ydoc.off('update', this._updateHandler)
    this.awareness.off('change', this._awarenessHandler)
  }
}
