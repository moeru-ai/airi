import { createContext } from '@moeru/eventa/adapters/window-message'
import { widgetsIframeInitEvent, widgetsIframePublishEvent } from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import { describe, expect, it } from 'vitest'

class MockWindow {
  peer?: MockWindow

  private readonly listeners = new Map<string, Map<EventListenerOrEventListenerObject, (event: Event) => void>>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) {
      return
    }

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Map())
    }

    const handler = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event)

    this.listeners.get(type)?.set(listener, handler)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) {
      return
    }

    this.listeners.get(type)?.delete(listener)
  }

  postMessage(data: unknown) {
    const messageEvent = {
      data,
      source: this.peer ?? null,
    } as MessageEvent

    for (const listener of this.listeners.get('message')?.values() ?? []) {
      listener(messageEvent as unknown as Event)
    }
  }
}

/**
 * @example
 * describe('createContext', () => {
 *   it('relays typed events between parent and iframe windows', async () => {
 *     expect(true).toBe(true)
 *   })
 * })
 */
describe('createContext', () => {
  /**
   * @example
   * it('relays typed events between parent and iframe windows', async () => {
   *   expect(payload.moduleId).toBe('module-chess')
   * })
   */
  it('relays typed events between parent and iframe windows', async () => {
    const parentWindow = new MockWindow()
    const iframeWindow = new MockWindow()
    parentWindow.peer = iframeWindow
    iframeWindow.peer = parentWindow

    const host = createContext({
      channel: 'test:extension-ui',
      currentWindow: parentWindow as unknown as Window,
      expectedSource: () => iframeWindow as unknown as Window,
      targetWindow: () => iframeWindow as unknown as Window,
    })
    const iframe = createContext({
      channel: 'test:extension-ui',
      currentWindow: iframeWindow as unknown as Window,
      expectedSource: () => parentWindow as unknown as Window,
      targetWindow: () => parentWindow as unknown as Window,
    })

    const initPayload = new Promise<{ moduleId: string }>((resolve) => {
      iframe.context.on(widgetsIframeInitEvent, (event) => {
        if (!event.body?.moduleId) {
          return
        }

        resolve({ moduleId: event.body.moduleId })
      })
    })

    host.context.emit(widgetsIframeInitEvent, {
      moduleId: 'module-chess',
      config: {},
      module: undefined,
      props: {},
    })

    await expect(initPayload).resolves.toEqual(expect.objectContaining({
      moduleId: 'module-chess',
    }))

    const publishedPayload = new Promise<Record<string, unknown>>((resolve) => {
      host.context.on(widgetsIframePublishEvent, (event) => {
        if (!event.body) {
          return
        }

        resolve(event.body)
      })
    })

    iframe.context.emit(widgetsIframePublishEvent, {
      route: {
        namespace: 'plugin.chess',
        name: 'request',
      },
      payload: {
        requestId: 'req-1',
      },
    })

    await expect(publishedPayload).resolves.toEqual(expect.objectContaining({
      payload: expect.objectContaining({
        requestId: 'req-1',
      }),
    }))

    host.dispose()
    iframe.dispose()
  })
})
