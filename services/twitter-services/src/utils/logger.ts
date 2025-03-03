import { createLogg, Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'

import { createDefaultConfig } from '../config'
import { errorToMessage } from './error'

// 初始化全局日志配置
export function initializeLogger() {
  const config = createDefaultConfig().getConfig()

  // 从环境变量或配置中获取日志级别
  const logLevelString = config.system?.logLevel?.toLowerCase() || 'info'

  // 映射日志级别
  const logLevelMap: Record<string, LogLevel> = {
    error: LogLevel.Error,
    warn: LogLevel.Warning,
    info: LogLevel.Log,
    verbose: LogLevel.Verbose,
    debug: LogLevel.Debug,
  }

  // 设置全局日志级别
  setGlobalLogLevel(logLevelMap[logLevelString] || LogLevel.Log)

  // 根据配置设置格式
  if (config.system?.logFormat === 'pretty') {
    setGlobalFormat(Format.Pretty)
  }
  else {
    setGlobalFormat(Format.JSON)
  }
}

// 创建特定上下文的日志记录器
export function createLogger(context: string) {
  const logger = createLogg(context).useGlobalConfig()

  // 添加错误处理方法
  return {
    ...logger,
    // 使用 errorToMessage 增强错误日志
    errorWithMessage: (message: string, error: unknown) => {
      logger.error(`${message}: ${errorToMessage(error)}`)
    },
  }
}

// 创建各种服务的预配置日志记录器
export const logger = {
  auth: createLogger('auth-service'),
  timeline: createLogger('timeline-service'),
  browser: createLogger('browser-adapter'),
  airi: createLogger('airi-adapter'),
  mcp: createLogger('mcp-adapter'),
  parser: createLogger('parser'),
  main: createLogger('twitter-service'),
  config: createLogger('config'),
}
