import type { Client } from '@proj-airi/server-sdk'

import { fileURLToPath } from 'node:url'

import { useLogg } from '@guiiai/logg'
import { pick } from 'es-toolkit'
import { createContainer, provide, resolve } from 'injeca'

import { AiriBridge } from '../airi/airi-bridge'
import { MinecraftContextService } from '../airi/minecraft-context-service'
import { config } from '../composables/config'
import { TaskExecutor } from './action/task-executor'
import { Brain } from './conscious/brain'
import { LLMAgent } from './conscious/llm-agent'
import { createEventBus } from './event-bus'
import { PerceptionPipeline } from './perception/pipeline'
import { createRuleEngine } from './perception/rules'
import { ReflexManager } from './reflex/reflex-manager'

/**
 * Wires the services of one agent. Each service is built on its first `resolve` and then cached,
 * so a caller decides when a service starts, for example the rule engine after the bot spawns.
 */
export function createAgentContainer(airiClient: Client) {
  // The agent logs its own startup. The container writes no lifecycle logs, as before the move to injeca. It still writes the injeca warnings.
  const container = createContainer()

  // Create independent logger for each agent
  const logger = provide(container, 'logger', () => useLogg('agent').useGlobalConfig())

  // Register EventBus (cognitive event core)
  const eventBus = provide(container, 'eventBus', {
    dependsOn: { logger },
    build: ({ dependsOn }) => createEventBus({
      onSubscriberError: ({ event, pattern, error }) => {
        dependsOn.logger
          .withFields({
            eventType: event.type,
            eventId: event.id,
            traceId: event.traceId,
            parentId: event.parentId,
            pattern,
          })
          .errorWithError('EventBus subscriber failed', error)
      },
    }),
  })

  const airiBridge = provide(container, 'airiBridge', {
    dependsOn: { eventBus },
    build: ({ dependsOn }) => new AiriBridge(airiClient, dependsOn.eventBus),
  })

  const minecraftContextService = provide(container, 'minecraftContextService', {
    dependsOn: { airiBridge },
    build: ({ dependsOn }) => new MinecraftContextService({
      airiBridge: dependsOn.airiBridge,
      serverHost: config.bot.host,
      serverPort: config.bot.port,
      masterUsername: config.bot.masterUsername,
    }),
  })

  // Register LLM Agent (xsai-based)
  const llmAgent = provide(container, 'llmAgent', () => new LLMAgent({
    baseURL: config.openai.baseUrl,
    apiKey: config.openai.apiKey,
    model: config.openai.model,
  }))

  // Register RuleEngine (YAML rules processing)
  const ruleEngine = provide(container, 'ruleEngine', {
    dependsOn: { eventBus },
    build: ({ dependsOn }) => {
      const engine = createRuleEngine({
        eventBus: dependsOn.eventBus,
        logger: useLogg('ruleEngine').useGlobalConfig(),
        config: {
          // NOTICE: Use fileURLToPath, not URL.pathname — on Windows `.pathname` yields
          // "/D:/.../rules" (leading slash before the drive), which fs.existsSync/readdirSync cannot
          // resolve, so the rule loader silently found 0 rules and the whole perception rule engine
          // (damage/punch/movement signals) was dead. The rest of the codebase already uses
          // fileURLToPath; this line was the lone deviation.
          rulesDir: fileURLToPath(new URL('./perception/rules', import.meta.url)),
          slotMs: 20,
        },
      })
      engine.init()
      return engine
    },
  })

  const perceptionPipeline = provide(container, 'perceptionPipeline', {
    dependsOn: { eventBus, logger },
    build: ({ dependsOn }) => new PerceptionPipeline(dependsOn),
  })

  // TaskExecutor with logger injection only
  const taskExecutor = provide(container, 'taskExecutor', {
    dependsOn: { logger },
    build: ({ dependsOn }) => new TaskExecutor(dependsOn),
  })

  // Reflex Manager (Reactive Layer)
  const reflexManager = provide(container, 'reflexManager', {
    dependsOn: { eventBus, taskExecutor, logger },
    build: ({ dependsOn }) => new ReflexManager(dependsOn),
  })

  const brain = provide(container, 'brain', {
    dependsOn: { eventBus, llmAgent, reflexManager, taskExecutor, logger, airiBridge, minecraftContextService },
    build: ({ dependsOn }) => new Brain(dependsOn),
  })

  const services = { logger, eventBus, ruleEngine, llmAgent, perceptionPipeline, taskExecutor, brain, reflexManager, airiBridge, minecraftContextService }

  return {
    /** Builds the named services that are not built yet, and resolves to all of them. */
    resolve: <Name extends keyof typeof services>(...names: Name[]) => resolve(container, pick(services, names)),
  }
}
