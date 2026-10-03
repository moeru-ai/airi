/**
 * Resolves whether the application is running under the Wayland Ozone backend.
 *
 * Checks explicit command-line switches before falling back to session environment variables.
 * Treats 'auto' as an unresolved platform selection and resolves it using session environment variables.
 */
export function resolveIsWayland(params: {
  explicitOzonePlatform?: string
  ozonePlatformHint?: string
  env?: Record<string, string | undefined>
}): boolean {
  if (params.explicitOzonePlatform && params.explicitOzonePlatform !== 'auto') {
    return params.explicitOzonePlatform === 'wayland'
  }

  if (params.ozonePlatformHint && params.ozonePlatformHint !== 'auto') {
    return params.ozonePlatformHint === 'wayland'
  }

  return Boolean(params.env?.WAYLAND_DISPLAY || params.env?.XDG_SESSION_TYPE === 'wayland')
}
