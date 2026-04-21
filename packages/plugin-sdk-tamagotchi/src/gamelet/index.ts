import type { ContextInit } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

/**
 * Describes a widget hint contributed by a gamelet to the tamagotchi host.
 *
 * Use when:
 * - A gamelet should expose one or more mountable widget surfaces
 *
 * Expects:
 * - `id` is stable within the gamelet
 *
 * Returns:
 * - A serializable host hint for widget registration
 */
export interface GameletWidgetDefinition {
  id: string
  kind: string
}

/**
 * Describes host-managed configuration defaults declared by a gamelet.
 *
 * Use when:
 * - A gamelet wants the host to persist validated defaults
 *
 * Expects:
 * - `defaults` is JSON-compatible
 *
 * Returns:
 * - The configuration declaration stored in the gamelet module config
 */
export interface GameletConfigDefinition<TDefaults extends HostDataRecord = HostDataRecord> {
  defaults?: TDefaults
}

/**
 * Describes the friendly tamagotchi authoring shape for a gamelet.
 *
 * Use when:
 * - A plugin wants to register one UI-driven gamelet without raw kit/module calls
 *
 * Expects:
 * - `entrypoint` points at the plugin-provided UI asset entry
 *
 * Returns:
 * - A declarative gamelet definition consumed by {@link defineGamelet}
 */
export interface GameletDefinition<TDefaults extends HostDataRecord = HostDataRecord> {
  id: string
  title: string
  entrypoint: string
  widgets?: GameletWidgetDefinition[]
  config?: GameletConfigDefinition<TDefaults>
}

/**
 * Represents one registered tamagotchi gamelet.
 *
 * Use when:
 * - Tools or plugin bootstrap code need to check whether host registration succeeded
 *
 * Expects:
 * - Returned values come from a previously completed {@link defineGamelet} call
 *
 * Returns:
 * - A minimal handle that keeps host lifecycle concerns internal
 */
export interface DefinedGamelet {
  id: string
  isSupported: () => Promise<boolean>
}

/**
 * Normalizes one author-facing gamelet widget into host-safe binding config data.
 *
 * Before:
 * - `{ id: 'main-board', kind: 'primary' }`
 *
 * After:
 * - `{ id: 'main-board', kind: 'primary' }`
 */
function createWidgetHintRecord(definition: GameletWidgetDefinition): HostDataRecord {
  return {
    id: definition.id,
    kind: definition.kind,
  }
}

/**
 * Normalizes one gamelet definition into binding config stored in `kit.gamelet`.
 *
 * Before:
 * - Friendly authoring fields that may include optional properties and typed helper objects
 *
 * After:
 * - A plain `HostDataRecord` with only host-safe values and no `undefined` properties
 */
function buildModuleConfig<TDefaults extends HostDataRecord>(definition: GameletDefinition<TDefaults>): HostDataRecord {
  return {
    title: definition.title,
    entrypoint: definition.entrypoint,
    widgets: (definition.widgets ?? []).map(createWidgetHintRecord),
    widget: {
      mount: 'iframe',
      iframe: {
        assetPath: definition.entrypoint,
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
      },
      windowSize: {
        width: 980,
        height: 840,
        minWidth: 640,
        minHeight: 640,
      },
    },
    ...(definition.config
      ? {
          config: {
            defaults: definition.config.defaults ?? {},
          },
        }
      : {}),
  }
}

/**
 * Registers a tamagotchi gamelet through the low-level kit/binding APIs.
 *
 * Use when:
 * - A plugin targets stage-tamagotchi and wants one-step gamelet registration
 *
 * Expects:
 * - The host exposes the `kit.gamelet` kit through `ctx.apis.kits`
 *
 * Returns:
 * - A handle that reports whether the host supports the gamelet kit
 */
export async function defineGamelet<TDefaults extends HostDataRecord = HostDataRecord>(
  ctx: Pick<ContextInit, 'apis'>,
  definition: GameletDefinition<TDefaults>,
): Promise<DefinedGamelet> {
  const kits = await ctx.apis.kits.list()
  const supported = kits.some(kit => kit.kitId === 'kit.gamelet')

  if (!supported) {
    return {
      id: definition.id,
      async isSupported() {
        return false
      },
    }
  }

  const existingModules = await ctx.apis.bindings.list()
  const existingModule = existingModules.find(module => module.moduleId === definition.id)
  const config = buildModuleConfig(definition)

  if (!existingModule) {
    await ctx.apis.bindings.announce({
      moduleId: definition.id,
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      config,
    })
  }
  else {
    await ctx.apis.bindings.update({
      moduleId: definition.id,
      config,
    })
  }

  await ctx.apis.bindings.activate({
    moduleId: definition.id,
  })

  return {
    id: definition.id,
    async isSupported() {
      return true
    },
  }
}
