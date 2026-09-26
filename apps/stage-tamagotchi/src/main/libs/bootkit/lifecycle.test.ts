import { describe, expect, it, vi } from 'vitest'

import { emitAppBeforeQuit, onAppBeforeQuit } from './lifecycle'

describe('onAppBeforeQuit', () => {
  it('does not run a hook after its owner removed it, and a second removal touches no other hook', async () => {
    const hook = vi.fn()
    const other = vi.fn()
    const off = onAppBeforeQuit(hook)
    const offOther = onAppBeforeQuit(other)

    off()
    off()
    await emitAppBeforeQuit()

    expect(hook).not.toHaveBeenCalled()
    expect(other).toHaveBeenCalled()
    offOther()
  })

  it('runs every hook when one of them removes another hook', async () => {
    const later = vi.fn()
    // A quit closes windows, and a closing window removes its own hooks.
    let offLater: () => void = () => {}
    const first = vi.fn(() => offLater())
    const offFirst = onAppBeforeQuit(first)
    const offSecond = onAppBeforeQuit(() => offFirst())
    offLater = onAppBeforeQuit(later)

    await emitAppBeforeQuit()

    expect(first).toHaveBeenCalled()
    expect(later).toHaveBeenCalled()
    offSecond()
  })
})
