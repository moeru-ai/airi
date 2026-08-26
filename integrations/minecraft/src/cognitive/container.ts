import type { Logg } from '@guiiai/logg'
import type { Client } from '@proj-airi/server-sdk'

import type { AiriBridge } from '../airi/airi-bridge'
import type { MinecraftContextService } from '../airi/minecraft-context-service'
import type { EventBus } from './event-bus'
import type { RuleEngine } from './perception/rules'

import { fileURLToPath } from 'node:url'

import { useLogg } from '@guiiai/logg'
import { asClass, asFunction, asValue, createContainer, InjectionMode } from 'awilix'

import { AiriBridge as AiriBridgeImpl } from '../airi/airi-bridge'
import { MinecraftContextService as MinecraftContextServiceImpl } from '../airi/minecraft-context-service'
import { config } from '../composables/config'
import { TaskExecutor } from './action/task-executor'
import { Brain } from './conscious/brain'
import { LLMAgent } from './conscious/llm-agent'
import { createEventBus } from './event-bus'
import { PerceptionPipeline } from './perception/pipeline'
import { createRuleEngine } from './perception/rules'
import { ReflexManager } from './reflex/reflex-manager'

export interface ContainerServices {
  airiBridge: AiriBridge
  airiClient: Client
  brain: Brain
  eventBus: EventBus
  llmAgent: LLMAgent
  logger: Logg
  minecraftContextService: MinecraftContextService
  perceptionPipeline: PerceptionPipeline
  reflexManager: ReflexManager
  ruleEngine: RuleEngine
  taskExecutor: TaskExecutor
}

export function createAgentContainer(airiClient: Client) {
  const container = createContainer<ContainerServices>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  // Register services
  container.register({
    airiBridge: asFunction(({ eventBus }: { eventBus: EventBus }) =>
      new AiriBridgeImpl(airiClient, eventBus),
    ).singleton(),

    airiClient: asValue(airiClient),

    brain: asClass(Brain)
      .singleton()
      .inject(c => ({
        airiBridge: c.resolve('airiBridge'),
        eventBus: c.resolve('eventBus'),
        llmAgent: c.resolve('llmAgent'),
        logger: c.resolve('logger'),
        minecraftContextService: c.resolve('minecraftContextService'),
        reflexManager: c.resolve('reflexManager'),
        taskExecutor: c.resolve('taskExecutor'),
      })),

    // Register EventBus (cognitive event core)
    eventBus: asFunction(({ logger }) =>
      createEventBus({
        onSubscriberError: ({ error, event, pattern }) => {
          logger
            .withFields({
              eventId: event.id,
              eventType: event.type,
              parentId: event.parentId,
              pattern,
              traceId: event.traceId,
            })
            .errorWithError('EventBus subscriber failed', error)
        },
      }),
    ).singleton(),

    // Register LLM Agent (xsai-based)
    llmAgent: asFunction(() => new LLMAgent({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseUrl,
      model: config.openai.model,
    })).singleton(),

    // Create independent logger for each agent
    logger: asFunction(() => useLogg('agent').useGlobalConfig()).singleton(),

    minecraftContextService: asFunction(({ airiBridge }) =>
      new MinecraftContextServiceImpl({
        airiBridge,
        masterUsername: config.bot.masterUsername,
        serverHost: config.bot.host,
        serverPort: config.bot.port,
      }),
    ).singleton(),

    perceptionPipeline: asClass(PerceptionPipeline).singleton(),

    // Reflex Manager (Reactive Layer)
    reflexManager: asFunction(({ eventBus, logger, taskExecutor }) =>
      new ReflexManager({
        eventBus,
        logger,
        taskExecutor,
      }),
    ).singleton(),

    // Register RuleEngine (YAML rules processing)
    ruleEngine: asFunction(({ eventBus }) => {
      const engine = createRuleEngine({
        config: {
          // NOTICE: Use fileURLToPath, not URL.pathname — on Windows `.pathname` yields
          // "/D:/.../rules" (leading slash before the drive), which fs.existsSync/readdirSync cannot
          // resolve, so the rule loader silently found 0 rules and the whole perception rule engine
          // (damage/punch/movement signals) was dead. The rest of the codebase already uses
          // fileURLToPath; this line was the lone deviation.
          rulesDir: fileURLToPath(new URL('./perception/rules', import.meta.url)),
          slotMs: 20,
        },
        eventBus,
        logger: useLogg('ruleEngine').useGlobalConfig(),
      })
      engine.init()
      return engine
    }).singleton(),

    // TaskExecutor with logger injection only
    taskExecutor: asFunction(({ logger }) =>
      new TaskExecutor({ logger }),
    ).singleton(),
  })

  return container
}
