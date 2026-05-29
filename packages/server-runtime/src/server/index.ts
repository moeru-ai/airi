import type { AppOptions } from '..'
import type { MdnsAdvertiser } from '../discovery/mdns'

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { merge } from '@moeru/std'
import { plugin as ws } from 'crossws/server'
import { serve } from 'h3'
import { nanoid } from 'nanoid'

import { normalizeLoggerConfig, setupApp } from '..'
import { optionOrEnv } from '../config'
import { createMdnsAdvertiser } from '../discovery/mdns'

export interface ServerOptions extends AppOptions {
  port?: number
  hostname?: string
  tlsConfig?: {
    cert?: string
    key?: string
    passphrase?: string
  } | null
  /**
   * mDNS auto-discovery configuration.
   *
   * When enabled, the server advertises itself on the local link via DNS-SD
   * (`_airi._tcp.local`) so native clients can discover it without manual
   * IP/port entry.
   *
   * @default { enabled: false, serviceName: 'airi-websocket-server' }
   */
  mdns?: {
    /**
     * Opt-in flag. Also controllable via `MDNS_ADVERTISE=true` env variable.
     *
     * @default false
     */
    enabled?: boolean
    /**
     * Service instance label used to derive the `.local` hostname.
     *
     * @default 'airi-websocket-server'
     */
    serviceName?: string
  }
}

interface ServerInstance {
  close: (closeActiveConnections?: boolean) => Promise<void>
}

export interface Server {
  getConnectionHost: () => string[]
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  updateConfig: (newOptions: ServerOptions) => void
}

function isAddressInUseError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
}

/**
 * Returns true when the given IP is within the IPv4 loopback range (127.0.0.0/8)
 * or is the IPv6 loopback address (::1).
 *
 * Use when:
 * - Deciding whether a discovered local IP should be advertised to LAN clients
 *
 * Expects:
 * - A bare IP string with no port, brackets, or zone ID
 *
 * Returns:
 * - true for any 127.x.x.x address or ::1; false otherwise
 */
export function isLoopbackAddress(ip: string): boolean {
  return ip.startsWith('127.') || ip === '::1'
}

/**
 * Returns true when the given IP is an IPv6 link-local address (fe80::/10).
 *
 * Link-local addresses are not routable beyond the local segment and are
 * unreliable for LAN clients once the zone ID has been stripped.
 *
 * Use when:
 * - Filtering addresses that should not be published for remote connections
 *
 * Expects:
 * - A bare IPv6 string with zone IDs already removed (the `%` suffix)
 *
 * Returns:
 * - true for fe80:: through febf:: addresses; false otherwise
 */
export function isLinkLocalAddress(ip: string): boolean {
  // fe80::/10 spans fe80:: – febf::; the second nibble is always 8, 9, a, or b.
  return /^fe[89ab]/i.test(ip)
}

/**
 * Returns true when the given IP is an IPv4 link-local (APIPA) address (169.254.0.0/16).
 *
 * APIPA addresses are self-assigned by the OS when DHCP is unavailable and are
 * not routable beyond the local segment. Publishing them in mDNS A records would
 * let clients discover and attempt an endpoint that cannot be reached from a
 * normal LAN address — causing connection failures similar to the IPv6 link-local
 * case handled by {@link isLinkLocalAddress}.
 *
 * Use when:
 * - Filtering addresses that should not be published for remote connections
 *
 * Expects:
 * - A bare IPv4 string with no port
 *
 * Returns:
 * - true for 169.254.x.x addresses; false otherwise
 */
export function isIPv4LinkLocalAddress(ip: string): boolean {
  return ip.startsWith('169.254.')
}

/**
 * Collects local IP addresses that can be used to reach the server from the LAN.
 *
 * Use when:
 * - Building connection hints for `0.0.0.0` listeners
 * - Showing reachable addresses in logs or UI
 *
 * Expects:
 * - Virtual interfaces should be ignored to reduce noisy or misleading addresses
 *
 * Returns:
 * - A de-duplicated list of valid IP addresses discovered from the host network interfaces
 */
export function getLocalIPs(): string[] {
  const interfaces = networkInterfaces()
  const addresses = new Set<string>()

  const VIRTUAL_INTERFACE_PREFIXES = [
    'vboxnet',
    'vmnet',
    'docker',
    'br-',
    'veth',
    'utun',
    'wg',
    'tap',
    'tun',
  ]
  const isVirtualInterface = (name: string) =>
    VIRTUAL_INTERFACE_PREFIXES.some(prefix => name.startsWith(prefix))

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
        addresses.add(address)
    }
  }

  return [...addresses]
}

/**
 * Creates the websocket server controller for the AIRI runtime.
 *
 * Use when:
 * - Starting, stopping, or restarting the standalone runtime server
 * - Updating bind options between restarts
 *
 * Expects:
 * - The returned controller to manage a single active server instance at a time
 *
 * Returns:
 * - Lifecycle helpers for starting, stopping, restarting, and updating server options
 */
export function createServer(opts?: ServerOptions): Server {
  let options = merge<ServerOptions>({ port: 6121, hostname: '127.0.0.1' }, opts)

  const { appLogFormat, appLogLevel } = normalizeLoggerConfig(options)
  const log = useLogg('@proj-airi/server-runtime/server').withLogLevelString(appLogLevel).withFormat(appLogFormat)
  let serverInstance: ServerInstance | null = null
  let startTask: Promise<void> | null = null
  let advertiser: MdnsAdvertiser | null = null
  // Generated once so restart() reuses the same id; clients that deduplicate by
  // the TXT id field won't see the runtime as a second server after a restart.
  const fallbackInstanceId = nanoid()

  log.withFields({ hasTlsConfig: !!options?.tlsConfig }).log('creating server channel')

  async function closeServer(closeActiveConnections = false) {
    if (advertiser) {
      await advertiser.stop().catch(error => log.withError(error).warn('mdns stop failed'))
      advertiser = null
    }

    if (!serverInstance || typeof serverInstance.close !== 'function') {
      return
    }

    try {
      if (closeActiveConnections) {
        log.log('closing existing server instance')
      }
      await serverInstance.close(closeActiveConnections)
      if (closeActiveConnections) {
        log.log('existing server instance closed')
      }
    }
    catch (error) {
      const nodejsError = error as NodeJS.ErrnoException
      if ('code' in nodejsError && nodejsError.code === 'ERR_SERVER_NOT_RUNNING') {
        return
      }

      log.withError(error).error('Error closing WebSocket server')
    }
    finally {
      serverInstance = null
    }
  }

  async function start() {
    if (serverInstance) {
      return
    }
    if (startTask) {
      return startTask
    }

    // Capture identity so the finally block can skip the clear if a concurrent
    // restart() has already assigned a new task to the shared slot.
    const thisTask: Promise<void> = startTask = (async () => {
      const secureEnabled = options?.tlsConfig != null
      const instanceId = options?.instanceId ?? optionOrEnv(undefined, 'SERVER_INSTANCE_ID', fallbackInstanceId)
      const h3App = setupApp({ ...options, instanceId })

      const port = options.port
      const hostname = options.hostname

      const instance = serve(h3App.app, {
        // @ts-expect-error - the .crossws property wasn't extended in types
        plugins: [ws({ resolve: async req => (await h3App.app.fetch(req)).crossws })],
        port,
        hostname,
        tls: options?.tlsConfig || undefined,
        reusePort: true,
        silent: true,
        manual: true,
        gracefulShutdown: {
          forceTimeout: 0.5,
          gracefulTimeout: 0.5,
        },
      })

      try {
        serverInstance = {
          close: async (closeActiveConnections = false) => {
            h3App.dispose()
            log.log('closing server instance')
            await instance.close(closeActiveConnections)
            log.log('server instance closed')
          },
        }

        await instance.serve()

        // The listener is now accepting connections. Release the deduplication guard so
        // that a concurrent restart() can open a fresh listener while mDNS setup is still
        // in progress. serverInstance is the lifecycle guard from here on; startTask is
        // only needed to serialise concurrent calls before the socket is bound.
        startTask = null

        const protocol = secureEnabled ? 'wss' : 'ws'
        if (hostname === '0.0.0.0') {
          const ips = getLocalIPs().filter(ip => !isLoopbackAddress(ip) && !isLinkLocalAddress(ip))
          const targets = ips.length > 0 ? ips.join(', ') : 'localhost'
          log.log(`@proj-airi/server-runtime started on ${protocol}://0.0.0.0:${port} (reachable via: ${targets})`)
        }
        else {
          // Bracket IPv6 literals (e.g. ::, ::1) so the logged URL is well-formed.
          const displayHost = hostname?.includes(':') ? `[${hostname}]` : hostname
          log.log(`@proj-airi/server-runtime started on ${protocol}://${displayHost}:${port}`)
        }

        // mDNS auto-discovery (opt-in)
        const mdnsEnabled = options?.mdns?.enabled
          ?? (env.MDNS_ADVERTISE === 'true' || env.MDNS_ADVERTISE === '1')
        if (mdnsEnabled) {
          const isIPv4Wildcard = hostname === '0.0.0.0'
          const isIPv6Wildcard = hostname === '::'

          let mdnsAddresses: string[] = []
          let mdnsSkipReason: string | null = null

          if (isIPv4Wildcard) {
            mdnsAddresses = getLocalIPs().filter(ip => !ip.includes(':') && !isLoopbackAddress(ip) && !isIPv4LinkLocalAddress(ip))
          }
          else if (isIPv6Wildcard) {
            // :: accepts connections on all interfaces for both IPv4 and IPv6 on dual-stack hosts.
            // The mDNS transport is udp4 (224.0.0.251); IPv6-only discovery (udp6/ff02::fb) is
            // not yet supported. Collect all non-loopback addresses but skip if there is no IPv4
            // address available to carry the advertisement.
            // fe80::/10 link-local addresses (fe80::–febf::) are scoped to a single interface
            // and require a zone id (e.g. fe80::1%en0) to be reachable; getLocalIPs() strips
            // that zone id so any unscoped record we advertise would be unroutable on
            // multi-interface hosts. /^fe[89ab]/i matches the full /10 range (second-byte
            // high nibble 8–b covers 0x80–0xbf).
            // 169.254.x.x (APIPA) addresses are self-assigned when DHCP is unavailable and are
            // not reachable from normal LAN addresses; exclude them for the same reason as the
            // IPv4 wildcard path.
            const allLanAddresses = getLocalIPs().filter(ip => !isLoopbackAddress(ip) && !isLinkLocalAddress(ip) && !isIPv4LinkLocalAddress(ip))
            const hasIPv4 = allLanAddresses.some(ip => !ip.includes(':'))
            if (!hasIPv4) {
              mdnsSkipReason = 'IPv6-only LAN detected; IPv6 mDNS (udp6/ff02::fb) is not yet supported'
            }
            else {
              mdnsAddresses = allLanAddresses
            }
          }
          else if (hostname) {
            // Resolve hostname names to an IP before advertising; plain IPs pass through.
            let resolvedIp: string | null = null
            if (isIP(hostname)) {
              resolvedIp = hostname
            }
            else {
              // Snapshot the current instance before suspending so we can detect a
              // concurrent stop()/restart() that runs while the DNS query is in flight.
              const instanceBeforeLookup = serverInstance
              try {
                const { address } = await lookup(hostname)
                resolvedIp = address
              }
              catch {
                mdnsSkipReason = `could not resolve bind hostname '${hostname}'`
              }
              // closeServer() sets serverInstance to null; restart() replaces it with a
              // new object. Either way the listener this start() opened is already gone,
              // so bail out rather than advertising a dead endpoint.
              if (serverInstance !== instanceBeforeLookup) {
                return
              }
            }

            if (resolvedIp !== null) {
              if (isLoopbackAddress(resolvedIp)) {
                mdnsSkipReason = `server is bound to loopback (${hostname}${hostname !== resolvedIp ? ` → ${resolvedIp}` : ''}); clients on LAN cannot reach it`
              }
              else if (resolvedIp.includes(':')) {
                // An explicit IPv6 bind address needs a per-interface udp6 socket to be
                // discoverable on ff02::fb; that transport is not yet supported.
                mdnsSkipReason = `server is bound to IPv6 address (${hostname}${hostname !== resolvedIp ? ` → ${resolvedIp}` : ''}); IPv6 mDNS (udp6/ff02::fb) is not yet supported`
              }
              else if (isIPv4LinkLocalAddress(resolvedIp)) {
                // 169.254.x.x (APIPA) is self-assigned when DHCP is unavailable and is not
                // routable beyond the local segment, so LAN clients that discover it cannot
                // connect. The wildcard paths above already exclude it; mirror that here so an
                // explicit bind hostname resolving to APIPA is skipped rather than advertised.
                mdnsSkipReason = `server is bound to IPv4 link-local/APIPA address (${hostname}${hostname !== resolvedIp ? ` → ${resolvedIp}` : ''}); clients on a normal LAN cannot reach it`
              }
              else {
                mdnsAddresses = [resolvedIp]
              }
            }
          }

          if (mdnsAddresses.length === 0) {
            log.warn(`mdns advertisement skipped: ${mdnsSkipReason ?? 'no reachable non-loopback addresses'}`)
          }
          else {
            const mdnsServiceName = options?.mdns?.serviceName
              ?? env.MDNS_SERVICE_NAME
              ?? 'airi-websocket-server'
            const authToken = optionOrEnv(options?.auth?.token, 'AUTHENTICATION_TOKEN', '')

            const localAdvertiser = createMdnsAdvertiser({
              port,
              instanceId,
              secure: secureEnabled,
              auth: Boolean(authToken),
              serviceName: mdnsServiceName,
              addresses: mdnsAddresses,
              logger: log,
            })
            advertiser = localAdvertiser

            try {
              const { hostname: mdnsHostname } = await localAdvertiser.start()
              log.log(`mdns advertised as ${mdnsHostname}`)
            }
            catch (error) {
              log.withError(error).warn('mdns advertisement failed; continuing without discovery')
              await localAdvertiser.stop().catch(stopError => log.withError(stopError).warn('mdns stop after failed start also failed'))
              // Only clear the shared handle if it still points to this instance;
              // a concurrent stop()/restart() may have already nulled it out.
              if (advertiser === localAdvertiser) {
                advertiser = null
              }
            }
          }
        }
      }
      catch (error) {
        serverInstance = null
        h3App.dispose()
        await instance.close(true).catch(() => {})
        if (isAddressInUseError(error)) {
          log.withError(error).warn('WebSocket server port already in use, assuming an existing listener is available')
          return
        }
        log.withError(error).error('failed to start WebSocket server')
        throw error
      }
    })().finally(() => {
      if (startTask === thisTask) {
        startTask = null
      }
    })

    return startTask
  }
  async function stop() {
    await closeServer(true)
  }

  async function restart() {
    log.log('restarting server channel', { options })
    await closeServer(true)
    await start()
  }

  function updateConfig(newOptions: ServerOptions) {
    options = merge<ServerOptions>(options, newOptions)
  }

  return {
    getConnectionHost: () => {
      if (options.hostname && options.hostname !== '0.0.0.0' && options.hostname !== '::') {
        return [options.hostname]
      }

      return getLocalIPs()
    },
    start,
    stop,
    restart,
    updateConfig,
  }
}
