import type { Server, ServerOptions } from '@proj-airi/server-runtime/server'
import type { Lifecycle } from 'injeca'

import type { ElectronServerChannelConfig, ElectronServerChannelTlsConfig } from '../../../../shared/eventa'

import { randomUUID, X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Socket } from 'node:net'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { createServer, getLocalIPs } from '@proj-airi/server-runtime/server'
import { Mutex } from 'async-mutex'
import { app, ipcMain, session } from 'electron'
import { createCA, createCert } from 'mkcert'
import { x } from 'tinyexec'
import { nullable, object, optional, string } from 'valibot'
import { z } from 'zod'

import {
  electronApplyServerChannelConfig,
  electronGetServerChannelConfig,

} from '../../../../shared/eventa'
import { createConfig } from '../../../libs/electron/persistence'

const channelServerConfigSchema = object({
  hostname: optional(string()),
  authToken: optional(string()),
  tlsConfig: optional(nullable(object({
    cert: optional(string()),
    key: optional(string()),
    passphrase: optional(string()),
  }))),
})

const channelServerInvokeConfigSchema = z.object({
  hostname: z.string().optional(),
  authToken: z.string().optional(),
  tlsConfig: z.object({ }).nullable().optional(),
}).strict()

const channelServerConfigStore = createConfig('server-channel', 'config.json', channelServerConfigSchema, {
  default: {
    hostname: '127.0.0.1',
    authToken: '',
    tlsConfig: null,
  },
  autoHeal: true,
})

function getServerChannelPort() {
  return env.SERVER_CHANNEL_PORT ? Number.parseInt(env.SERVER_CHANNEL_PORT) : 6121
}

async function getChannelServerConfig(): Promise<ElectronServerChannelConfig> {
  const config = channelServerConfigStore.get() || { hostname: '127.0.0.1', authToken: '', tlsConfig: null }
  return {
    hostname: config.hostname || '127.0.0.1',
    authToken: config.authToken || '',
    tlsConfig: (config.tlsConfig || null) as ElectronServerChannelTlsConfig | null,
  }
}

async function normalizeChannelServerOptions(payload: unknown, fallback?: any) {
  if (!fallback) {
    fallback = await getChannelServerConfig()
  }

  const parsed = channelServerInvokeConfigSchema.safeParse(payload)
  if (!parsed.success) {
    return fallback
  }

  return {
    hostname: parsed.data.hostname ?? fallback.hostname,
    authToken: parsed.data.authToken ?? fallback.authToken,
    tlsConfig: typeof parsed.data.tlsConfig === 'undefined' ? null : parsed.data.tlsConfig,
  }
}

function getCertificateDomains(): string[] {
  const localIPs = getLocalIPs()
  const hostname = env.SERVER_RUNTIME_HOSTNAME
  return Array.from(new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    ...(hostname ? [hostname] : []),
    ...localIPs,
  ]))
}

function getCertificatePaths() {
  const userDataPath = app.getPath('userData')

  return {
    certPath: join(userDataPath, 'websocket-cert.pem'),
    keyPath: join(userDataPath, 'websocket-key.pem'),
    caCertPath: join(userDataPath, 'websocket-ca-cert.pem'),
    caKeyPath: join(userDataPath, 'websocket-ca-key.pem'),
  }
}

function withCertificateChain(cert: string, caCert?: string) {
  return caCert ? `${cert.trim()}\n${caCert.trim()}\n` : cert
}

function certHasAllDomains(certPem: string, domains: string[]): boolean {
  try {
    const cert = new X509Certificate(certPem)
    const san = cert.subjectAltName || ''
    const entries = san.split(',').map(part => part.trim())
    const values = entries
      .map((entry) => {
        if (entry.startsWith('DNS:'))
          return entry.slice(4).trim()
        if (entry.startsWith('IP Address:'))
          return entry.slice(11).trim()
        return ''
      })
      .filter(Boolean)

    const sanSet = new Set(values)
    return domains.every(domain => sanSet.has(domain))
  }
  catch {
    return false
  }
}

/**
 * Checks if the given certificate is trusted by our generated CA.
 */
function isTrustedServerChannelCertificate(certData: string | Buffer, caCertPem: string): boolean {
  try {
    const caCert = new X509Certificate(caCertPem)
    const cert = new X509Certificate(certData)
    return cert.verify(caCert.publicKey)
  }
  catch {
    return false
  }
}

/**
 * Configures the Electron session to trust our generated CA certificate specifically
 * for the server channel.
 */
function configureServerChannelCertificateTrust(caCertPem: string) {
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // Only trust our generated certificate if it matches our CA's signature.
    if (isTrustedServerChannelCertificate(request.certificate.data, caCertPem)) {
      callback(0) // Trusted
    }
    else {
      callback(-2) // Use default verification logic
    }
  })
}

async function installCACertificate(caCert: string) {
  const { caCertPath } = getCertificatePaths()
  writeFileSync(caCertPath, caCert)

  try {
    if (platform === 'darwin') {
      await x('security', ['add-trusted-cert', '-d', '-r', 'trustRoot', '-k', '/Library/Keychains/System.keychain', caCertPath], { nodeOptions: { stdio: 'ignore' } })
    }
    else if (platform === 'win32') {
      await x('certutil', ['-addstore', '-f', 'Root', caCertPath], { nodeOptions: { stdio: 'ignore' } })
    }
    else if (platform === 'linux') {
      const caDir = '/usr/local/share/ca-certificates'
      const caFileName = 'airi-websocket-ca.crt'
      try {
        writeFileSync(join(caDir, caFileName), caCert)
        await x('update-ca-certificates', [], { nodeOptions: { stdio: 'ignore' } })
      }
      catch {
        const userCaDir = join(env.HOME || '', '.local/share/ca-certificates')
        try {
          if (!existsSync(userCaDir)) {
            await x('mkdir', ['-p', userCaDir], { nodeOptions: { stdio: 'ignore' } })
          }
          writeFileSync(join(userCaDir, caFileName), caCert)
        }
        catch (error) {
          useLogg('main/services/channel-server').withError(error as any).error('Failed to install certificate for Linux (user share)')
        }
      }
    }
  }
  catch (error) {
    useLogg('main/services/channel-server').withError(error as any).error('Failed to install CA certificate to system store')
  }
}

async function generateCertificate() {
  const { caCertPath, caKeyPath } = getCertificatePaths()

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
    configureServerChannelCertificateTrust(ca.cert)
  }

  const domains = getCertificateDomains()

  const cert = await createCert({
    ca: { key: ca.key, cert: ca.cert },
    domains,
    validity: 365,
  })

  return {
    cert: cert.cert,
    key: cert.key,
  }
}

async function getOrCreateCertificate() {
  const { certPath, keyPath, caCertPath } = getCertificatePaths()
  const expectedDomains = getCertificateDomains()

  if (existsSync(certPath) && existsSync(keyPath)) {
    const cert = readFileSync(certPath, 'utf-8')
    const key = readFileSync(keyPath, 'utf-8')
    if (certHasAllDomains(cert, expectedDomains)) {
      const caCert = existsSync(caCertPath) ? readFileSync(caCertPath, 'utf-8') : undefined
      return { cert: withCertificateChain(cert, caCert), key }
    }
  }

  const { cert, key } = await generateCertificate()
  writeFileSync(certPath, cert)
  writeFileSync(keyPath, key)

  const caCert = existsSync(caCertPath) ? readFileSync(caCertPath, 'utf-8') : undefined
  return { cert: withCertificateChain(cert, caCert), key }
}

export async function setupServerChannel(params: { lifecycle: Lifecycle }): Promise<Server> {
  channelServerConfigStore.setup()

  const storedConfig = await getChannelServerConfig()
  console.log('[main/services/channel-server] Loaded stored config. Token exists:', !!storedConfig.authToken)

  if (!storedConfig.authToken) {
    const newToken = randomUUID()
    console.log('[main/services/channel-server] No authToken found. Generating new one:', newToken)
    storedConfig.authToken = newToken
    // Update synchronously (saves internally)
    channelServerConfigStore.update({
      hostname: storedConfig.hostname,
      authToken: storedConfig.authToken,
      tlsConfig: storedConfig.tlsConfig,
    })
    console.log('[main/services/channel-server] authToken generated.')
  }
  else {
    console.log('[main/services/channel-server] Using existing authToken:', storedConfig.authToken)
  }

  const serverOptions: ServerOptions = {
    auth: { token: storedConfig.authToken },
    port: getServerChannelPort(),
    hostname: storedConfig.hostname || env.SERVER_RUNTIME_HOSTNAME || '127.0.0.1',
    tlsConfig: storedConfig.tlsConfig ? await getOrCreateCertificate() : null,
  }

  const serverChannel = createServer(serverOptions)

  const mutex = new Mutex()
  let startLoopTask: Promise<void> | null = null
  let healthCheckTimer: NodeJS.Timeout | null = null

  function getRuntimePort() {
    return getServerChannelPort()
  }

  function isPortListening(port: number) {
    return new Promise<boolean>((resolve) => {
      const socket = new Socket()
      let settled = false

      const settle = (value: boolean) => {
        if (settled)
          return
        settled = true
        socket.destroy()
        resolve(value)
      }

      socket.once('connect', () => settle(true))
      socket.once('error', () => settle(false))
      socket.setTimeout(1500, () => settle(false))
      socket.connect(port, storedConfig.hostname || '127.0.0.1')
    })
  }

  async function ensureServerRunning(reason: string) {
    if (startLoopTask)
      return startLoopTask

    const log = useLogg('main/server-runtime').useGlobalConfig()
    startLoopTask = (async () => {
      let attempt = 0

      while (true) {
        attempt += 1
        try {
          await serverChannel.start()
          if (await isPortListening(getRuntimePort())) {
            log.withFields({ reason, attempt, port: getRuntimePort() }).log('WebSocket server confirmed ready')
            return
          }

          throw new Error(`WebSocket server was not listening on port ${getRuntimePort()} after start`)
        }
        catch (error) {
          const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10000)
          log.withFields({ reason, attempt, delayMs, port: getRuntimePort() }).withError(error as Error).error('WebSocket server start failed, retrying')
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }
    })().finally(() => {
      startLoopTask = null
    })

    return startLoopTask
  }

  params.lifecycle.appHooks.onStart(async () => {
    const release = await mutex.acquire()

    const log = useLogg('main/server-runtime').useGlobalConfig()

    try {
      await ensureServerRunning('app startup')
      healthCheckTimer = setInterval(async () => {
        if (!(await isPortListening(getRuntimePort()))) {
          log.withFields({ port: getRuntimePort() }).warn('WebSocket server is down while app is running, restarting')
          await ensureServerRunning('health check')
        }
      }, 5000)
      log.log('WebSocket server started')
    }
    catch (error) {
      log.withError(error as Error).error('Error starting WebSocket server')
    }
    finally {
      release()
    }
  })
  params.lifecycle.appHooks.onStop(async () => {
    const release = await mutex.acquire()

    const log = useLogg('main/server-runtime').useGlobalConfig()
    if (!serverChannel) {
      return
    }

    try {
      if (healthCheckTimer) {
        clearInterval(healthCheckTimer)
        healthCheckTimer = null
      }
      await serverChannel.stop()
      log.log('WebSocket server closed')
    }
    catch (error) {
      log.withError(error as Error).error('Error closing WebSocket server')
    }
    finally {
      release()
    }
  })

  return {
    getConnectionHost() {
      return serverChannel.getConnectionHost()
    },
    async start() {
      const release = await mutex.acquire()
      try {
        await serverChannel.start()
      }
      finally {
        release()
      }
    },
    async restart() {
      const release = await mutex.acquire()
      try {
        await serverChannel.stop()
        await serverChannel.start()
      }
      finally {
        release()
      }
    },
    async stop() {
      const release = await mutex.acquire()
      try {
        await serverChannel.stop()
      }
      finally {
        release()
      }
    },
    async updateConfig(config: ServerOptions) {
      const release = await mutex.acquire()
      try {
        await serverChannel.updateConfig(config)
      }
      finally {
        release()
      }
    },
  }
}

let serverChannelServiceRegistered = false

export async function createServerChannelService(params: { serverChannel: Server }) {
  if (serverChannelServiceRegistered) {
    return
  }
  serverChannelServiceRegistered = true

  const { context } = createContext(ipcMain)
  console.log('[main/services/channel-server] Registering Eventa invoke handlers')

  defineInvokeHandler(context, electronGetServerChannelConfig, async () => {
    const startedAt = Date.now()
    console.log('[main/services/channel-server] getServerChannelConfig invoked')
    const config = await getChannelServerConfig()
    console.log(`[main/services/channel-server] getServerChannelConfig resolved in ${Date.now() - startedAt}ms`)
    return {
      tlsConfig: config.tlsConfig,
      authToken: config.authToken,
      hostname: config.hostname,
    }
  })

  defineInvokeHandler(context, electronApplyServerChannelConfig, async (req) => {
    try {
      const current = await getChannelServerConfig()
      const next = await normalizeChannelServerOptions(req, current)

      const tlsChanged = JSON.stringify(next.tlsConfig) !== JSON.stringify(current.tlsConfig)

      // Update synchronously (saves internally)
      channelServerConfigStore.update({
        hostname: next.hostname,
        authToken: next.authToken,
        tlsConfig: next.tlsConfig,
      })

      if (tlsChanged) {
        await params.serverChannel.stop()
        await params.serverChannel.updateConfig({
          auth: { token: next.authToken },
          port: getServerChannelPort(),
          hostname: next.hostname || '127.0.0.1',
          tlsConfig: next.tlsConfig ? await getOrCreateCertificate() : null,
        })
        await params.serverChannel.start()
      }
      else {
        // Propagate other changes even if TLS didn't change
        await params.serverChannel.updateConfig({
          auth: { token: next.authToken },
          hostname: next.hostname || '127.0.0.1',
        })
        // Ensure it's running
        await params.serverChannel.start()
      }

      return {
        tlsConfig: next.tlsConfig,
        authToken: next.authToken,
        hostname: next.hostname,
      }
    }
    catch (error) {
      useLogg('main/services/channel-server').withError(error as Error).error('Failed to apply server channel configuration')
      throw error
    }
  })
}

export type { Server as ServerChannel }
