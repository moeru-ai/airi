import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { DebugServer } from '../debug-server'

export type Logger = ReturnType<typeof useLogg>

export function initLogger() {
  setGlobalLogLevel(LogLevel.Debug)
  setGlobalFormat(Format.Pretty)

  const logger = useLogg('logger').useGlobalConfig()
  logger.log('Logger initialized')
}

/**
 * Get logger instance with directory name and filename
 * @returns logger instance configured with "directoryName/filename"
 */
export function useLogger() {
  const stack = new Error('logger').stack
  const caller = stack?.split('\n')[2]

  // Match the parent directory and filename without extension
  const match = caller?.match(/\/([^/]+)\/([^/]+?)\.[jt]s/)
  const dirName = match?.[1] || 'unknown'
  const fileName = match?.[2] || 'unknown'

  const logger = useLogg(`${dirName}/${fileName}`).useGlobalConfig()

  // Proxy logger to broadcast events
  // We need to preserve the original formatting/behavior while adding the side-effect
  return {
    log: (message: string, ...args: any[]) => {
      logger.log(message, ...args)
      DebugServer.getInstance().broadcast('log', {
        level: 'INFO',
        message: `[${dirName}/${fileName}] ${message}`,
        timestamp: Date.now(),
        fields: (logger as any).fields, // Access fields if stored on instance, currently Logg API might differ so we simplify
      })
    },
    error: (message: string, ...args: any[]) => {
      logger.error(message, ...args)
      DebugServer.getInstance().broadcast('log', {
        level: 'ERROR',
        message: `[${dirName}/${fileName}] ${message}`,
        timestamp: Date.now(),
      })
    },
    warn: (message: string, ...args: any[]) => {
      logger.warn(message, ...args)
      DebugServer.getInstance().broadcast('log', {
        level: 'WARN',
        message: `[${dirName}/${fileName}] ${message}`,
        timestamp: Date.now(),
      })
    },
    withFields: (fields: Record<string, any>) => {
      const subLogger = logger.withFields(fields)
      // Return proxied sub-logger
      return {
        log: (message: string) => {
          subLogger.log(message)
          DebugServer.getInstance().broadcast('log', {
            level: 'INFO',
            message: `[${dirName}/${fileName}] ${message}`,
            fields,
            timestamp: Date.now(),
          })
        },
        error: (message: string) => {
          subLogger.error(message)
          DebugServer.getInstance().broadcast('log', {
            level: 'ERROR',
            message: `[${dirName}/${fileName}] ${message}`,
            fields,
            timestamp: Date.now(),
          })
        },
        warn: (message: string) => {
          subLogger.warn(message)
          DebugServer.getInstance().broadcast('log', {
            level: 'WARN',
            message: `[${dirName}/${fileName}] ${message}`,
            fields,
            timestamp: Date.now(),
          })
        },
        errorWithError: (message: string, error: unknown) => {
          subLogger.errorWithError(message, error)
          DebugServer.getInstance().broadcast('log', {
            level: 'ERROR',
            message: `[${dirName}/${fileName}] ${message}`,
            fields: { ...fields, error },
            timestamp: Date.now(),
          })
        },
        withFields: (newFields: Record<string, any>) => useLogger().withFields({ ...fields, ...newFields }), // Recursion hack for simplicity, ideally properly implement interface
        withError: (err: unknown) => useLogger().withFields({ ...fields, error: err }), // Recursion hack
      }
    },
    withError: (error: unknown) => {
      return useLogger().withFields({ error })
    },
    errorWithError: (message: string, error: unknown) => {
      logger.errorWithError(message, error)
      DebugServer.getInstance().broadcast('log', {
        level: 'ERROR',
        message: `[${dirName}/${fileName}] ${message}`,
        fields: { error },
        timestamp: Date.now(),
      })
    },
  } as unknown as ReturnType<typeof useLogg> // Force type for now as complete Logg interface is complex to mock fully perfectly without more boilerplate
}
