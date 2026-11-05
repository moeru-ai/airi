import type { HarnessTurnContext } from '../../src/harness'
import type { KitClientOf } from '../../src/kit'
import type { HostKitCall } from './host'

import { runHarnessHooks } from '../../src/plugin-host/harness'
import { createScenarioHost, instancesOf, scenarioManifest, Timeline, waitForPhase, waitUntil } from './host'
import { autoMemoryKit, bmbControlKit, discoverProbeKit, pluginAProbeKit, rebuildProbeKit, shellControlKit } from './kits'

/** Prints one line of the timeline. Without it, a scenario runs silently. */
export type ScenarioPrinter = (line: string) => void

const pluginBManifest = scenarioManifest('plugin-b', {
  uses: [{ id: 'airi.memory-backend', version: '^1' }],
  provides: [{ id: 'airi.fs-store', version: '1.0.0' }, { id: 'airi.auto-memory', version: '1.0.0' }],
})
const pluginAManifest = scenarioManifest('plugin-a', {
  uses: [{ id: 'airi.fs-store', version: '^1' }, { id: 'airi.auto-memory', version: '^1' }],
  provides: [{ id: 'plugin-a.probe', version: '1.0.0' }],
})

/** The result of S1. */
export interface S1Result {
  phase: string
  calls: HostKitCall[]
  consumers: string[]
}

/** S1: a plugin uses the built-in `airi.widget` and `airi.computer-use` Kits. */
export async function runS1(print?: ScenarioPrinter): Promise<S1Result> {
  const scenario = createScenarioHost()
  const timeline = new Timeline(scenario.host, print)
  try {
    timeline.step('S1: start s1-consumer, which uses airi.widget and airi.computer-use')
    const session = await scenario.start(scenarioManifest('s1-consumer', {
      uses: [{ id: 'airi.widget', version: '^1' }, { id: 'airi.computer-use', version: '^1' }],
    }))
    timeline.explain(session.id)
    for (const call of scenario.calls)
      timeline.note(`${call.kit}.${call.method} from ${call.extensionId} ${JSON.stringify(call.input)}`)
    const consumers = scenario.host.inspect().services.filter(service => service.consumer?.pluginId === 's1-consumer').map(service => service.key)
    timeline.note(`per-consumer instances of s1-consumer: ${consumers.join(', ')}`)
    return { phase: session.phase, calls: [...scenario.calls], consumers }
  }
  finally {
    timeline.dispose()
    await scenario.dispose()
  }
}

/** The result of S2. */
export interface S2Result {
  forward: {
    pluginBBefore: Record<string, string | undefined>
    pluginBAfterInstall: Record<string, string | undefined>
    pluginBBeforeUninstall: Record<string, string | undefined>
    pluginBAfterUninstall: Record<string, string | undefined>
    ping: PingResult
    pingAfterReload: PingResult
    pluginASessionBeforeReload?: string
    pluginASessionAfterReload?: string
    selectionDecisionsOnReload: string[]
  }
  reverse: {
    pendingPhase: string
    pendingExplanation: string
    phaseAfterProvider: string
  }
}

type PingResult = Awaited<ReturnType<KitClientOf<typeof pluginAProbeKit>['ping']>>

/**
 * S2: `plugin-b` already runs when `plugin-a`, its consumer, is installed. Then the reverse order.
 */
export async function runS2(print?: ScenarioPrinter): Promise<S2Result> {
  const forward = await (async () => {
    const scenario = createScenarioHost()
    const timeline = new Timeline(scenario.host, print)
    try {
      timeline.step('S2: start plugin-b, which provides airi.fs-store and airi.auto-memory')
      const pluginB = await scenario.start(pluginBManifest)
      const pluginBBefore = instancesOf(scenario.host, 'plugin-b')

      timeline.step('S2: install plugin-a, which uses both Kits')
      const pluginA = await scenario.start(pluginAManifest)
      timeline.explain(pluginA.id)
      const pluginBAfterInstall = instancesOf(scenario.host, 'plugin-b')
      const probe = await scenario.host.resolveKit(pluginAProbeKit)
      const ping = await probe.ping({ text: 'first' })
      timeline.note(`plugin-a ping: ${JSON.stringify(ping)}`)

      timeline.step('S2: reload plugin-b atomically. plugin-a moves to the new provider in place.')
      const pluginASessionBeforeReload = instancesOf(scenario.host, 'plugin-a').session
      const decisionsBefore = timeline.records.length
      await scenario.host.reload(pluginB.id, { atomic: true })
      await waitUntil(() => instancesOf(scenario.host, 'plugin-b')['kit:airi.fs-store@plugin-b'] !== undefined, 5_000, 'new fs-store export')
      const pingAfterReload = await probe.ping({ text: 'second' })
      timeline.note(`plugin-a ping after reload: ${JSON.stringify(pingAfterReload)}`)
      const pluginASessionAfterReload = instancesOf(scenario.host, 'plugin-a').session
      const selectionDecisionsOnReload = timeline.records.slice(decisionsBefore)
        .filter(record => record.type === 'decision' && record.owner.pluginId === 'plugin-a' && record.key.startsWith('kit:airi.'))
        .map(record => record.type === 'decision' ? `${record.key} ${record.hook}:${record.decision}` : '')

      timeline.step('S2: uninstall plugin-a. plugin-b is not touched.')
      const pluginBBeforeUninstall = instancesOf(scenario.host, 'plugin-b')
      await scenario.host.stop(pluginA.id)
      const pluginBAfterUninstall = instancesOf(scenario.host, 'plugin-b')
      timeline.note(`plugin-b instances same after uninstall: ${JSON.stringify(pluginBBeforeUninstall) === JSON.stringify(pluginBAfterUninstall)}`)
      return {
        pluginBBefore,
        pluginBAfterInstall,
        pluginBBeforeUninstall,
        pluginBAfterUninstall,
        ping,
        pingAfterReload,
        pluginASessionBeforeReload,
        pluginASessionAfterReload,
        selectionDecisionsOnReload,
      }
    }
    finally {
      timeline.dispose()
      await scenario.dispose()
    }
  })()

  const reverse = await (async () => {
    const scenario = createScenarioHost()
    const timeline = new Timeline(scenario.host, print)
    try {
      timeline.step('S2 (reverse): install plugin-a first. It waits for its Kits.')
      const pluginA = await scenario.start(pluginAManifest)
      const pendingPhase = pluginA.phase
      const pendingExplanation = timeline.explain(pluginA.id)

      timeline.step('S2 (reverse): start plugin-b. plugin-a starts by itself.')
      await scenario.start(pluginBManifest)
      await waitForPhase(scenario.host, pluginA.id, 'ready')
      timeline.explain(pluginA.id)
      return { pendingPhase, pendingExplanation, phaseAfterProvider: scenario.host.getSession(pluginA.id)!.phase }
    }
    finally {
      timeline.dispose()
      await scenario.dispose()
    }
  })()

  return { forward, reverse }
}

/** The result of S3. */
export interface S3Result {
  duringSetup: { phase: string, stats: { setups: number, activeEffects: number, round: number, hasFsStore: boolean, hasAutoMemory: boolean } }
  afterSetup: {
    phase: string
    stats: { setups: number, activeEffects: number, round: number, hasFsStore: boolean, hasAutoMemory: boolean }
    probeErrors: number
    newRoundRanBeforeOldStopped: boolean
  }
  discovery: { stats: { setups: number, completed: number }, stored: string[], statsAfterRestart: { setups: number, completed: number } }
  limit: { error: string, phase?: string }
}

/** S3: a plugin rebuilds itself with new Kit dependencies. */
export async function runS3(print?: ScenarioPrinter): Promise<S3Result> {
  const scenario = createScenarioHost({ extraKits: ['airi.extra-1', 'airi.extra-2', 'airi.extra-3', 'airi.extra-4', 'airi.extra-5', 'airi.extra-6', 'airi.extra-7'] })
  const timeline = new Timeline(scenario.host, print)
  try {
    await scenario.start(pluginBManifest)

    timeline.step('S3: start plugin-rebuild. Round 1 rebuilds during setup with airi.fs-store.')
    const rebuild = await scenario.start(scenarioManifest('plugin-rebuild', {
      provides: [{ id: 'plugin-rebuild.probe', version: '1.0.0' }],
      permissions: { kits: { dynamic: { allow: ['airi.*'] } } },
    }))
    await waitForPhase(scenario.host, rebuild.id, 'ready')
    const probe = await scenario.host.resolveKit(rebuildProbeKit)
    const duringSetup = { phase: scenario.host.getSession(rebuild.id)!.phase, stats: await probe.stats() }
    timeline.note(`stats: ${JSON.stringify(duringSetup.stats)}`)

    timeline.step('S3: rebuild after setup with airi.auto-memory. The old round serves until the new one runs.')
    const marker = timeline.records.length
    let probeErrors = 0
    const polling = { active: true }
    const poll = (async () => {
      while (polling.active) {
        await probe.stats().catch(() => {
          probeErrors += 1
        })
        await new Promise(resolve => setTimeout(resolve, 2))
      }
    })()
    await probe.addDependency()
    await waitUntil(() => scenario.host.getSession(rebuild.id)?.phase === 'ready' && instancesOf(scenario.host, 'plugin-rebuild').session !== undefined, 5_000)
    let stats = await probe.stats()
    for (let attempt = 0; attempt < 200 && !stats.hasAutoMemory; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
      stats = await probe.stats()
    }
    polling.active = false
    await poll
    const sessionRecords = timeline.records.slice(marker).filter(record => record.type === 'phase' && record.key === 'session' && record.owner.pluginId === 'plugin-rebuild')
    const newRunning = sessionRecords.findIndex(record => record.type === 'phase' && record.to === 'running')
    const oldStopping = sessionRecords.findIndex(record => record.type === 'phase' && record.from === 'running' && record.to === 'stopping')
    const afterSetup = {
      phase: scenario.host.getSession(rebuild.id)!.phase,
      stats,
      probeErrors,
      newRoundRanBeforeOldStopped: newRunning !== -1 && oldStopping !== -1 && newRunning < oldStopping,
    }
    timeline.note(`stats: ${JSON.stringify(stats)}, probe errors during the rebuild: ${probeErrors}`)

    timeline.step('S3: start plugin-discover. ctx.kits.use() finds airi.fs-store, and round 1 ends at the call.')
    const discoverManifest = scenarioManifest('plugin-discover', {
      provides: [{ id: 'plugin-discover.probe', version: '1.0.0' }],
      permissions: { kits: { dynamic: {} } },
    })
    const discover = await scenario.start(discoverManifest)
    await waitForPhase(scenario.host, discover.id, 'ready')
    const discoverProbe = await scenario.host.resolveKit(discoverProbeKit)
    const discoveryStats = await discoverProbe.stats()
    timeline.note(`stats: ${JSON.stringify(discoveryStats)}`)

    timeline.step('S3: restart plugin-discover. The stored dependency builds the session in one round.')
    await scenario.host.stop(discover.id)
    const restarted = await scenario.start(discoverManifest)
    await waitForPhase(scenario.host, restarted.id, 'ready')
    const statsAfterRestart = await (await scenario.host.resolveKit(discoverProbeKit)).stats()
    timeline.note(`stats after restart (the worker is new): ${JSON.stringify(statsAfterRestart)}`)

    timeline.step('S3: start plugin-greedy. It finds a new Kit in each round and fails after 5 rebuilds.')
    let limitError = ''
    let limitPhase: string | undefined
    try {
      const greedy = await scenario.start(scenarioManifest('plugin-greedy', { permissions: { kits: { dynamic: { allow: ['airi.extra-*'] } } } }))
      limitPhase = greedy.phase
    }
    catch (error) {
      limitError = (error as Error).message
      timeline.note(`start rejected: ${limitError}`)
    }

    return {
      duringSetup,
      afterSetup,
      discovery: { stats: discoveryStats, stored: scenario.dependencies.get('plugin-discover').map(use => use.id), statsAfterRestart },
      limit: { error: limitError, phase: limitPhase },
    }
  }
  finally {
    timeline.dispose()
    await scenario.dispose()
  }
}

/** The result of S4. */
export interface S4Result {
  first: { ok: boolean, error?: string }
  replace: { ok: boolean, error?: string }
  replaceOrder: string[]
  timeout: { ok: boolean, error?: string, code?: string }
  afterTimeout: string[]
  superseded: { ok: boolean, error?: string, code?: string }
  newest: { ok: boolean, error?: string }
  denied: { ok: boolean, error?: string, code?: string }
  log: string[]
}

/** S4: a shell plugin runs scripts with Kit lists that come at run time. */
export async function runS4(print?: ScenarioPrinter): Promise<S4Result> {
  const scenario = createScenarioHost({ kitGrantPolicy: request => !request.kitId.includes('secret'), extraKits: ['airi.secret-notes'] })
  const timeline = new Timeline(scenario.host, print)
  try {
    await scenario.start(pluginBManifest)
    await scenario.start(scenarioManifest('plugin-shell', {
      provides: [{ id: 'plugin-shell.control', version: '1.0.0' }],
      permissions: { kits: { dynamic: {} } },
    }))
    const shell = await scenario.host.resolveKit(shellControlKit)

    timeline.step('S4: upsert module notes with airi.fs-store')
    const first = await shell.run({ id: 'notes', script: 'notes', kits: ['airi.fs-store'] })

    timeline.step('S4: upsert notes again with airi.auto-memory added. The old module serves until the new one runs.')
    const marker = (await shell.log()).events.length
    const replace = await shell.run({ id: 'notes', script: 'notes', kits: ['airi.fs-store', 'airi.auto-memory'] })
    const replaceOrder = (await shell.log()).events.slice(marker).filter(event => !event.startsWith('  '))
    timeline.note(`module events: ${replaceOrder.join(' | ')}`)

    timeline.step('S4: upsert notes with a missing Kit. It times out, and the old module stays.')
    const timeout = await shell.run({ id: 'notes', script: 'notes', kits: ['airi.fs-store', 'airi.absent'], timeoutMs: 200 })
    timeline.note(`result: ${JSON.stringify(timeout)}`)
    const afterTimeout = (await shell.log()).events.slice(marker).filter(event => !event.startsWith('  '))

    timeline.step('S4: a newer upsert cancels an older one that waits')
    const older = shell.run({ id: 'notes', script: 'notes', kits: ['airi.later'], timeoutMs: 3_000 })
    await new Promise(resolve => setTimeout(resolve, 50))
    const newest = await shell.run({ id: 'notes', script: 'notes', kits: ['airi.fs-store'] })
    const superseded = await older
    timeline.note(`older: ${JSON.stringify(superseded)}, newer: ${JSON.stringify(newest)}`)

    timeline.step('S4: upsert a module with a Kit that the grant policy denies')
    const denied = await shell.run({ id: 'secret', script: 'notes', kits: ['airi.secret-notes'] })
    timeline.note(`result: ${JSON.stringify(denied)}`)

    return { first, replace, replaceOrder, timeout, afterTimeout, superseded, newest, denied, log: (await shell.log()).events }
  }
  finally {
    timeline.dispose()
    await scenario.dispose()
  }
}

/** The result of S5. */
export interface S5Result {
  selected: string
  hostSelected: string
  injected: string[]
  afterCrash: string
  pluginBDecisions: string[]
  injectedAfterUnload: string[]
  runsAfterUnload: number
}

/** S5: two providers of `airi.memory-backend`, the selection order, and a harness hook. */
export async function runS5(print?: ScenarioPrinter): Promise<S5Result> {
  const scenario = createScenarioHost({ kitProviderOrder: { 'airi.memory-backend': ['bmb', 'host'] } })
  const timeline = new Timeline(scenario.host, print)
  const turn: HarnessTurnContext = { turnId: 'turn-1', messages: [{ role: 'user', content: 'hello' }], injected: [] }
  try {
    timeline.step('S5: start plugin-b. Only the Host provides airi.memory-backend now.')
    await scenario.start(pluginBManifest)
    const autoMemory = await scenario.host.resolveKit(autoMemoryKit)
    const hostSelected = (await autoMemory.remember({ text: 'before bmb' })).backend
    timeline.note(`auto-memory stores in: ${hostSelected}`)

    timeline.step('S5: start bmb, which provides airi.memory-backend@bmb and a context.inject hook. The order prefers bmb.')
    const bmb = await scenario.start(scenarioManifest('bmb', {
      uses: [{ id: 'airi.harness', version: '^1' }],
      provides: [{ id: 'airi.memory-backend', version: '1.1.0' }, { id: 'bmb.control', version: '1.0.0' }],
    }))
    timeline.explain(bmb.id)
    await waitUntil(() => timeline.decisions('kit:airi.memory-backend#^1', 'plugin-b').length > 0, 5_000, 'plugin-b selection move')
    const selected = (await autoMemory.remember({ text: 'with bmb' })).backend
    timeline.note(`auto-memory stores in: ${selected}`)

    timeline.step('S5: run the harness context.inject hooks')
    const injected = (await runHarnessHooks(scenario.host.container, 'context.inject', turn)).context.injected
    timeline.note(`injected: ${JSON.stringify(injected)}`)

    timeline.step('S5: the worker of bmb exits. The selection falls back to the Host.')
    const marker = timeline.records.length
    await (await scenario.host.resolveKit(bmbControlKit)).crash()
    await waitUntil(() => timeline.records.slice(marker).some(record => record.type === 'decision' && record.owner.pluginId === 'plugin-b' && record.key === 'kit:airi.memory-backend#^1'), 5_000, 'fallback to host')
    const afterCrash = (await autoMemory.remember({ text: 'after crash' })).backend
    timeline.note(`auto-memory stores in: ${afterCrash}`)
    timeline.explainKey('kit:airi.memory-backend@bmb')
    const pluginBDecisions = timeline.records.slice(marker)
      .filter(record => record.type === 'decision' && record.owner.pluginId === 'plugin-b')
      .map(record => record.type === 'decision' ? `${record.key} ${record.hook}:${record.decision}` : '')

    timeline.step('S5: unload bmb. Its hook goes away.')
    await scenario.host.stop(bmb.id)
    const afterUnload = await runHarnessHooks(scenario.host.container, 'context.inject', turn)
    timeline.note(`injected: ${JSON.stringify(afterUnload.context.injected)}, listener runs: ${afterUnload.runs.length}`)
    return {
      selected,
      hostSelected,
      injected,
      afterCrash,
      pluginBDecisions,
      injectedAfterUnload: afterUnload.context.injected,
      runsAfterUnload: afterUnload.runs.length,
    }
  }
  finally {
    timeline.dispose()
    await scenario.dispose()
  }
}
