import { createContext } from '@moeru/eventa'

const context = createContext()
const tokenLeaseCount = new Map<string, number>()
let leaseCount = 0

function createTraceToken() {
  return `stage-three-runtime-trace:${Math.random().toString(36).slice(2, 10)}`
}

export function getStageThreeRuntimeTraceContext() {
  return context
}

export function isStageThreeRuntimeTraceEnabled() {
  return leaseCount > 0
}

export function releaseStageThreeRuntimeTrace(token?: string) {
  if (!token)
    return

  const current = tokenLeaseCount.get(token)
  if (!current)
    return

  if (current <= 1) {
    tokenLeaseCount.delete(token)
  }
  else {
    tokenLeaseCount.set(token, current - 1)
  }

  leaseCount = Math.max(0, leaseCount - 1)
}

export function acquireStageThreeRuntimeTrace(token = createTraceToken()) {
  tokenLeaseCount.set(token, (tokenLeaseCount.get(token) ?? 0) + 1)
  leaseCount += 1

  let released = false
  return () => {
    if (released)
      return
    released = true
    releaseStageThreeRuntimeTrace(token)
  }
}

export function resetStageThreeRuntimeTraceForTesting() {
  tokenLeaseCount.clear()
  leaseCount = 0
}
