import type { Logg } from '@guiiai/logg'

import path from 'node:path'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

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
    debug: LogLevel.Debug,
    error: LogLevel.Error,
    info: LogLevel.Log,
    verbose: LogLevel.Verbose,
    warn: LogLevel.Warning,
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
export function useLogger(name?: string): Logg {
  if (name)
    return useLogg(name).useGlobalConfig()

  const stack = new Error('logger').stack
  const caller = stack?.split('\n')[2]

  // Extract directory, filename and line number from stack trace
  const match = caller?.match(/(?:([^/]+)\/)?([^/\s]+?)(?:\.[jt]s)?:(\d+)(?::\d+)?\)?$/)
  const dirName = match?.[1] || path.basename(path.dirname(__filename))
  const fileName = match?.[2] || path.basename(__filename, '.ts')
  const lineNumber = match?.[3] || '?'

  return useLogg(`${dirName}/${fileName}:${lineNumber}`).useGlobalConfig()
}

// Create pre-configured loggers for various services
export const logger = {
  airi: useLogger('airi-adapter'),
  auth: useLogger('auth-service'),
  browser: useLogger('browser-adapter'),
  config: useLogger('config'),
  main: useLogger('twitter-service'),
  mcp: useLogger('mcp-adapter'),
  parser: useLogger('parser'),
  timeline: useLogger('timeline-service'),
}
