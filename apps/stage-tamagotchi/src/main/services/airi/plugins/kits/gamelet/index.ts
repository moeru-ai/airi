import type {
  HostDataRecord,
  KitDescriptor,
  PluginHost,
  PluginHostContribution,
} from '@proj-airi/plugin-sdk/plugin-host'

import type { PluginHostGameletWidgetsManager } from '../../types'

import { isPlainObject } from 'es-toolkit'

import {
  createGameletWidgetProps,
  getGameletTitle,
  getGameletWidgetWindowSize,
  getOwnedGameletBindingOrThrow,
  getStoredGameletConfig,
  mergeGameletConfigPatch,
} from './gamelet-widget-state'

/**
 * Identifies the stage-tamagotchi permission key used to open a host-backed gamelet surface.
 *
 * Use when:
 * - Declaring or asserting permission for `session.apis.gamelets.open(...)`
 * - Reusing the stable gamelet event key in stage-owned tests
 *
 * Expects:
 * - The gamelet kit contribution and its tests share this stage-owned constant
 *
 * Returns:
 * - The permission/event key string for opening gamelets
 */
export const pluginGameletApiOpenEventName = 'proj-airi:plugin-sdk:apis:client:gamelets:open'

/**
 * Identifies the stage-tamagotchi permission key used to update a host-backed gamelet surface.
 *
 * Use when:
 * - Declaring or asserting permission for `session.apis.gamelets.configure(...)`
 * - Reusing the stable gamelet event key in stage-owned tests
 *
 * Expects:
 * - The gamelet kit contribution and its tests share this stage-owned constant
 *
 * Returns:
 * - The permission/event key string for configuring gamelets
 */
export const pluginGameletApiConfigureEventName = 'proj-airi:plugin-sdk:apis:client:gamelets:configure'

/**
 * Identifies the stage-tamagotchi permission key used to close a host-backed gamelet surface.
 *
 * Use when:
 * - Declaring or asserting permission for `session.apis.gamelets.close(...)`
 * - Reusing the stable gamelet event key in stage-owned tests
 *
 * Expects:
 * - The gamelet kit contribution and its tests share this stage-owned constant
 *
 * Returns:
 * - The permission/event key string for closing gamelets
 */
export const pluginGameletApiCloseEventName = 'proj-airi:plugin-sdk:apis:client:gamelets:close'

/**
 * Identifies the stage-tamagotchi permission key used to query whether a gamelet is open.
 *
 * Use when:
 * - Declaring or asserting permission for `session.apis.gamelets.isOpen(...)`
 * - Reusing the stable gamelet event key in stage-owned tests
 *
 * Expects:
 * - The gamelet kit contribution and its tests share this stage-owned constant
 *
 * Returns:
 * - The permission/event key string for querying gamelets
 */
export const pluginGameletApiIsOpenEventName = 'proj-airi:plugin-sdk:apis:client:gamelets:is-open'

function cloneRecord<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? cloneRecord(value as Record<string, unknown>) : undefined
}

/**
 * Declares the built-in gamelet kit exposed by `stage-tamagotchi`.
 *
 * Use when:
 * - Bootstrapping the Electron plugin host with gamelet support
 * - Reading the stable built-in gamelet kit descriptor in tests or snapshots
 *
 * Expects:
 * - The host registers this descriptor during startup
 *
 * Returns:
 * - The gamelet kit descriptor used for `kit.gamelet`
 */
export const gameletPluginKitDescriptor = {
  kitId: 'kit.gamelet',
  version: '1.0.0',
  runtimes: ['electron', 'web'],
  capabilities: [
    { key: 'kit.gamelet.runtime', actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'] },
  ],
} satisfies KitDescriptor

/**
 * Registers the built-in gamelet kit on one host instance.
 *
 * Use when:
 * - Bootstrapping the Electron plugin host with gamelet kit support
 * - Keeping gamelet descriptor registration inside the gamelet kit module
 *
 * Expects:
 * - `host` is the initialized plugin host instance
 *
 * Returns:
 * - The registered gamelet kit descriptor
 */
export function registerGameletPluginKit(host: PluginHost): KitDescriptor {
  return host.registerKit(gameletPluginKitDescriptor)
}

/**
 * Creates the installable gamelet host contribution for `session.apis.gamelets`.
 *
 * Use when:
 * - `stage-tamagotchi` needs plugin sessions to open, configure, close, or inspect gamelet widgets
 * - The root plugin host bootstrap should consume a kit-owned contribution instead of embedding gamelet logic
 *
 * Expects:
 * - `attachHost(...)` is called immediately after constructing `PluginHost`
 * - `widgetsManager` already manages extension-ui widget state
 *
 * Returns:
 * - A contribution plus an attach step that binds it to the constructed host instance
 */
export function createGameletHostContribution(options: {
  widgetsManager: PluginHostGameletWidgetsManager
}): {
  attachHost: (host: PluginHost) => void
  contribution: PluginHostContribution
} {
  let host: PluginHost | undefined
  const openWidgetIdsBySession = new Map<string, Set<string>>()
  const cleanupPromisesBySession = new Map<string, Promise<void>>()

  const requireHost = () => {
    if (!host) {
      throw new Error('Gamelet host contribution has not been attached to a PluginHost instance.')
    }

    return host
  }

  const trackOpenWidget = (sessionId: string, moduleId: string) => {
    const widgetIds = openWidgetIdsBySession.get(sessionId) ?? new Set<string>()
    widgetIds.add(moduleId)
    openWidgetIdsBySession.set(sessionId, widgetIds)
  }

  const untrackOpenWidget = (sessionId: string, moduleId: string) => {
    const widgetIds = openWidgetIdsBySession.get(sessionId)
    if (!widgetIds) {
      return
    }

    widgetIds.delete(moduleId)
    if (widgetIds.size === 0) {
      openWidgetIdsBySession.delete(sessionId)
    }
  }

  return {
    attachHost(instance) {
      host = instance
    },
    contribution: {
      install(context) {
        context.registerLifecycleHook('session-stopped', ({ session }) => {
          const widgetIds = openWidgetIdsBySession.get(session.sessionId)
          if (!widgetIds) {
            return
          }

          const widgetIdsToRemove = [...widgetIds]
          const cleanupPromise = Promise
            .allSettled(widgetIdsToRemove.map(widgetId => options.widgetsManager.removeWidget(widgetId)))
            .then(() => {
              openWidgetIdsBySession.delete(session.sessionId)
              cleanupPromisesBySession.delete(session.sessionId)
            })

          cleanupPromisesBySession.set(session.sessionId, cleanupPromise)
          void cleanupPromise.catch(() => {})
        })

        context.registerSessionApi('gamelets', ({ session, assertPermission }) => ({
          async open(id: string, params?: HostDataRecord) {
            assertPermission({
              area: 'apis',
              action: 'invoke',
              key: pluginGameletApiOpenEventName,
            })

            const module = getOwnedGameletBindingOrThrow({
              host: requireHost(),
              ownerPluginId: session.ownerPluginId,
              ownerSessionId: session.sessionId,
              moduleId: id,
            })
            const existingSnapshot = options.widgetsManager.getWidgetSnapshot(id)
            const existingComponentProps = toRecord(existingSnapshot?.componentProps)
            const payload = params
              ? cloneRecord(params)
              : (toRecord(existingComponentProps?.payload) ?? getStoredGameletConfig(module.config))
            const windowSize = getGameletWidgetWindowSize({
              moduleConfig: module.config,
              existingSnapshot,
            })
            const componentProps = createGameletWidgetProps({
              moduleId: id,
              title: getGameletTitle({
                moduleId: id,
                moduleConfig: module.config,
                existingComponentProps,
              }),
              payload,
              windowSize,
              existingComponentProps,
            })

            if (existingSnapshot) {
              await options.widgetsManager.updateWidget({
                id,
                componentProps,
                windowSize,
              })
              await options.widgetsManager.openWindow({ id })
              trackOpenWidget(session.sessionId, id)
              return
            }

            await options.widgetsManager.pushWidget({
              id,
              componentName: 'extension-ui',
              componentProps,
              size: 'm',
              ttlMs: 0,
              windowSize,
            })
            trackOpenWidget(session.sessionId, id)
          },
          async configure(id: string, patch: HostDataRecord) {
            assertPermission({
              area: 'apis',
              action: 'invoke',
              key: pluginGameletApiConfigureEventName,
            })

            const module = getOwnedGameletBindingOrThrow({
              host: requireHost(),
              ownerPluginId: session.ownerPluginId,
              ownerSessionId: session.sessionId,
              moduleId: id,
            })
            const { nextConfig } = mergeGameletConfigPatch({
              moduleConfig: module.config,
              patch,
            })

            requireHost().updateBinding(module.ownerSessionId, id, { config: nextConfig })

            const existingSnapshot = options.widgetsManager.getWidgetSnapshot(id)
            if (!existingSnapshot) {
              return
            }

            const existingComponentProps = toRecord(existingSnapshot.componentProps)
            const existingPayload = toRecord(existingComponentProps?.payload) ?? {}
            const windowSize = getGameletWidgetWindowSize({
              moduleConfig: nextConfig,
              existingSnapshot,
            })

            await options.widgetsManager.updateWidget({
              id,
              componentProps: createGameletWidgetProps({
                moduleId: id,
                title: getGameletTitle({
                  moduleId: id,
                  moduleConfig: nextConfig,
                  existingComponentProps,
                }),
                payload: {
                  ...existingPayload,
                  ...cloneRecord(patch),
                },
                windowSize,
                existingComponentProps,
              }),
              windowSize,
            })
          },
          async close(id: string) {
            assertPermission({
              area: 'apis',
              action: 'invoke',
              key: pluginGameletApiCloseEventName,
            })

            getOwnedGameletBindingOrThrow({
              host: requireHost(),
              ownerPluginId: session.ownerPluginId,
              ownerSessionId: session.sessionId,
              moduleId: id,
            })
            await options.widgetsManager.removeWidget(id)
            untrackOpenWidget(session.sessionId, id)
          },
          async isOpen(id: string) {
            assertPermission({
              area: 'apis',
              action: 'invoke',
              key: pluginGameletApiIsOpenEventName,
            })

            getOwnedGameletBindingOrThrow({
              host: requireHost(),
              ownerPluginId: session.ownerPluginId,
              ownerSessionId: session.sessionId,
              moduleId: id,
            })
            return options.widgetsManager.getWidgetSnapshot(id) !== undefined
          },
        }))
      },
    },
  }
}
