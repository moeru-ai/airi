import type { Extension } from '../../../../extension'
import type { ExtensionLoadOptions, ExtensionManifestV1 } from '../../../shared/types'

import { isAbsolute, join } from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'

const urlSchemePattern = /^[a-z][\d+.a-z-]*:\/\//i

/**
 * Converts a resolved filesystem entrypoint into an ESM import specifier.
 *
 * Why:
 * - Dynamic `import()` parses a bare Windows path such as `C:\plugins\index.mjs`
 *   as URL scheme `c:` and Node rejects it with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
 * - Auto-reload cache-bust markers (`index.mjs?cacheBust=...`) must stay a URL
 *   query so Node keeps them as the module cache key instead of a path segment.
 *
 * Returns the original specifier when it already carries a URL scheme.
 */
function toImportSpecifier(entrypoint: string): string {
  if (urlSchemePattern.test(entrypoint)) {
    return entrypoint
  }

  const queryIndex = entrypoint.indexOf('?')
  if (queryIndex === -1) {
    return pathToFileURL(entrypoint).href
  }

  const pathname = entrypoint.slice(0, queryIndex)
  const query = entrypoint.slice(queryIndex)
  return `${pathToFileURL(pathname).href}${query}`
}

function isExtensionDefinition(value: unknown): value is Extension {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof (value as { id?: unknown }).id === 'string'
    && 'setup' in value
    && typeof (value as { setup?: unknown }).setup === 'function'
}

function coerceExtensionFromModule(moduleValue: unknown): Extension {
  if (isExtensionDefinition(moduleValue)) {
    return moduleValue
  }

  if (typeof moduleValue === 'object' && moduleValue !== null) {
    const defaultExport = (moduleValue as { default?: unknown }).default
    if (isExtensionDefinition(defaultExport)) {
      return defaultExport
    }
  }

  throw new Error('Failed to resolve extension module. The entrypoint must export defineExtension(...).')
}

/**
 * Loads extension entrypoints from the local filesystem for the current runtime.
 *
 * Use when:
 * - The host needs to resolve a manifest entrypoint path
 * - The host needs to import a `defineExtension(...)` export
 *
 * Expects:
 * - Entry points are valid importable module paths for the active runtime
 *
 * Returns:
 * - Filesystem-backed helpers for resolving and loading extension entrypoints
 */
export class FileSystemLoader {
  /**
   * Resolve a manifest entrypoint for the requested runtime.
   *
   * Resolution order:
   * 1) `entrypoints.<runtime>`
   * 2) `entrypoints.default`
   * 3) `entrypoints.electron` (legacy fallback for current local extension manifests)
   */
  resolveEntrypointFor(manifest: ExtensionManifestV1, options?: ExtensionLoadOptions) {
    const runtime = options?.runtime ?? 'electron'
    const root = options?.cwd ?? cwd()
    const entrypoint
      = manifest.entrypoints[runtime]
        ?? manifest.entrypoints.default
        ?? manifest.entrypoints.electron

    if (!entrypoint) {
      throw new Error(''
        + `Extension entrypoint is required for runtime \`${runtime}\`. `
        + 'Define one of `entrypoints.<runtime>`, `entrypoints.default`, '
        + 'or `entrypoints.electron` in the extension manifest.',
      )
    }

    return isAbsolute(entrypoint) ? entrypoint : join(root, entrypoint)
  }

  async loadExtensionFor(manifest: ExtensionManifestV1, options?: ExtensionLoadOptions) {
    const entrypoint = this.resolveEntrypointFor(manifest, options)
    const extensionModule = await import(toImportSpecifier(entrypoint))
    return coerceExtensionFromModule(extensionModule)
  }
}
