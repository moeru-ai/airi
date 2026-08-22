import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockContext {
  invokeHandlers: Map<string, (payload: unknown) => unknown>
}

const getMediaAccessStatus = vi.fn()
const askForMediaAccess = vi.fn()

function createMockContext(): MockContext {
  return {
    invokeHandlers: new Map(),
  }
}

async function setupService() {
  vi.doMock('electron', () => ({
    systemPreferences: {
      askForMediaAccess,
      getMediaAccessStatus,
    },
  }))

  vi.doMock('@moeru/eventa', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@moeru/eventa')>()
    return {
      ...actual,
      defineInvokeHandler: (
        context: MockContext,
        eventa: { sendEvent: { id: string } },
        handler: (payload: unknown) => unknown,
      ) => {
        context.invokeHandlers.set(eventa.sendEvent.id.replace(/-send$/, ''), handler)
      },
    }
  })

  const { createSystemPreferencesService } = await import('./system-preferences')
  const context = createMockContext()
  createSystemPreferencesService({
    context: context as never,
    window: {} as never,
  })

  return context.invokeHandlers
}

describe('system preferences service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  // https://github.com/moeru-ai/airi/issues/2132
  it('returns unknown when Linux does not provide getMediaAccessStatus (Issue #2132)', async () => {
    // ROOT CAUSE:
    //
    // Electron does not provide `getMediaAccessStatus` on Linux.
    // The service calls this platform-specific method without a platform guard.
    // The fix must return AIRI's normalized unknown status on unsupported platforms.
    getMediaAccessStatus.mockImplementationOnce(() => {
      throw new TypeError('systemPreferences.getMediaAccessStatus is not a function')
    })
    const handlers = await setupService()
    const handler = handlers.get('eventa:invoke:electron:system-preferences:get-media-access-status')

    expect(handler).toBeDefined()
    expect(handler!(['microphone'])).toBe('unknown')
  })

  // https://github.com/moeru-ai/airi/issues/2132
  it('returns false when Linux cannot show a native media prompt (Issue #2132)', async () => {
    // ROOT CAUSE:
    //
    // Electron provides `askForMediaAccess` only on macOS.
    // The service calls this method for every platform and rejects the renderer request on Linux.
    // The fix must report that AIRI cannot open a native prompt on unsupported platforms.
    askForMediaAccess.mockImplementationOnce(() => {
      throw new TypeError('systemPreferences.askForMediaAccess is not a function')
    })
    const handlers = await setupService()
    const handler = handlers.get('eventa:invoke:electron:system-preferences:ask-for-media-access')

    expect(handler).toBeDefined()
    await expect(handler!(['microphone'])).resolves.toBe(false)
  })
})
