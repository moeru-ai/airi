const GLOBAL_DEBUG_FLAG = 'airi:debug'
const HEARING_DEBUG_FLAG = 'airi:debug:hearing'
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes'])
const FALSE_VALUES = new Set(['0', 'false', 'off', 'no'])

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined')
    return null
  return window.localStorage
}

function parseDebugFlag(value: string | null): boolean | undefined {
  if (value == null)
    return undefined

  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized))
    return true
  if (FALSE_VALUES.has(normalized))
    return false
  return undefined
}

export function isHearingLoggingEnabled(): boolean {
  try {
    const storage = getLocalStorage()
    if (!storage)
      return true

    const scoped = parseDebugFlag(storage.getItem(HEARING_DEBUG_FLAG))
    if (scoped !== undefined)
      return scoped

    const global = parseDebugFlag(storage.getItem(GLOBAL_DEBUG_FLAG))
    if (global !== undefined)
      return global

    return true
  }
  catch {
    return true
  }
}

export type HearingLogPayload = Record<string, unknown>

export function logHearing(event: string, payload: HearingLogPayload = {}, level: 'info' | 'debug' = 'info') {
  if (!isHearingLoggingEnabled())
    return

  const timestamp = new Date().toISOString()
  const tag = level === 'debug' ? `[hearing][verbose:${event}]` : `[hearing][${event}]`
  console.info(tag, timestamp, payload)
}

export function summarizeHearingText(text: string | null | undefined, maxLength: number = 120): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized)
    return '(empty)'

  if (normalized.length <= maxLength)
    return normalized

  return `${normalized.slice(0, maxLength)}…`
}
