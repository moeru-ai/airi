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

/**
 * Linux X11 disables GPU compositing so a transparent window receives clicks.
 * WebGL stays available. Wayland and non-Linux return no switches.
 * Platform resolution matches {@link resolveIsWayland}.
 * `auto` and an absent platform resolve from the session environment.
 * This decision does not select an Ozone backend.
 */
export function resolveGpuCompositingSwitches(params: {
  isLinux: boolean
  explicitOzonePlatform?: string
  ozonePlatformHint?: string
  env?: Record<string, string | undefined>
}): readonly string[] {
  if (!params.isLinux) {
    return []
  }

  if (resolveIsWayland(params)) {
    return []
  }

  // NOTICE:
  // On Linux X11, GPU compositing makes a transparent window ignore clicks.
  // Root cause: the GPU compositor drops input for that window. `--disable-gpu` also disables WebGL.
  // Source: https://github.com/moeru-ai/airi/issues/3251
  // Removal condition: X11 input works while GPU compositing and WebGL stay on.
  return ['disable-gpu-compositing']
}
