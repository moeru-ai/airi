import type { RemoteInfo } from 'node:dgram'

import type { Answer, OptAnswer, Question, RecordType, StringAnswer, TxtAnswer } from 'dns-packet'
import type { QueryPacket, ResponseOutgoingPacket, ResponsePacket } from 'multicast-dns'

import makeMdns from 'multicast-dns'

type MdnsQueryListener = (packet: QueryPacket, rinfo: RemoteInfo) => void
type MdnsResponseListener = (packet: ResponsePacket, rinfo: RemoteInfo) => void
type MdnsErrorListener = (error: Error) => void

/**
 * Subset of the `multicast-dns` instance API used by the advertiser.
 *
 * Exists so tests and alternative transports can substitute the real UDP
 * socket without spinning up the full multicast stack.
 *
 * The `'error'` event mirrors `multicast-dns`, which re-emits fatal socket
 * failures (EADDRINUSE/EACCES on bind) as an instance-level `'error'` event;
 * without a listener Node escalates it to an unhandled exception.
 */
export interface MdnsTransport {
  on: ((event: 'query', listener: MdnsQueryListener) => MdnsTransport)
    & ((event: 'response', listener: MdnsResponseListener) => MdnsTransport)
    & ((event: 'error', listener: MdnsErrorListener) => MdnsTransport)
  off: ((event: 'query', listener: MdnsQueryListener) => MdnsTransport)
    & ((event: 'response', listener: MdnsResponseListener) => MdnsTransport)
    & ((event: 'error', listener: MdnsErrorListener) => MdnsTransport)
  query: (query: { questions: Question[] }) => void
  respond: (response: ResponseOutgoingPacket, callback?: (error: Error | null) => void) => void
  destroy: (callback?: () => void) => void
}

// NOTICE:
// `dns-packet`'s `RecordType` union omits `'ANY'`/255, but multicast-dns happily
// encodes and decodes it (see node_modules/dns-packet/types.js — toType returns 255
// for 'ANY'). We rely on string comparison against the wire-level value, and
// cast literal `'ANY'` to `RecordType` at the few sites where we emit a question.
const ANY_RECORD_TYPE = 'ANY' as RecordType

/**
 * Minimal logger shape used by the advertiser.
 *
 * Designed to be a structural subset of `@guiiai/logg` so callers can pass
 * a scoped logger without an adapter, and tests can drop in a no-op.
 */
export interface MdnsAdvertiserLogger {
  log: (message: string, ...fields: unknown[]) => void
  debug: (message: string, ...fields: unknown[]) => void
  warn: (message: string, ...fields: unknown[]) => void
}

const noopLogger: MdnsAdvertiserLogger = {
  log: () => {},
  debug: () => {},
  warn: () => {},
}

/**
 * Options for {@link createMdnsAdvertiser}.
 */
export interface MdnsAdvertiserOptions {
  /** TCP port the WebSocket server listens on. Advertised in the SRV record. */
  port: number
  /** Stable server identity. Surfaced via the TXT `id` key for deduplication. */
  instanceId: string
  /** Whether the WebSocket endpoint is TLS-terminated. Drives the TXT `proto` value. */
  secure: boolean
  /** Whether the server requires an authentication token. Drives the TXT `auth` value. */
  auth: boolean
  /**
   * Service instance label, used to derive both the DNS-SD instance name
   * (`<serviceName>._airi._tcp.local`) and the hostname (`<serviceName>.local`).
   *
   * @default 'airi-websocket-server'
   */
  serviceName?: string
  /**
   * IPv4/IPv6 addresses to publish in A/AAAA records.
   *
   * Should be the addresses the WebSocket listener is reachable on.
   * Loopback and link-local entries should typically be omitted.
   */
  addresses: string[]
  /** Optional logger; defaults to a no-op so the advertiser is silent when unconfigured. */
  logger?: MdnsAdvertiserLogger
  /**
   * Override the underlying mDNS transport. Production code should leave
   * this undefined to use the real `multicast-dns` UDP socket; tests inject
   * a fake to verify packets without touching the network.
   */
  transportFactory?: () => MdnsTransport
}

/** Handle returned by {@link createMdnsAdvertiser}. */
export interface MdnsAdvertiser {
  /**
   * Probes for hostname conflicts, then announces the service on the local link.
   *
   * Resolves once the chosen name has been claimed (possibly with a `-2`/`-3`/...
   * suffix on conflict) and the first two unsolicited announcements have been sent.
   * Re-announcements continue on a fixed interval until {@link stop} is called.
   *
   * Returns the resolved DNS-SD instance label and the corresponding `.local` hostname.
   */
  start: () => Promise<{ instanceName: string, hostname: string }>
  /**
   * Sends goodbye packets (TTL=0) for all advertised records, clears the
   * re-announce interval, and destroys the underlying transport.
   *
   * Safe to call multiple times.
   */
  stop: () => Promise<void>
}

const SERVICE_TYPE = '_airi._tcp.local'
const DEFAULT_SERVICE_NAME = 'airi-websocket-server'
const PROBE_INTERVAL_MS = 250
const PROBE_ATTEMPTS = 3
const ANNOUNCE_GAP_MS = 1000
const REANNOUNCE_INTERVAL_MS = 75_000
const RECORD_TTL_SECONDS = 120
const MAX_CONFLICT_RETRIES = 10
const TXT_VERSION = '1'

function isIPv6(address: string): boolean {
  return address.includes(':')
}

function suffixedName(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`
}

function recordsMatchName(records: Answer[] | undefined, name: string): boolean {
  if (!records) {
    return false
  }

  const lower = name.toLowerCase()
  return records.some(record => record.name?.toLowerCase() === lower)
}

/**
 * Creates an mDNS advertiser for the AIRI WebSocket server.
 *
 * Use when:
 * - The runtime should be auto-discoverable on the local network via DNS-SD
 * - Native AIRI clients (stage-pocket, stage-tamagotchi) should locate a server
 *   without manually entered IP/port pairs
 *
 * Expects:
 * - The caller has already opened the WebSocket listener on `options.port`
 * - `options.addresses` contains every interface address the server is reachable on
 *
 * Returns:
 * - A handle whose {@link MdnsAdvertiser.start} performs RFC 6762 §8.1 probing
 *   before announcing, and whose {@link MdnsAdvertiser.stop} cleanly retracts
 *   the advertisement via goodbye packets
 *
 * Ownership:
 * - Owns the mDNS transport (UDP socket) and the re-announce interval; both
 *   are released by {@link MdnsAdvertiser.stop}
 */
export function createMdnsAdvertiser(options: MdnsAdvertiserOptions): MdnsAdvertiser {
  const logger = options.logger ?? noopLogger
  const serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME
  const transportFactory = options.transportFactory ?? (() => makeMdns() as unknown as MdnsTransport)

  let transport: MdnsTransport | null = null
  let reannounceInterval: ReturnType<typeof setInterval> | null = null
  let claimed: { instanceName: string, hostname: string, serviceInstance: string } | null = null
  let stopped = false
  let conflictDuringProbe = false

  function buildAnswers(ttl: number): Answer[] {
    if (!claimed) {
      return []
    }

    // RFC 6762 §11.3: unique RRSets (SRV, TXT, A, AAAA) carry flush:true so peers
    // immediately evict stale records when the server restarts with a new port or
    // address, rather than keeping the old RRSet for up to the full TTL.
    // PTR is a shared record type (multiple hosts can answer for the same service
    // type) so it must NOT carry the flush bit.
    const aRecords: StringAnswer[] = options.addresses
      .filter(address => !isIPv6(address))
      .map(address => ({
        name: claimed!.hostname,
        type: 'A',
        ttl,
        flush: true,
        data: address,
      }))

    const aaaaRecords: StringAnswer[] = options.addresses
      .filter(address => isIPv6(address))
      .map(address => ({
        name: claimed!.hostname,
        type: 'AAAA',
        ttl,
        flush: true,
        data: address,
      }))

    const txt: TxtAnswer = {
      name: claimed.serviceInstance,
      type: 'TXT',
      ttl,
      flush: true,
      data: [
        `txtvers=${TXT_VERSION}`,
        `path=/ws`,
        `proto=${options.secure ? 'wss' : 'ws'}`,
        `auth=${options.auth ? 'required' : 'none'}`,
        `id=${options.instanceId}`,
      ],
    }

    return [
      {
        name: SERVICE_TYPE,
        type: 'PTR',
        ttl,
        data: claimed.serviceInstance,
      },
      {
        name: claimed.serviceInstance,
        type: 'SRV',
        ttl,
        flush: true,
        data: {
          priority: 0,
          weight: 0,
          port: options.port,
          target: claimed.hostname,
        },
      },
      txt,
      ...aRecords,
      ...aaaaRecords,
    ]
  }

  function handleQuery(packet: QueryPacket) {
    if (!claimed || !transport) {
      return
    }

    const isAnyOr = (type: string, allowed: string[]) => type === 'ANY' || allowed.includes(type)

    const wantsService = packet.questions.some(q =>
      q.name?.toLowerCase() === SERVICE_TYPE
      && isAnyOr(q.type, ['PTR']),
    )
    const wantsInstance = packet.questions.some(q =>
      q.name?.toLowerCase() === claimed!.serviceInstance.toLowerCase(),
    )
    const wantsHost = packet.questions.some(q =>
      q.name?.toLowerCase() === claimed!.hostname.toLowerCase()
      && isAnyOr(q.type, ['A', 'AAAA']),
    )

    if (!wantsService && !wantsInstance && !wantsHost) {
      return
    }

    transport.respond({ answers: buildAnswers(RECORD_TTL_SECONDS) })
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // NOTICE:
  // Simplified RFC 6762 §8.1 probing: we send 3 probe queries at PROBE_INTERVAL_MS
  // intervals and watch incoming RESPONSE traffic for any record claiming the names
  // we intend to claim. We intentionally skip the simultaneous-probe tie-breaking rules
  // (RFC 6762 §8.2.1) — a rare, needless rename is far cheaper than the implementation
  // complexity. We also do not watch incoming QUERY packets: multicast-dns enables
  // IP_MULTICAST_LOOP by default (socket.setMulticastLoopback(opts.loopback !== false)),
  // so our own probe queries are echoed back as incoming events. Matching on question
  // name alone (without an rinfo self-filter) would cause every probe to self-detect
  // as a conflict, making start() always fail in production.
  // Spec: https://datatracker.ietf.org/doc/html/rfc6762#section-8.1
  async function probeForConflict(candidate: { hostname: string, serviceInstance: string }): Promise<boolean> {
    if (!transport) {
      throw new Error('transport not initialised')
    }

    conflictDuringProbe = false

    const probeResponseListener = (packet: ResponsePacket) => {
      // TTL=0 answers are goodbye/deletion records (RFC 6762 §11.3), not ownership claims.
      // Filtering them prevents our own stop() goodbye — or a departing peer — from
      // being mistaken for a conflict and forcing an unnecessary -2/-3 suffix.
      const liveAnswers = packet.answers?.filter((a): a is Exclude<Answer, OptAnswer> => a.type !== 'OPT' && a.ttl !== 0)
      if (recordsMatchName(liveAnswers, candidate.hostname)
        || recordsMatchName(liveAnswers, candidate.serviceInstance)) {
        conflictDuringProbe = true
      }
    }

    transport.on('response', probeResponseListener)

    try {
      for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
        if (stopped) {
          throw new Error('advertiser stopped during probing')
        }

        const probeQuestions: Question[] = [
          { name: candidate.hostname, type: ANY_RECORD_TYPE },
          { name: candidate.serviceInstance, type: ANY_RECORD_TYPE },
        ]
        transport.query({ questions: probeQuestions })

        await sleep(PROBE_INTERVAL_MS)

        if (conflictDuringProbe) {
          return true
        }
      }

      return false
    }
    finally {
      transport?.off('response', probeResponseListener)
    }
  }

  async function claimAndAnnounce(activeTransport: MdnsTransport): Promise<{ instanceName: string, hostname: string }> {
    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
      if (stopped) {
        throw new Error('advertiser stopped during probing')
      }

      const candidateName = suffixedName(serviceName, attempt)
      const candidate = {
        hostname: `${candidateName}.local`,
        serviceInstance: `${candidateName}.${SERVICE_TYPE}`,
      }

      const conflict = await probeForConflict(candidate)

      // stop() may have run during the probe's final PROBE_INTERVAL_MS sleep.
      // probeForConflict only checks `stopped` at the top of each attempt, so a stop
      // landing during the last sleep returns false ("no conflict") without re-checking.
      // Without this guard we would claim the name and emit a live-TTL announcement below
      // even though stop() already skipped the goodbye (claimed was still null at that
      // point) and tore the transport down — publishing a stale service for the full TTL
      // and leaving `claimed` set after teardown.
      if (stopped) {
        throw new Error('advertiser stopped during probing')
      }

      if (conflict) {
        logger.debug('mdns name conflict during probe, retrying with suffix', {
          attempted: candidateName,
        })
        continue
      }

      claimed = {
        instanceName: candidateName,
        hostname: candidate.hostname,
        serviceInstance: candidate.serviceInstance,
      }
      break
    }

    if (!claimed) {
      throw new Error(`mdns advertiser could not claim a name after ${MAX_CONFLICT_RETRIES} attempts`)
    }

    // RFC 6762 §8.3: announce twice, one second apart.
    activeTransport.respond({ answers: buildAnswers(RECORD_TTL_SECONDS) })
    await sleep(ANNOUNCE_GAP_MS)

    // stop() may have run during the announce gap. If it did, the transport is
    // destroyed and stopped=true means a future stop() returns early without
    // clearing the interval — making it unreachable. Bail before installing it.
    if (stopped) {
      throw new Error('advertiser stopped during announcement')
    }

    activeTransport.respond({ answers: buildAnswers(RECORD_TTL_SECONDS) })

    reannounceInterval = setInterval(() => {
      if (!transport || !claimed) {
        return
      }

      transport.respond({ answers: buildAnswers(RECORD_TTL_SECONDS) })
    }, REANNOUNCE_INTERVAL_MS)
    reannounceInterval.unref?.()

    logger.log('mdns advertisement started', {
      hostname: claimed.hostname,
      service: claimed.serviceInstance,
      port: options.port,
    })

    return { instanceName: claimed.instanceName, hostname: claimed.hostname }
  }

  async function start(): Promise<{ instanceName: string, hostname: string }> {
    if (claimed) {
      return { instanceName: claimed.instanceName, hostname: claimed.hostname }
    }

    // Reset stopped so probing and re-announcement work on a fresh lifecycle after stop().
    stopped = false
    const activeTransport = transportFactory()
    transport = activeTransport
    activeTransport.on('query', handleQuery)

    // multicast-dns re-emits fatal socket failures (EADDRINUSE/EACCES on bind, or
    // send errors) as an instance-level 'error' event. With no listener Node treats
    // it as an unhandled EventEmitter error and crashes the runtime, bypassing the
    // caller's "continue without discovery" fallback. Attach the listener BEFORE the
    // first probe issues any traffic: while starting we surface the failure so start()
    // rejects; once advertising, the socket is already live, so we only log.
    let rejectStartup: ((error: Error) => void) | null = null
    const handleError = (error: Error) => {
      if (rejectStartup) {
        rejectStartup(error)
        return
      }

      logger.warn('mdns transport error', { error })
    }
    activeTransport.on('error', handleError)

    const startupFailed = new Promise<never>((_, reject) => {
      rejectStartup = reject
    })

    try {
      const claim = claimAndAnnounce(activeTransport)
      // Promise.race propagates whichever branch settles first to the caller. When a
      // transport error wins, the claim branch stays pending and later rejects (e.g. via
      // the stopped guard once stop() runs); swallow that here so it does not surface as
      // an unhandled rejection.
      claim.catch(() => {})
      return await Promise.race([claim, startupFailed])
    }
    finally {
      // The advertisement is now either live or torn down; later transport errors must
      // only be logged, never reject an already-settled start().
      rejectStartup = null
    }
  }

  async function stop(): Promise<void> {
    if (stopped) {
      return
    }

    stopped = true

    if (reannounceInterval) {
      clearInterval(reannounceInterval)
      reannounceInterval = null
    }

    if (transport && claimed) {
      // RFC 6762 §10.1: signal departure with TTL=0 answers.
      // Await the respond callback before calling destroy() — in the real multicast-dns
      // transport, respond() dispatches via thunky (async), so destroy() must not be
      // called until socket.send has been accepted by the OS kernel; otherwise the
      // thunky onbind guard (if (destroyed) return) silently drops the goodbye packet.
      try {
        await new Promise<void>((resolve, reject) => {
          transport!.respond({ answers: buildAnswers(0) }, (err) => {
            if (err)
              reject(err)
            else
              resolve()
          })
        })
      }
      catch (error) {
        logger.warn('failed to send mdns goodbye packet', { error })
      }
    }

    if (transport) {
      await new Promise<void>((resolve) => {
        transport!.destroy(() => resolve())
      })
      transport = null
    }

    // Reset claimed so the same instance can be restarted with start().
    // stopped is intentionally kept true here so that any in-progress probeForConflict
    // loop still sees stopped=true after transport is nulled — preventing it from
    // calling transport.query() on a destroyed socket. start() resets stopped=false
    // at its entry point when a fresh lifecycle begins.
    claimed = null
  }

  return { start, stop }
}
