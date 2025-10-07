import { useLogg } from '@guiiai/logg'

import { name } from '../package.json'

export interface Logger {
  provide: (name: string, dependencies: string[]) => void
  invoke: (dependencies: string[]) => void
  beforeRun: (name: string) => void
  run: (name: string, duration: number) => void
  hookOnStart: (name: string) => void
  hookOnStartComplete: (name: string, duration: number) => void
  hookOnStop: (name: string) => void
  hookOnStopComplete: (name: string, duration: number) => void
  running: () => void
}

export interface LoggerOptions {
  enabled?: boolean
  logger?: Logger
}

function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(3)}µs`
  }
  if (ms < 1000) {
    return `${ms.toFixed(3)}ms`
  }
  return `${(ms / 1000).toFixed(3)}s`
}

export function createDefaultLogger(): Logger {
  return {
    provide: (name: string, dependencies: string[]) => {
      const depsStr = dependencies.length > 0 ? ` (depends on: ${dependencies.join(', ')})` : ''
      // eslint-disable-next-line no-console
      console.log(`[${name}] PROVIDE    ${name}${depsStr}`)
    },

    invoke: (dependencies: string[]) => {
      const depsStr = dependencies.length > 0 ? ` (depends on: ${dependencies.join(', ')})` : ''
      // eslint-disable-next-line no-console
      console.log(`[${name}] INVOKE${depsStr}`)
    },

    beforeRun: (name: string) => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] BEFORE RUN provide: ${name}()`)
    },

    run: (name: string, duration: number) => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] RUN        provide: ${name}() in ${formatDuration(duration)}`)
    },

    hookOnStart: (name: string) => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] HOOK OnStart        ${name}() executing`)
    },

    hookOnStartComplete: (name: string, duration: number) => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] HOOK OnStart        ${name}() ran successfully in ${formatDuration(duration)}`)
    },

    hookOnStop: (name: string) => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] HOOK OnStop         ${name}() executing`)
    },

    hookOnStopComplete: (name: string, duration: number) => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] HOOK OnStop         ${name}() ran successfully in ${formatDuration(duration)}`)
    },

    running: () => {
      // eslint-disable-next-line no-console
      console.log(`[${name}] RUNNING`)
    },
  }
}

export function createLoggLogger(): Logger {
  const logg = useLogg(name).useGlobalConfig()

  return {
    provide: (name: string, dependencies: string[]) => {
      const depsStr = dependencies.length > 0 ? ` (depends on: ${dependencies.join(', ')})` : ''
      logg.log(`PROVIDE    ${name}${depsStr}`)
    },

    invoke: (dependencies: string[]) => {
      const depsStr = dependencies.length > 0 ? ` (depends on: ${dependencies.join(', ')})` : ''
      logg.log(`INVOKE${depsStr}`)
    },

    beforeRun: (name: string) => {
      logg.log(`BEFORE RUN provide: ${name}()`)
    },

    run: (name: string, duration: number) => {
      logg.log(`RUN        provide: ${name}() in ${formatDuration(duration)}`)
    },

    hookOnStart: (name: string) => {
      logg.log(`HOOK OnStart        ${name}() executing`)
    },

    hookOnStartComplete: (name: string, duration: number) => {
      logg.log(`HOOK OnStart        ${name}() ran successfully in ${formatDuration(duration)}`)
    },

    hookOnStop: (name: string) => {
      logg.log(`HOOK OnStop         ${name}() executing`)
    },

    hookOnStopComplete: (name: string, duration: number) => {
      logg.log(`HOOK OnStop         ${name}() ran successfully in ${formatDuration(duration)}`)
    },

    running: () => {
      logg.log(`RUNNING`)
    },
  }
}

export function createNoopLogger(): Logger {
  return {
    provide: () => {},
    invoke: () => {},
    beforeRun: () => {},
    run: () => {},
    hookOnStart: () => {},
    hookOnStartComplete: () => {},
    hookOnStop: () => {},
    hookOnStopComplete: () => {},
    running: () => {},
  }
}
