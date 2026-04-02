import type {
  OpenClawDelegatedTaskRequest,
  OpenClawTaskError,
  OpenClawTaskHistoryRecord,
  OpenClawTaskResult,
  OpenClawTaskStatus,
  OpenClawTaskUpdate,
} from './types'

export interface CreateOpenClawTaskRecordOptions {
  request: OpenClawDelegatedTaskRequest
  sourceEventId?: string
  taskId: string
  timestamp?: number
}

export interface UpdateOpenClawTaskRecordOptions {
  error?: OpenClawTaskError
  note?: string
  result?: OpenClawTaskResult
  status: OpenClawTaskStatus
  taskId: string
  timestamp?: number
}

export class OpenClawTaskHistoryStore {
  private readonly records = new Map<string, OpenClawTaskHistoryRecord>()

  createQueuedTask(options: CreateOpenClawTaskRecordOptions): OpenClawTaskHistoryRecord {
    const timestamp = options.timestamp ?? Date.now()
    const record: OpenClawTaskHistoryRecord = {
      taskId: options.taskId,
      request: options.request,
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceEventId: options.sourceEventId,
      statusHistory: [{ status: 'queued', timestamp }],
    }

    this.records.set(options.taskId, record)

    return this.cloneRecord(record)
  }

  updateTask(options: UpdateOpenClawTaskRecordOptions): OpenClawTaskHistoryRecord {
    const current = this.records.get(options.taskId)
    if (!current) {
      throw new Error(`OpenClaw task not found: ${options.taskId}`)
    }

    const timestamp = options.timestamp ?? Date.now()
    const next: OpenClawTaskHistoryRecord = {
      ...current,
      status: options.status,
      updatedAt: timestamp,
      result: options.result ?? current.result,
      error: options.error ?? current.error,
      statusHistory: [
        ...current.statusHistory,
        {
          status: options.status,
          timestamp,
          note: options.note,
          error: options.error,
        },
      ],
    }

    this.records.set(options.taskId, next)
    return this.cloneRecord(next)
  }

  getTask(taskId: string): OpenClawTaskHistoryRecord | undefined {
    const record = this.records.get(taskId)
    return record ? this.cloneRecord(record) : undefined
  }

  listTasks(): OpenClawTaskHistoryRecord[] {
    return Array.from(this.records.values(), record => this.cloneRecord(record))
  }

  toTaskUpdate(taskId: string): OpenClawTaskUpdate {
    const record = this.records.get(taskId)
    if (!record) {
      throw new Error(`OpenClaw task not found: ${taskId}`)
    }

    const latestEntry = record.statusHistory.at(-1)

    return {
      taskId: record.taskId,
      status: record.status,
      timestamp: latestEntry?.timestamp ?? record.updatedAt,
      request: record.request,
      note: latestEntry?.note,
      result: record.result,
      error: latestEntry?.error ?? record.error,
      sourceEventId: record.sourceEventId,
    }
  }

  private cloneRecord(record: OpenClawTaskHistoryRecord): OpenClawTaskHistoryRecord {
    return structuredClone(record)
  }
}
