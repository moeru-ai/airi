/**
 * AIRI Core — Planner Tests
 *
 * Tests for the planner layer: PlanRegistry, PlanExecutor, plan lifecycle,
 * step dependency resolution, cancellation propagation, and event emission.
 *
 * Uses mock tasks (no real worker processes) — executors resolve immediately
 * by directly completing/failing tasks via the TaskManager.
 */

import type { CreatePlanInput, Plan, PlanStep, StepId } from '../planner/types.js'

import type { TaskExecutionContext, TaskExecutor } from '../tasks/executor.js'
import type { Task, TaskResult } from '../tasks/types.js'

import { beforeEach, describe, expect, it } from 'vitest'
import { EventBus } from '../events/bus.js'
import { createLogger } from '../logger.js'

import { PlanExecutor } from '../planner/executor.js'
import { PlanRegistry } from '../planner/registry.js'
import { createPlanId, createStepId } from '../planner/types.js'
import { TaskManager } from '../tasks/manager.js'

// ── Test helpers ─────────────────────────────────────────────────────────

function createTestEventBus(): EventBus {
  return new EventBus()
}

function createTestLogger() {
  return createLogger('test')
}

function createTestTaskManager(events: EventBus, logger: ReturnType<typeof createLogger>): TaskManager {
  return new TaskManager(events, logger, {
    maxTasks: 100,
    completedTtlMs: 60_000,
    cleanupIntervalMs: 30_000,
  })
}

function createMockExecutor(
  moduleId: string,
  executeFn: (task: Task, ctx: TaskExecutionContext) => Promise<TaskResult>,
): TaskExecutor {
  return {
    canExecute(task: Task) {
      return task.moduleId === moduleId
    },
    execute: executeFn,
  }
}

/**
 * Create a plan with the given steps.
 */
function createTestPlan(name: string, steps: PlanStep[]): Plan {
  const now = new Date().toISOString()
  return {
    id: createPlanId(crypto.randomUUID()),
    name,
    steps,
    status: 'pending',
    createdAt: now,
  }
}

/**
 * Create a plan step.
 */
function createTestStep(
  name: string,
  action: string,
  input: Record<string, unknown> = {},
  dependencyIds?: string[],
): PlanStep {
  return {
    id: createStepId(crypto.randomUUID()),
    name,
    action,
    input,
    dependencyIds: dependencyIds ? dependencyIds as StepId[] : undefined,
    status: 'pending',
  }
}

/**
 * Extract step name from task metadata.
 * The PlanExecutor stores stepId in metadata; we map it back via the step name
 * encoded in the task title: "Plan: <planName> — Step: <stepName>".
 */
function getStepNameFromTask(task: Task): string {
  const title = task.title
  const match = title.match(/Step: (.+)$/)
  return match ? match[1] : title
}

// ── Plan Registry tests ──────────────────────────────────────────────────

describe('planRegistry', () => {
  let registry: PlanRegistry

  beforeEach(() => {
    registry = new PlanRegistry()
  })

  describe('register', () => {
    it('registers a plan', () => {
      const plan = createTestPlan('test-plan', [])
      registry.register(plan)
      expect(registry.size).toBe(1)
    })

    it('throws on duplicate ID', () => {
      const plan = createTestPlan('test-plan', [])
      registry.register(plan)
      expect(() => registry.register(plan)).toThrow('Plan already registered')
    })
  })

  describe('get', () => {
    it('retrieves a plan by ID', () => {
      const plan = createTestPlan('test-plan', [])
      registry.register(plan)
      const retrieved = registry.get(plan.id as string)
      expect(retrieved).toBeDefined()
      expect(retrieved!.name).toBe('test-plan')
    })

    it('returns undefined for unknown ID', () => {
      const result = registry.get('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('list', () => {
    it('lists all plans', () => {
      const plan1 = createTestPlan('plan-1', [])
      const plan2 = createTestPlan('plan-2', [])
      registry.register(plan1)
      registry.register(plan2)
      expect(registry.list()).toHaveLength(2)
    })

    it('filters by status', () => {
      const plan1 = createTestPlan('plan-1', [])
			;(plan1 as { status: string }).status = 'running'
      const plan2 = createTestPlan('plan-2', [])
			;(plan2 as { status: string }).status = 'completed'
      registry.register(plan1)
      registry.register(plan2)

      const running = registry.list({ status: 'running' })
      expect(running).toHaveLength(1)
      expect(running[0].name).toBe('plan-1')
    })

    it('filters by name', () => {
      const plan1 = createTestPlan('alpha', [])
      const plan2 = createTestPlan('beta', [])
      registry.register(plan1)
      registry.register(plan2)

      const filtered = registry.list({ name: 'alpha' })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('alpha')
    })
  })

  describe('update', () => {
    it('updates a plan', () => {
      const plan = createTestPlan('test-plan', [])
      registry.register(plan)

      const updated = { ...plan, status: 'running' as const }
      registry.update(updated)

      const retrieved = registry.get(plan.id as string)
      expect(retrieved!.status).toBe('running')
    })

    it('throws for unknown plan', () => {
      const plan = createTestPlan('test-plan', [])
      expect(() => registry.update(plan)).toThrow('Plan not found')
    })
  })

  describe('remove', () => {
    it('removes a plan', () => {
      const plan = createTestPlan('test-plan', [])
      registry.register(plan)
      expect(registry.remove(plan.id as string)).toBe(true)
      expect(registry.size).toBe(0)
    })

    it('returns false for unknown plan', () => {
      expect(registry.remove('nonexistent')).toBe(false)
    })
  })

  describe('getByStatus', () => {
    it('returns plans with the given status', () => {
      const plan1 = createTestPlan('plan-1', [])
			;(plan1 as { status: string }).status = 'completed'
      const plan2 = createTestPlan('plan-2', [])
			;(plan2 as { status: string }).status = 'completed'
      const plan3 = createTestPlan('plan-3', [])
			;(plan3 as { status: string }).status = 'failed'
      registry.register(plan1)
      registry.register(plan2)
      registry.register(plan3)

      expect(registry.getByStatus('completed')).toHaveLength(2)
      expect(registry.getByStatus('failed')).toHaveLength(1)
    })
  })

  describe('size', () => {
    it('returns the number of registered plans', () => {
      expect(registry.size).toBe(0)
      registry.register(createTestPlan('p1', []))
      expect(registry.size).toBe(1)
      registry.register(createTestPlan('p2', []))
      expect(registry.size).toBe(2)
    })
  })
})

// ── Plan Executor tests ──────────────────────────────────────────────────

describe('planExecutor', () => {
  let events: EventBus
  let logger: ReturnType<typeof createLogger>
  let taskManager: TaskManager
  let executor: PlanExecutor

  beforeEach(() => {
    events = createTestEventBus()
    logger = createTestLogger()
    taskManager = createTestTaskManager(events, logger)
    executor = new PlanExecutor(taskManager, events, logger, {
      concurrency: 2,
      defaultStepTimeoutMs: 5_000,
    })
    taskManager.start()
  })

  describe('sequential step execution', () => {
    it('executes a plan with 3 sequential steps', async () => {
      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        return { success: true }
      }))

      const step1 = createTestStep('step-1', 'action_a')
      const step2 = createTestStep('step-2', 'action_b')
      const step3 = createTestStep('step-3', 'action_c')

      step2.dependencyIds = [step1.id]
      step3.dependencyIds = [step2.id]

      const plan = createTestPlan('sequential-plan', [step1, step2, step3])
      const result = await executor.executePlan(plan)

      expect(result.status).toBe('completed')
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].status).toBe('completed')
      expect(result.steps[1].status).toBe('completed')
      expect(result.steps[2].status).toBe('completed')
    })

    it('respects step dependencies', async () => {
      const executionOrder: string[] = []

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        const stepName = getStepNameFromTask(_task)
        executionOrder.push(stepName)

        return { success: true }
      }))

      const step1 = createTestStep('first', 'action_a')
      const step2 = createTestStep('second', 'action_b', {}, [step1.id as string])

      const plan = createTestPlan('dep-plan', [step1, step2])
      await executor.executePlan(plan)

      // step1 must execute before step2.
      expect(executionOrder.indexOf('first')).toBeLessThan(executionOrder.indexOf('second'))
    })
  })

  describe('parallel step execution', () => {
    it('executes independent steps in parallel', async () => {
      const startTimes: Record<string, number> = {}

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        const stepName = getStepNameFromTask(_task)
        startTimes[stepName] = Date.now()

        // Simulate some async work.
        await new Promise(r => setTimeout(r, 20))

        return { success: true }
      }))

      const step1 = createTestStep('parallel-1', 'action_a')
      const step2 = createTestStep('parallel-2', 'action_b')

      const plan = createTestPlan('parallel-plan', [step1, step2])
      const result = await executor.executePlan(plan)

      expect(result.status).toBe('completed')
      expect(result.steps[0].status).toBe('completed')
      expect(result.steps[1].status).toBe('completed')

      // Both steps should have started near each other.
      const timeDiff = Math.abs((startTimes['parallel-1'] ?? 0) - (startTimes['parallel-2'] ?? 0))
      expect(timeDiff).toBeLessThan(200)
    })

    it('respects concurrency limit', async () => {
      let concurrentCount = 0
      let maxConcurrent = 0

      // Use a small delay to allow concurrency tracking.
      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        concurrentCount++
        maxConcurrent = Math.max(maxConcurrent, concurrentCount)

        // Small delay to allow overlap.
        await new Promise(r => setTimeout(r, 30))

        concurrentCount--

        return { success: true }
      }))

      const steps = [
        createTestStep('s1', 'a'),
        createTestStep('s2', 'a'),
        createTestStep('s3', 'a'),
        createTestStep('s4', 'a'),
      ]

      const plan = createTestPlan('concurrency-plan', steps)
      await executor.executePlan(plan)

      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })
  })

  describe('plan cancellation', () => {
    it('cancels a plan mid-step', async () => {
      let stepStarted = false
      let cancelResolve: (() => void) | undefined
      const cancelPromise = new Promise<void>((r) => { cancelResolve = r })

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, ctx) => {
        stepStarted = true

        // Wait for cancellation.
        await cancelPromise

        // After cancellation, the token should be cancelled.
        ctx.token.throwIfCancelled()
        return { success: true }
      }))

      const step1 = createTestStep('slow-step', 'slow_action')
      const plan = createTestPlan('cancel-plan', [step1])

      // Start execution.
      const execPromise = executor.executePlan(plan)

      // Wait for the step to start.
      await new Promise(r => setTimeout(r, 30))
      expect(stepStarted).toBe(true)

      // Cancel the plan.
      const cancelled = executor.cancelPlan(plan.id, 'User cancelled')
      expect(cancelled).toBeDefined()
      expect(cancelled!.status).toBe('cancelled')

      // Let the step complete (it will throw due to cancellation).
      cancelResolve!()

      await execPromise
    })
  })

  describe('step failure handling', () => {
    it('fails the plan when a step fails', async () => {
      let callCount = 0

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        callCount++

        if (callCount === 2) {
          // Second step fails.
          throw new Error('Step 2 failed')
        }

        return { success: true }
      }))

      const step1 = createTestStep('ok-step', 'action_a')
      const step2 = createTestStep('fail-step', 'action_b')
      const step3 = createTestStep('after-fail', 'action_c', {}, [step2.id as string])

      const plan = createTestPlan('fail-plan', [step1, step2, step3])
      const result = await executor.executePlan(plan)

      expect(result.status).toBe('failed')
    })
  })

  describe('event emission', () => {
    it('emits plan.started and plan.completed events', async () => {
      const emittedEvents: string[] = []

      events.on('plan.started', () => emittedEvents.push('plan.started'))
      events.on('plan.completed', () => emittedEvents.push('plan.completed'))
      events.on('step.started', () => emittedEvents.push('step.started'))
      events.on('step.completed', () => emittedEvents.push('step.completed'))

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        return { success: true }
      }))

      const step1 = createTestStep('step-1', 'action_a')
      const plan = createTestPlan('event-plan', [step1])
      await executor.executePlan(plan)

      expect(emittedEvents).toContain('plan.started')
      expect(emittedEvents).toContain('plan.completed')
      expect(emittedEvents).toContain('step.started')
      expect(emittedEvents).toContain('step.completed')
    })

    it('emits events in correct order', async () => {
      const eventOrder: string[] = []

      events.on('plan.started', () => eventOrder.push('plan.started'))
      events.on('step.started', p => eventOrder.push(`step.started:${(p as { stepName: string }).stepName}`))
      events.on('step.completed', p => eventOrder.push(`step.completed:${(p as { stepName: string }).stepName}`))
      events.on('plan.completed', () => eventOrder.push('plan.completed'))

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        return { success: true }
      }))

      const step1 = createTestStep('alpha', 'action_a')
      const step2 = createTestStep('beta', 'action_b')

      const plan = createTestPlan('order-plan', [step1, step2])
      await executor.executePlan(plan)

      expect(eventOrder[0]).toBe('plan.started')
      expect(eventOrder[eventOrder.length - 1]).toBe('plan.completed')

      for (const stepName of ['alpha', 'beta']) {
        const startIdx = eventOrder.indexOf(`step.started:${stepName}`)
        const completeIdx = eventOrder.indexOf(`step.completed:${stepName}`)
        expect(startIdx).toBeGreaterThan(-1)
        expect(completeIdx).toBeGreaterThan(-1)
        expect(startIdx).toBeLessThan(completeIdx)
      }
    })

    it('emits step.failed event on step failure', async () => {
      const failedSteps: string[] = []

      events.on('step.failed', p => failedSteps.push((p as { stepName: string }).stepName))

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        throw new Error('Intentional failure')
      }))

      const step1 = createTestStep('failing-step', 'bad_action')
      const plan = createTestPlan('fail-event-plan', [step1])
      await executor.executePlan(plan)

      expect(failedSteps).toContain('failing-step')
    })
  })

  describe('getRunningPlan', () => {
    it('returns undefined when no plan is running', () => {
      expect(executor.getRunningPlan()).toBeUndefined()
    })
  })

  describe('plan with mixed dependencies', () => {
    it('executes diamond dependency pattern correctly', async () => {
      const executionOrder: string[] = []

      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        const stepName = getStepNameFromTask(_task)
        executionOrder.push(stepName)

        return { success: true }
      }))

      const stepA = createTestStep('A', 'action_a')
      const stepB = createTestStep('B', 'action_b', {}, [stepA.id as string])
      const stepC = createTestStep('C', 'action_c', {}, [stepA.id as string])
      const stepD = createTestStep('D', 'action_d', {}, [stepB.id as string, stepC.id as string])

      const plan = createTestPlan('diamond-plan', [stepA, stepB, stepC, stepD])
      const result = await executor.executePlan(plan)

      expect(result.status).toBe('completed')

      const idxA = executionOrder.indexOf('A')
      const idxB = executionOrder.indexOf('B')
      const idxC = executionOrder.indexOf('C')
      const idxD = executionOrder.indexOf('D')

      expect(idxA).toBeGreaterThanOrEqual(0)
      expect(idxB).toBeGreaterThanOrEqual(0)
      expect(idxC).toBeGreaterThanOrEqual(0)
      expect(idxD).toBeGreaterThanOrEqual(0)
      expect(idxA).toBeLessThan(idxB)
      expect(idxA).toBeLessThan(idxC)
      expect(idxB).toBeLessThan(idxD)
      expect(idxC).toBeLessThan(idxD)
    })
  })

  describe('step timeout', () => {
    it('times out a step that exceeds its timeout', async () => {
      taskManager.registerExecutor('planner', createMockExecutor('planner', async (_task, _ctx) => {
        // Simulate a very long-running step.
        await new Promise(r => setTimeout(r, 10_000))
        return { success: true }
      }))

      const step1 = createTestStep('slow-step', 'slow_action')
			;(step1 as { timeoutMs?: number }).timeoutMs = 50 // 50ms timeout.

      const plan = createTestPlan('timeout-plan', [step1])
      const result = await executor.executePlan(plan)

      // The plan should fail due to step timeout.
      expect(result.status).toBe('failed')
    })
  })
})

// ── Plan types tests ─────────────────────────────────────────────────────

describe('plan types', () => {
  describe('createPlanId', () => {
    it('creates a branded PlanId from a raw string', () => {
      const id = createPlanId('plan-123')
      expect(id).toBe('plan-123')
    })
  })

  describe('createStepId', () => {
    it('creates a branded StepId from a raw string', () => {
      const id = createStepId('step-456')
      expect(id).toBe('step-456')
    })
  })
})

// ── Import type tests ────────────────────────────────────────────────────

describe('plan type imports', () => {
  it('exports PlanStep type', () => {
    const step: PlanStep = {
      id: createStepId('test-step'),
      name: 'test',
      action: 'test_action',
      input: {},
      status: 'pending',
    }
    expect(step.name).toBe('test')
  })

  it('exports CreatePlanInput type', () => {
    const input: CreatePlanInput = {
      name: 'test-plan',
      steps: [],
    }
    expect(input.name).toBe('test-plan')
  })
})
