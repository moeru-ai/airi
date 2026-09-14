import type { Extension } from '../../../../extension'
import type { ExtensionLoadOptions, ExtensionManifestV1 } from '../../../shared/types'

import { registerHooks } from 'node:module'
import { dirname, isAbsolute, join, sep } from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'

const urlSchemePattern = /^[a-z][\d+.a-z-]*:\/\//i

/**
 * Converts a resolved filesystem entrypoint into an ESM import specifier.
 *
 * Why:
 * - Dynamic `import()` parses a bare Windows path such as `C:\plugins\index.mjs`
 *   as URL scheme `c:` and Node rejects it with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
 * - `pathToFileURL` also percent-encodes URL-significant characters in file
 *   names, so a cache-bust query appended afterwards stays a query.
 *
 * Returns the original specifier when it already carries a URL scheme.
 */
function toImportSpecifier(entrypoint: string): string {
  if (urlSchemePattern.test(entrypoint)) {
    return entrypoint
  }

  return pathToFileURL(entrypoint).href
}

function withCacheBustKey(specifier: string, cacheBustKey: string): string {
  const delimiter = specifier.includes('?') ? '&' : '?'
  return `${specifier}${delimiter}cacheBust=${encodeURIComponent(cacheBustKey)}`
}

/**
 * Maps one plugin root URL to the cache-bust generation of its latest load.
 *
 * The module graph hook reads this map to append the same generation to every
 * relative import inside the plugin root, so a reload replaces the whole module
 * graph instead of only the entrypoint.
 */
const pluginModuleGenerations = new Map<string, string>()
let pluginModuleGraphHookRegistered = false

function createRootUrl(root: string): string {
  return pathToFileURL(root.endsWith(sep) ? root : `${root}${sep}`).href
}

function findModuleGeneration(parentUrl: string): { cacheBustKey: string, rootUrl: string } | undefined {
  for (const [rootUrl, cacheBustKey] of pluginModuleGenerations) {
    if (parentUrl.startsWith(rootUrl)) {
      return { cacheBustKey, rootUrl }
    }
  }

  return undefined
}

/**
 * Installs the resolve hook that cache-busts plugin-local module imports.
 *
 * The hook is process-wide and installed once. It appends the active generation
 * of the owning plugin root to every file URL that resolves inside that root.
 * Imports outside plugin roots keep their original URL, so shared packages and
 * Node builtins stay cached across reloads.
 *
 * Requires a Node runtime with `module.registerHooks` (Node 22.15 or later,
 * which current Electron releases provide).
 */
function registerPluginModuleGraphHook() {
  if (pluginModuleGraphHookRegistered) {
    return
  }

  pluginModuleGraphHookRegistered = true

  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parentUrl = context.parentURL
      const generation = parentUrl ? findModuleGeneration(parentUrl) : undefined
      if (!generation) {
        return nextResolve(specifier, context)
      }

      const resolved = nextResolve(specifier, context)
      if (!resolved.url.startsWith('file:')) {
        return resolved
      }

      const resolvedUrl = new URL(resolved.url)
      if (!resolvedUrl.href.startsWith(generation.rootUrl)) {
        return resolved
      }

      if (resolvedUrl.searchParams.get('cacheBust') === generation.cacheBustKey) {
        return resolved
      }

      resolvedUrl.searchParams.set('cacheBust', generation.cacheBustKey)
      return { ...resolved, url: resolvedUrl.href }
    },
  })
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
    const specifier = toImportSpecifier(entrypoint)

    if (options?.cacheBustKey) {
      registerPluginModuleGraphHook()
      // Register the plugin root and the entrypoint directory, so relative
      // imports from either location receive the same cache-bust generation.
      pluginModuleGenerations.set(createRootUrl(options.cwd || dirname(entrypoint)), options.cacheBustKey)
      pluginModuleGenerations.set(createRootUrl(dirname(entrypoint)), options.cacheBustKey)
    }

    const extensionModule = await import(options?.cacheBustKey
      ? withCacheBustKey(specifier, options.cacheBustKey)
      : specifier)
    return coerceExtensionFromModule(extensionModule)
  }
}
