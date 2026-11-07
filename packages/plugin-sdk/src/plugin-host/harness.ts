import type { Container, OwnerRecord } from 'injeca'

import type { HarnessHookEvent, HarnessHookHandler, HarnessHookOptions, HarnessKitClient, HarnessTurnContext } from '../harness'
import type { KitRef } from '../kit'

import { errorMessageFrom } from '@moeru/std'
import { listeners } from 'injeca'

import { harnessEventKey, harnessKitId, harnessKitVersion } from '../harness'
import { defineKit } from '../kit'

/**
 * Creates the Host side of the reference harness Kit.
 *
 * `hooks.on` registers the listener with injeca `listen` on the consumer container, so the plugin owns it.
 * Register it with `host.provideKit({ api: createHarnessKit() })`.
 */
export function createHarnessKit(): KitRef<HarnessKitClient> {
  return defineKit({
    id: harnessKitId,
    version: harnessKitVersion,
    createClient: runtime => ({
      hooks: {
        on: async (event: HarnessHookEvent, handler: HarnessHookHandler, options: HarnessHookOptions = {}) => {
          if (!runtime.listen)
            throw new Error('The harness Kit needs a Host that supports listeners.')
          const remove = runtime.listen(harnessEventKey(event), handler, {
            priority: options.priority ?? 0,
            timeoutMs: options.timeoutMs,
            extensionId: runtime.extensionId,
          })
          runtime.subscriptions.add({ dispose: remove })
          return { dispose: async () => remove() }
        },
      },
    }),
  })
}

/** How one listener ran. */
export interface HarnessHookRun {
  readonly owner: OwnerRecord
  readonly priority: number
  readonly outcome: 'changed' | 'unchanged' | 'timeout' | 'error'
  readonly durationMs: number
  readonly error?: string
}

/** The result of one hook run. */
export interface HarnessHookResult {
  readonly context: HarnessTurnContext
  readonly runs: readonly HarnessHookRun[]
}

/** The options of {@link runHarnessHooks}. */
export interface HarnessRunOptions {
  /** The time that the runner waits for each listener without its own timeout. @default 1_000 */
  timeoutMs?: number
}

const timedOut = Symbol('timed-out')

/**
 * Runs the listeners of one hook event in priority order. A higher priority runs first. Listeners with one priority run in registration order.
 *
 * Each listener gets the context that the listener before it returned. A listener that times out or throws is skipped, and its context change is lost.
 *
 * @param container The plugin host container, so that the runner sees the listeners of all plugins.
 */
export async function runHarnessHooks(
  container: Container,
  event: HarnessHookEvent,
  context: HarnessTurnContext,
  options: HarnessRunOptions = {},
): Promise<HarnessHookResult> {
  const entries = listeners<HarnessHookHandler>(container, harnessEventKey(event))
    .map((entry, index) => ({ entry, index, priority: Number(entry.metadata.priority ?? 0) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)

  let current = structuredClone(context)
  const runs: HarnessHookRun[] = []
  for (const { entry, priority } of entries) {
    const timeoutMs = typeof entry.metadata.timeoutMs === 'number' ? entry.metadata.timeoutMs : options.timeoutMs ?? 1_000
    const startedAt = performance.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        Promise.resolve(entry.handler(structuredClone(current))),
        new Promise<typeof timedOut>((resolveTimeout) => {
          timer = setTimeout(resolveTimeout, timeoutMs, timedOut)
        }),
      ])
      const durationMs = performance.now() - startedAt
      if (result === timedOut) {
        runs.push({ owner: entry.owner, priority, outcome: 'timeout', durationMs })
        continue
      }
      if (result) {
        current = result
        runs.push({ owner: entry.owner, priority, outcome: 'changed', durationMs })
      }
      else {
        runs.push({ owner: entry.owner, priority, outcome: 'unchanged', durationMs })
      }
    }
    catch (error) {
      runs.push({ owner: entry.owner, priority, outcome: 'error', durationMs: performance.now() - startedAt, error: errorMessageFrom(error) ?? 'unknown error' })
    }
    finally {
      clearTimeout(timer)
    }
  }
  return { context: current, runs }
}
