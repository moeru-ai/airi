import { clearClockInterval, setClockInterval } from '@moeru/std'
import { Mutex } from 'es-toolkit/promise'

interface LoopOptions {
  interval?: number
  autoStart?: boolean
}

export function useLoop(fn: () => Promise<void> | void, options?: LoopOptions) {
  const mutex = new Mutex()
  const interval = options?.interval ?? 1000 / 60
  let timerId: number | null = null
  let shouldRun = options?.autoStart ?? true

  const tick = async () => {
    if (!shouldRun || mutex.isLocked) {
      return
    }

    await mutex.acquire()
    try {
      await fn()
    }
    finally {
      mutex.release()
    }
  }

  const startTimer = () => {
    if (!shouldRun || timerId !== null) {
      return
    }

    timerId = setClockInterval(() => {
      void tick()
    }, interval)
  }

  const stopTimer = () => {
    if (timerId === null) {
      return
    }

    clearClockInterval(timerId)
    timerId = null
  }

  const toggleRunState = (next: boolean) => {
    shouldRun = next
    if (shouldRun) {
      startTimer()
      return
    }

    stopTimer()
  }

  if (shouldRun) {
    startTimer()
  }

  return {
    start: () => toggleRunState(true),
    resume: () => toggleRunState(true),
    pause: () => toggleRunState(false),
    stop: () => toggleRunState(false),
  }
}
