import type { PriorityLevel, PriorityResolver } from './types'

const DEFAULT_LEVELS: Record<PriorityLevel, number> = {
  critical: 300,
  high: 200,
  normal: 100,
  low: 0,
}

export function createPriorityResolver(levels?: Partial<Record<PriorityLevel, number>>): PriorityResolver {
  const resolved = { ...DEFAULT_LEVELS, ...levels }

  return {
    resolve(priority?: PriorityLevel | number) {
      if (priority == null)
        return resolved.normal
      if (typeof priority === 'number')
        return priority
      return resolved[priority] ?? resolved.normal
    },
  }
}

export function comparePriority(a: number, b: number) {
  if (a === b)
    return 0
  return a > b ? 1 : -1
}
