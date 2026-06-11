import type { Extension } from './shared'

/**
 * Defines an AIRI extension entrypoint.
 *
 * Use when:
 * - Authoring an extension package that runs setup code and may use host-provided kits
 * - Keeping extension metadata and setup logic in one explicit export
 *
 * Expects:
 * - `id` matches `extension.airi.json`
 * - `setup` uses `ctx.kits` for the common kit authoring path
 *
 * Returns:
 * - The extension definition consumed by an extension host loader
 */
export function defineExtension(extension: Extension): Extension {
  return extension
}
