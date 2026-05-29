import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// node:os mock — controls what networkInterfaces() returns for address collection
const osMocks = vi.hoisted(() => {
  const networkInterfacesMock = vi.fn()
  return { networkInterfacesMock }
})

vi.mock('node:os', () => ({
  networkInterfaces: osMocks.networkInterfacesMock,
}))

// dns/promises mock — controls what lookup() returns for non-IP bind hostnames
const dnsMocks = vi.hoisted(() => {
  const lookupMock = vi.fn()
  return { lookupMock }
})

vi.mock('node:dns/promises', () => ({
  lookup: dnsMocks.lookupMock,
}))

// Discovery module spy
const mdnsMocks = vi.hoisted(() => {
  const startMock = vi.fn<() => Promise<{ instanceName: string, hostname: string }>>()
  const stopMock = vi.fn<() => Promise<void>>()
  const createAdvertiserMock = vi.fn(() => ({
    start: startMock,
    stop: stopMock,
  }))

  return { createAdvertiserMock, startMock, stopMock }
})

vi.mock('../discovery/mdns', () => ({
  createMdnsAdvertiser: mdnsMocks.createAdvertiserMock,
}))

// h3 / crossws / setupApp mocks (same shape as server.test.ts)
const serveMocks = vi.hoisted(() => {
  const serveResolvers: (() => void)[] = []

  const serveCall = vi.fn(() => new Promise<void>((resolve) => {
    serveResolvers.push(resolve)
  }))

  const closeCall = vi.fn(async (_closeActive?: boolean) => {})
  const disposeCall = vi.fn(() => {})
  const setupAppCall = vi.fn(() => ({
    app: {
      fetch: vi.fn(async () => ({ crossws: {} })),
    },
    closeAllPeers: vi.fn(),
    dispose: disposeCall,
  }))

  return {
    closeCall,
    disposeCall,
    resolveNextServe: () => {
      const resolve = serveResolvers.shift()
      resolve?.()
    },
    serveCall,
    serveResolvers,
    setupAppCall,
  }
})

vi.mock('h3', () => ({
  H3: class {
    get = vi.fn()
  },
  defineWebSocketHandler: vi.fn(handler => handler),
  serve: vi.fn(() => ({
    serve: serveMocks.serveCall,
    close: serveMocks.closeCall,
  })),
}))

vi.mock('crossws/server', () => ({
  plugin: vi.fn(() => ({})),
}))

vi.mock('../index', () => ({
  normalizeLoggerConfig: () => ({
    appLogFormat: 'pretty',
    appLogLevel: 'log',
  }),
  setupApp: serveMocks.setupAppCall,
}))

describe('mDNS wiring', async () => {
  const { createServer } = await import('./index')

  beforeEach(() => {
    vi.clearAllMocks()
    mdnsMocks.startMock.mockResolvedValue({ instanceName: 'airi-websocket-server', hostname: 'airi-websocket-server.local' })
    mdnsMocks.stopMock.mockResolvedValue(undefined)
    serveMocks.serveResolvers.length = 0
    // Default: one IPv4 LAN interface so existing 0.0.0.0 tests still trigger the advertiser.
    osMocks.networkInterfacesMock.mockReturnValue({
      eth0: [{ address: '192.168.1.10' }],
    })
  })

  afterEach(() => {
    delete process.env.MDNS_ADVERTISE
    delete process.env.MDNS_SERVICE_NAME
  })

  /**
   * @example
   * const server = createServer()
   * await server.start()
   * // createMdnsAdvertiser was never called because mDNS is opt-in (disabled by default).
   */
  it('does not create an advertiser when mDNS is disabled (default)', async () => {
    const server = createServer({ hostname: '127.0.0.1', port: 6121 })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  /**
   * @example
   * const server = createServer({ mdns: { enabled: true } })
   * await server.start()
   * // createMdnsAdvertiser was called with the resolved options.
   */
  it('creates and starts an advertiser when mDNS is enabled via options', async () => {
    const server = createServer({
      hostname: '0.0.0.0',
      port: 6121,
      mdns: { enabled: true, serviceName: 'my-server' },
    })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      port: 6121,
      serviceName: 'my-server',
      addresses: expect.any(Array),
    }))
    expect(mdnsMocks.startMock).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * process.env.MDNS_ADVERTISE = 'true'
   * const server = createServer()
   * await server.start()
   * // createMdnsAdvertiser was called because the env variable enables it.
   */
  it('enables mDNS via MDNS_ADVERTISE=true env variable', async () => {
    process.env.MDNS_ADVERTISE = 'true'
    const server = createServer({ hostname: '0.0.0.0', port: 6121 })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * process.env.MDNS_ADVERTISE = '1'
   * const server = createServer()
   * await server.start()
   * // createMdnsAdvertiser was called — '1' is also truthy for the env flag.
   */
  it('treats MDNS_ADVERTISE=1 as enabled', async () => {
    process.env.MDNS_ADVERTISE = '1'
    const server = createServer({ hostname: '0.0.0.0', port: 6121 })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * process.env.MDNS_ADVERTISE = 'false'
   * const server = createServer()
   * await server.start()
   * // createMdnsAdvertiser was NOT called — only 'true' and '1' enable it.
   */
  it('does not enable mDNS when MDNS_ADVERTISE is set to a non-truthy string', async () => {
    process.env.MDNS_ADVERTISE = 'false'
    const server = createServer({ hostname: '0.0.0.0', port: 6121 })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  /**
   * @example
   * await server.start()
   * await server.stop()
   * // advertiser.stop() was called before instance.close().
   */
  it('stops the advertiser before closing the server instance', async () => {
    const stopOrder: string[] = []

    mdnsMocks.stopMock.mockImplementation(async () => {
      stopOrder.push('advertiser-stop')
    })
    serveMocks.closeCall.mockImplementation(async () => {
      stopOrder.push('instance-close')
    })

    const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    await server.stop()

    expect(stopOrder).toEqual(['advertiser-stop', 'instance-close'])
  })

  /**
   * @example
   * // advertiser.start() rejects → server still starts, advertiser is nulled.
   */
  it('continues server startup when mDNS advertisement fails', async () => {
    mdnsMocks.startMock.mockRejectedValue(new Error('mDNS bind failed'))

    const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    // Server started successfully despite the mDNS failure.
    expect(serveMocks.serveCall).toHaveBeenCalledTimes(1)

    // stop() must be called on the failed advertiser to release any transport it opened
    // before throwing, then the reference is nulled so server.stop() won't call it again.
    expect(mdnsMocks.stopMock).toHaveBeenCalledTimes(1)
    await server.stop()
    expect(mdnsMocks.stopMock).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * // Options override has lower priority than explicit option, env is fallback.
   * process.env.MDNS_SERVICE_NAME = 'env-server'
   * const server = createServer({ mdns: { enabled: true } })
   * // serviceName defaults to env value → 'env-server'
   */
  it('resolves serviceName from MDNS_SERVICE_NAME env when no option is set', async () => {
    process.env.MDNS_SERVICE_NAME = 'env-server'
    const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      serviceName: 'env-server',
    }))
  })

  /**
   * @example
   * // Tests TXT `auth` flag wiring: when token is configured, auth=required.
   */
  it('derives auth flag from the authentication token', async () => {
    const server = createServer({
      hostname: '0.0.0.0',
      port: 6121,
      mdns: { enabled: true },
      auth: { token: 'secret' },
    })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      auth: true,
    }))
  })

  /**
   * @example
   * // Tests TXT `secure` flag wiring: when tlsConfig is set, secure=true.
   */
  it('derives secure flag from tlsConfig', async () => {
    const server = createServer({
      hostname: '0.0.0.0',
      port: 6121,
      mdns: { enabled: true },
      tlsConfig: { cert: 'fake-cert', key: 'fake-key' },
    })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      secure: true,
    }))
  })

  /**
   * @example
   * // Tests that instanceId is resolved once and passed to both setupApp and the advertiser.
   */
  it('passes the resolved instanceId to setupApp', async () => {
    const server = createServer({
      hostname: '0.0.0.0',
      port: 6121,
      mdns: { enabled: true },
      instanceId: 'explicit-id',
    })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(serveMocks.setupAppCall).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'explicit-id',
    }))
    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'explicit-id',
    }))
  })

  /**
   * @example
   * // When the server is restarted, the old advertiser is stopped and a new one is created.
   */
  it('stops the old advertiser and creates a new one on restart', async () => {
    const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

    // First start
    const start1 = server.start()
    serveMocks.resolveNextServe()
    await start1

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
    expect(mdnsMocks.stopMock).not.toHaveBeenCalled()

    // Restart — must stop old advertiser before starting a new one
    const restartPromise = server.restart()
    // restart() runs closeServer(true) which is async (mock microtasks).
    // Yield to the event loop so closeServer's microtask chain completes
    // and the second start() calls serve(), queuing a resolver.
    await new Promise(resolve => setTimeout(resolve, 0))
    serveMocks.resolveNextServe()
    await restartPromise

    expect(mdnsMocks.stopMock).toHaveBeenCalledTimes(1)
    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(2)
  })

  /**
   * @example
   * // await server.stop() twice — advertiser.stop() is only called once.
   */
  it('only stops the advertiser once on repeated stop() calls', async () => {
    const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    await server.stop()
    expect(mdnsMocks.stopMock).toHaveBeenCalledTimes(1)

    await server.stop()
    // Second stop should not call advertiser.stop() again (advertiser already nulled).
    expect(mdnsMocks.stopMock).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * // hostname: '127.0.0.1' is a plain IP — no DNS lookup, loopback detected, advertiser skipped.
   */
  it('skips mDNS when bound to 127.0.0.1 without calling dns.lookup', async () => {
    const server = createServer({ hostname: '127.0.0.1', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(dnsMocks.lookupMock).not.toHaveBeenCalled()
    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  /**
   * @example
   * // hostname: 'localhost' resolves to 127.0.0.1 — loopback, so advertiser is skipped.
   */
  it('skips mDNS when a hostname name resolves to a loopback address', async () => {
    dnsMocks.lookupMock.mockResolvedValue({ address: '127.0.0.1', family: 4 })
    const server = createServer({ hostname: 'localhost', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(dnsMocks.lookupMock).toHaveBeenCalledWith('localhost')
    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  /**
   * @example
   * // hostname: 'my-server.local' resolves to a LAN IP — advertised with the resolved IP.
   */
  it('resolves a hostname name to an IP and advertises it when non-loopback', async () => {
    dnsMocks.lookupMock.mockResolvedValue({ address: '192.168.1.5', family: 4 })
    const server = createServer({ hostname: 'my-server.local', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(dnsMocks.lookupMock).toHaveBeenCalledWith('my-server.local')
    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      addresses: ['192.168.1.5'],
    }))
  })

  /**
   * @example
   * // hostname: 'unresolvable-host' — lookup fails, advertiser is skipped gracefully.
   */
  it('skips mDNS when dns.lookup fails for the bind hostname', async () => {
    dnsMocks.lookupMock.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    const server = createServer({ hostname: 'unresolvable-host', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  describe('regression', () => {
    /**
     * @example
     * // restart() is called while mDNS probing is still in progress (typical probe
     * // window is ~1.75 s). Without the fix, restart()'s internal start() returns the
     * // stale startTask and no new listener is created; serverInstance is null when
     * // restart resolves, leaving the runtime offline.
     *
     * ROOT CAUSE:
     * startTask is not cleared until the entire async IIFE (including mDNS) finishes.
     * restart() → closeServer() nulls serverInstance, then calls start(). start() sees
     * startTask !== null and returns the original task. The original task eventually
     * resolves (mDNS settles) but serverInstance stays null because no new serve() was
     * called.
     *
     * We fixed this by clearing startTask immediately after await instance.serve()
     * resolves. serverInstance then acts as the sole lifecycle guard; startTask only
     * serialises concurrent calls before the socket is bound.
     */
    it('starts a fresh listener when restart() is called while mDNS start is in progress', async () => {
      let releaseMdnsStart!: () => void
      mdnsMocks.startMock
        .mockReturnValueOnce(
          new Promise<{ instanceName: string, hostname: string }>((resolve) => {
            releaseMdnsStart = () => resolve({ instanceName: 'airi-websocket-server', hostname: 'airi-websocket-server.local' })
          }),
        )
        .mockResolvedValue({ instanceName: 'airi-websocket-server', hostname: 'airi-websocket-server.local' })

      const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

      // Start — listener up, mDNS probe is lingering.
      server.start()
      serveMocks.resolveNextServe()
      await new Promise(resolve => setTimeout(resolve, 0))

      // restart() during the mDNS probe window.
      const restartPromise = server.restart()
      // Yield so closeServer() completes and restart's start() queues the second serve().
      await new Promise(resolve => setTimeout(resolve, 0))
      serveMocks.resolveNextServe()

      // Drain the lingering mDNS promise so no dangling task remains after the test.
      releaseMdnsStart()

      await restartPromise

      // Without the fix: serveCall is 1 because restart's start() returns the stale startTask.
      // With the fix: startTask is cleared after serve resolves, so a second listener is created.
      expect(serveMocks.serveCall).toHaveBeenCalledTimes(2)
    })
  })

  /**
   * @example
   * // hostname: '::' on a dual-stack host — advertiser receives both IPv4 and IPv6 addresses.
   * // A records let IPv4-only clients connect; AAAA records let dual-stack clients pick IPv6.
   * // Both are carried inside the same udp4 mDNS packet, which is standard practice.
   */
  it('advertises both IPv4 and IPv6 addresses when bound to :: on a dual-stack LAN', async () => {
    osMocks.networkInterfacesMock.mockReturnValue({
      eth0: [
        { address: '192.168.1.10' },
        { address: '2001:db8::1' },
      ],
    })
    const server = createServer({ hostname: '::', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
    expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
      addresses: expect.arrayContaining(['192.168.1.10', '2001:db8::1']),
    }))
  })

  /**
   * @example
   * // hostname: '::' on an IPv6-only LAN — no IPv4 address to carry the udp4 mDNS packet;
   * // advertisement is skipped until udp6/ff02::fb support is added.
   */
  it('skips mDNS when bound to :: on an IPv6-only LAN (no IPv4 interface available)', async () => {
    osMocks.networkInterfacesMock.mockReturnValue({
      eth0: [{ address: '2001:db8::1' }],
    })
    const server = createServer({ hostname: '::', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  /**
   * @example
   * // hostname: '2001:db8::1' — explicit IPv6 bind address; udp6 mDNS is not yet supported.
   */
  it('skips mDNS when bound to an explicit IPv6 address', async () => {
    const server = createServer({ hostname: '2001:db8::1', port: 6121, mdns: { enabled: true } })

    const startPromise = server.start()
    serveMocks.resolveNextServe()
    await startPromise

    expect(dnsMocks.lookupMock).not.toHaveBeenCalled()
    expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
  })

  describe('iPv4 link-local (APIPA) filtering', () => {
    /**
     * @example
     * // HOST=0.0.0.0 on a host with a 169.254.x.x APIPA address — only 192.168.1.10 should be advertised.
     *
     * ROOT CAUSE:
     * The isIPv4Wildcard mDNS path filtered loopback and IPv6 but not IPv4 link-local
     * (APIPA) addresses in the 169.254.0.0/16 range. When DHCP is unavailable for one
     * interface the OS self-assigns an address from this range. A client that discovers
     * and tries to connect to 169.254.x.x from a normal LAN will get a connection failure
     * because APIPA addresses are not routable beyond the local segment — the same problem
     * that the IPv6 fe80::/10 filter prevents for IPv6 link-local addresses.
     *
     * Fixed by adding `!isIPv4LinkLocalAddress(ip)` to the filter in the isIPv4Wildcard
     * branch before building mdnsAddresses.
     */
    it('excludes 169.254/16 APIPA addresses from mDNS when bound to 0.0.0.0', async () => {
      osMocks.networkInterfacesMock.mockReturnValue({
        eth0: [{ address: '192.168.1.10' }],
        eth1: [{ address: '169.254.12.34' }],
      })
      const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

      const startPromise = server.start()
      serveMocks.resolveNextServe()
      await startPromise

      expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
      expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['192.168.1.10']),
      }))
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['169.254.12.34']),
      }))
    })

    /**
     * @example
     * // HOST=0.0.0.0 on a host where the only non-loopback address is an APIPA address —
     * // no reachable addresses remain, so mDNS is skipped entirely.
     */
    it('skips mDNS when the only non-loopback IPv4 addresses are APIPA on 0.0.0.0', async () => {
      osMocks.networkInterfacesMock.mockReturnValue({
        lo: [{ address: '127.0.0.1' }],
        eth0: [{ address: '169.254.12.34' }],
      })
      const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

      const startPromise = server.start()
      serveMocks.resolveNextServe()
      await startPromise

      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
    })

    /**
     * @example
     * // HOST=apipa-host resolves to 169.254.x.x — the explicit-host path must skip it the
     * // same way the wildcard paths do, rather than advertising an unreachable A record.
     *
     * ROOT CAUSE:
     * The explicit-host mDNS branch checked the resolved IP for loopback and IPv6 but not
     * IPv4 link-local (APIPA). Both wildcard paths (isIPv4Wildcard / isIPv6Wildcard) already
     * exclude 169.254.0.0/16 via isIPv4LinkLocalAddress, but a bind HOST that resolves to an
     * APIPA address fell through to `mdnsAddresses = [resolvedIp]` and was advertised. LAN
     * clients that discovered the 169.254.* A record would try an endpoint that is not
     * routable beyond the local segment and fail or stall.
     *
     * Fixed by adding an isIPv4LinkLocalAddress() guard (with a skip reason matching the
     * loopback/IPv6 cases) in the explicit-host branch before assigning mdnsAddresses.
     */
    it('skips mDNS when a hostname resolves to a 169.254/16 APIPA address', async () => {
      dnsMocks.lookupMock.mockResolvedValue({ address: '169.254.12.34', family: 4 })
      const server = createServer({ hostname: 'apipa-host', port: 6121, mdns: { enabled: true } })

      const startPromise = server.start()
      serveMocks.resolveNextServe()
      await startPromise

      expect(dnsMocks.lookupMock).toHaveBeenCalledWith('apipa-host')
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
    })

    /**
     * @example
     * // HOST=169.254.12.34 (literal APIPA) — plain IP, no DNS lookup, still skipped.
     */
    it('skips mDNS when bound to a literal 169.254/16 APIPA address', async () => {
      const server = createServer({ hostname: '169.254.12.34', port: 6121, mdns: { enabled: true } })

      const startPromise = server.start()
      serveMocks.resolveNextServe()
      await startPromise

      expect(dnsMocks.lookupMock).not.toHaveBeenCalled()
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalled()
    })
  })

  describe('regression — incomplete loopback filtering', () => {
    /**
     * @example
     * // HOST=0.0.0.0 on a host with a 127.0.1.1 alias — only 192.168.1.10 should be advertised.
     *
     * ROOT CAUSE:
     * The isIPv4Wildcard mDNS path filtered with `ip !== '127.0.0.1'`, which only
     * removes the canonical loopback alias. Hosts that expose any other address in the
     * 127.0.0.0/8 range (e.g. 127.0.1.1, common on Ubuntu/Debian) via networkInterfaces()
     * would still have that address published as an mDNS A record. LAN clients that
     * discovered and tried to connect to 127.0.1.1 would get ECONNREFUSED immediately
     * because the address is not reachable outside the local machine.
     *
     * Fixed by replacing `ip !== '127.0.0.1'` with `!isLoopbackAddress(ip)`, which
     * covers the entire 127.0.0.0/8 range via `ip.startsWith('127.')`.
     */
    it('excludes 127/8 loopback aliases from mDNS when bound to 0.0.0.0', async () => {
      osMocks.networkInterfacesMock.mockReturnValue({
        lo: [
          { address: '127.0.0.1' },
          { address: '127.0.1.1' },
        ],
        eth0: [{ address: '192.168.1.10' }],
      })
      const server = createServer({ hostname: '0.0.0.0', port: 6121, mdns: { enabled: true } })

      const startPromise = server.start()
      serveMocks.resolveNextServe()
      await startPromise

      expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
      expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['192.168.1.10']),
      }))
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['127.0.0.1']),
      }))
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['127.0.1.1']),
      }))
    })

    /**
     * @example
     * // HOST=:: on a dual-stack host with a 127.0.1.1 alias — loopback must not leak into mDNS.
     *
     * ROOT CAUSE:
     * The isIPv6Wildcard path had the same gap as the IPv4 wildcard path, filtering
     * `ip !== '127.0.0.1'` instead of the full 127/8 range.
     */
    it('excludes 127/8 loopback aliases from mDNS when bound to ::', async () => {
      osMocks.networkInterfacesMock.mockReturnValue({
        lo: [
          { address: '127.0.0.1' },
          { address: '127.0.1.1' },
        ],
        eth0: [
          { address: '192.168.1.10' },
          { address: '2001:db8::1' },
        ],
      })
      const server = createServer({ hostname: '::', port: 6121, mdns: { enabled: true } })

      const startPromise = server.start()
      serveMocks.resolveNextServe()
      await startPromise

      expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledTimes(1)
      expect(mdnsMocks.createAdvertiserMock).toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['192.168.1.10']),
      }))
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['127.0.0.1']),
      }))
      expect(mdnsMocks.createAdvertiserMock).not.toHaveBeenCalledWith(expect.objectContaining({
        addresses: expect.arrayContaining(['127.0.1.1']),
      }))
    })
  })
})
