import type { Logg } from '@guiiai/logg'

import type { EventBus } from './os'
import type { RuleEngine } from './perception/rules'

import { useLogg } from '@guiiai/logg'
import { asClass, asFunction, createContainer, InjectionMode } from 'awilix'

import { config } from '../composables/config'
import { TaskExecutor } from './action/task-executor'
import { Brain } from './conscious/brain'
import { LLMAgent } from './conscious/llm-agent'
import { createEventBus } from './os'
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
}

export function createAgentContainer() {
  const container = createContainer<ContainerServices>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  // Register services
  container.register({
    // Create independent logger for each agent
    logger: asFunction(() => useLogg('agent').useGlobalConfig()).singleton(),

    // Register LLM Agent (xsai-based)
    llmAgent: asFunction(() => new LLMAgent({
      baseURL: config.openai.baseUrl,
      apiKey: config.openai.apiKey,
      model: config.openai.model,
    })).singleton(),

    // Register EventBus (Cognitive OS core)
    eventBus: asFunction(() =>
      createEventBus({
        logger: useLogg('eventBus').useGlobalConfig(),
        config: { historySize: 10000 },
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
      })),

    // Reflex Manager (Reactive Layer)
    reflexManager: asFunction(({ eventBus, perceptionPipeline, taskExecutor, logger }) =>
      new ReflexManager({
        eventBus,
        perception: perceptionPipeline.getPerceptionAPI(),
        taskExecutor,
        logger,
      }),
    ).singleton(),
  })

  return container
}
