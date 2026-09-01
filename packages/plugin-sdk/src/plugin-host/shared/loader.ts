import type { Extension } from '../../extension/shared'
import type { ExtensionLoadOptions, ExtensionManifestV1 } from './types'

/**
 * Resolves an extension definition for one host runtime.
 *
 * Loaders define the extension distribution boundary. Desktop hosts can load
 * user-installed files. Web and Pocket hosts can load only definitions that
 * ship with the application.
 */
export interface ExtensionLoader {
  loadExtensionFor: (
    manifest: ExtensionManifestV1,
    options?: ExtensionLoadOptions,
  ) => Promise<Extension>
}
