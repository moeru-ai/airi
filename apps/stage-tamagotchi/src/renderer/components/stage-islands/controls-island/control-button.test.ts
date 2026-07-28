// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

import ControlButton from './control-button.vue'

const trackControlsIslandActionMock = vi.fn()

vi.mock('@proj-airi/stage-ui/composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackControlsIslandAction: trackControlsIslandActionMock,
  }),
}))

describe('controlButton analytics', () => {
  const mountedApps: Array<{ app: ReturnType<typeof createApp>, host: HTMLElement }> = []

  afterEach(() => {
    for (const { app, host } of mountedApps) {
      app.unmount()
      host.remove()
    }
    mountedApps.length = 0
    trackControlsIslandActionMock.mockClear()
  })

  function mountButton(props: {
    trackAction?: 'toggle_chat'
    onClick: () => void
  }) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlButton, props),
    })
    app.mount(host)
    mountedApps.push({ app, host })
    return host.querySelector('button')!
  }

  it('tracks the declared action before forwarding the click', () => {
    const callOrder: string[] = []
    trackControlsIslandActionMock.mockImplementation(() => callOrder.push('track'))
    const button = mountButton({
      trackAction: 'toggle_chat',
      onClick: () => callOrder.push('click'),
    })

    button.click()

    expect(trackControlsIslandActionMock).toHaveBeenCalledWith({ action: 'toggle_chat' })
    expect(callOrder).toEqual(['track', 'click'])
  })

  it('forwards clicks without tracking when no action is declared', () => {
    const onClick = vi.fn()
    const button = mountButton({ onClick })

    button.click()

    expect(trackControlsIslandActionMock).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
