import { useChatSyncStore } from './chat-sync'

type ChatSyncWindowRole = 'authority' | 'follower'

function normalizeRoutePath(routePath: string) {
  const [path = ''] = routePath.split(/[?#]/)
  return path || '/'
}

export function resolveInitialChatSyncRoutePath(routePath: string, hash = globalThis.location?.hash ?? '') {
  const hashPath = hash.startsWith('#') ? hash.slice(1) : ''
  return normalizeRoutePath(hashPath || routePath)
}

function resolveChatSyncWindowRole(routePath: string): ChatSyncWindowRole | null {
  const path = normalizeRoutePath(routePath)
  if (path === '/')
    return 'authority'
  if (path === '/chat')
    return 'follower'
  return null
}

/**
 * Owns chat-sync BroadcastChannel lifecycle for one Electron renderer window.
 *
 * The role is captured from the initial window route and must be initialized
 * from the renderer root. Route pages should not dispose the channel because
 * in-window navigation can unmount them while the BrowserWindow is still alive.
 */
export function createChatSyncWindowLifecycle(routePath: string, hash?: string) {
  const chatSyncStore = useChatSyncStore()
  const role = resolveChatSyncWindowRole(resolveInitialChatSyncRoutePath(routePath, hash))

  return {
    role,
    initialize() {
      if (role)
        chatSyncStore.initialize(role)
    },
    dispose() {
      if (role)
        chatSyncStore.dispose()
    },
  }
}
