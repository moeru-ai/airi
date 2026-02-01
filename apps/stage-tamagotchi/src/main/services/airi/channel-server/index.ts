import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { app, ipcMain } from 'electron'
import { createCA, createCert } from 'mkcert'

import { electronRestartWebSocketServer, electronStartWebSocketServer } from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

let serverInstance: { close: (closeActiveConnections?: boolean) => Promise<void> } | null = null

async function installCACertificate(caCert: string) {
  const userDataPath = app.getPath('userData')
  const caCertPath = join(userDataPath, 'websocket-ca-cert.pem')
  writeFileSync(caCertPath, caCert)

  try {
    if (platform === 'darwin') {
      execSync(`security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${caCertPath}"`, { stdio: 'ignore' })
    }
    else if (platform === 'win32') {
      execSync(`certutil -addstore -f "Root" "${caCertPath}"`, { stdio: 'ignore' })
    }
    else if (platform === 'linux') {
      const caDir = '/usr/local/share/ca-certificates'
      const caFileName = 'airi-websocket-ca.crt'
      try {
        writeFileSync(join(caDir, caFileName), caCert)
        execSync('update-ca-certificates', { stdio: 'ignore' })
      }
      catch {
        const userCaDir = join(env.HOME || '', '.local/share/ca-certificates')
        try {
          if (!existsSync(userCaDir)) {
            execSync(`mkdir -p "${userCaDir}"`, { stdio: 'ignore' })
          }
          writeFileSync(join(userCaDir, caFileName), caCert)
        }
        catch {
          // Ignore errors
        }
      }
    }
  }
  catch {
    // Ignore installation errors
  }
}

async function generateCertificate() {
  const userDataPath = app.getPath('userData')
  const caCertPath = join(userDataPath, 'websocket-ca-cert.pem')
  const caKeyPath = join(userDataPath, 'websocket-ca-key.pem')

  let ca: { key: string, cert: string }

  if (existsSync(caCertPath) && existsSync(caKeyPath)) {
    ca = {
      cert: readFileSync(caCertPath, 'utf-8'),
      key: readFileSync(caKeyPath, 'utf-8'),
    }
  }
  else {
    ca = await createCA({
      organization: 'AIRI',
      countryCode: 'US',
      state: 'Development',
      locality: 'Local',
      validity: 365,
    })
    writeFileSync(caCertPath, ca.cert)
    writeFileSync(caKeyPath, ca.key)

    await installCACertificate(ca.cert)
  }

  const cert = await createCert({
    ca: { key: ca.key, cert: ca.cert },
    domains: ['localhost', '127.0.0.1', env.SERVER_RUNTIME_HOSTNAME || 'localhost'],
    validity: 365,
  })

  return {
    cert: cert.cert,
    key: cert.key,
  }
}

async function getOrCreateCertificate() {
  const userDataPath = app.getPath('userData')
  const certPath = join(userDataPath, 'websocket-cert.pem')
  const keyPath = join(userDataPath, 'websocket-key.pem')

  if (existsSync(certPath) && existsSync(keyPath)) {
    return {
      cert: readFileSync(certPath, 'utf-8'),
      key: readFileSync(keyPath, 'utf-8'),
    }
  }

  const { cert, key } = await generateCertificate()
  writeFileSync(certPath, cert)
  writeFileSync(keyPath, key)

  return { cert, key }
}

export async function setupServerChannel(options?: { websocketSecureEnabled?: boolean }) {
  const log = useLogg('main/server-runtime').useGlobalConfig()

  const secureEnabled = options?.websocketSecureEnabled ?? false

  try {
    const serverRuntime = await import('@proj-airi/server-runtime')
    const { plugin: ws } = await import('crossws/server')
    const { serve } = await import('h3')

    const h3App = serverRuntime.setupApp()

    const port = env.PORT ? Number(env.PORT) : 6121
    const hostname = env.SERVER_RUNTIME_HOSTNAME || 'localhost'

    // FIXME: should prompt user to grant permission to save certificate files on macOS
    const tls = secureEnabled ? await getOrCreateCertificate() : undefined

    const instance = serve(h3App.app, {
      // @ts-expect-error - the .crossws property wasn't extended in types
      plugins: [ws({ resolve: async req => (await h3App.app.fetch(req)).crossws })],
      port,
      hostname,
      tls,
      reusePort: true,
      silent: true,
      manual: true,
      gracefulShutdown: {
        forceTimeout: 0.5,
        gracefulTimeout: 0.5,
      },
    })

    serverInstance = {
      close: async (closeActiveConnections = false) => {
        log.log('closing all peers')
        h3App.closeAllPeers()
        log.log('closing server instance')
        await instance.close(closeActiveConnections)
        log.log('server instance closed')
      },
    }

    const servePromise = instance.serve()
    if (servePromise instanceof Promise) {
      servePromise.catch((error) => {
        const nodejsError = error as NodeJS.ErrnoException
        if ('code' in nodejsError && nodejsError.code === 'EADDRINUSE') {
          log.withError(error).warn('Port already in use, assuming server is already running')
          return
        }

        log.withError(error).error('Error serving WebSocket server')
      })
    }

    const protocol = secureEnabled ? 'wss' : 'ws'
    log.log(`@proj-airi/server-runtime started on ${protocol}://${hostname}:${port}`)

    onAppBeforeQuit(async () => {
      if (serverInstance && typeof serverInstance.close === 'function') {
        try {
          await serverInstance.close()
          log.log('WebSocket server closed')
        }
        catch (error) {
          const nodejsError = error as NodeJS.ErrnoException
          if ('code' in nodejsError && nodejsError.code === 'ERR_SERVER_NOT_RUNNING') {
            return
          }

          log.withError(error).error('Error closing WebSocket server')
        }
      }
    })
  }
  catch (error) {
    log.withError(error).error('failed to start WebSocket server')
  }
}

export async function restartServerChannel(options?: { websocketSecureEnabled?: boolean }) {
  const log = useLogg('main/server-runtime').useGlobalConfig()
  log.log('restarting server channel', { options })

  if (serverInstance && typeof serverInstance.close === 'function') {
    try {
      log.log('closing existing server instance')
      await serverInstance.close(true)
      log.log('existing server instance closed')
    }
    catch {
      // Ignore errors when closing
    }
  }
  serverInstance = null
  await setupServerChannel(options)
}

export function setupServerChannelHandlers() {
  const { context } = createContext(ipcMain)

  defineInvokeHandler(context, electronStartWebSocketServer, async (req) => {
    await setupServerChannel({ websocketSecureEnabled: req?.websocketSecureEnabled })
  })

  defineInvokeHandler(context, electronRestartWebSocketServer, async (req) => {
    await restartServerChannel({ websocketSecureEnabled: req?.websocketSecureEnabled })
  })
}
