import { describe, expect, it, vi } from 'vitest'

import { showWindowOnAllWorkspaces } from './workspaces'

const platform = vi.hoisted(() => ({ isMacOS: true }))
const dock = vi.hoisted(() => ({ isVisible: vi.fn() }))

vi.mock('std-env', () => platform)
vi.mock('electron', () => ({ app: { dock } }))

describe('workspace visibility', () => {
  it.each([true, false])('preserves Dock visibility when isVisible returns %s', (visible) => {
    platform.isMacOS = true
    dock.isVisible.mockReturnValue(visible)
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window, { visibleOnFullScreen: true })

    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: !visible,
    })
  })

  it('does not query the Dock on other platforms', () => {
    platform.isMacOS = false
    dock.isVisible.mockClear()
    const window = { setVisibleOnAllWorkspaces: vi.fn() }

    showWindowOnAllWorkspaces(window)

    expect(dock.isVisible).not.toHaveBeenCalled()
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { skipTransformProcessType: false })
  })
})
