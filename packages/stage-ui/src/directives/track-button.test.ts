// @vitest-environment jsdom

import type { ObjectDirective } from 'vue'

import type { TrackButtonEvent } from './track-button'

import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, withDirectives } from 'vue'

import { createTrackButtonDirective, trackButtonPlugin } from './track-button'

describe('trackButtonPlugin', () => {
  it('registers the directive at app level', () => {
    const app = createApp({ render: () => h('div') })

    app.use(trackButtonPlugin)

    expect(app.directive('track-button')).toBeDefined()
  })
})

describe('createTrackButtonDirective', () => {
  it('captures the current descriptor before the button handler runs', async () => {
    const calls: string[] = []
    const event = ref<TrackButtonEvent>({
      name: 'controls_island_action',
      action: 'switch_to_dark_mode',
    })
    const capture = vi.fn((value: TrackButtonEvent) => calls.push(`track:${'action' in value ? value.action : value.name}`))
    const directive = createTrackButtonDirective(capture)
    const host = document.createElement('div')
    const app = createApp({
      render: () => withDirectives(
        h('button', {
          onClick: () => calls.push('handler'),
        }),
        [[directive, event.value]],
      ),
    })

    app.mount(host)
    const button = host.querySelector('button')!

    button.click()
    expect(calls).toEqual(['track:switch_to_dark_mode', 'handler'])

    calls.length = 0
    event.value = {
      name: 'controls_island_action',
      action: 'switch_to_light_mode',
    }
    await nextTick()
    button.click()
    expect(calls).toEqual(['track:switch_to_light_mode', 'handler'])

    app.unmount()
  })

  it('removes its listener when the button is unmounted', () => {
    const capture = vi.fn()
    const directive: ObjectDirective<HTMLElement, TrackButtonEvent> = createTrackButtonDirective(capture)
    const host = document.createElement('div')
    const app = createApp({
      render: () => withDirectives(
        h('button'),
        [[directive, { name: 'mcp_server_added' } satisfies TrackButtonEvent]],
      ),
    })

    app.mount(host)
    const button = host.querySelector('button')!
    app.unmount()
    button.click()

    expect(capture).not.toHaveBeenCalled()
  })
})
