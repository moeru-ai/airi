import path from 'node:path'

import { createLogg, Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'

import { useConfigManager } from '../config'

// Track initialization status
let isInitialized = false

// Initialize global logging configuration
export function initLogger(): void {
  if (isInitialized) {
    return // Prevent multiple initializations
  }

  // Set global log level
  setGlobalLogLevel(LogLevel.Debug)
  setGlobalFormat(Format.Pretty)

  const config = useConfigManager().getConfig()

  const logLevelMap: Record<string, LogLevel> = {
    error: LogLevel.Error,
    warn: LogLevel.Warning,
    info: LogLevel.Log,
    verbose: LogLevel.Verbose,
    debug: LogLevel.Debug,
  }

  setGlobalLogLevel(logLevelMap[config.system?.logLevel] || LogLevel.Debug)

  // Set format based on configuration
  if (config.system?.logFormat === 'pretty') {
    setGlobalFormat(Format.Pretty)
  }
  else {
    setGlobalFormat(Format.JSON)
  }

  isInitialized = true
}

/**
 * Get logger instance with directory name and filename
 * @returns logger instance configured with "directoryName/filename"
 */
export function useLogger(name?: string): ReturnType<typeof createLogg> {
  if (name)
    return createLogg(name).useGlobalConfig()

  const stack = new Error('logger').stack
  const caller = stack?.split('\n')[2]

  // Extract directory, filename and line number from stack trace
  const match = caller?.match(/(?:([^/]+)\/)?([^/\s]+?)(?:\.[jt]s)?:(\d+)(?::\d+)?\)?$/)
  const dirName = match?.[1] || path.basename(path.dirname(__filename))
  const fileName = match?.[2] || path.basename(__filename, '.ts')
  const lineNumber = match?.[3] || '?'

  return createLogg(`${dirName}/${fileName}:${lineNumber}`).useGlobalConfig()
}

// Create pre-configured loggers for various services
export const logger = {
  auth: useLogger('auth-service'),
  timeline: useLogger('timeline-service'),
  browser: useLogger('browser-adapter'),
  airi: useLogger('airi-adapter'),
  mcp: useLogger('mcp-adapter'),
  parser: useLogger('parser'),
  main: useLogger('twitter-service'),
  config: useLogger('config'),
}
