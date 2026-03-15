import type { Server, ServerOptions } from '@proj-airi/server-runtime/server'
import type { Lifecycle } from 'injeca'

import { X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env, platform } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { createServer, getLocalIPs } from '@proj-airi/server-runtime/server'
import { Mutex } from 'async-mutex'
import { app, ipcMain } from 'electron'
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
  tlsConfig: optional(nullable(object({
    cert: optional(string()),
    key: optional(string()),
    passphrase: optional(string()),
  }))),
})

const channelServerInvokeConfigSchema = z.object({
  tlsConfig: z.object({ }).nullable().optional(),
}).strict()

const channelServerConfigStore = createConfig('server-channel', 'config.json', channelServerConfigSchema, {
  default: {
    tlsConfig: null,
  },
  autoHeal: true,
})

async function getChannelServerConfig(): Promise<ServerOptions> {
  return channelServerConfigStore.get() || { tlsConfig: null }
}

async function normalizeChannelServerOptions(payload: unknown, fallback?: ServerOptions) {
  if (!fallback) {
    fallback = await getChannelServerConfig()
  }

  const parsed = channelServerInvokeConfigSchema.safeParse(payload)
  if (!parsed.success) {
    return fallback
  }

  return {
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

async function installCACertificate(caCert: string) {
  const userDataPath = app.getPath('userData')
  const caCertPath = join(userDataPath, 'websocket-ca-cert.pem')
  writeFileSync(caCertPath, caCert)

  try {
    if (platform === 'darwin') {
      await x(`security`, ['add-trusted-cert', '-d', '-r', 'trustRoot', '-k', '/Library/Keychains/System.keychain', `"${caCertPath}"`], { nodeOptions: { stdio: 'ignore' } })
    }
    else if (platform === 'win32') {
      await x(`certutil`, ['-addstore', '-f', 'Root', `"${caCertPath}"`], { nodeOptions: { stdio: 'ignore' } })
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
            await x(`mkdir`, ['-p', `"${userCaDir}"`], { nodeOptions: { stdio: 'ignore' } })
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
  const userDataPath = app.getPath('userData')
  const certPath = join(userDataPath, 'websocket-cert.pem')
  const keyPath = join(userDataPath, 'websocket-key.pem')
  const expectedDomains = getCertificateDomains()

  if (existsSync(certPath) && existsSync(keyPath)) {
    const cert = readFileSync(certPath, 'utf-8')
    const key = readFileSync(keyPath, 'utf-8')
    if (certHasAllDomains(cert, expectedDomains)) {
      return { cert, key }
    }
  }

  const { cert, key } = await generateCertificate()
  writeFileSync(certPath, cert)
  writeFileSync(keyPath, key)

  return { cert, key }
}

export async function setupServerChannel(params: { lifecycle: Lifecycle }): Promise<Server> {
  channelServerConfigStore.setup()

  const storedConfig = await getChannelServerConfig()

  const serverChannel = createServer({
    ...storedConfig,
    port: env.PORT ? Number.parseInt(env.PORT) : 6121,
    hostname: env.SERVER_RUNTIME_HOSTNAME || '0.0.0.0',
    tlsConfig: storedConfig.tlsConfig ? await getOrCreateCertificate() : null,
  })

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
  const { context } = createContext(ipcMain)

  defineInvokeHandler(context, electronGetServerChannelConfig, async () => {
    return await getChannelServerConfig()
  })

  defineInvokeHandler(context, electronApplyServerChannelConfig, async (req) => {
    try {
      const current = await getChannelServerConfig()
      const next = await normalizeChannelServerOptions(req, current)
      const changed = JSON.stringify(next.tlsConfig) !== JSON.stringify(current.tlsConfig)

      channelServerConfigStore.update(next)

      if (changed) {
        await params.serverChannel.stop()
        await params.serverChannel.updateConfig({
          port: env.PORT ? Number.parseInt(env.PORT) : 6121,
          hostname: env.SERVER_RUNTIME_HOSTNAME || '0.0.0.0',
          tlsConfig: next.tlsConfig ? await getOrCreateCertificate() : null,
        })
        await params.serverChannel.start()
      }
      else {
        await params.serverChannel.start()
      }

      return next
    }
    catch (error) {
      useLogg('main/server-runtime').withError(error).error('Failed to apply server channel configuration')
    }
  })
}

export type { Server as ServerChannel }
