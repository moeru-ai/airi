import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { DebugService } from '../debug-server'

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
      DebugService.getInstance().log('INFO', `[${dirName}/${fileName}] ${message}`, { args })
    },
    error: (message: string, ...args: any[]) => {
      logger.error(message, ...args)
      DebugService.getInstance().log('ERROR', `[${dirName}/${fileName}] ${message}`, { args })
    },
    warn: (message: string, ...args: any[]) => {
      logger.warn(message, ...args)
      DebugService.getInstance().log('WARN', `[${dirName}/${fileName}] ${message}`, { args })
    },
    withFields: (fields: Record<string, any>) => {
      const subLogger = logger.withFields(fields)
      // Return proxied sub-logger
      return {
        log: (message: string) => {
          subLogger.log(message)
          DebugService.getInstance().log('INFO', `[${dirName}/${fileName}] ${message}`, fields)
        },
        error: (message: string) => {
          subLogger.error(message)
          DebugService.getInstance().log('ERROR', `[${dirName}/${fileName}] ${message}`, fields)
        },
        warn: (message: string) => {
          subLogger.warn(message)
          DebugService.getInstance().log('WARN', `[${dirName}/${fileName}] ${message}`, fields)
        },
        errorWithError: (message: string, error: unknown) => {
          subLogger.errorWithError(message, error)
          DebugService.getInstance().log('ERROR', `[${dirName}/${fileName}] ${message}`, { ...fields, error })
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
      DebugService.getInstance().log('ERROR', `[${dirName}/${fileName}] ${message}`, { error })
    },
  } as unknown as ReturnType<typeof useLogg> // Force type for now as complete Logg interface is complex to mock fully perfectly without more boilerplate
}
