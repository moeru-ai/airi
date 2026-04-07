import type { Server, ServerOptions } from '@proj-airi/server-runtime/server'
import type { Lifecycle } from 'injeca'

import type { ElectronServerChannelConfig } from '../../../../shared/eventa'

import { randomUUID, X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { errorMessageFrom } from '@moeru/std'
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
import { ensureServerChannelConfigDefaults } from './config'

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
let serverChannelServiceRegistered = false
let serverChannelCertificateTrustConfigured = false

interface ServerChannelCertificateVerifyRequest {
  hostname: string
  verificationResult: string
  errorCode: number
  certificate: {
    subject: {
      commonName: string
    }
    issuer: {
      commonName: string
      country: string
      locality: string
      organizations: string[]
    }
  }
}

function getServerChannelPort() {
  return env.SERVER_CHANNEL_PORT ? Number.parseInt(env.SERVER_CHANNEL_PORT) : 6121
}

async function getChannelServerConfig(): Promise<ElectronServerChannelConfig> {
  const config = channelServerConfigStore.get() || { hostname: '127.0.0.1', authToken: '', tlsConfig: null }

  return {
    hostname: config.hostname || '127.0.0.1',
    authToken: config.authToken || '',
    tlsConfig: config.tlsConfig || null,
  }
}

function getServerRuntimeBaseOptions() {
  return {
    port: getServerChannelPort(),
    hostname: '127.0.0.1',
  }
}

async function resolveServerRuntimeOptions(config: ServerOptions): Promise<ServerOptions> {
  return {
    ...getServerRuntimeBaseOptions(),
    auth: {
      token: 'authToken' in config && typeof config.authToken === 'string' ? config.authToken : '',
    },
    hostname: 'hostname' in config && typeof config.hostname === 'string'
      ? config.hostname || '127.0.0.1'
      : '127.0.0.1',
    tlsConfig: config.tlsConfig ? await getOrCreateCertificate() : null,
  }
}

async function normalizeChannelServerOptions(payload: unknown, fallback?: ElectronServerChannelConfig) {
  if (!fallback) {
    fallback = await getChannelServerConfig()
  }

  const parsed = channelServerInvokeConfigSchema.safeParse(payload)
  if (!parsed.success) {
    return fallback
  }

  const normalizedConfig = {
    hostname: parsed.data.hostname ?? fallback.hostname,
    authToken: parsed.data.authToken ?? fallback.authToken,
    tlsConfig: typeof parsed.data.tlsConfig === 'undefined' ? null : parsed.data.tlsConfig,
  }

  return ensureServerChannelConfigDefaults(normalizedConfig, randomUUID).config
}

function getCertificateDomains(): string[] {
  const localIPs = getLocalIPs()
  const hostname = channelServerConfigStore.get()?.hostname || env.SERVER_RUNTIME_HOSTNAME
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

function isTrustedServerChannelCertificate(request: ServerChannelCertificateVerifyRequest): boolean {
  if (!['CERT_AUTHORITY_INVALID', 'ERR_CERT_AUTHORITY_INVALID'].includes(request.verificationResult)
    && request.errorCode !== -202) {
    return false
  }

  if (!getCertificateDomains().includes(request.hostname)) {
    return false
  }

  const issuer = request.certificate.issuer
  return request.certificate.subject.commonName === 'localhost'
    && issuer.commonName === 'AIRI'
    && issuer.country === 'US'
    && issuer.locality === 'Local'
    && issuer.organizations.includes('AIRI')
}

function configureServerChannelCertificateTrust() {
  if (serverChannelCertificateTrustConfigured) {
    return
  }

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (isTrustedServerChannelCertificate(request)) {
      callback(0)
      return
    }

    callback(-3)
  })

  serverChannelCertificateTrustConfigured = true
}

async function installCACertificate(caCert: string) {
  const { caCertPath } = getCertificatePaths()
  const log = useLogg('main/server-runtime').useGlobalConfig()
  writeFileSync(caCertPath, caCert)

  try {
    if (platform === 'darwin') {
      await x('security', ['add-trusted-cert', '-d', '-r', 'trustRoot', '-k', join(app.getPath('home'), 'Library/Keychains/login.keychain-db'), caCertPath], { nodeOptions: { stdio: 'ignore' } })
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
        catch {
          // Ignore errors
        }
      }
    }
  }
  catch (error) {
    log.withError(error).warn(`Failed to install AIRI WebSocket CA certificate from ${caCertPath}`)
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
  }

  await installCACertificate(ca.cert)

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
  configureServerChannelCertificateTrust()

  const storedConfig = await getChannelServerConfig()
  const { changed: storedConfigChanged, config: normalizedStoredConfig } = ensureServerChannelConfigDefaults(storedConfig, randomUUID)
  if (storedConfigChanged) {
    channelServerConfigStore.update(normalizedStoredConfig)
  }

  const serverChannel = createServer(await resolveServerRuntimeOptions(normalizedStoredConfig))

  const mutex = new Mutex()

  params.lifecycle.appHooks.onStart(async () => {
    const release = await mutex.acquire()

    const log = useLogg('main/server-runtime').useGlobalConfig()

    try {
      await serverChannel.start()
      log.log('WebSocket server started')
    }
    catch (error) {
      log.withError(error).error('Error starting WebSocket server')
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
      await serverChannel.stop()
      log.log('WebSocket server closed')
    }
    catch (error) {
      log.withError(error).error('Error closing WebSocket server')
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
    async updateConfig(config) {
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

export async function createServerChannelService(params: { serverChannel: Server }) {
  if (serverChannelServiceRegistered) {
    return
  }
  serverChannelServiceRegistered = true

  const { context } = createContext(ipcMain)

  defineInvokeHandler(context, electronGetServerChannelConfig, async () => {
    return await getChannelServerConfig()
  })

  defineInvokeHandler(context, electronApplyServerChannelConfig, async (req) => {
    const current = await getChannelServerConfig()
    const next = await normalizeChannelServerOptions(req, current)
    const tlsChanged = JSON.stringify(next.tlsConfig) !== JSON.stringify(current.tlsConfig)
    const hostnameChanged = next.hostname !== current.hostname
    const authTokenChanged = next.authToken !== current.authToken
    const runtimeChanged = tlsChanged || hostnameChanged || authTokenChanged

    try {
      if (runtimeChanged) {
        const nextRuntimeOptions = await resolveServerRuntimeOptions(next)

        await params.serverChannel.updateConfig(nextRuntimeOptions)
        await params.serverChannel.restart()
      }
      else {
        await params.serverChannel.start()
      }

      channelServerConfigStore.update(next)
      return next
    }
    catch (error) {
      useLogg('main/server-runtime').withError(error).error('Failed to apply server channel configuration')
      if (runtimeChanged) {
        const previousRuntimeOptions = await resolveServerRuntimeOptions(current)

        try {
          await params.serverChannel.updateConfig(previousRuntimeOptions)
          await params.serverChannel.restart()
        }
        catch (rollbackError) {
          useLogg('main/server-runtime').withError(rollbackError).error('Failed to restore previous server channel configuration')
        }
      }

      throw new Error(errorMessageFrom(error) ?? 'Failed to apply server channel configuration')
    }
  })
}

export type { Server as ServerChannel }
