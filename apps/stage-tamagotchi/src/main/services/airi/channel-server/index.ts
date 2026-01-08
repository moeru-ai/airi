import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createHttpsServer } from 'node:https'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { app } from 'electron'
import { toNodeListener } from 'h3'
import { createCA, createCert } from 'mkcert'

import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createConfig } from '../../../windows/shared/persistence'

interface ServerConfig {
  websocketSecureEnabled?: boolean
}

let serverInstance: { close: () => Promise<void> } | null = null

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

function readSettingsFromLocalStorage(): boolean {
  try {
    const userDataPath = app.getPath('userData')
    const settingsPath = join(userDataPath, 'websocket-settings.json')

    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.websocketSecureEnabled === true
    }
  }
  catch {
    // Ignore errors, fall back to config file
  }

  const {
    setup: setupConfig,
    get: getConfig,
  } = createConfig<ServerConfig>('websocket', 'config.json', { default: { websocketSecureEnabled: false } })

  setupConfig()
  const config = getConfig()
  return config?.websocketSecureEnabled ?? false
}

export async function setupServerChannel() {
  const log = useLogg('main/server-runtime').useGlobalConfig()

  const secureEnabled = readSettingsFromLocalStorage()

  try {
    const serverRuntime = await import('@proj-airi/server-runtime')
    const { plugin: ws } = await import('crossws/server')

    const h3App = serverRuntime.setupApp()

    const port = env.PORT ? Number(env.PORT) : 6121
    const hostname = env.SERVER_RUNTIME_HOSTNAME || 'localhost'

    if (secureEnabled) {
      const { cert, key } = await getOrCreateCertificate()

      const httpsServer = createHttpsServer({ cert, key }, toNodeListener(h3App))

      const wsPlugin = ws({ resolve: async (req) => {
        // @ts-expect-error - the .crossws property wasn't extended in types
        return (await h3App.fetch(req)).crossws
      } })
      httpsServer.on('upgrade', async (request, socket, head) => {
        await wsPlugin.upgrade(request, socket, head)
      })

      await new Promise<void>((resolve, reject) => {
        httpsServer.listen(port, hostname, () => {
          resolve()
        })
        httpsServer.on('error', reject)
      })

      serverInstance = {
        close: async () => {
          return new Promise<void>((resolve) => {
            httpsServer.close(() => resolve())
          })
        },
      }

      log.log(`@proj-airi/server-runtime started on wss://${hostname}:${port}`)
    }
    else {
      const { serve } = await import('h3')

      const instance = serve(h3App, {
        // TODO: fix types
        // @ts-expect-error - the .crossws property wasn't extended in types
        plugins: [ws({ resolve: async req => (await h3App.fetch(req)).crossws })],
        port,
        hostname,
        reusePort: true,
        silent: true,
        manual: true,
        gracefulShutdown: {
          forceTimeout: 0.5,
          gracefulTimeout: 0.5,
        },
      })

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

      serverInstance = instance

      log.log(`@proj-airi/server-runtime started on ws://${hostname}:${port}`)
    }

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

export async function restartServerChannel() {
  if (serverInstance && typeof serverInstance.close === 'function') {
    try {
      await serverInstance.close()
    }
    catch {
      // Ignore errors when closing
    }
  }
  serverInstance = null
  await setupServerChannel()
}
