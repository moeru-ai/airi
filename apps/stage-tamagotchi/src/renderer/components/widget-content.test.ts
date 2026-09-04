// @vitest-environment jsdom

import type { WidgetsIframeRequestPayload, WidgetSnapshot } from '../../shared/eventa'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import WidgetContent from './widget-content.vue'

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: mocks.t }),
}))

vi.mock('@proj-airi/airi-extension-whiteboard/ui', async () => {
  const { defineComponent, h, onMounted } = await import('vue')

  return {
    WhiteboardGamelet: defineComponent({
      props: {
        pendingRequests: { type: Array, default: () => [] },
        pendingIframeRequests: { type: Array, default: () => [] },
      },
      emits: ['iframeRequestResult'],
      setup(props, { emit }) {
        onMounted(() => {
          for (const pendingRequest of props.pendingRequests as Array<{ id: string, requestId: string }>) {
            emit('iframeRequestResult', {
              id: pendingRequest.id,
              requestId: pendingRequest.requestId,
              ok: true,
              result: { accepted: true },
            })
          }
        })

        return () => h('output', {
          'data-pending-requests': props.pendingRequests.length,
          'data-pending-iframe-requests': props.pendingIframeRequests.length,
        })
      },
    }),
  }
})

vi.mock('../widgets/extension-ui', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    ExtensionUi: defineComponent({
      props: {
        pendingRequests: { type: Array, default: () => [] },
        pendingIframeRequests: { type: Array, default: () => [] },
      },
      setup(props) {
        return () => h('output', {
          'data-pending-requests': props.pendingRequests.length,
          'data-pending-iframe-requests': props.pendingIframeRequests.length,
        })
      },
    }),
  }
})

const widget: WidgetSnapshot = {
  id: 'whiteboard:main',
  componentName: 'whiteboard-gamelet',
  componentProps: { bindingId: 'whiteboard:main' },
  alwaysOnTop: false,
  size: 'l',
  ttlMs: 0,
}

const extensionWidget: WidgetSnapshot = {
  ...widget,
  id: 'extension:main',
  componentName: 'extension-ui',
}

const request: WidgetsIframeRequestPayload = {
  id: 'whiteboard:main',
  requestId: 'request-1',
  payload: { type: 'create_canvas', name: 'Agent canvas' },
  timeoutMs: 30000,
  expiresAt: Date.now() + 30000,
}

const mountedApps: Array<{ app: ReturnType<typeof createApp>, host: HTMLElement }> = []

afterEach(() => {
  for (const mounted of mountedApps) {
    mounted.app.unmount()
    mounted.host.remove()
  }
  mountedApps.length = 0
  window.localStorage.clear()
})

describe('widget content whiteboard relay', () => {
  it('passes an Issue #1469 request to WhiteboardGamelet and emits its result', async () => {
    // https://github.com/moeru-ai/airi/issues/1469
    // ROOT CAUSE:
    //
    // The renderer used the Extension UI prop name for the direct WhiteboardGamelet.
    // WhiteboardGamelet therefore received no pending request and the host timed out.
    //
    // The renderer now passes the direct gamelet prop and preserves the Extension UI prop.
    const results: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(WidgetContent, {
        widget,
        pendingRequests: [request],
        onIframeRequestResult: (result: unknown) => results.push(result),
      }),
    })
    app.mount(host)
    mountedApps.push({ app, host })

    await nextTick()
    await vi.waitFor(() => expect(host.querySelector('output')).toBeTruthy())

    expect(host.querySelector('output')?.dataset.pendingRequests).toBe('1')
    expect(host.querySelector('output')?.dataset.pendingIframeRequests).toBe('0')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({
      id: request.id,
      requestId: request.requestId,
      ok: true,
    }))
  })

  it('preserves the Extension UI request prop for iframe-backed widgets', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(WidgetContent, {
        widget: extensionWidget,
        pendingRequests: [request],
      }),
    })
    app.mount(host)
    mountedApps.push({ app, host })

    await nextTick()
    await vi.waitFor(() => expect(host.querySelector('output')).toBeTruthy())

    expect(host.querySelector('output')?.dataset.pendingRequests).toBe('0')
    expect(host.querySelector('output')?.dataset.pendingIframeRequests).toBe('1')
  })
})
