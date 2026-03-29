import type { SingingJob } from '../../types/job'

/**
 * Interface for the job queue used by the orchestrator.
 */
export interface JobQueue {
  enqueue: (job: SingingJob) => Promise<void>
  dequeue: () => Promise<SingingJob | null>
  getJob: (jobId: string) => Promise<SingingJob | null>
  updateJob: (jobId: string, update: Partial<SingingJob>) => Promise<void>
  listJobs: (status?: SingingJob['status']) => Promise<SingingJob[]>
}
