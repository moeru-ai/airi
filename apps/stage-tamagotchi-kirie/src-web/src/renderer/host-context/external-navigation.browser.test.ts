import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installExternalNavigation } from './external-navigation'

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn<(_: string) => Promise<void>>(),
}))

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    platform: {
      openExternalUrl: mocks.openExternalUrl,
    },
    runtime: 'kirie',
  }),
}))

let dispose: (() => void) | undefined

describe('kirie external navigation', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    mocks.openExternalUrl.mockReset()
    mocks.openExternalUrl.mockResolvedValue()
  })

  afterEach(() => {
    dispose?.()
    dispose = undefined
    document.body.replaceChildren()
  })

  it('opens a new-window HTTP link through Kirie Platform', () => {
    dispose = installExternalNavigation()
    const anchor = document.createElement('a')
    anchor.href = 'https://airi.moeru.ai/docs/'
    anchor.target = '_blank'
    document.body.append(anchor)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    anchor.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://airi.moeru.ai/docs/')
  })

  it('opens a new-window script request through Kirie Platform', () => {
    const originalOpen = window.open
    dispose = installExternalNavigation()

    const openedWindow = window.open('https://airi.moeru.ai/docs/', '_blank')

    expect(openedWindow).toBeNull()
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://airi.moeru.ai/docs/')

    dispose()
    dispose = undefined
    expect(window.open).toBe(originalOpen)
  })

  it('leaves same-origin navigation in the renderer', () => {
    dispose = installExternalNavigation()
    const anchor = document.createElement('a')
    anchor.href = `${window.location.origin}/settings`
    anchor.addEventListener('click', event => event.preventDefault())
    document.body.append(anchor)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    anchor.dispatchEvent(event)

    expect(mocks.openExternalUrl).not.toHaveBeenCalled()
  })
})
