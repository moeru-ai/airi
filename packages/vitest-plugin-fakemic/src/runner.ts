import type { RunnerTestCase } from 'vitest'

import { TestRunner } from 'vitest'

interface FakemicTaskExecution {
  run: (task: RunnerTestCase, invokeHandler: () => Promise<void>) => Promise<void>
}

const registryKey = Symbol.for('airi.vitest-plugin-fakemic.executions')
const registryHost = globalThis as typeof globalThis & Record<typeof registryKey, WeakMap<RunnerTestCase, FakemicTaskExecution> | undefined>
const fakemicTaskExecutions = registryHost[registryKey] ??= new WeakMap()

/**
 * Runs package-owned audio tasks and delegates normal tasks to Vitest.
 *
 * Call stack:
 *
 * FakemicVitestRunner.runTask
 *   -> fakemic task execution
 *     -> {@link TestRunner.getTestFn}
 */
export default class FakemicVitestRunner extends TestRunner {
  async runTask(task: RunnerTestCase): Promise<void> {
    const handler = TestRunner.getTestFn(task)
    if (!handler)
      throw new Error(`Vitest did not collect a handler for "${task.name}"`)

    const execution = fakemicTaskExecutions.get(task)
    if (!execution) {
      await handler()
      return
    }

    await execution.run(task, async () => {
      await handler()
    })
  }
}
