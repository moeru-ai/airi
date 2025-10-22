export function useLoop(fn: () => Promise<void> | void, options?: { interval?: number, autoStart?: boolean }) {
  let timer: NodeJS.Timeout | null = null
  let shouldRun = options?.autoStart ?? true

  const loopIteration = async () => {
    if (!shouldRun) {
      return
    }

    try {
      await fn()
    }
    finally {
      timer = setTimeout(loopIteration, options?.interval ?? 1000 / 60) // Default to ~60 FPS
    }
  }

  if (shouldRun) {
    loopIteration()
  }

  return {
    start: () => {
      shouldRun = true
      if (!timer) {
        loopIteration()
      }
    },
    resume: () => {
      shouldRun = true
      if (!timer) {
        loopIteration()
      }
    },
    pause: () => {
      shouldRun = false
    },
    stop: () => {
      shouldRun = false

      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
