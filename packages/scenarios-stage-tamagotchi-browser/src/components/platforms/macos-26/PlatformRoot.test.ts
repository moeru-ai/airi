// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

import PlatformRoot from './PlatformRoot.vue'

vi.mock('./ui', () => ({
  Appearance: {
    template: '<div data-test-appearance />',
  },
  Dock: {
    template: '<div data-test-dock><slot name="dock" /></div>',
  },
  MenuBar: {
    template: '<div data-test-menu-bar />',
  },
}))

describe('platformRoot', () => {
  it('renders wallpaper behind the windows layer', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp({
      render: () => h(PlatformRoot, null, {
        windows: () => h('div', { 'data-test-window': 'true' }),
      }),
    })

    app.mount(host)

    const wallpaper = host.querySelector<HTMLElement>('[data-test-appearance]')
    const windowNode = host.querySelector<HTMLElement>('[data-test-window="true"]')

    expect(wallpaper).not.toBeNull()
    expect(windowNode).not.toBeNull()
    expect(Boolean(wallpaper && windowNode && (wallpaper.compareDocumentPosition(windowNode) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)

    app.unmount()
    host.remove()
  })
})
