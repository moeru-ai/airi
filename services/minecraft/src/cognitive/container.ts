import type { Logg } from '@guiiai/logg'
import type { Client } from '@proj-airi/server-sdk'

import type { AiriBridge } from '../airi/airi-bridge'
import type { MinecraftContextService } from '../airi/minecraft-context-service'
import type { EventBus } from './event-bus'
import type { RuleEngine } from './perception/rules'

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
  logger: Logg
  eventBus: EventBus
  ruleEngine: RuleEngine
  llmAgent: LLMAgent
  perceptionPipeline: PerceptionPipeline
  taskExecutor: TaskExecutor
  brain: Brain
  reflexManager: ReflexManager
  airiClient: Client
  airiBridge: AiriBridge
  minecraftContextService: MinecraftContextService
}

export function createAgentContainer(airiClient: Client) {
  const container = createContainer<ContainerServices>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  // Register services
  container.register({
    airiClient: asValue(airiClient),

    airiBridge: asFunction(({ eventBus }: { eventBus: EventBus }) =>
      new AiriBridgeImpl(airiClient, eventBus),
    ).singleton(),

    minecraftContextService: asFunction(({ airiBridge }) =>
      new MinecraftContextServiceImpl({
        airiBridge,
        serverHost: config.bot.host,
        serverPort: config.bot.port,
      }),
    ).singleton(),

    // Create independent logger for each agent
    logger: asFunction(() => useLogg('agent').useGlobalConfig()).singleton(),

    // Register LLM Agent (xsai-based)
    llmAgent: asFunction(() => new LLMAgent({
      baseURL: config.openai.baseUrl,
      apiKey: config.openai.apiKey,
      model: config.openai.model,
    })).singleton(),

    // Register EventBus (cognitive event core)
    eventBus: asFunction(({ logger }) =>
      createEventBus({
        onSubscriberError: ({ event, pattern, error }) => {
          logger
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
    ).singleton(),

    // Register RuleEngine (YAML rules processing)
    ruleEngine: asFunction(({ eventBus }) => {
      const engine = createRuleEngine({
        eventBus,
        logger: useLogg('ruleEngine').useGlobalConfig(),
        config: {
          rulesDir: new URL('./perception/rules', import.meta.url).pathname,
          slotMs: 20,
        },
      })
      engine.init()
      return engine
    }).singleton(),

    perceptionPipeline: asClass(PerceptionPipeline).singleton(),

    // TaskExecutor with logger injection only
    taskExecutor: asFunction(({ logger }) =>
      new TaskExecutor({ logger }),
    ).singleton(),

    brain: asClass(Brain)
      .singleton()
      .inject(c => ({
        eventBus: c.resolve('eventBus'),
        llmAgent: c.resolve('llmAgent'),
        reflexManager: c.resolve('reflexManager'),
        taskExecutor: c.resolve('taskExecutor'),
        logger: c.resolve('logger'),
        airiBridge: c.resolve('airiBridge'),
        minecraftContextService: c.resolve('minecraftContextService'),
      })),

    // Reflex Manager (Reactive Layer)
    reflexManager: asFunction(({ eventBus, taskExecutor, logger }) =>
      new ReflexManager({
        eventBus,
        taskExecutor,
        logger,
      }),
    ).singleton(),
  })

  return container
}
