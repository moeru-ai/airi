import type { BrowserWindow, Rectangle } from 'electron'

import type { VoiceInlayPresentation } from '../../../shared/eventa'

const draftBounds = new WeakMap<BrowserWindow, Rectangle>()

/** Keeps the editable inlay bounds so a listening capsule can return to them. */
export function registerVoiceInlayBounds(window: BrowserWindow, bounds: Rectangle) {
  draftBounds.set(window, bounds)
}

/** Resizes and shows the inlay for the active voice interaction. */
export function presentVoiceInlay(window: BrowserWindow, presentation: VoiceInlayPresentation, focus: boolean) {
  const bounds = draftBounds.get(window)
  if (!bounds)
    throw new Error('Voice inlay bounds are unavailable')

  if (presentation === 'listening') {
    const width = Math.min(280, bounds.width)
    const height = 56
    window.setBounds({
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + bounds.height - height),
      width,
      height,
    })
  }
  else {
    window.setBounds(bounds)
  }
  window.setIgnoreMouseEvents(presentation === 'listening')
  if (focus)
    window.show()
  else
    window.showInactive()
}
