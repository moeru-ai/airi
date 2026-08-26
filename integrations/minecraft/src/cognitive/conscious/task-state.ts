import type { Plan } from '../../libs/mineflayer/base-agent'

export interface CancellationToken {
  cancel: () => void
  isCancelled: boolean
  onCancelled: (callback: () => void) => void
}

export interface TaskContext {
  cancellationToken: CancellationToken
  currentStep?: string
  goal: string
  id: string
  plan?: Plan
  startTime: number
  status: TaskStatus
}

export type TaskStatus = 'cancelling' | 'executing' | 'idle' | 'planning' | 'responding'

export function createCancellationToken(): CancellationToken {
  let isCancelled = false
  const callbacks: Array<() => void> = []

  return {
    cancel() {
      isCancelled = true
      callbacks.forEach(cb => cb())
    },
    get isCancelled() {
      return isCancelled
    },
    onCancelled(callback: () => void) {
      callbacks.push(callback)
    },
  }
}
