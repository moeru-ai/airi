import type { LogLevelString } from '@guiiai/logg'

import { useLogg } from '@guiiai/logg'

export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

export type Logger = ReturnType<typeof useLogg> & {
  withTag: (tag: string) => Logger
}

const levelMap: Record<LogLevel, LogLevelString> = {
  verbose: 'verbose',
  debug: 'debug',
  info: 'log',
  warn: 'warn',
  error: 'error',
}

export function createLogger(namespace: string, level: LogLevel = 'info'): Logger {
  const base = useLogg(namespace).useGlobalConfig().withLogLevelString(levelMap[level])
  return Object.assign(base, {
    withTag(tag: string): Logger {
      return createLogger(`${namespace}:${tag}`, level)
    },
  })
}

export function createGatewayLogger(level?: LogLevel) {
  return createLogger('visual-chat:gateway', level)
}

export function createWorkerLogger(level?: LogLevel) {
  return createLogger('visual-chat:worker', level)
}

export function createMediaLogger(level?: LogLevel) {
  return createLogger('visual-chat:media', level)
}

export function createLiveKitLogger(level?: LogLevel) {
  return createLogger('visual-chat:livekit', level)
}

export function createInferenceLogger(level?: LogLevel) {
  return createLogger('visual-chat:inference', level)
}
