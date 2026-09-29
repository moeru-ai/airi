import { describe, expect, it, vi } from 'vitest'

import { hideVoiceInlay, presentVoiceInlay } from './presentation'

function createWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 100, y: 200, width: 450, height: 150 })),
    setBounds: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    showInactive: vi.fn(),
  }
}

describe('voice inlay presentation', () => {
  it('shows the transparent indicator while hiding the draft window', () => {
    const draft = createWindow()
    const indicator = createWindow()

    presentVoiceInlay(draft, indicator, 'listening', false)

    expect(indicator.setBounds).toHaveBeenCalledWith({ x: 185, y: 294, width: 280, height: 56 })
    expect(draft.hide).toHaveBeenCalledOnce()
    expect(indicator.showInactive).toHaveBeenCalledOnce()
    expect(draft.show).not.toHaveBeenCalled()
  })

  it('hides the indicator before focusing the editable draft', () => {
    const draft = createWindow()
    const indicator = createWindow()

    presentVoiceInlay(draft, indicator, 'draft', true)

    expect(indicator.hide).toHaveBeenCalledOnce()
    expect(draft.show).toHaveBeenCalledOnce()
    expect(draft.setBounds).not.toHaveBeenCalled()
  })

  it('hides both windows when the voice interaction ends', () => {
    const draft = createWindow()
    const indicator = createWindow()

    hideVoiceInlay(draft, indicator)

    expect(indicator.hide).toHaveBeenCalledOnce()
    expect(draft.hide).toHaveBeenCalledOnce()
  })
})

it('does not access a closed window after asynchronous window acquisition', () => {
  const draft = createWindow()
  const indicator = createWindow()
  indicator.isDestroyed.mockReturnValue(true)
  presentVoiceInlay(draft, indicator, 'listening', false)
  hideVoiceInlay(draft, indicator)
  expect(indicator.setBounds).not.toHaveBeenCalled()
  expect(indicator.hide).not.toHaveBeenCalled()
  expect(draft.hide).toHaveBeenCalledOnce()
})
