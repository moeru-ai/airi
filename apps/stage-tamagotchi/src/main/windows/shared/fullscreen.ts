import type { FullscreenPack } from '../../../shared/eventa'

/**
 * A place that can show what the fullscreen mode shows: a window that hosts the mode, or the settings window, which
 * shows settings while the mode is off.
 */
export interface FullscreenPlace {
  /** Packs what the place shows, or answers `undefined` when it shows nothing. */
  pack: () => Promise<FullscreenPack | undefined>
  /** Closes the place the way the user does. Answers `false` when a page with unsaved changes stops it. */
  close: () => Promise<boolean>
  /** Shows what another place packed. */
  open: (pack: FullscreenPack) => Promise<void>
}

/**
 * Moves what the fullscreen mode shows from one place to another, when the user changes the window mode.
 *
 * Use when:
 * - The fullscreen mode changes, and the place of the old mode can show something.
 *
 * Expects:
 * - Each place packs only the surfaces it shows, and closes through its pages, so a page can stop the move.
 *
 * Returns:
 * - Nothing. Nothing moves when the old place shows nothing, or when one of its pages stops the close.
 */
export async function moveFullscreen(from: FullscreenPlace | undefined, to: FullscreenPlace | undefined) {
  if (!from || !to || from === to)
    return
  const pack = await from.pack()
  if (!pack || !await from.close())
    return
  await to.open(pack)
}
