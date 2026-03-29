import type { SingingJob } from '../../types/job'
import type { JobQueue } from './job-queue.interface'

/**
 * In-memory job queue for development and testing.
 */
export class InMemoryQueue implements JobQueue {
  private jobs = new Map<string, SingingJob>()
  private queue: string[] = []

  async enqueue(job: SingingJob): Promise<void> {
    this.jobs.set(job.id, job)
    this.queue.push(job.id)
  }

  async dequeue(): Promise<SingingJob | null> {
    const id = this.queue.shift()
    return id ? this.jobs.get(id) ?? null : null
  }

  async getJob(jobId: string): Promise<SingingJob | null> {
    return this.jobs.get(jobId) ?? null
  }

  async updateJob(jobId: string, update: Partial<SingingJob>): Promise<void> {
    const job = this.jobs.get(jobId)
    if (job) {
      Object.assign(job, update)
    }
  }

  async listJobs(status?: SingingJob['status']): Promise<SingingJob[]> {
    const all = [...this.jobs.values()]
    return status ? all.filter(j => j.status === status) : all
  }
}
