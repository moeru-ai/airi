import { Semaphore } from 'es-toolkit'

/** Waits for a slot. A cancelled wait leaves the queue at once and passes its slot on. */
async function waitForSlot(slots: Semaphore, abortSignal?: AbortSignal) {
  abortSignal?.throwIfAborted()
  const acquired = slots.acquire()
  if (!abortSignal)
    return await acquired

  let rejectAborted: (reason: unknown) => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject
  })
  const onAbort = () => rejectAborted(abortSignal.reason)
  abortSignal.addEventListener('abort', onAbort, { once: true })
  try {
    await Promise.race([acquired, aborted])
  }
  catch (error) {
    // The slot still arrives later. Pass it on to the next read.
    void acquired.then(() => slots.release())
    throw error
  }
  finally {
    abortSignal.removeEventListener('abort', onAbort)
  }
}

/**
 * Queues the image reads of one window for each vision provider.
 *
 * A provider answers only its declared number of reads at once. A read beyond
 * that waits here, before its timeout starts, instead of inside the provider.
 *
 * State: one semaphore for each provider id, created by the first read with the
 * limit of that provider. The queue lives as long as its window and needs no
 * dispose, because a semaphore holds no resource.
 *
 * NOTICE:
 * Each window has its own queue, so reads from two windows can reach one
 * provider at once, for example the screen ticker in devtools and a chat image.
 * Root cause: renderer windows share no memory, and the read timeout runs in
 * the renderer that starts the read.
 * Source: review of https://github.com/moeru-ai/airi/pull/2734.
 * Remove this note when the main process queues the reads of each provider and
 * starts the timeout itself.
 */
export class VisionReadQueue {
  private readonly slotsByProvider = new Map<string, Semaphore>()

  /**
   * Waits for a read slot of a provider.
   *
   * @returns A function that releases the slot. Call it once when the read ends.
   */
  async acquire(providerId: string, concurrentReads: number, abortSignal?: AbortSignal): Promise<() => void> {
    let slots = this.slotsByProvider.get(providerId)
    if (!slots) {
      slots = new Semaphore(concurrentReads)
      this.slotsByProvider.set(providerId, slots)
    }
    await waitForSlot(slots, abortSignal)
    const acquired = slots
    return () => acquired.release()
  }
}
