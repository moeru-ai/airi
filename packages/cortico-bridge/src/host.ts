// The `cortico/*` specifier prefix is mapped to vendor/cortico/src/* by the
// framework resolver, which must be registered before those modules load.
import '../../../vendor/cortico/src/extensions/runtime.ts'

import type { Bot, BotDefinition } from 'cortico/bot.ts'
import type { ResponseClient } from 'cortico/core/generation.ts'
import type { World } from 'cortico/core/types.ts'

import { createBot } from 'cortico/bot.ts'
import { loadDeployment } from 'cortico/deploy.ts'
import { withWorlds } from 'cortico/world.ts'
import { QQ } from 'cortico/worlds/qq/definition.ts'
import { TERMINAL } from 'cortico/worlds/terminal/definition.ts'
import { WEBSEARCH } from 'cortico/worlds/websearch/definition.ts'

import soulmateDefinition, { build as buildSoulmate, type BotConfig } from '../../../vendor/cortico/bots/corti-soulmate/index.ts'
import { AiriChatCompletionsClient } from './airi-llm.ts'
import { createFakeLlm } from './fake-llm.ts'
import { AiriWorld } from './world/world.ts'

const CORTICO_ROOT = new URL('../../../vendor/cortico/', import.meta.url).pathname

export interface BridgeOptions {
  /** Deployment directory holding config.json, .env, memory/, data/. */
  deploymentDir: string
  /** WebSocket port for stage clients. */
  port: number
  /** Inject a deterministic fake LLM instead of a configured provider. */
  fakeLlm?: boolean
}

export interface Bridge {
  bot: Bot<BotConfig>
  world: AiriWorld
  stop: () => Promise<void>
}

/**
 * Assembles corti-soulmate with the AIRI stage world. The persona, memory,
 * event bus, and LLM loop all live inside Cortico Core; this bridge only
 * provides the stage-facing World and (optionally) a fake LLM.
 */
export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const definition: BotDefinition<BotConfig> = withWorlds(soulmateDefinition, [TERMINAL, WEBSEARCH, QQ])
  const loaded = loadDeployment(definition, options.deploymentDir, CORTICO_ROOT)

  // The stage pushes its active provider over the socket; generation goes
  // through this client so AIRI settings stay the single source of truth.
  const airiLlm = new AiriChatCompletionsClient()
  const world = new AiriWorld({
    port: options.port,
    botName: loaded.config.displayName,
    timezone: loaded.config.timezone,
    onProvider: (config) => {
      airiLlm.configure(config)
      // Keep the deployment's active model label in sync for modelFacts.
      const active = loaded.config.activeProvider
      const entry = active ? loaded.config.providers[active] : undefined
      if (entry?.spec && config)
        entry.spec.model = config.model
    },
  })
  const llm: ResponseClient = options.fakeLlm ? createFakeLlm() : airiLlm

  const bot = createBot(loaded, {
    ...definition,
    build: (l, worlds) => {
      const parts = buildSoulmate(l, worlds)
      const prebuilt: World[] = [world, ...(parts.worlds ?? [])]
      return { ...parts, worlds: prebuilt, llm }
    },
  })

  await bot.start()
  return { bot, world, stop: () => bot.shutdown('bridge stop').then(() => undefined) }
}
