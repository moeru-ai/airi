import { AsyncLocalStorage } from 'node:async_hooks'

interface CleanupFrame {
  readonly session: object
  readonly parent?: CleanupFrame
  active: boolean
}

// One process-lifetime context tracks nested cleanup across Hosts. Session objects isolate equal session IDs in different Hosts.
const cleanupFrames = new AsyncLocalStorage<CleanupFrame>()

/** Runs cleanup with its active ancestors visible across native asynchronous operations. Completed frames cannot block detached descendants. */
export async function runCleanup(session: object, cleanup: () => Promise<void>): Promise<void> {
  const frame: CleanupFrame = { session, parent: cleanupFrames.getStore(), active: true }
  try {
    await cleanupFrames.run(frame, cleanup)
  }
  finally {
    frame.active = false
  }
}

/** Returns whether this asynchronous call descends from active cleanup of the exact session object. */
export function isCleanupActive(session: object): boolean {
  for (let frame = cleanupFrames.getStore(); frame; frame = frame.parent) {
    if (frame.active && frame.session === session) {
      return true
    }
  }
  return false
}
