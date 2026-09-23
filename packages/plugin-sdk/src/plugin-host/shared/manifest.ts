import type { ExtensionManifestV2 } from './types'

import { safeParse } from 'valibot'

import { extensionManifestV2Schema } from './types'

/** Describes one field-level problem found while parsing an Extension manifest. */
export interface ExtensionManifestDiagnostic {
  /** Dot-separated path to the invalid field, or `<root>` for the manifest itself. */
  path: string
  /** Human-readable validation message. */
  message: string
}

/** Represents the strict parse result for one Extension manifest. */
export type ExtensionManifestParseResult
  = | { success: true, manifest: ExtensionManifestV2 }
    | { success: false, diagnostics: ExtensionManifestDiagnostic[] }

/**
 * Parses an untrusted Extension manifest into the version-2 contract.
 *
 * A successful result contains only schema-owned fields. A failed result keeps
 * field paths so import and discovery surfaces can explain the problem.
 */
export function parseExtensionManifest(value: unknown): ExtensionManifestParseResult {
  const result = safeParse(extensionManifestV2Schema, value)
  if (result.success) {
    return { success: true, manifest: result.output }
  }

  return {
    success: false,
    diagnostics: result.issues.map((issue) => {
      const path = issue.path?.map(item => String(item.key)).join('.')
      return {
        path: path || '<root>',
        message: issue.message,
      }
    }),
  }
}
