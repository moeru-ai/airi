import type { Extension } from '../../../../extension/shared'
import type { ExtensionLoader } from '../../../shared/loader'
import type { ExtensionLoadOptions, ExtensionManifestV1 } from '../../../shared/types'

/** One extension definition that ships with an application release. */
export interface BundledExtensionDefinition {
  extension: Extension
  manifest: ExtensionManifestV1
}

/**
 * Loads only extensions that the application registers during its build.
 *
 * This loader does not resolve URLs, archives, or filesystem paths. It keeps
 * Web and Pocket extension execution inside the reviewed release bundle.
 */
export class BundledExtensionLoader implements ExtensionLoader {
  private readonly extensions = new Map<string, Extension>()

  constructor(definitions: Iterable<BundledExtensionDefinition>) {
    for (const definition of definitions) {
      if (definition.extension.id !== definition.manifest.id) {
        throw new Error(`Bundled extension id \`${definition.extension.id}\` must match manifest id \`${definition.manifest.id}\`.`)
      }

      this.extensions.set(definition.manifest.id, definition.extension)
    }
  }

  async loadExtensionFor(manifest: ExtensionManifestV1, _options?: ExtensionLoadOptions): Promise<Extension> {
    const extension = this.extensions.get(manifest.id)
    if (!extension) {
      throw new Error(`Bundled extension \`${manifest.id}\` is not registered.`)
    }

    return extension
  }
}
