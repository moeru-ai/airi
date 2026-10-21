import type { FullscreenPack } from '../../../shared/eventa'
import type { FullscreenPlace } from './fullscreen'

import { describe, expect, it, vi } from 'vitest'

import { moveFullscreen } from './fullscreen'

const pack: FullscreenPack = { surface: 'chat', surfaces: [{ id: 'settings', state: '/settings/system' }, { id: 'chat', state: 'unsent draft' }] }

function place(options: { packs?: FullscreenPack, closes?: boolean } = {}) {
  const steps: string[] = []
  const target: FullscreenPlace = {
    pack: vi.fn(async () => {
      steps.push('pack')
      return options.packs
    }),
    close: vi.fn(async () => {
      steps.push('close')
      return options.closes ?? true
    }),
    open: vi.fn(async () => {
      steps.push('open')
    }),
  }
  return { target, steps }
}

describe('moveFullscreen', () => {
  // The old place closes through its pages before the new place shows the pack, so a page can still stop the move.
  it('packs the old place, closes it, then opens the pack in the new place', async () => {
    const from = place({ packs: pack })
    const to = place()

    await moveFullscreen(from.target, to.target)

    expect(from.steps).toEqual(['pack', 'close'])
    expect(to.target.open).toHaveBeenCalledWith(pack)
  })

  // A page with unsaved changes stops the close, and then the mode stays where it is.
  it('keeps the mode in the old place when one of its pages stops the close', async () => {
    const from = place({ packs: pack, closes: false })
    const to = place()

    await moveFullscreen(from.target, to.target)

    expect(to.target.open).not.toHaveBeenCalled()
  })

  // A mode change while nothing shows has nothing to move, so no place closes or opens.
  it('moves nothing when the old place shows nothing', async () => {
    const from = place()
    const to = place()

    await moveFullscreen(from.target, to.target)

    expect(from.steps).toEqual(['pack'])
    expect(to.target.open).not.toHaveBeenCalled()
  })
})
