import type { ChatDraftHandover, ChatWindowMode } from '../../../shared/eventa'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChatModeSwitch } from './mode-switch'

type ChatModeSwitch = ReturnType<typeof createChatModeSwitch>

/** The switch under test, which the window doubles need before it exists. */
interface ModeSwitchRef {
  current?: ChatModeSwitch
}

/**
 * A chat window with a composer. Opening it mounts the page one task later,
 * which takes the handed over draft and settles it, as `useChatDraftHandover`
 * does. A page that has mounted does the same when the switch offers a draft.
 *
 * @example
 * const floating = createWindowDouble('floating', modeSwitchRef, { restores: false })
 */
function createWindowDouble(mode: ChatWindowMode, modeSwitchRef: ModeSwitchRef, options: { restores: boolean }) {
  const window = {
    isOpen: false,
    /** `true` from the opening of the window until its page has mounted. */
    mounting: false,
    /** The unsent composer text while the window is open. */
    text: '',
    /** The page takes the draft and reports what happened to it. */
    receive() {
      const draft = modeSwitchRef.current?.takeDraft(mode)
      if (draft && options.restores)
        window.text = draft.text
      modeSwitchRef.current?.settleDraft(mode, !draft || options.restores)
    },
    open: vi.fn(async () => {
      if (window.isOpen)
        return
      window.isOpen = true
      window.mounting = true
      setTimeout(() => {
        window.mounting = false
        window.receive()
      })
    }),
    offerDraft: vi.fn(() => {
      if (window.isOpen && !window.mounting)
        setTimeout(() => window.receive())
    }),
    close: vi.fn(() => {
      window.isOpen = false
      window.mounting = false
      window.text = ''
    }),
    collectDraft: vi.fn(async (): Promise<ChatDraftHandover | undefined> => {
      if (!window.isOpen || !window.text)
        return undefined
      return { sessionId: 'session', text: window.text, attachments: [] }
    }),
  }
  return window
}

/** The double as the switch sees it. `ownsWindow` tells whether the window shows only the chat. */
function asModeWindow(double: ReturnType<typeof createWindowDouble>, ownsWindow: boolean) {
  return {
    ownsWindow,
    isOpen: () => double.isOpen,
    open: double.open,
    offerDraft: double.offerDraft,
    close: double.close,
    collectDraft: double.collectDraft,
  }
}

function setup(options: { floatingRestores: boolean, legacyRestores?: boolean }) {
  let mode: ChatWindowMode = 'legacy'
  const modeSwitchRef: ModeSwitchRef = {}
  const legacy = createWindowDouble('legacy', modeSwitchRef, { restores: options.legacyRestores ?? true })
  const floating = createWindowDouble('floating', modeSwitchRef, { restores: options.floatingRestores })
  const fullscreen = createWindowDouble('fullscreen', modeSwitchRef, { restores: true })
  const modeSwitch = createChatModeSwitch({
    getMode: () => mode,
    setMode: next => mode = next,
    // The fullscreen chat shows in a window that shows other surfaces too.
    windows: { legacy: asModeWindow(legacy, true), floating: asModeWindow(floating, true), fullscreen: asModeWindow(fullscreen, false) },
  })
  modeSwitchRef.current = modeSwitch

  legacy.isOpen = true
  legacy.text = 'unsent'
  return { legacy, floating, fullscreen, modeSwitch, getMode: () => mode }
}

describe('createChatModeSwitch', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('carries the draft through a quick floating then legacy switch', async () => {
    // ROOT CAUSE:
    //
    // The draft waited in one slot. The floating window took it, and the
    // legacy window that the second switch created found nothing.
    //
    // Each switch now collects the draft from the window it closes.
    const { legacy, floating, modeSwitch, getMode } = setup({ floatingRestores: true })

    await Promise.all([modeSwitch.switchTo('floating', 'legacy'), modeSwitch.switchTo('legacy', 'floating')])

    expect(getMode()).toBe('legacy')
    expect(floating.isOpen).toBe(false)
    expect(legacy.isOpen).toBe(true)
    expect(legacy.text).toBe('unsent')
  })

  it('keeps the previous window and its draft when the new window cannot restore it', async () => {
    // ROOT CAUSE:
    //
    // The previous window closed once the new one had loaded, before the new
    // one had restored anything. A restore that failed lost the draft.
    //
    // The previous window now closes only after the new one reports the
    // draft restored. Otherwise the new window closes and the mode goes back.
    const { legacy, floating, modeSwitch, getMode } = setup({ floatingRestores: false })

    await expect(modeSwitch.switchTo('floating', 'legacy')).rejects.toThrow('could not restore the draft')

    expect(getMode()).toBe('legacy')
    expect(floating.close).toHaveBeenCalled()
    expect(legacy.close).not.toHaveBeenCalled()
    expect(legacy.text).toBe('unsent')
  })

  it('leaves the open window alone when the mode does not change', async () => {
    // A pin or placement change saves the preferences through the same
    // switch. Treating the open window as the next one would wait for a draft
    // it never settles, and the rollback would then close it.
    const { legacy, floating, modeSwitch } = setup({ floatingRestores: true })

    await modeSwitch.switchTo('legacy', 'legacy')

    expect(legacy.collectDraft).not.toHaveBeenCalled()
    expect(legacy.open).not.toHaveBeenCalled()
    expect(legacy.close).not.toHaveBeenCalled()
    expect(floating.open).not.toHaveBeenCalled()
  })

  it('does not let the window being closed take or settle the draft', async () => {
    const { legacy, floating, modeSwitch } = setup({ floatingRestores: false })
    // The legacy page reloads during the switch and reports like a new page.
    floating.open.mockImplementationOnce(async () => {
      floating.isOpen = true
      setTimeout(() => {
        expect(modeSwitch.takeDraft('legacy')).toBeUndefined()
        modeSwitch.settleDraft('legacy', true)
        modeSwitch.takeDraft('floating')
        modeSwitch.settleDraft('floating', false)
      })
    })

    await expect(modeSwitch.switchTo('floating', 'legacy')).rejects.toThrow('could not restore the draft')

    expect(legacy.isOpen).toBe(true)
  })

  it('waits for a slow restore, and gives up on a window that never reports', async () => {
    vi.useFakeTimers()
    const { legacy, floating, modeSwitch, getMode } = setup({ floatingRestores: true })
    // The new page reports only after the synchronized session arrives.
    floating.open.mockImplementationOnce(async () => {
      floating.isOpen = true
      setTimeout(() => {
        modeSwitch.takeDraft('floating')
        modeSwitch.settleDraft('floating', true)
      }, 5_000)
    })
    const slowSwitch = modeSwitch.switchTo('floating', 'legacy')
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(slowSwitch).resolves.toBeUndefined()
    expect(legacy.isOpen).toBe(false)

    // A page that never mounts never reports, and it must not hold the queue forever.
    legacy.open.mockImplementationOnce(async () => {
      legacy.isOpen = true
      legacy.mounting = true
    })
    const stuckSwitch = expect(modeSwitch.switchTo('legacy', 'floating')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_000)
    await stuckSwitch
    expect(getMode()).toBe('floating')
    expect(legacy.close).toHaveBeenCalled()
  })

  it('drops the handed over draft once the switch ends', async () => {
    const { modeSwitch } = setup({ floatingRestores: true })

    await modeSwitch.switchTo('floating', 'legacy')

    expect(modeSwitch.takeDraft('floating')).toBeUndefined()
  })

  // The fullscreen island shows the chat in any saved mode, and its window shows settings too. Showing the saved mode
  // must not close that window.
  it('closes the other chat windows when it shows the saved mode, and keeps a window that shows more than the chat', async () => {
    const { legacy, floating, fullscreen, modeSwitch } = setup({ floatingRestores: true })

    await modeSwitch.switchTo('floating', 'legacy')
    legacy.isOpen = true
    fullscreen.isOpen = true
    await modeSwitch.show()

    expect(floating.isOpen).toBe(true)
    expect(legacy.isOpen).toBe(false)
    expect(fullscreen.isOpen).toBe(true)
  })

  // The fullscreen chat lives in the main window, and a switch treats it like any other chat window.
  it('carries the draft into the fullscreen chat and out to the floating chat', async () => {
    const { legacy, floating, fullscreen, modeSwitch, getMode } = setup({ floatingRestores: true })

    await modeSwitch.switchTo('fullscreen', 'legacy')

    expect(getMode()).toBe('fullscreen')
    expect(fullscreen.text).toBe('unsent')
    expect(legacy.isOpen).toBe(false)

    await modeSwitch.switchTo('floating', 'fullscreen')

    expect(getMode()).toBe('floating')
    expect(floating.text).toBe('unsent')
    expect(fullscreen.isOpen).toBe(false)
  })

  it('moves the chat from the window that asks, when that is not the window of the saved mode', async () => {
    // ROOT CAUSE:
    //
    // A switch started from the window of the saved mode. The fullscreen island shows the chat in any saved mode, so
    // choosing the saved mode there did nothing.
    //
    // A switch now starts from the window where the user chose.
    const { legacy, fullscreen, modeSwitch, getMode } = setup({ floatingRestores: true })
    fullscreen.isOpen = true
    fullscreen.text = 'typed in the fullscreen chat'

    await modeSwitch.switchTo('legacy', 'fullscreen')

    expect(getMode()).toBe('legacy')
    expect(legacy.isOpen).toBe(true)
    expect(legacy.text).toBe('typed in the fullscreen chat')
    expect(fullscreen.isOpen).toBe(false)
  })

  it('keeps a window that was open before the switch when it cannot restore the draft', async () => {
    const { legacy, fullscreen, modeSwitch, getMode } = setup({ floatingRestores: true, legacyRestores: false })
    fullscreen.isOpen = true
    fullscreen.text = 'typed in the fullscreen chat'

    await expect(modeSwitch.switchTo('legacy', 'fullscreen')).rejects.toThrow('could not restore the draft')

    expect(getMode()).toBe('legacy')
    expect(legacy.close).not.toHaveBeenCalled()
    expect(legacy.isOpen).toBe(true)
    expect(fullscreen.text).toBe('typed in the fullscreen chat')
  })

  it('closes the chat window of a third mode, so only the chosen window keeps the chat', async () => {
    const { legacy, floating, fullscreen, modeSwitch, getMode } = setup({ floatingRestores: true })
    fullscreen.isOpen = true
    fullscreen.text = 'typed in the fullscreen chat'

    await modeSwitch.switchTo('floating', 'fullscreen')

    expect(getMode()).toBe('floating')
    expect(floating.text).toBe('typed in the fullscreen chat')
    expect(legacy.isOpen).toBe(false)
    expect(fullscreen.isOpen).toBe(false)
  })

  it('ignores the report of a take that came before the switch', async () => {
    const { legacy, fullscreen, modeSwitch } = setup({ floatingRestores: true })
    fullscreen.isOpen = true
    fullscreen.text = 'typed in the fullscreen chat'
    // The legacy page took nothing when it mounted, and that report arrives only now.
    legacy.offerDraft.mockImplementationOnce(() => {
      modeSwitch.settleDraft('legacy', true)
      setTimeout(() => legacy.receive())
    })

    await modeSwitch.switchTo('legacy', 'fullscreen')

    expect(legacy.text).toBe('typed in the fullscreen chat')
  })
})
