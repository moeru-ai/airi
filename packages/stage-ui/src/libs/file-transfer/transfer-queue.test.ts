import type { TransferTask, TransferTaskStorage } from './transfer-queue'

import { describe, expect, it, vi } from 'vitest'

import { TransferQueue } from './transfer-queue'

function createStorage() {
  const saved = new Map<string, TransferTask>()
  const storage: TransferTaskStorage = {
    save: async (task) => {
      saved.set(task.id, task)
    },
    remove: async (id) => {
      saved.delete(id)
    },
    list: async () => Array.from(saved.values()),
  }
  return { saved, storage }
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('transferQueue', () => {
  it('runs tasks in order and removes finished tasks from storage', async () => {
    const { saved, storage } = createStorage()
    const order: string[] = []
    const queue = new TransferQueue({
      copy: async (task) => {
        order.push(task.id)
      },
    }, storage)
    await queue.activate('owner')

    await queue.enqueue({ id: 'a', kind: 'copy', payload: null })
    await queue.enqueue({ id: 'b', kind: 'copy', payload: null })
    await flush()

    expect(order).toEqual(['a', 'b'])
    expect(saved.size).toBe(0)
  })

  it('keeps a failed task until retry succeeds', async () => {
    const { saved, storage } = createStorage()
    let attempts = 0
    const changes: string[] = []
    const queue = new TransferQueue({
      copy: async () => {
        if (++attempts === 1)
          throw new Error('network down')
      },
    }, storage, (task, removed) => changes.push(`${task.status}${removed ? ':removed' : ''}`))
    await queue.activate('owner')

    await queue.enqueue({ id: 'a', kind: 'copy', payload: null })
    await flush()
    expect(saved.get('a')).toMatchObject({ status: 'failed', error: 'network down' })

    await queue.retry('a')
    await flush()
    expect(saved.size).toBe(0)
    expect(changes.at(-1)).toMatch(/:removed$/)
  })

  it('resumes only the active account tasks after a restart', async () => {
    const { storage } = createStorage()
    await storage.save({ id: 'mine', kind: 'copy', ownerId: 'owner', payload: null, status: 'running' })
    await storage.save({ id: 'other', kind: 'copy', ownerId: 'someone', payload: null, status: 'queued' })
    const ran: string[] = []
    const queue = new TransferQueue({
      copy: async (task) => {
        ran.push(task.id)
      },
    }, storage)

    await queue.activate('owner')
    await flush()

    expect(ran).toEqual(['mine'])
  })

  it('aborts running work and ignores its result when the account changes', async () => {
    const { saved, storage } = createStorage()
    const gate = deferred()
    let aborted = false
    const queue = new TransferQueue({
      copy: async (_task, signal) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        await gate.promise
      },
    }, storage)
    await queue.activate('owner')
    await queue.enqueue({ id: 'a', kind: 'copy', payload: null })
    await flush()

    queue.deactivate()
    gate.resolve()
    await flush()

    expect(aborted).toBe(true)
    expect(saved.get('a')).toMatchObject({ ownerId: 'owner' })
  })

  it('refuses work without an active account', async () => {
    const queue = new TransferQueue({}, createStorage().storage)

    await expect(queue.enqueue({ id: 'a', kind: 'copy', payload: null })).rejects.toThrow('no active account')
  })

  it('retries failed tasks in the background, except those that another attempt cannot complete', async () => {
    const handler = vi.fn(async (task: TransferTask) => {
      if (task.id === 'refused')
        throw new Error('refused')
    })
    handler.mockRejectedValueOnce(new Error('network'))
    const statuses = new Map<string, string>()
    const queue = new TransferQueue(
      { upload: handler },
      createStorage().storage,
      (task, removed) => statuses.set(task.id, removed ? 'removed' : task.status),
      error => (error as Error).message !== 'refused',
    )
    await queue.activate('owner')

    await queue.enqueue({ id: 'transient', kind: 'upload', payload: null })
    await vi.waitFor(() => expect(statuses.get('transient')).toBe('failed'))
    await queue.enqueue({ id: 'refused', kind: 'upload', payload: null })
    await vi.waitFor(() => expect(statuses.get('refused')).toBe('failed'))
    await queue.retryFailed()

    await vi.waitFor(() => expect(statuses.get('transient')).toBe('removed'))
    expect(statuses.get('refused')).toBe('failed')
  })

  it('does not run a task under another account when the account changes during its first write', async () => {
    const { saved, storage } = createStorage()
    const write = deferred()
    const handler = vi.fn(async () => {})
    const queue = new TransferQueue({ upload: handler }, {
      ...storage,
      save: async (task) => {
        await write.promise
        await storage.save(task)
      },
    })
    await queue.activate('owner-a')

    const enqueued = queue.enqueue({ id: 'task', kind: 'upload', payload: null })
    await queue.activate('owner-b')
    write.resolve()
    await enqueued
    await flush()

    expect(handler).not.toHaveBeenCalled()
    expect(saved.get('task')?.ownerId).toBe('owner-a')
  })
})
