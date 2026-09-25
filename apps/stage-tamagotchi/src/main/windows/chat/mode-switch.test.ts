import type { ChatDraftHandover, ChatWindowMode } from '../../../shared/eventa'

import { describe, expect, it, vi } from 'vitest'

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

  it('does not let the window being closed settle the draft', async () => {
    const { legacy, floating, modeSwitch } = setup({ floatingRestores: false })
    // The legacy page reloads during the switch and reports like a new page.
    floating.open.mockImplementationOnce(async () => {
      floating.isOpen = true
      setTimeout(() => {
        modeSwitch.settleDraft('legacy', true)
        modeSwitch.settleDraft('floating', false)
      })
    })

    await expect(modeSwitch.switchTo('floating')).rejects.toThrow('could not restore the draft')

    expect(legacy.isOpen).toBe(true)
  })
})
