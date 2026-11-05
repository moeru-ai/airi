import type { ObserveRecord } from 'injeca'

import type { KitDependencyStore, KitGrantPolicy } from '../../src/plugin-host/kits/access'
import type { ExtensionSession, ExtensionSessionPhase } from '../../src/plugin-host/session'
import type { ExtensionManifestV2, ExtensionPermissionDeclaration, ExtensionProvidedKitDeclaration, ExtensionUsedKitDeclaration } from '../../src/plugin-host/shared/types'

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { graph, observe } from 'injeca'

import { defineKit } from '../../src/kit'
import { describeExplanation } from '../../src/plugin-host/diagnostics'
import { createHarnessKit } from '../../src/plugin-host/harness'
import { createMemoryKitDependencyStore } from '../../src/plugin-host/kits/access'
import { createWorkerRunner, ExtensionHost } from '../../src/plugin-host/runtimes/node'
import { computerUseKit, memoryBackendKit, widgetKit } from './kits'

/** The folder of the scenario plugins. */
export const scenarioRoot = dirname(fileURLToPath(import.meta.url))

/** One call that a built-in Kit stand-in received, with the caller identity that the Host injected. */
export interface HostKitCall {
  readonly kit: string
  readonly method: string
  readonly extensionId: string
  readonly sessionId: string
  readonly input: unknown
}

/** Options of {@link createScenarioHost}. */
export interface ScenarioHostOptions {
  /** The provider order of each Kit. */
  kitProviderOrder?: Record<string, readonly string[]>
  /** The dynamic Kit grant policy. @default allow all */
  kitGrantPolicy?: KitGrantPolicy
  /** More Host Kits, by id. Each one has one `echo` method. */
  extraKits?: readonly string[]
}

/** A plugin host with the built-in Kit stand-ins and the worker runner. */
export interface ScenarioHost {
  readonly host: ExtensionHost
  readonly calls: HostKitCall[]
  /** The items that the built-in memory backend stored. */
  readonly hostMemory: string[]
  /** The Kit dependencies that plugins found at run time. */
  readonly dependencies: KitDependencyStore
  /** Starts one scenario plugin from `plugins/<id>.ts` in a worker. */
  readonly start: (manifest: ExtensionManifestV2) => Promise<ExtensionSession>
  readonly dispose: () => Promise<void>
}

/**
 * Creates the Host of a scenario.
 *
 * It provides these built-in Kits: `airi.widget`, `airi.computer-use`, `airi.memory-backend@host`, and `airi.harness`.
 * Each plugin runs in a `worker_threads` Worker. `tsx` loads the TypeScript plugin files.
 */
export function createScenarioHost(options: ScenarioHostOptions = {}): ScenarioHost {
  const calls: HostKitCall[] = []
  const hostMemory: string[] = []
  const dependencies = createMemoryKitDependencyStore()
  const host = new ExtensionHost({
    kitDependencyStore: dependencies,
    runtime: 'node',
    runner: createWorkerRunner({ execArgv: ['--import', 'tsx'] }),
    kitProviderOrder: options.kitProviderOrder,
    kitGrantPolicy: options.kitGrantPolicy ?? (() => true),
    timeouts: { start: 10_000, stop: 5_000 },
  })

  host.provideKit({
    api: defineKit({
      id: widgetKit.id,
      version: widgetKit.version,
      createClient: runtime => ({
        show: async (input: { title: string }) => {
          calls.push({ kit: widgetKit.id, method: 'show', extensionId: runtime.extensionId, sessionId: runtime.sessionId, input })
          return { id: `widget:${input.title}`, owner: runtime.extensionId }
        },
      }),
    }),
  })
  host.provideKit({
    api: defineKit({
      id: computerUseKit.id,
      version: computerUseKit.version,
      createClient: runtime => ({
        click: async (input: { x: number, y: number }) => {
          calls.push({ kit: computerUseKit.id, method: 'click', extensionId: runtime.extensionId, sessionId: runtime.sessionId, input })
          return { ok: true, caller: runtime.extensionId }
        },
      }),
    }),
  })
  host.provideKit({
    api: defineKit({
      id: memoryBackendKit.id,
      version: memoryBackendKit.version,
      createClient: runtime => ({
        store: async (input: { text: string }) => {
          calls.push({ kit: memoryBackendKit.id, method: 'store', extensionId: runtime.extensionId, sessionId: runtime.sessionId, input })
          hostMemory.push(input.text)
          return { backend: 'host' }
        },
        list: async () => ({ backend: 'host', items: [...hostMemory] }),
      }),
    }),
  })
  host.provideKit({ api: createHarnessKit() })
  for (const id of options.extraKits ?? []) {
    host.provideKit({
      api: defineKit({
        id,
        version: '1.0.0',
        createClient: runtime => ({ echo: async (text: string) => `${id}:${runtime.extensionId}:${text}` }),
      }),
    })
  }

  return {
    host,
    calls,
    hostMemory,
    dependencies,
    start: manifest => host.start(manifest, { cwd: scenarioRoot }),
    dispose: () => host.dispose(),
  }
}

/** Creates the Manifest of one scenario plugin. Its entrypoint is `plugins/<id>.ts`. */
export function scenarioManifest(id: string, options: {
  uses?: ExtensionUsedKitDeclaration[]
  provides?: Array<Omit<ExtensionProvidedKitDeclaration, 'exposure'>>
  permissions?: ExtensionPermissionDeclaration
} = {}): ExtensionManifestV2 {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id,
    version: '1.0.0',
    engines: { airi: '>=0.0.0', runtimes: ['node'] },
    entrypoints: { default: `./plugins/${id}.ts` },
    permissions: options.permissions ?? {},
    kits: {
      uses: options.uses ?? [],
      provides: (options.provides ?? []).map(provide => ({ ...provide, exposure: 'local-only' as const })),
    },
  }
}

/** Waits until a session reaches a phase. */
export async function waitForPhase(host: ExtensionHost, sessionId: string, phase: ExtensionSessionPhase, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now()
  while (host.getSession(sessionId)?.phase !== phase) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`Session ${sessionId} did not reach ${phase}. It is ${host.getSession(sessionId)?.phase ?? 'gone'}.\n${host.getSession(sessionId)?.explanation ?? ''}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/** Waits until `check` returns `true`. */
export async function waitUntil(check: () => boolean, timeoutMs = 10_000, label = 'condition'): Promise<void> {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`The ${label} did not become true in ${timeoutMs}ms.`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/** The instance ids of the services that one plugin owns, by key. */
export function instancesOf(host: ExtensionHost, extensionId: string): Record<string, string | undefined> {
  return Object.fromEntries(graph(host.container).services()
    .filter(service => service.owner.pluginId === extensionId && service.consumer === undefined && service.kind === 'service' && service.phase === 'running')
    .map(service => [service.key, service.instanceId]))
}

/** Records the observe stream of a Host as readable lines. */
export class Timeline {
  readonly records: ObserveRecord[] = []
  private readonly startedAt = Date.now()
  private readonly stopObserving: () => void

  constructor(private readonly host: ExtensionHost, private readonly print?: (line: string) => void) {
    this.stopObserving = observe(host.container, (record) => {
      this.records.push(record)
      const line = formatRecord(record)
      if (line)
        this.print?.(`  ${String(Date.now() - this.startedAt).padStart(5)}ms ${line}`)
    })
  }

  /** Prints a step header. */
  step(title: string): void {
    this.print?.(`\n▶ ${title}`)
  }

  /** Prints one note. */
  note(text: string): void {
    this.print?.(`  · ${text}`)
  }

  /** Prints why a session is not ready, from `graph().explain()`. */
  explain(sessionId: string): string {
    const session = this.host.getSession(sessionId)
    const text = session ? `${session.extension.id} is ${session.phase}${session.explanation ? `:\n      ${session.explanation.split('\n').join('\n      ')}` : '.'}` : `${sessionId} is gone.`
    this.print?.(`  ? ${text}`)
    return text
  }

  /** Prints the explanation of one key in the plugin host container. */
  explainKey(key: string): string {
    const text = describeExplanation(graph(this.host.container).explain(key))
    this.print?.(`  ? ${text}`)
    return text
  }

  /** The decision records of one key in the containers of one plugin. */
  decisions(key: string, extensionId: string): ObserveRecord[] {
    return this.records.filter(record => record.type === 'decision' && record.key === key && record.owner.pluginId === extensionId)
  }

  dispose(): void {
    this.stopObserving()
  }
}

function ownerLabel(owner: Readonly<Record<string, unknown>>): string {
  if (owner.kind === 'plugin')
    return String(owner.pluginId)
  if (owner.kind === 'module')
    return `${String(owner.pluginId)}/${String(owner.moduleId)}`
  return 'host'
}

/** Formats one observe record. Records of capabilities and of the Host Kit templates are left out. */
export function formatRecord(record: ObserveRecord): string | undefined {
  if (record.key.startsWith('capability:'))
    return undefined
  const where = `[${ownerLabel(record.owner)}] ${record.key}`
  switch (record.type) {
    case 'phase':
      return `${where} ${record.from ?? '∅'} → ${record.to}${record.decision ? ` (${record.decision})` : ''}${record.reason ? ` — ${record.reason}` : ''}`
    case 'status':
      return `${where} status ${record.from ?? '∅'} → ${record.to}${record.reason ? ` — ${record.reason}` : ''}`
    case 'decision':
      return `${where} ${record.hook}: ${record.decision}${record.ignored ? ' (ignored)' : ''}`
    case 'timeout':
      return `${where} ${record.hook} timed out after ${record.timeoutMs}ms`
    default:
      return undefined
  }
}
