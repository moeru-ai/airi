import http from 'node:http'

import { env } from 'node:process'

import { app, shell } from 'electron'

/** Enables Electron's CDP endpoint before the app ready event. */
export function setupDebugger() {
  if (/^true$/i.test(env.APP_REMOTE_DEBUG || '')) {
    const remoteDebugPort = Number(env.APP_REMOTE_DEBUG_PORT || '9222')
    if (Number.isNaN(remoteDebugPort) || !Number.isInteger(remoteDebugPort) || remoteDebugPort < 0 || remoteDebugPort > 65535) {
      throw new Error(`Invalid remote debug port: ${env.APP_REMOTE_DEBUG_PORT}`)
    }

    app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebugPort))
    app.commandLine.appendSwitch('remote-allow-origins', `http://localhost:${remoteDebugPort}`)
  }
}

/**
 * Opens the inspector for the first available Electron renderer target.
 *
 * Developers may keep CDP enabled without opening the system browser by
 * setting `APP_REMOTE_DEBUG_NO_OPEN=true`.
 */
export function openDebugger() {
  if (/^true$/i.test(env.APP_REMOTE_DEBUG || '')) {
    const remoteDebugEndpoint = `http://localhost:${env.APP_REMOTE_DEBUG_PORT || '9222'}`

    http.get(`${remoteDebugEndpoint}/json`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const targets = JSON.parse(data)
          if (targets.length <= 0) {
            console.warn('[Remote Debugging] No targets found')
            return
          }

          let wsUrl = targets[0].webSocketDebuggerUrl
          if (!wsUrl.startsWith('ws://')) {
            console.warn('[Remote Debugging] Invalid WebSocket URL:', wsUrl)
            return
          }

          wsUrl = wsUrl.substring(5)
          const inspectorUrl = `${remoteDebugEndpoint}/devtools/inspector.html?ws=${wsUrl}`
          console.info(`Inspect remotely: ${inspectorUrl}`)

          if (!/^true$/i.test(env.APP_REMOTE_DEBUG_NO_OPEN || ''))
            void shell.openExternal(inspectorUrl)
        }
        catch (err) {
          console.error('[Remote Debugging] Failed to parse metadata from /json:', err)
        }
      })
    }).on('error', (err) => {
      console.error('[Remote Debugging] Failed to fetch metadata from /json:', err)
    })
  }
}
