import type { Result } from 'tinyexec'
import type { Plugin } from 'vite'

import type { CapacitorPlatform } from './native'

import process from 'node:process'

import { resolve } from 'node:path'

import * as readline from 'node:readline'

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
  return x('cap', ['run', ...capArgs], {
    throwOnError: false,
    nodeOptions: {
      cwd,
      env: {
        CAPACITOR_DEV_SERVER_URL: url.toString(),
      },
      // NOTICE: cap-vite owns the terminal shortcuts, so cap run should not
      // consume stdin while still mirroring its stdout/stderr to the console.
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  })
}

function bindCapViteShortcuts(
  onRestart: () => void,
  onShutdown: () => Promise<void>,
) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return () => {}
  }

  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  readline.emitKeypressEvents(process.stdin)

  const shouldRestoreRawMode = !process.stdin.isRaw
  if (shouldRestoreRawMode) {
    process.stdin.setRawMode(true)
  }

  async function shutdownFromShortcut() {
    try {
      await onShutdown()
    }
    finally {
      if (shouldRestoreRawMode) {
        process.stdin.setRawMode(false)
      }

      process.kill(process.pid, 'SIGINT')
    }
  }

  const onKeyPress = (input: string, key: readline.Key) => {
    if (key.ctrl && key.name === 'c') {
      void shutdownFromShortcut()
      return
    }

    const keyName = key.name?.toLowerCase() ?? input.toLowerCase()
    if (!key.ctrl && !key.meta && keyName === 'r') {
      onRestart()
    }
  }

  process.stdin.on('keypress', onKeyPress)

  return () => {
    process.stdin.off('keypress', onKeyPress)

    if (shouldRestoreRawMode) {
      process.stdin.setRawMode(false)
    }
  }
}

export function capVitePlugin(options: CapVitePluginOptions): Plugin {
  const resolvedCapArgs = resolveCapRunArgs(options.capArgs)
  const platform = parseCapacitorPlatform(resolvedCapArgs[0])
  if (!platform) {
    throw new Error('The first `cap run` argument must be `ios` or `android`.')
  }
  const resolvedPlatform: CapacitorPlatform = platform

  return {
    apply: 'serve',
    name: 'cap-vite:run-capacitor',
    configureServer(server) {
      const cwd = resolve(server.config.root)
      const platformRoot = resolve(cwd, resolvedPlatform)
      const debounceMs = 300
      const logger = server.config.logger

      let currentCapProcess: Result | undefined
      let restartTask: Promise<void> | undefined
      let queuedRestartReason: string | undefined
      let disposeShortcut: (() => void) | undefined
      let shuttingDown = false
      let restartTimer: NodeJS.Timeout | undefined

      function launchCapProcess() {
        const url = pickServerUrl(server)
        currentCapProcess = startCapProcess(cwd, resolvedCapArgs, url)
        currentCapProcess.then(() => {
          logger.info(`[cap-vite] Ran "cap run ${resolvedCapArgs.join(' ')}". Press R to re-run. Press Ctrl+C to exit.`)
        })
      }

      function requestRestart(reason: string) {
        if (shuttingDown) {
          return
        }

        queuedRestartReason = reason
        if (!restartTask) {
          restartTask = flushPendingRestarts()
        }
      }

      async function flushPendingRestarts() {
        try {
          while (queuedRestartReason) {
            const activeReason = queuedRestartReason
            queuedRestartReason = undefined

            if (shuttingDown) {
              return
            }

            logger.info(`[cap-vite] ${activeReason}. Re-running "cap run ${resolvedCapArgs.join(' ')}".`)
            const previous = currentCapProcess
            currentCapProcess = undefined
            await stopCapProcess(previous)

            if (shuttingDown) {
              return
            }

            launchCapProcess()
          }
        }
        catch (error) {
          logger.error(`[cap-vite] ${error instanceof Error ? error.message : String(error)}`)
          await shutdown()
        }
        finally {
          restartTask = undefined
        }
      }

      function onWatcherEvent(_event, file) {
        if (!shouldRestartForNativeChange(file, resolvedPlatform, cwd)) {
          return
        }

        clearTimeout(restartTimer)
        restartTimer = setTimeout(() => {
          requestRestart(`native file changed: ${resolve(cwd, file)}`)
        }, debounceMs)
      }

      function handleShutdownRequest() {
        void shutdown()
      }

      async function shutdown() {
        if (shuttingDown) {
          return
        }

        shuttingDown = true
        clearTimeout(restartTimer)
        queuedRestartReason = undefined
        const disposeBoundShortcut = disposeShortcut
        disposeShortcut = undefined
        disposeBoundShortcut?.()
        server.watcher.off('all', onWatcherEvent)
        process.off('SIGINT', handleShutdownRequest)
        process.off('SIGTERM', handleShutdownRequest)
        await server.watcher.unwatch(platformRoot)
        await stopCapProcess(currentCapProcess)
      }

      server.watcher.add(platformRoot)
      server.watcher.on('all', onWatcherEvent)

      server.httpServer?.once('listening', () => {
        launchCapProcess()
        disposeShortcut = bindCapViteShortcuts(() => requestRestart('manual restart requested'), shutdown)
      })
      server.httpServer?.once('close', handleShutdownRequest)
      process.once('SIGINT', handleShutdownRequest)
      process.once('SIGTERM', handleShutdownRequest)
    },
  }
}
