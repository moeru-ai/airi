import { beforeEach, describe, expect, it, vi } from 'vitest'

const chatSyncStoreMock = vi.hoisted(() => ({
  dispose: vi.fn(),
  initialize: vi.fn(),
}))

vi.mock('./chat-sync', () => ({
  useChatSyncStore: () => chatSyncStoreMock,
}))

describe('createChatSyncWindowLifecycle', async () => {
  const {
    createChatSyncWindowLifecycle,
    resolveInitialChatSyncRoutePath,
  } = await import('./chat-sync-lifecycle')

  beforeEach(() => {
    chatSyncStoreMock.dispose.mockClear()
    chatSyncStoreMock.initialize.mockClear()
  })

  it('issue #1743: keeps main window chat sync owned by the renderer root', () => {
    // https://github.com/moeru-ai/airi/issues/1743
    const lifecycle = createChatSyncWindowLifecycle('/', '')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).toHaveBeenCalledWith('authority')
    expect(chatSyncStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('issue #1743: resolves chat windows from the initial hash before router readiness', () => {
    // https://github.com/moeru-ai/airi/issues/1743
    const lifecycle = createChatSyncWindowLifecycle('/', '#/chat')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).toHaveBeenCalledWith('follower')
    expect(chatSyncStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('resolves spotlight windows as followers', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/spotlight')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).toHaveBeenCalledWith('follower')
    expect(chatSyncStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('does not initialize chat sync for unrelated windows', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/widgets')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('does not initialize chat sync for settings windows', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/settings')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('does not initialize chat sync for nested settings windows', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/settings/unrelated')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('normalizes hash query strings when resolving the initial route', () => {
    expect(resolveInitialChatSyncRoutePath('/', '#/chat?source=tray')).toBe('/chat')
  })
})
