import type { SingingJob } from '../../types/job'
import type { JobQueue } from './job-queue.interface'

/**
 * Queue adapter that delegates to an external queue implementation.
 * Used when the singing module runs as part of the Airi server
 * and needs to bridge to the server's own job management.
 */
export class ServerQueueAdapter implements JobQueue {
  constructor(private readonly delegate: JobQueue) {}

  async enqueue(job: SingingJob): Promise<void> {
    return this.delegate.enqueue(job)
  }

  async dequeue(): Promise<SingingJob | null> {
    return this.delegate.dequeue()
  }

  async getJob(jobId: string): Promise<SingingJob | null> {
    return this.delegate.getJob(jobId)
  }

  async updateJob(jobId: string, update: Partial<SingingJob>): Promise<void> {
    return this.delegate.updateJob(jobId, update)
  }

  async listJobs(status?: SingingJob['status']): Promise<SingingJob[]> {
    return this.delegate.listJobs(status)
  }
}
