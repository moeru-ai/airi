import type { BrowserWindow } from 'electron'

import type { VoiceInlayPresentation } from '../../../shared/eventa'

type VoiceWindow = Pick<BrowserWindow, 'getBounds' | 'setBounds' | 'hide' | 'show' | 'showInactive'>

/** Shows the listening indicator or the editable draft in its own window. */
export function presentVoiceInlay(
  inlayWindow: VoiceWindow,
  indicatorWindow: VoiceWindow,
  presentation: VoiceInlayPresentation,
  focus: boolean,
) {
  if (presentation === 'listening') {
    const bounds = inlayWindow.getBounds()
    const width = Math.min(280, bounds.width)
    const height = 56
    indicatorWindow.setBounds({
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + bounds.height - height),
      width,
      height,
    })
    inlayWindow.hide()
    indicatorWindow.showInactive()
    return
  }

  indicatorWindow.hide()
  if (focus)
    inlayWindow.show()
  else
    inlayWindow.showInactive()
}

/** Hides both voice windows when no listening state or draft remains. */
export function hideVoiceInlay(inlayWindow: VoiceWindow, indicatorWindow: VoiceWindow) {
  indicatorWindow.hide()
  inlayWindow.hide()
}
