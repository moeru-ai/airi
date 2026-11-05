import { randomUUID } from 'node:crypto'
import { threadId } from 'node:worker_threads'

import { defineExtension } from '../../../src/extension'
import { autoMemoryKit, fsStoreKit, memoryBackendKit } from '../kits'

/** One id for each worker, so that a scenario can tell a restart from a move. */
const instance = randomUUID()

/** S2 and S5: provides a file store and an automatic memory. The memory stores through `airi.memory-backend`. */
export default defineExtension({
  id: 'plugin-b',
  setup(ctx) {
    const files = new Map<string, string>()
    const remembered: string[] = []
    // `get` returns a client that follows the selected backend, so the provider keeps it.
    const backend = ctx.kits.get(memoryBackendKit)

    ctx.kits.provide(fsStoreKit, {
      methods: {
        write: ({ key, value }, caller) => {
          files.set(key, value)
          return { by: caller.consumerExtensionId, thread: threadId }
        },
        read: ({ key }) => ({ value: files.get(key) ?? null, thread: threadId }),
        whoami: (_input, caller) => ({ caller: caller.consumerExtensionId, thread: threadId, instance }),
      },
    })
    ctx.kits.provide(autoMemoryKit, {
      methods: {
        remember: async ({ text }, caller) => {
          remembered.push(text)
          const result = await backend.store({ text })
          return { backend: result.backend, by: caller.consumerExtensionId }
        },
        recall: () => ({ items: [...remembered] }),
      },
    })
  },
})
