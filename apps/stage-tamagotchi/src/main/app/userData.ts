import { basename, dirname, join } from 'node:path'

/**
 * Selects an explicit Electron user-data directory when the runtime requests
 * one. Returning `undefined` preserves Electron's default directory.
 *
 * `APP_USER_DATA_PATH` is an operational override used by smoke tests and
 * remains authoritative over build-distribution policy. Steam builds use a
 * sibling directory so channel-local credentials, plugins, settings, and
 * caches cannot be restored from a direct installation.
 */
export function resolveUserDataPath(params: {
  defaultPath: string
  distribution?: string
  overridePath?: string
}): string | undefined {
  const overridePath = params.overridePath?.trim()
  if (overridePath)
    return overridePath

  if (params.distribution === 'steam') {
    // Derive from Electron's platform-specific default instead of hardcoding
    // macOS, Windows, or Linux application-data locations.
    return join(
      dirname(params.defaultPath),
      `${basename(params.defaultPath)}-steam`,
    )
  }

  return undefined
}
