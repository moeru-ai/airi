import type { Logg } from '@guiiai/logg'

import type { EventBus } from './os'
import type { RuleEngine } from './perception/rules'

import { useLogg } from '@guiiai/logg'
import { asClass, asFunction, createContainer, InjectionMode } from 'awilix'

import { ActionRegistry } from './action/action-registry'
import { TaskExecutor } from './action/task-executor'
import { Brain } from './conscious/brain'
import { createEventBus } from './os'
import { PerceptionPipeline } from './perception/pipeline'
import { createRuleEngine } from './perception/rules'
import { ReflexManager } from './reflex/reflex-manager'
import { StubChatAgent } from './stub-agents'

export interface ContainerServices {
  logger: Logg
  eventBus: EventBus
  ruleEngine: RuleEngine
  actionRegistry: ActionRegistry
  chatAgent: StubChatAgent
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

    // Register action registry (replaces deprecated actionAgent)
    actionRegistry: asClass(ActionRegistry).singleton(),
    chatAgent: asClass(StubChatAgent).singleton(),

    perceptionPipeline: asClass(PerceptionPipeline).singleton(),

    taskExecutor: asClass(TaskExecutor).singleton(),

    brain: asClass(Brain)
      .singleton()
      .inject((c) => {
        return {
          eventBus: c.resolve('eventBus'),
          reflexManager: c.resolve('reflexManager'),
        }
      }),

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
