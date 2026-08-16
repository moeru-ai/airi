function normalizeRoutePath(routePath: string) {
  const [path = ''] = routePath.split(/[?#]/)
  return path || '/'
}

/** Resolves the initial hash route before Vue Router hydrates `route.path`. */
export function resolveInitialWindowRoutePath(routePath: string, hash = globalThis.location?.hash ?? '') {
  const hashPath = hash.startsWith('#') ? hash.slice(1) : ''
  return normalizeRoutePath(hashPath || routePath)
}

/** Keeps Electron side effects in the main Stage renderer. */
export function resolveWindowSyncLeadership(routePath: string, hash = globalThis.location?.hash ?? '') {
  return resolveInitialWindowRoutePath(routePath, hash) === '/'
    ? 'leader-only'
    : 'follower-only'
}

/** Returns whether a renderer owns the Stage model and integration runtime. */
export function shouldInitializeFullStageRuntime(routePath: string, hash = globalThis.location?.hash ?? ''): boolean {
  const initialRoutePath = resolveInitialWindowRoutePath(routePath, hash)
  return !['/chat', '/editor', '/spotlight'].includes(initialRoutePath)
}
