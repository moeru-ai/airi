import type { definePlugin } from '../plugin'
import type { Plugin } from '../plugin/shared'

import { join } from 'node:path'
import { cwd } from 'node:process'

/**
 * Plugin Host lifecycle overview (transport-aware):
 *
 * - The host loads a plugin entrypoint (local or remote).
 * - The host resolves a per-plugin transport (in-memory, worker, WebSocket, electron).
 * - The host creates an Eventa context bound to that transport.
 * - The host binds SDK APIs to the context and passes them into plugin.init.
 *
 * This design allows multiple plugins in one host without shared global channels.
 * Each plugin instance has its own context and transport, so local and remote
 * plugins share the same API surface while remaining isolated.
 */
/**
 * One plugin could contribute multiple modules.
 *
 * For plugin itself, there are two ways to implement it, either local plugin, or remote plugin.
 * Since we have @moeru/eventa as underlying event transmission, we can drive everything in event.
 *
 * It's ok that local plugin doesn't implement the remote protocol to handle the remote plugin
 * RPC if doesn't wish for. Purely local UI manipulation or local resource registration is normal.
 *
 * In another word, we could implement the plugin in same eventa definition, while switching
 * between two different transport.
 *
 * For local plugin, local context for in-memory transport will be used.
 * For remote plugin, server-runtime for WebSocket based transport will be used.
 *
 *
 * The procedure looks like this (regardless to the underlying transport since we will implement
 * in both):
 *
 * 0.  Channel Gateway sits on top of all channels
 * 1.  Connect to control plane channel (from plugin-sdk, or any language implementation will impl)
 * 2.  Authenticate with module:authenticate
 * 3.  Plugin Host will send registry:modules:sync, this ensures the auto plugin / dependency discovery
 * 4.  Module will now announce itself to the entire system through module:announce
 * 5.  Module will now sync to Plugin Host that module now preparing, declaring its:
 *    1. Dependencies to other plugins / modules
 *    2. Initial Configuration (doesn't relate to capabilities)
 *       Note that for capabilities requires Database configuration, and perhaps Memory manipulation,
 *       plugin should orchestrate itself to contribute many capabilities / features, and the needed
 *       configurations and credentials should be requested and configured for each capabilities
 *       instead.
 * 6.  During this phase, if module failed to find the needed dependency, module:status will be emitted
 *     to allow the Plugin Host to surface errors or notice up to Configurator layer, to display the
 *     needed warning and status.
 *
 *     It's ok for module to stay online / connected to channels. In this phase, module:announce
 *     could happen multiple times. Module is ok to listen to the sync events and decide whether to enter
 *     the next phases if needed.
 * 7.  During this phase, if plugin successfully configured itself and calculated / computed the possible
 *     contributing capabilities / features, it will emit module:prepared.
 * 8.  During this phase, if module requires more configuration to fill and enable in order to go next
 *     phase, it's ok, it will emit module:configuration:needed.
 * 8.  Module should now emit module:prepared.
 * 9.  Module should now emit module:configuration:needed, for telling the shape to Configurator.
 *     In between, for user side / Configurator side:
 *       - module:configuration:validate:request (static check, zod/valibot or programmatic checks)
 *       - module:configuration:validate:status (with parent event id)
 *       - module:configuration:validate:response
 *       - module:configuration:plan:request (actually dry-run, ensures anything during runtime works)
 *       - module:configuration:plan:status (with parent event id)
 *       - module:configuration:plan:response
 *       - module:configuration:commit
 *       - module:configuration:commit:status (with parent event id)
 * 9.  Module previously configured will get validate, plan, and commit automatically, if failed, status
 *     will surface to the Configurator side for further noticing to user.
 * 10. Module should now emit module:configuration:configured.
 * 11. Module should now be able to calculate / compute possible capabilities / features to be able to
 *     contribute to the system / Plugin Host, once calculated, module:contribute:capability:offer will
 *     be emitted in (length of) capabilities times.
 *
 *     This means for 1 module that offers 5 capabilities, 5 * module:contribute:capability:offer will
 *     be emitted.
 * 12. Next, module will now enter the capability / feature fill-in phase, during this phase, it's ok
 *     to say that the plugin is running but nothing gets contributed if none of them were configured.
 *
 *     For any capabilities without further configuration and fill-in from Configurator and User side,
 *     it can be automatically activated now (which is next phase for module:contribute:capability:*
 *     events), module:contribute:capability:configuration:configured,
 *     module:contribute:capability:activated will be emitted.
 *
 *     If further configuration and actions needed, module:contribute:capability:configuration:needed
 *     will be emitted.
 *
 *     To configure the capabilities in sequence and correct order,
 *       - module:contribute:capability:configuration:validate:request (static check, zod/valibot or programmatic checks)
 *       - module:contribute:capability:configuration:validate:status (with parent event id)
 *       - module:contribute:capability:configuration:validate:response
 *       - module:contribute:capability:configuration:plan:request (actually dry-run, ensures anything during runtime works)
 *       - module:contribute:capability:configuration:plan:status (with parent event id)
 *       - module:contribute:capability:configuration:plan:response
 *       - module:contribute:capability:configuration:commit
 *       - module:contribute:capability:configuration:commit:status (with parent event id)
 *    similar to module:configuration are accepted.
 *
 * 13. No matter what happens, the module:status should emit with ready status now.
 * 14. Any time the module need to re-calculate / re-compute, or wish to be re-configured, it's ok to
 *     emit module:status:change with needed phase to update, if need to rollback to announced phase,
 *     Plugin Host should treat the Module to be un-prepared status, the needed procedure will be called.
 */

export class PluginHost {
  constructor() {

  }
}

export interface ManifestV1 {
  apiVersion: 'v1'
  kind: 'manifest.plugin.airi.moeru.ai'
  name: string
  entrypoints: {
    electron?: string
  }
}

export class FileSystemLoader {
  constructor() {

  }

  async loadLazyPluginFor(manifest: ManifestV1, options?: { cwd?: string }) {
    const root = options?.cwd ?? cwd()
    if (!manifest.entrypoints.electron) {
      throw new Error(''
        + 'For locally installed, defined plugin, electron entrypoint is required.'
        + 'The value of `entrypoints.electron` should be the relative path to the '
        + 'root of app.getPath(\'userData\').',
      )
    }

    const entrypoint = join(root, manifest.entrypoints.electron)
    const pluginModule = await import(entrypoint) as { default: ReturnType<typeof definePlugin> }
    return pluginModule.default
  }

  async loadPluginFor(manifest: ManifestV1, options?: { cwd?: string }) {
    const root = options?.cwd ?? cwd()
    if (!manifest.entrypoints.electron) {
      throw new Error(''
        + 'For locally installed, defined plugin, electron entrypoint is required.'
        + 'The value of `entrypoints.electron` should be the relative path to the '
        + 'root of app.getPath(\'userData\').',
      )
    }

    const entrypoint = join(root, manifest.entrypoints.electron)
    const pluginModule = await import(entrypoint) as Plugin
    return pluginModule
  }
}
