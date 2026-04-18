import { playwright, PlaywrightBrowserProvider } from '@vitest/browser-playwright'

function installBroadcastReplayPatch(page: {
  addInitScript: (script: () => void) => Promise<void>
}) {
  return page.addInitScript(() => {
    const NativeBroadcastChannel = window.BroadcastChannel
    const backlogHost = (() => {
      try {
        return window.top ?? window
      }
      catch {
        return window
      }
    })() as Window & { __vitestBroadcastBacklog__?: Map<string, unknown[]> }
    const broadcastBacklog = backlogHost.__vitestBroadcastBacklog__ ?? new Map<string, unknown[]>()
    backlogHost.__vitestBroadcastBacklog__ = broadcastBacklog

    window.BroadcastChannel = class PatchedBroadcastChannel extends NativeBroadcastChannel {
      override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (type !== 'message' || !listener) {
          return super.addEventListener(type, listener as EventListenerOrEventListenerObject, options)
        }

        if (typeof listener === 'function') {
          const wrappedListener: EventListener = event => listener.call(this, event)
          const result = super.addEventListener(type, wrappedListener, options)
          queueMicrotask(() => {
            for (const message of broadcastBacklog.get(this.name) ?? []) {
              void wrappedListener.call(this, new MessageEvent('message', { data: message }))
            }
          })
          return result
        }

        const wrappedListenerObject: EventListenerObject = {
          handleEvent: event => listener.handleEvent(event),
        }
        const result = super.addEventListener(type, wrappedListenerObject, options)
        queueMicrotask(() => {
          for (const message of broadcastBacklog.get(this.name) ?? []) {
            void wrappedListenerObject.handleEvent(new MessageEvent('message', { data: message }))
          }
        })
        return result
      }

      override postMessage(message: unknown) {
        const currentMessages = broadcastBacklog.get(this.name) ?? []
        currentMessages.push(message)
        if (currentMessages.length > 8) {
          currentMessages.splice(0, currentMessages.length - 8)
        }
        broadcastBacklog.set(this.name, currentMessages)
        setTimeout(() => {
          const queuedMessages = broadcastBacklog.get(this.name)
          if (!queuedMessages) {
            return
          }

          const index = queuedMessages.indexOf(message)
          if (index >= 0) {
            queuedMessages.splice(index, 1)
          }

          if (!queuedMessages.length) {
            broadcastBacklog.delete(this.name)
          }
        }, 2000)
        return super.postMessage(message)
      }
    }
  })
}

interface PlaywrightProviderInstance {
  openBrowserPage: (sessionId: string) => Promise<{
    addInitScript: (script: () => void) => Promise<void>
  }>
}

export function playwrightBrowserProvider(options: Record<string, unknown> = {}) {
  const provider = playwright(options) as any

  return {
    ...provider,
    providerFactory(project: any) {
      const browserProvider = new PlaywrightBrowserProvider(project, options) as unknown as PlaywrightProviderInstance
      const originalOpenBrowserPage = browserProvider.openBrowserPage.bind(browserProvider)

      browserProvider.openBrowserPage = async (sessionId: string) => {
        const page = await originalOpenBrowserPage(sessionId)
        await installBroadcastReplayPatch(page)
        return page
      }

      return browserProvider as any
    },
  } as any
}
