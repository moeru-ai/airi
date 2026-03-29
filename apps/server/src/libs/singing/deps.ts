/**
 * [singing] Dependency wiring for the singing module.
 * Creates and connects singing service components.
 */
import { InMemoryQueue, resolveRuntimeEnv } from '@proj-airi/singing'
import { createSingingService } from '../../services/singing/singing-service'
import { createSingingStorage } from '../../services/singing/singing-storage'

export type { SingingService } from '../../services/singing/singing-service'

/**
 * [singing] Create all singing module dependencies with shared queue and storage.
 * All components share the same tempDir from resolveRuntimeEnv().
 */
export function createSingingDeps() {
  const env = resolveRuntimeEnv()
  const queue = new InMemoryQueue()
  const storage = createSingingStorage(env.tempDir)
  const service = createSingingService({ queue })

  return { service, queue, storage }
}
