import { describe, expect, it, vi } from 'vitest'

import { continueProviderCreationNavigation } from './provider-creation-navigation'

describe('provider creation navigation', () => {
  it('does not install the alias watcher after the page becomes inactive', async () => {
    let finishNavigation!: () => void
    let active = true
    const installResolutionWatch = vi.fn()
    const navigation = continueProviderCreationNavigation(
      () => new Promise<void>((resolve) => { finishNavigation = resolve }),
      () => active,
      installResolutionWatch,
    )

    active = false
    finishNavigation()

    await expect(navigation).resolves.toBe(false)
    expect(installResolutionWatch).not.toHaveBeenCalled()
  })
})
