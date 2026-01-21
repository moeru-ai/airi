import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

let initialized = false

export function initLogger() {
  if (initialized)
    return

  setGlobalLogLevel(LogLevel.Debug)
  setGlobalFormat(Format.Pretty)
  useLogg('minecraft-hub').useGlobalConfig().log('Logger initialized')
  initialized = true
}

export function useLogger(scope = 'minecraft-hub') {
  return useLogg(scope).useGlobalConfig()
}
