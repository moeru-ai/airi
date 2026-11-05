import type { Extension } from '../../extension/shared'
import type { PluginRunner } from './types'

import { PluginRuntime } from '../bridge/plugin-runtime'
import { FileSystemLoader } from '../runtimes/node/loaders'

/**
 * Creates the runner that runs plugin code in the Host thread.
 *
 * Use when:
 * - Tests need a plugin without a worker
 * - A Host Kit passes objects that cannot cross a worker boundary, for example the Electron Kits
 *
 * Returns:
 * - A runner whose plugins get the Kit client objects directly
 */
export function createDirectRunner(): PluginRunner {
  const loader = new FileSystemLoader()
  return {
    kind: 'direct',
    async open(input) {
      let loaded: Promise<Extension> | undefined
      const load = () => {
        loaded ??= input.extension
          ? Promise.resolve(input.extension)
          : loader.loadExtensionFor(input.manifest, { cwd: input.cwd, runtime: input.runtime })
        return loaded
      }
      return {
        endpoint: new PluginRuntime(load, input.host),
        passesValues: true,
        onExit: () => () => {},
        close: async () => {},
      }
    },
  }
}
