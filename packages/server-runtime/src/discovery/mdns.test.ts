import type { Buffer } from 'node:buffer'
import type { RemoteInfo } from 'node:dgram'

import type { Answer, Question } from 'dns-packet'
import type { QueryPacket, ResponseOutgoingPacket, ResponsePacket } from 'multicast-dns'

import type { MdnsTransport } from './mdns'

import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { createMdnsAdvertiser } from './mdns'

interface RecordedRespond {
  answers: Answer[]
}

interface RecordedQuery {
  questions: Question[]
}

interface FakeTransport extends MdnsTransport {
  emit: (event: 'query' | 'response' | 'error', ...args: unknown[]) => boolean
  emitQuery: (questions: Question[]) => void
  emitResponse: (answers: Answer[]) => void
  respondCalls: RecordedRespond[]
  queryCalls: RecordedQuery[]
  destroyed: boolean
}

function createFakeTransport(): FakeTransport {
  const emitter = new EventEmitter() as EventEmitter & FakeTransport

  emitter.respondCalls = []
  emitter.queryCalls = []
  emitter.destroyed = false

  const fakeRinfo: RemoteInfo = { address: '127.0.0.1', port: 5353, family: 'IPv4', size: 0 }

  emitter.respond = ((response, ...rest) => {
    const answers = Array.isArray(response) ? response : response.answers
    emitter.respondCalls.push({ answers })
    const callback = rest.find(arg => typeof arg === 'function') as ((err: Error | null) => void) | undefined
    callback?.(null)
  }) as MdnsTransport['respond']

  emitter.query = ((query, ...rest) => {
    if (typeof query === 'object' && !Array.isArray(query) && 'questions' in query && Array.isArray(query.questions)) {
      emitter.queryCalls.push({ questions: query.questions })
    }
    const callback = rest.find(arg => typeof arg === 'function') as ((err: Error | null) => void) | undefined
    callback?.(null)
  }) as MdnsTransport['query']

  emitter.destroy = (callback?: () => void) => {
    emitter.destroyed = true
    callback?.()
  }

  emitter.emitQuery = (questions: Question[]) => {
    const packet = { type: 'query', questions, answers: [], additionals: [], authorities: [], id: 0, flags: 0 } as unknown as QueryPacket
    emitter.emit('query', packet, fakeRinfo)
  }

  emitter.emitResponse = (answers: Answer[]) => {
    const packet = { type: 'response', answers, questions: [], additionals: [], authorities: [], id: 0, flags: 0 } as unknown as ResponsePacket
    emitter.emit('response', packet, fakeRinfo)
  }

  return emitter
}

describe('createMdnsAdvertiser', () => {
  /**
   * @example
   * await advertiser.start() // resolves with { instanceName: 'airi-websocket-server', hostname: 'airi-websocket-server.local' }
   */
  it('claims the default name and announces twice when no conflict is observed', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-abc',
      secure: false,
      auth: false,
      addresses: ['192.168.1.10'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()

    // Advance through the 3 × 250ms probe interval plus the inter-announcement 1s gap.
    await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
    const result = await startPromise

    expect(result.instanceName).toBe('airi-websocket-server')
    expect(result.hostname).toBe('airi-websocket-server.local')
    expect(fake.queryCalls.length).toBe(3)
    expect(fake.respondCalls.length).toBe(2)

    vi.useRealTimers()
    await advertiser.stop()
  })

  /**
   * @example
   * // Another host responds to the probe with our chosen name → advertiser picks `<name>-2`.
   */
  it('falls back to a numeric suffix when another host owns the desired name', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-abc',
      secure: false,
      auth: false,
      addresses: ['192.168.1.10'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()

    // After the first probe goes out, simulate a competing host answering for the base hostname.
    await vi.advanceTimersByTimeAsync(1)
    fake.emitResponse([
      { name: 'airi-websocket-server.local', type: 'A', ttl: 120, data: '10.0.0.1' },
    ])

    // First probe round (~250ms) fails; second round on `airi-websocket-server-2`
    // needs another 3*250ms + 1000ms announcement gap to fully resolve.
    await vi.advanceTimersByTimeAsync(250 + 250 * 3 + 1000)
    const result = await startPromise

    expect(result.instanceName).toBe('airi-websocket-server-2')
    expect(result.hostname).toBe('airi-websocket-server-2.local')

    vi.useRealTimers()
    await advertiser.stop()
  })

  /**
   * @example
   * // TXT record carries: txtvers=1, path=/ws, proto=wss, auth=required, id=<instanceId>
   */
  it('includes the documented TXT keys in announcement responses', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-xyz',
      secure: true,
      auth: true,
      addresses: ['192.168.1.10'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()
    await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
    await startPromise

    const announcement = fake.respondCalls[0]
    const txt = announcement.answers.find(answer => answer.type === 'TXT')

    expect(txt).toBeDefined()
    const data = (txt as { data: Buffer[] | string[] }).data.map(entry =>
      typeof entry === 'string' ? entry : entry.toString('utf8'),
    )

    expect(data).toContain('txtvers=1')
    expect(data).toContain('path=/ws')
    expect(data).toContain('proto=wss')
    expect(data).toContain('auth=required')
    expect(data).toContain('id=instance-xyz')

    vi.useRealTimers()
    await advertiser.stop()
  })

  /**
   * @example
   * // RFC 6762 §11.3: SRV/TXT/A/AAAA are unique records and must carry flush:true;
   * // PTR is a shared record and must not.
   */
  it('sets flush:true on unique records (SRV/TXT/A) and omits it on PTR', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-xyz',
      secure: false,
      auth: false,
      addresses: ['192.168.1.10'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()
    await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
    await startPromise

    const announcement = fake.respondCalls[0]

    const ptr = announcement.answers.find(a => a.type === 'PTR')
    const srv = announcement.answers.find(a => a.type === 'SRV')
    const txt = announcement.answers.find(a => a.type === 'TXT')
    const a = announcement.answers.find(a => a.type === 'A')

    expect((ptr as { flush?: boolean }).flush).toBeFalsy()
    expect((srv as { flush?: boolean }).flush).toBe(true)
    expect((txt as { flush?: boolean }).flush).toBe(true)
    expect((a as { flush?: boolean }).flush).toBe(true)

    vi.useRealTimers()
    await advertiser.stop()
  })

  /**
   * @example
   * // PTR query for `_airi._tcp.local` → advertiser responds with PTR/SRV/TXT/A bundle.
   */
  it('responds to PTR queries for the service type after claiming a name', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-xyz',
      secure: false,
      auth: false,
      addresses: ['192.168.1.10', '192.168.1.11'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()
    await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
    await startPromise

    const announcementsBefore = fake.respondCalls.length

    fake.emitQuery([{ name: '_airi._tcp.local', type: 'PTR' }])

    expect(fake.respondCalls.length).toBe(announcementsBefore + 1)

    const reply = fake.respondCalls.at(-1)!
    const types = reply.answers.map(a => a.type)
    expect(types).toContain('PTR')
    expect(types).toContain('SRV')
    expect(types).toContain('TXT')
    expect(reply.answers.filter(a => a.type === 'A').length).toBe(2)

    vi.useRealTimers()
    await advertiser.stop()
  })

  /**
   * @example
   * // stop() emits a TTL=0 goodbye for every advertised record and destroys the transport.
   */
  it('sends goodbye packets with TTL=0 on stop', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-abc',
      secure: false,
      auth: false,
      addresses: ['192.168.1.10'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()
    await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
    await startPromise

    vi.useRealTimers()
    await advertiser.stop()

    const goodbye = fake.respondCalls.at(-1)!
    expect(goodbye.answers.length).toBeGreaterThan(0)
    expect(goodbye.answers.every((answer) => {
      // Every answer we emit carries a TTL — OptAnswer (the only ttl-less Answer variant)
      // is never produced by buildAnswers().
      return 'ttl' in answer && answer.ttl === 0
    })).toBe(true)
    expect(fake.destroyed).toBe(true)
  })

  describe('regression', () => {
    /**
     * @example
     * // With IP_MULTICAST_LOOP enabled (multicast-dns default), every transport.query()
     * // call is looped back as an incoming 'query' event on the same socket.
     * // probeQueryListener must NOT treat own-sent probe packets as a conflict.
     *
     * ROOT CAUSE:
     * multicast-dns enables IP_MULTICAST_LOOP by default:
     *   socket.setMulticastLoopback(opts.loopback !== false)  // index.js line 58
     * Every outgoing query is echoed back as an incoming 'query' event. probeQueryListener
     * matches on question name alone (rinfo.address is ignored), so it fires on the
     * advertiser's own echoed probe, sets conflictDuringProbe=true immediately, and every
     * candidate name is treated as conflicted — exhausting all 10 MAX_CONFLICT_RETRIES
     * and throwing in production even when the network has no other mDNS peers.
     */
    it('does not self-detect a conflict when own probe queries are echoed back (multicast loopback)', async () => {
      vi.useFakeTimers()

      const fake = createFakeTransport()
      // Simulate IP_MULTICAST_LOOP: mirror every outgoing query() back as an incoming
      // 'query' event, identical to what the real multicast-dns UDP socket does.
      const originalQuery = fake.query
      fake.query = ((query: { questions: Question[] }, ...rest: unknown[]) => {
        ;(originalQuery as (q: { questions: Question[] }, ...r: unknown[]) => void)(query, ...rest)
        const loopbackRinfo: RemoteInfo = { address: '224.0.0.251', port: 5353, family: 'IPv4', size: 0 }
        const echoed = {
          type: 'query' as const,
          questions: query.questions,
          answers: [],
          additionals: [],
          authorities: [],
          id: 0,
          flags: 0,
        } as unknown as QueryPacket
        fake.emit('query', echoed, loopbackRinfo)
      }) as MdnsTransport['query']

      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        transportFactory: () => fake,
      })

      const startPromise = advertiser.start()
      // Allow time for max retries (10 × 250 ms) plus the announcement gap — enough for
      // both the buggy path (all retries exhausted → throw) and the fixed path (success).
      await vi.advanceTimersByTimeAsync(10 * 250 + 1000)

      // With the bug: rejects with 'could not claim a name after 10 attempts' because
      // every probe echo is treated as a competing host probing for the same name.
      await expect(startPromise).resolves.toMatchObject({
        instanceName: 'airi-websocket-server',
        hostname: 'airi-websocket-server.local',
      })

      vi.useRealTimers()
      await advertiser.stop()
    })

    /**
     * @example
     * // stop() must deliver the TTL=0 goodbye records before tearing down the socket so
     * // that peers can expire the service entry immediately rather than waiting the full TTL.
     *
     * ROOT CAUSE:
     * stop() calls transport.respond(goodbye) fire-and-forget, then immediately calls
     * transport.destroy(). In real multicast-dns, respond() dispatches via thunky which
     * defers socket.send asynchronously. destroy() sets destroyed=true synchronously.
     * When the thunky callback fires it sees destroyed=true (index.js onbind guard) and
     * returns without calling socket.send, so the goodbye packet is provably never sent.
     * The MdnsTransport.respond interface also omits the callback overload, making it
     * structurally impossible to await the send without widening the interface.
     */
    it('delivers the goodbye packet before destroying the transport when respond is asynchronous', async () => {
      vi.useFakeTimers()

      const events: string[] = []
      // Pending callback for the goodbye's deferred "socket.send" completion.
      let pendingGoodbyySend: (() => void) | null = null

      const fake = createFakeTransport()

      // Override respond to simulate thunky's async dispatch: capture the goodbye callback
      // without invoking it — the caller (stop()) must wait for it before calling destroy().
      const originalRespond = fake.respond.bind(fake)
      fake.respond = ((response: ResponseOutgoingPacket, ...rest: unknown[]) => {
        const answers = Array.isArray(response) ? response : (response as { answers: Answer[] }).answers
        const isGoodbye = answers.some(a => 'ttl' in a && (a as { ttl: number }).ttl === 0)
        if (isGoodbye) {
          pendingGoodbyySend = () => {
            events.push('goodbye-sent')
            const cb = rest.find(a => typeof a === 'function') as ((e: Error | null) => void) | undefined
            cb?.(null)
          }
        }
        else {
          ;(originalRespond as (...args: unknown[]) => void)(response, ...rest)
        }
      }) as MdnsTransport['respond']

      const realDestroy = fake.destroy.bind(fake)
      fake.destroy = (callback?: () => void) => {
        events.push('destroy')
        realDestroy(callback)
      }

      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        transportFactory: () => fake,
      })

      const startPromise = advertiser.start()
      await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
      await startPromise

      vi.useRealTimers()

      const stopPromise = advertiser.stop()

      // Fire the deferred goodbye send (simulating the thunky callback arriving).
      // With the fix, stop() awaits this callback before calling destroy(), so
      // 'goodbye-sent' must appear in events before 'destroy'.
      // With the bug, destroy is called synchronously inside stop() before we can
      // invoke this callback, so 'destroy' appears first.
      pendingGoodbyySend?.()
      pendingGoodbyySend = null

      await stopPromise

      // With the bug:  events = ['destroy', 'goodbye-sent']  → index('goodbye-sent') > index('destroy')
      // With the fix:  events = ['goodbye-sent', 'destroy']  → index('goodbye-sent') < index('destroy')
      expect(events.indexOf('goodbye-sent')).toBeLessThan(events.indexOf('destroy'))
    })

    /**
     * @example
     * // advertiser.stop() then advertiser.start() again — the second start must re-probe
     * // and re-announce on a new transport, not silently return the stale claimed state.
     *
     * ROOT CAUSE:
     * stop() resets transport to null but never resets claimed or stopped. A subsequent
     * start() call hits `if (claimed) return { instanceName, hostname }` and returns
     * immediately without creating a transport, probing, or announcing — the advertiser
     * appears active but is completely silent on the network.
     */
    it('probes and announces on a fresh transport after stop() + start()', async () => {
      vi.useFakeTimers()

      const fakes = [createFakeTransport(), createFakeTransport()]
      let factoryCallCount = 0

      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        transportFactory: () => fakes[factoryCallCount++]!,
      })

      // First lifecycle.
      const start1 = advertiser.start()
      await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
      await start1
      vi.useRealTimers()
      await advertiser.stop()
      vi.useFakeTimers()

      // Second lifecycle — must create a new transport and probe from scratch.
      const start2 = advertiser.start()
      await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
      await start2

      // With the bug, fakes[1] is never used because start() returns early from `if (claimed)`.
      expect(fakes[1]!.queryCalls.length).toBe(3)
      expect(fakes[1]!.respondCalls.length).toBeGreaterThanOrEqual(1)

      vi.useRealTimers()
      await advertiser.stop()
    })

    /**
     * @example
     * // stop() called while start() is mid-probe — start() must reject with a clean error,
     * // not a TypeError, and must not send any live-TTL announcement records.
     *
     * ROOT CAUSE:
     * probeForConflict returns false (meaning "no conflict") when stopped=true, which
     * causes start() to set claimed and call transport.respond(RECORD_TTL_SECONDS) even
     * after stop() has been called. Additionally, the finally block in probeForConflict
     * calls transport.off() after stop() has nulled transport, throwing a TypeError
     * instead of the expected clean 'advertiser stopped during probing' error.
     */
    it('rejects with a clean Error (not TypeError) and sends no live-TTL announcement when stop() is called during probing', async () => {
      vi.useFakeTimers()

      const fake = createFakeTransport()
      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        transportFactory: () => fake,
      })

      const startPromise = advertiser.start()
      // Attach catch immediately to suppress the unhandled-rejection warning that would
      // otherwise fire when the promise rejects during timer advancement below.
      const startResult = startPromise.catch((e: unknown) => e)

      // Allow the first probe query to be sent; start() is now suspended mid-probe sleep.
      await vi.advanceTimersByTimeAsync(1)
      const stopPromise = advertiser.stop()

      // Let the probe sleep complete and all pending microtasks (stop() finishing) resolve.
      await vi.advanceTimersByTimeAsync(500)
      vi.useRealTimers()

      // With the bug: rejects with TypeError from `transport.off()` in the finally block
      // after stop() has nulled transport. The fix makes probeForConflict guard against
      // a null transport in finally and propagates a clean 'advertiser stopped' error.
      const err = await startResult
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(TypeError)

      await stopPromise

      // With the bug: claimed is set and transport.respond(live TTL) is called before
      // the TypeError surfaces. No live-TTL announcement should ever reach the wire after
      // stop() has been called.
      const liveAnnouncements = fake.respondCalls.filter(call =>
        call.answers.some(a => 'ttl' in a && (a as { ttl: number }).ttl > 0),
      )
      expect(liveAnnouncements.length).toBe(0)
    })

    /**
     * @example
     * // stop() lands during the FINAL probe sleep — after the last probe query is sent
     * // but before probeForConflict returns. No live-TTL announcement may be published.
     *
     * ROOT CAUSE:
     * probeForConflict only checks `stopped` at the top of each attempt (before each
     * PROBE_INTERVAL_MS sleep). When stop() runs during the last attempt's sleep there is
     * no further iteration to hit that guard, so probeForConflict returns false ("no
     * conflict"). claimAndAnnounce then assigned `claimed` and called
     * transport.respond(RECORD_TTL_SECONDS) — a live-TTL announcement — even though stop()
     * had already skipped the goodbye (claimed was still null at goodbye time) and torn the
     * transport down. The result is a stale service advertised on the link for the full TTL,
     * plus `claimed` left non-null after teardown (which would make the next start() return
     * early and advertise nothing). The sibling "during probing" test above does not cover
     * this because it stops during the first probe, where the next-iteration guard fires.
     *
     * We fixed this by re-checking `stopped` in claimAndAnnounce immediately after
     * probeForConflict returns, before assigning claimed or responding.
     */
    it('sends no live-TTL announcement when stop() is called during the final probe wait', async () => {
      vi.useFakeTimers()

      const fake = createFakeTransport()
      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        transportFactory: () => fake,
      })

      const startPromise = advertiser.start()
      // Suppress the unhandled-rejection warning; start() rejects once stop() wins the race.
      const startResult = startPromise.catch((e: unknown) => e)

      // Advance through the first two probe sleeps (2 × 250ms). At t=500 the third and
      // final probe query has just gone out and start() is suspended in the last 250ms
      // sleep — exactly the window the per-attempt loop guard cannot cover.
      await vi.advanceTimersByTimeAsync(250 * 2)
      expect(fake.queryCalls.length).toBe(3)

      const stopPromise = advertiser.stop()

      // Finish the final probe sleep, then cover the inter-announcement gap so any buggy
      // live announcement would already have been emitted before start() settles.
      await vi.advanceTimersByTimeAsync(250 + 1000)
      vi.useRealTimers()

      await stopPromise

      // With the bug: probeForConflict returns false, claimAndAnnounce claims the name and
      // calls respond(RECORD_TTL_SECONDS) → a live-TTL record reaches the wire after stop().
      // With the fix: the post-probe stopped guard throws first, so nothing is announced.
      const liveAnnouncements = fake.respondCalls.filter(call =>
        call.answers.some(a => 'ttl' in a && (a as { ttl: number }).ttl > 0),
      )
      expect(liveAnnouncements.length).toBe(0)

      // start() must still reject cleanly (no TypeError), consistent with the other stop races.
      const err = await startResult
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(TypeError)
    })

    /**
     * @example
     * // The underlying socket fails to bind (EADDRINUSE) and multicast-dns emits an
     * // instance-level 'error' event mid-probe → start() rejects with that error and
     * // never claims a name or sends a live-TTL announcement.
     *
     * ROOT CAUSE:
     * multicast-dns re-emits fatal socket failures (EADDRINUSE/EACCES on bind, see
     * node_modules/multicast-dns/index.js socket.on('error', ...)) as an instance-level
     * 'error' event. The advertiser attached no 'error' listener, so Node treated the
     * emit as an unhandled EventEmitter error and crashed the runtime — bypassing the
     * caller's try/catch "continue without discovery" fallback entirely. With no listener
     * the EventEmitter throws synchronously inside emit('error', ...).
     *
     * We fixed this by attaching an 'error' listener before issuing the first probe and
     * routing startup-time errors into start()'s rejection so the caller can stop() the
     * advertiser and continue without discovery.
     */
    it('rejects instead of crashing when the transport emits an error during probing', async () => {
      vi.useFakeTimers()

      const fake = createFakeTransport()
      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        transportFactory: () => fake,
      })

      const startPromise = advertiser.start()
      // Attach catch immediately to suppress the unhandled-rejection warning that would
      // otherwise fire when the promise rejects during timer advancement below.
      const startResult = startPromise.catch((e: unknown) => e)

      // First probe query goes out; start() is now suspended in the probe sleep.
      await vi.advanceTimersByTimeAsync(1)

      // Simulate the real socket failing to bind: multicast-dns emits 'error' with an
      // ErrnoException. Before the fix this emit throws synchronously (no listener).
      const bindError = Object.assign(new Error('bind EADDRINUSE 0.0.0.0:5353'), { code: 'EADDRINUSE' })
      fake.emit('error', bindError)

      const err = await startResult
      expect(err).toBe(bindError)

      // Mirror the production caller, which stop()s the advertiser in its catch block.
      // stop() sets stopped=true so the orphaned probe loop aborts at its next guard
      // instead of claiming a name and announcing on the failed socket.
      const stopPromise = advertiser.stop()
      await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
      vi.useRealTimers()
      await stopPromise

      const liveAnnouncements = fake.respondCalls.filter(call =>
        call.answers.some(a => 'ttl' in a && (a as { ttl: number }).ttl > 0),
      )
      expect(liveAnnouncements.length).toBe(0)
    })

    /**
     * @example
     * // After the advertisement is live, a transient socket 'error' is logged rather
     * // than re-thrown, since start() has already resolved and the socket is in use.
     */
    it('logs transport errors that arrive after startup without throwing', async () => {
      vi.useFakeTimers()

      const warn = vi.fn()
      const logger = { log: vi.fn(), debug: vi.fn(), warn }

      const fake = createFakeTransport()
      const advertiser = createMdnsAdvertiser({
        port: 6121,
        instanceId: 'instance-abc',
        secure: false,
        auth: false,
        addresses: ['192.168.1.10'],
        logger,
        transportFactory: () => fake,
      })

      const startPromise = advertiser.start()
      await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
      await startPromise

      const postStartupError = Object.assign(new Error('send EMSGSIZE'), { code: 'EMSGSIZE' })
      // With a listener attached this does not throw; it is logged as a warning.
      expect(() => fake.emit('error', postStartupError)).not.toThrow()
      expect(warn).toHaveBeenCalledWith('mdns transport error', { error: postStartupError })

      vi.useRealTimers()
      await advertiser.stop()
    })
  })

  /**
   * @example
   * // Calling stop() twice is a no-op after the first call.
   */
  it('is idempotent across repeated stop() calls', async () => {
    vi.useFakeTimers()

    const fake = createFakeTransport()
    const advertiser = createMdnsAdvertiser({
      port: 6121,
      instanceId: 'instance-abc',
      secure: false,
      auth: false,
      addresses: ['192.168.1.10'],
      transportFactory: () => fake,
    })

    const startPromise = advertiser.start()
    await vi.advanceTimersByTimeAsync(250 * 3 + 1000)
    await startPromise

    vi.useRealTimers()
    await advertiser.stop()
    const callsAfterFirstStop = fake.respondCalls.length
    await advertiser.stop()

    expect(fake.respondCalls.length).toBe(callsAfterFirstStop)
  })
})
