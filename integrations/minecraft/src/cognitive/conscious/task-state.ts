import type { Plan } from '../../libs/mineflayer/base-agent'

export type TaskStatus = 'idle' | 'planning' | 'executing' | 'responding' | 'cancelling'

export interface CancellationToken {
  isCancelled: boolean
  cancel: () => void
  onCancelled: (callback: () => void) => void
}

export interface TaskContext {
  id: string
  goal: string
  status: TaskStatus
  startTime: number
  currentStep?: string
  plan?: Plan
  cancellationToken: CancellationToken
}

export function createCancellationToken(): CancellationToken {
  let isCancelled = false
  const callbacks: Array<() => void> = []

  return {
    get isCancelled() {
      return isCancelled
    },
    cancel() {
      isCancelled = true
      callbacks.forEach(cb => cb())
    },
    onCancelled(callback: () => void) {
      callbacks.push(callback)
    },
  }
}
