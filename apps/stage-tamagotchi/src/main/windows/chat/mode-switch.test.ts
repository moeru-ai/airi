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
 * does.
 *
 * @example
 * const floating = createWindowDouble('floating', modeSwitchRef, { restores: false })
 */
function createWindowDouble(mode: ChatWindowMode, modeSwitchRef: ModeSwitchRef, options: { restores: boolean }) {
  const window = {
    isOpen: false,
    /** The unsent composer text while the window is open. */
    text: '',
    open: vi.fn(async () => {
      if (window.isOpen)
        return
      window.isOpen = true
      setTimeout(() => {
        const draft = modeSwitchRef.current?.takeDraft(mode)
        if (draft && options.restores)
          window.text = draft.text
        modeSwitchRef.current?.settleDraft(mode, !draft || options.restores)
      })
    }),
    close: vi.fn(() => {
      window.isOpen = false
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

function setup(options: { floatingRestores: boolean }) {
  let mode: ChatWindowMode = 'legacy'
  const modeSwitchRef: ModeSwitchRef = {}
  const legacy = createWindowDouble('legacy', modeSwitchRef, { restores: true })
  const floating = createWindowDouble('floating', modeSwitchRef, { restores: options.floatingRestores })
  const modeSwitch = createChatModeSwitch({
    getMode: () => mode,
    setMode: next => mode = next,
    legacy,
    floating,
  })
  modeSwitchRef.current = modeSwitch

  legacy.isOpen = true
  legacy.text = 'unsent'
  return { legacy, floating, modeSwitch, getMode: () => mode }
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

    await Promise.all([modeSwitch.switchTo('floating'), modeSwitch.switchTo('legacy')])

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

    await expect(modeSwitch.switchTo('floating')).rejects.toThrow('could not restore the draft')

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

    await modeSwitch.switchTo('legacy')

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
        modeSwitch.settleDraft('floating', false)
      })
    })

    await expect(modeSwitch.switchTo('floating')).rejects.toThrow('could not restore the draft')

    expect(legacy.isOpen).toBe(true)
  })

  it('waits for a slow restore, and gives up on a window that never reports', async () => {
    vi.useFakeTimers()
    const { legacy, floating, modeSwitch, getMode } = setup({ floatingRestores: true })
    // The new page reports only after the synchronized session arrives.
    floating.open.mockImplementationOnce(async () => {
      floating.isOpen = true
      setTimeout(() => modeSwitch.settleDraft('floating', true), 5_000)
    })
    const slowSwitch = modeSwitch.switchTo('floating')
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(slowSwitch).resolves.toBeUndefined()
    expect(legacy.isOpen).toBe(false)

    // A page that never reports must not hold the queue forever.
    legacy.open.mockImplementationOnce(async () => {
      legacy.isOpen = true
    })
    const stuckSwitch = expect(modeSwitch.switchTo('legacy')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_000)
    await stuckSwitch
    expect(getMode()).toBe('floating')
    expect(legacy.close).toHaveBeenCalled()
  })

  it('drops the handed over draft once the switch ends', async () => {
    const { modeSwitch } = setup({ floatingRestores: true })

    await modeSwitch.switchTo('floating')

    expect(modeSwitch.takeDraft('floating')).toBeUndefined()
  })

  it('closes the other mode window when it shows the saved mode', async () => {
    const { legacy, floating, modeSwitch } = setup({ floatingRestores: true })

    await modeSwitch.switchTo('floating')
    legacy.isOpen = true
    await modeSwitch.show()

    expect(floating.isOpen).toBe(true)
    expect(legacy.isOpen).toBe(false)
  })
})
