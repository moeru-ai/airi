import path from 'node:path'
import { createLogg, Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'

import { createDefaultConfig } from '../config'

// 记录初始化状态
let isInitialized = false

// 初始化全局日志配置
export function initializeLogger(): void {
  if (isInitialized) {
    return // 防止多次初始化
  }

  // 设置全局日志级别
  setGlobalLogLevel(LogLevel.Debug)
  setGlobalFormat(Format.Pretty)

  const config = createDefaultConfig().getConfig()

  const logLevelMap: Record<string, LogLevel> = {
    error: LogLevel.Error,
    warn: LogLevel.Warning,
    info: LogLevel.Log,
    verbose: LogLevel.Verbose,
    debug: LogLevel.Debug,
  }

  setGlobalLogLevel(logLevelMap[config.system?.logLevel] || LogLevel.Debug)

  // 根据配置设置格式
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

// 创建各种服务的预配置日志记录器
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
