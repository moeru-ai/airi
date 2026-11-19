import type { BrowserWindow } from 'electron'

interface WindowClosedListener {
  callbacks: Set<() => void>
  onClosed: () => void
}

/** The one `closed` listener of each window that has callbacks from {@link onWindowClosed}. */
const windowClosedListeners = new WeakMap<BrowserWindow, WindowClosedListener>()

/**
 * Calls `callback` when `window` emits `closed`. Use it for each main-process cleanup that a window close starts.
 *
 * All callbacks of one window share one `closed` listener on that window, and they run in the order of registration.
 * Node warns once for each emitter when an event has more than 10 listeners.
 * Without the shared listener, the services of one window reach that limit at startup.
 * After that warning, Node does not report a listener leak on the same window.
 *
 * The returned function removes `callback`, for an owner that stops before the window closes.
 */
export function onWindowClosed(window: BrowserWindow, callback: () => void): () => void {
  // A new entry for each registration, so a callback that is registered two times also runs two times.
  const entry = () => callback()
  const existing = windowClosedListeners.get(window)
  if (existing) {
    existing.callbacks.add(entry)
  }
  else {
    const callbacks = new Set([entry])
    const onClosed = () => {
      // A removal during the calls finds no listener and does nothing.
      windowClosedListeners.delete(window)
      callbacks.forEach(fn => fn())
    }
    windowClosedListeners.set(window, { callbacks, onClosed })
    window.once('closed', onClosed)
  }

  return () => {
    const listener = windowClosedListeners.get(window)
    if (!listener?.callbacks.delete(entry) || listener.callbacks.size > 0)
      return

    windowClosedListeners.delete(window)
    window.off('closed', listener.onClosed)
  }
}
