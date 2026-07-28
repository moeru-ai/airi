// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, withDirectives } from 'vue'

import { useTrackButton } from './useTrackButton'

describe('useTrackButton', () => {
  it('tracks the current action before the button handler runs', async () => {
    const calls: string[] = []
    const action = ref<'open' | 'close'>('open')
    const trackAction = vi.fn((value: 'open' | 'close') => calls.push(`track:${value}`))
    const vTrackButton = useTrackButton(trackAction)
    const host = document.createElement('div')
    const app = createApp({
      render: () => withDirectives(
        h('button', {
          onClick: () => calls.push('handler'),
        }),
        [[vTrackButton, action.value]],
      ),
    })

    app.mount(host)
    const button = host.querySelector('button')!

    button.click()
    expect(calls).toEqual(['track:open', 'handler'])

    calls.length = 0
    action.value = 'close'
    await nextTick()
    button.click()
    expect(calls).toEqual(['track:close', 'handler'])

    app.unmount()
  })

  it('removes its listener when the button is unmounted', () => {
    const trackAction = vi.fn()
    const vTrackButton = useTrackButton<'open'>(trackAction)
    const host = document.createElement('div')
    const app = createApp({
      render: () => withDirectives(h('button'), [[vTrackButton, 'open']]),
    })

    app.mount(host)
    const button = host.querySelector('button')!
    app.unmount()
    button.click()

    expect(trackAction).not.toHaveBeenCalled()
  })
})
