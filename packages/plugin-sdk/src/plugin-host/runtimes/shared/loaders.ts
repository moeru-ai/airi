import type { Extension } from '../../../extension/shared'
import type { ExtensionLoader } from '../../shared/loader'
import type { ExtensionLoadOptions, ExtensionManifestV1 } from '../../shared/types'

/**
 * Tries loaders in order until one resolves an extension definition.
 *
 * Put bundled loaders before filesystem loaders. This gives official release
 * extensions a fixed definition while preserving Desktop user extensions.
 */
export class FallbackExtensionLoader implements ExtensionLoader {
  constructor(private readonly loaders: ExtensionLoader[]) {}

  async loadExtensionFor(manifest: ExtensionManifestV1, options?: ExtensionLoadOptions): Promise<Extension> {
    let lastError: unknown
    for (const loader of this.loaders) {
      try {
        return await loader.loadExtensionFor(manifest, options)
      }
      catch (error) {
        lastError = error
      }
    }
    throw lastError ?? new Error(`No extension loader can resolve \`${manifest.id}\`.`)
  }
}
