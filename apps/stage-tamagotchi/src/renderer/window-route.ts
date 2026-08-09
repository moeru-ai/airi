function normalizeRoutePath(routePath: string) {
  const [path = ''] = routePath.split(/[?#]/)
  return path || '/'
}

/** Resolves the initial hash route before Vue Router hydrates `route.path`. */
export function resolveInitialWindowRoutePath(routePath: string, hash = globalThis.location?.hash ?? '') {
  const hashPath = hash.startsWith('#') ? hash.slice(1) : ''
  return normalizeRoutePath(hashPath || routePath)
}
