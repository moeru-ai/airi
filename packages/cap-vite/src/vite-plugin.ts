import type { Result } from 'tinyexec'
import type { Plugin } from 'vite'

import process from 'node:process'

import { resolve } from 'node:path'

import { x } from 'tinyexec'

import { parseCapacitorPlatform, pickServerUrl, resolveCapRunArgs, shouldRestartForNativeChange } from './native'

export interface CapVitePluginOptions {
  capArgs: string[]
}

async function stopCapProcess(current: Result | undefined) {
  if (!current) {
    return
  }

  current.kill('SIGINT')

  try {
    await current
  }
  catch {
    // tinyexec rejects when a process is stopped during a restart.
  }
}

function startCapProcess(cwd: string, capArgs: string[], url: URL) {
  console.info('\n----------------------\n')
  console.info('Running cap run', ...capArgs)

  return x('cap', ['run', ...capArgs], {
    throwOnError: false,
    nodeOptions: {
      cwd,
      env: {
        CAPACITOR_DEV_SERVER_URL: url.toString(),
      },
      stdio: 'inherit',
    },
  })
}

export function capVitePlugin(options: CapVitePluginOptions): Plugin {
  const resolvedCapArgs = resolveCapRunArgs(options.capArgs)
  const platform = parseCapacitorPlatform(resolvedCapArgs[0])
  if (!platform) {
    throw new Error('The first `cap run` argument must be `ios` or `android`.')
  }

  return {
    apply: 'serve',
    name: 'cap-vite:run-capacitor',
    configureServer(server) {
      const cwd = resolve(server.config.root)
      const platformRoot = resolve(cwd, platform)
      const debounceMs = 300
      const logger = server.config.logger

      let currentCapProcess: Result | undefined
      let shuttingDown = false
      let restartTimer: NodeJS.Timeout | undefined

      const start = () => {
        const url = pickServerUrl(server)
        currentCapProcess = startCapProcess(cwd, resolvedCapArgs, url)
      }

      const restartCapProcess = async (reason: string) => {
        if (shuttingDown) {
          return
        }

        logger.info(`[cap-vite] ${reason}. Re-running cap run ${platform}.`)
        const previous = currentCapProcess
        currentCapProcess = undefined
        await stopCapProcess(previous)
        start()
      }

      const onWatcherEvent = (_event, file) => {
        if (!shouldRestartForNativeChange(file, platform, cwd)) {
          return
        }

        clearTimeout(restartTimer)
        restartTimer = setTimeout(() => {
          restartCapProcess(`native file changed: ${resolve(cwd, file)}`)
        }, debounceMs)
      }

      const shutdown = async () => {
        if (shuttingDown) {
          return
        }

        shuttingDown = true
        clearTimeout(restartTimer)
        server.watcher.off('all', onWatcherEvent)
        await server.watcher.unwatch(platformRoot)
        await stopCapProcess(currentCapProcess)
      }

      server.watcher.add(platformRoot)
      server.watcher.on('all', onWatcherEvent)

      server.httpServer?.once('listening', () => {
        try {
          start()
        }
        catch (error) {
          logger.error(`[cap-vite] ${error instanceof Error ? error.message : String(error)}`)
          shutdown()
        }
      })
      server.httpServer?.once('close', shutdown)
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    },
  }
}
