import type { Logg } from '@guiiai/logg'
import type { Neuri } from 'neuri'

import type { EventBus, RuleEngine } from './os'

import { useLogg } from '@guiiai/logg'
import { asClass, asFunction, createContainer, InjectionMode } from 'awilix'

import { ActionAgentImpl } from '../agents/action'
import { ChatAgentImpl } from '../agents/chat'
import { PlanningAgentImpl } from '../agents/planning'
import { TaskExecutor } from './action/task-executor'
import { Brain } from './conscious/brain'
import { createEventBus, createRuleEngine } from './os'
import { PerceptionPipeline } from './perception/pipeline'
import { ReflexManager } from './reflex/reflex-manager'

export interface ContainerServices {
  logger: Logg
  eventBus: EventBus
  ruleEngine: RuleEngine
  actionAgent: ActionAgentImpl
  planningAgent: PlanningAgentImpl
  chatAgent: ChatAgentImpl
  neuri: Neuri
  perceptionPipeline: PerceptionPipeline
  taskExecutor: TaskExecutor
  brain: Brain
  reflexManager: ReflexManager
}

export function createAgentContainer(options: {
  neuri: Neuri
  model?: string
}) {
  const container = createContainer<ContainerServices>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  // Register services
  container.register({
    // Create independent logger for each agent
    logger: asFunction(() => useLogg('agent').useGlobalConfig()).singleton(),

    // Register neuri client
    neuri: asFunction(() => options.neuri).singleton(),

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
          rulesDir: new URL('./rules', import.meta.url).pathname,
          slotMs: 20,
        },
      })
      engine.init()
      return engine
    }).singleton(),

    // Register agents
    actionAgent: asClass(ActionAgentImpl)
      .singleton()
      .inject(() => ({
        id: 'action',
        type: 'action' as const,
      })),

    planningAgent: asClass(PlanningAgentImpl)
      .singleton()
      .inject(() => ({
        id: 'planning',
        type: 'planning' as const,
        llm: {
          agent: options.neuri,
          model: options.model,
        },
      })),

    chatAgent: asClass(ChatAgentImpl)
      .singleton()
      .inject(() => ({
        id: 'chat',
        type: 'chat' as const,
        llm: {
          agent: options.neuri,
          model: options.model,
        },
        maxHistoryLength: 50,
        idleTimeout: 5 * 60 * 1000, // 5 minutes
      })),

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
