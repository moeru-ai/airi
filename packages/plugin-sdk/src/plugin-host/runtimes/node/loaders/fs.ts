import type { Extension } from '../../../../extension'
import type { ExtensionLoadOptions, ExtensionManifestV2 } from '../../../shared/types'

import { isAbsolute, join } from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * Converts a resolved entrypoint into an importable URL.
 *
 * `import()` reads a Windows drive letter as a URL scheme, so a raw absolute path
 * fails with ERR_UNSUPPORTED_ESM_URL_SCHEME. A caller can append a cache-bust
 * query to force a module reload. That query must stay a URL query, not part of
 * the file name.
 */
function toEntrypointImportUrl(entrypoint: string): string {
  const queryIndex = entrypoint.indexOf('?')
  const filePath = queryIndex === -1 ? entrypoint : entrypoint.slice(0, queryIndex)
  const url = pathToFileURL(filePath)
  if (queryIndex !== -1)
    url.search = entrypoint.slice(queryIndex)
  return url.href
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
   */
  resolveEntrypointFor(manifest: ExtensionManifestV2, options?: ExtensionLoadOptions) {
    const runtime = options?.runtime ?? 'electron'
    if (!manifest.engines.runtimes.includes(runtime)) {
      throw new Error(`Extension \`${manifest.id}\` does not support runtime \`${runtime}\`.`)
    }

    const root = options?.cwd ?? cwd()
    const entrypoint
      = manifest.entrypoints[runtime]
        ?? manifest.entrypoints.default

    if (!entrypoint) {
      throw new Error(''
        + `Extension entrypoint is required for runtime \`${runtime}\`. `
        + 'Define `entrypoints.<runtime>` or `entrypoints.default` in the extension manifest.',
      )
    }

    return isAbsolute(entrypoint) ? entrypoint : join(root, entrypoint)
  }

  async loadExtensionFor(manifest: ExtensionManifestV2, options?: ExtensionLoadOptions) {
    const entrypoint = this.resolveEntrypointFor(manifest, options)
    const extensionModule = await import(toEntrypointImportUrl(entrypoint))
    return coerceExtensionFromModule(extensionModule)
  }
}
