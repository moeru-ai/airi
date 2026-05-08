/**
 * Singing pipeline logger interface.
 * Wraps the host application's logger to add pipeline-specific context.
 */
export interface SingingLogger {
  debug: (message: string, fields?: Record<string, unknown>) => void
  info: (message: string, fields?: Record<string, unknown>) => void
  warn: (message: string, fields?: Record<string, unknown>) => void
  error: (message: string, fields?: Record<string, unknown>) => void
}

/**
 * Create a no-op logger (default when no logger is provided).
 */
export function createNoopLogger(): SingingLogger {
  const noop = () => {}
  return { debug: noop, info: noop, warn: noop, error: noop }
}
