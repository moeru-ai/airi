// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'

import Appearance from './appearance.vue'

describe('appearance', () => {
  it('does not pin wallpaper above window content via z-index utility classes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp({
      render: () => h(Appearance),
    })

    app.mount(host)

    const wallpaper = host.querySelector<HTMLImageElement>('img')
    expect(wallpaper).not.toBeNull()
    expect(wallpaper?.className.includes('z-1')).toBe(false)

    app.unmount()
    host.remove()
  })
})
