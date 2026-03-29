/**
 * [singing] Job queue wrapper for the singing module.
 * Manages job lifecycle within the server process.
 */
export interface SingingQueue {
  enqueue: (jobId: string, payload: unknown) => Promise<void>
  getStatus: (jobId: string) => Promise<{ status: string, progress?: number } | null>
  cancel: (jobId: string) => Promise<boolean>
}

/**
 * [singing] Create an in-memory singing job queue (development/first version).
 */
export function createSingingQueue(): SingingQueue {
  const jobs = new Map<string, { status: string, progress?: number }>()

  return {
    async enqueue(jobId, _payload) {
      jobs.set(jobId, { status: 'pending' })
    },
    async getStatus(jobId) {
      return jobs.get(jobId) ?? null
    },
    async cancel(jobId) {
      const job = jobs.get(jobId)
      if (job && job.status !== 'completed') {
        job.status = 'cancelled'
        return true
      }
      return false
    },
  }
}
