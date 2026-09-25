import type { ChatWindowMode } from '../../../shared/eventa'

import { describe, expect, it, vi } from 'vitest'

import { createChatModeSwitch } from './mode-switch'

function createWindowDouble(name: string, events: string[]) {
  let finishOpen: (() => void) | undefined
  return {
    open: vi.fn(() => new Promise<void>((resolve) => {
      events.push(`${name}:open`)
      finishOpen = resolve
    })),
    close: vi.fn(() => {
      events.push(`${name}:close`)
    }),
    finishOpen: () => finishOpen?.(),
  }
}

describe('createChatModeSwitch', () => {
  it('leaves the window of the last chosen mode open after a quick floating then legacy switch', async () => {
    // ROOT CAUSE:
    //
    // Each switch ran on its own. A legacy switch could not close a floating
    // window still being created, which then closed the legacy window: the
    // saved mode was legacy, the screen floating.
    //
    // Switches now run one at a time and read the mode when they run.
    const events: string[] = []
    const legacy = createWindowDouble('legacy', events)
    const floating = createWindowDouble('floating', events)
    let mode: ChatWindowMode = 'floating'
    const modeSwitch = createChatModeSwitch({ getMode: () => mode, legacy, floating })

    const toFloating = modeSwitch.show()
    // The user picks legacy while the floating window is still being created.
    await vi.waitFor(() => expect(floating.open).toHaveBeenCalled())
    mode = 'legacy'
    const toLegacy = modeSwitch.show()

    floating.finishOpen()
    await toFloating
    await vi.waitFor(() => expect(legacy.open).toHaveBeenCalled())
    legacy.finishOpen()
    await toLegacy

    expect(events).toEqual(['floating:open', 'legacy:close', 'legacy:open', 'floating:close'])
  })
})
