import { execSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
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

function getLocalIPs(): string[] {
  const interfaces = networkInterfaces()
  const addresses: string[] = []

  const isVirtualInterface = (name: string) => (
    name.startsWith('vboxnet')
    || name.startsWith('vmnet')
    || name.startsWith('docker')
    || name.startsWith('br-')
    || name.startsWith('veth')
    || name.startsWith('utun')
    || name.startsWith('wg')
    || name.startsWith('tap')
    || name.startsWith('tun')
  )

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries)
      continue
    if (isVirtualInterface(name))
      continue

    for (const entry of entries) {
      const rawAddress = entry.address
      if (!rawAddress)
        continue

      const address = rawAddress.includes('%') ? rawAddress.split('%')[0] : rawAddress
      if (isIP(address))
        addresses.push(address)
    }
  }

  return addresses
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

export async function setupServerChannel(options?: { websocketSecureEnabled?: boolean }) {
  const log = useLogg('main/server-runtime').useGlobalConfig()

  const secureEnabled = options?.websocketSecureEnabled ?? false

  try {
    const serverRuntime = await import('@proj-airi/server-runtime')
    const { plugin: ws } = await import('crossws/server')
    const { serve } = await import('h3')

    const h3App = serverRuntime.setupApp()

    const port = env.PORT ? Number(env.PORT) : 6121
    const hostname = env.SERVER_RUNTIME_HOSTNAME || '0.0.0.0'

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
    if (hostname === '0.0.0.0') {
      const ips = getLocalIPs().filter(ip => ip !== '127.0.0.1' && ip !== '::1')
      const targets = ips.length > 0 ? ips.join(', ') : 'localhost'
      log.log(`@proj-airi/server-runtime started on ${protocol}://0.0.0.0:${port} (reachable via: ${targets})`)
    }
    else {
      log.log(`@proj-airi/server-runtime started on ${protocol}://${hostname}:${port}`)
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
