import type { JobQueue } from '../adapters/queue/job-queue.interface'

/**
 * TS-side worker for executing singing jobs.
 */
export interface SingingJobWorker {
  processNext: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Create a singing job worker that polls the queue and executes jobs.
 */
export function createSingingJobWorker(
  queue: JobQueue,
  onExecute: (jobId: string, payload: unknown) => Promise<void>,
): SingingJobWorker {
  let running = true

  return {
    async processNext() {
      if (!running)
        return
      const job = await queue.dequeue()
      if (!job)
        return

      await queue.updateJob(job.id, { status: 'running', updatedAt: new Date().toISOString() })
      try {
        await onExecute(job.id, job.payload)
        await queue.updateJob(job.id, { status: 'completed', updatedAt: new Date().toISOString() })
      }
      catch (error) {
        await queue.updateJob(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        })
      }
    },

    async stop() {
      running = false
    },
  }
}
