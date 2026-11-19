import type { Latest, Task } from '@proj-airi/stream-kit'

import type { SpeechInput } from '../input/speech-input'
import type { WriteResult } from '../input/transcript'
import type { SpeechContextEntry, TranscriptDocument } from '../input/types'
import type { FinalizeContext, FinalizeOptions, SpeechInputControl, SpeechInputScope, VoicePluginError } from './types'

import { createLatest, createTask, runTask } from '@proj-airi/stream-kit'

import { errorFromCause } from '../../utils/error'

/** What one input needs from a plugin installation. The registry implements it. */
export interface InputPluginInstallation {
  readonly name: string
  /** Aborts when the plugin is disposed. */
  readonly signal: AbortSignal
  readonly installers: readonly ((ctx: SpeechInputScope) => void | Promise<void>)[]
  /** The registry disposes these inputs when the plugin is disposed. */
  readonly inputs: Set<PluginInput>
  /** Returns undefined without the `input-control` grant. `live` turns false when the calling scope closes. */
  control: (live: () => boolean) => SpeechInputControl | undefined
  report: (stage: VoicePluginError['stage'], error: Error, inputId?: string) => void
}

const closed: WriteResult = Object.freeze({ status: 'rejected', reason: 'closed' })

/**
 * One plugin's work on one input.
 *
 * `lifetime` aborts when the input closes or the plugin is disposed. Watchers and stages are children of it, so one
 * abort stops all of them. Cleanups registered through `onDispose` run after that abort.
 */
export class PluginInput {
  private readonly lifetime: Task
  private readonly watchers: Latest<TranscriptDocument>[] = []
  private readonly stages: { run: (ctx: FinalizeContext) => Promise<void> | void, options: FinalizeOptions }[] = []
  private installing: Promise<void> = Promise.resolve()

  constructor(readonly installation: InputPluginInstallation, private readonly owner: InputPlugins) {
    this.lifetime = createTask({
      signal: AbortSignal.any([installation.signal, owner.signal]),
      onCleanupError: cause => this.report('cleanup', errorFromCause(cause, 'Plugin cleanup failed')),
    })
  }

  get name(): string {
    return this.installation.name
  }

  install() {
    const input = this.owner.input
    const scope: SpeechInputScope = {
      inputId: input.id,
      sessionId: input.sessionId,
      signal: this.lifetime.signal,
      control: this.installation.control(() => !this.lifetime.settled),
      watch: (run, options = {}) => {
        if (this.lifetime.settled)
          return
        const watcher = createLatest(run, {
          ...options,
          signal: this.lifetime.signal,
          onError: cause => this.report('watch', errorFromCause(cause, 'Transcript watcher failed')),
        })
        this.watchers.push(watcher)
        if (this.owner.watching)
          watcher.push(input.document)
      },
      finalize: (run, options = {}) => {
        if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0))
          throw new Error('Finalization timeout must be finite and nonnegative')
        this.stages.push({ run, options })
      },
      onDispose: cleanup => this.lifetime.defer(cleanup),
    }

    const installs = this.installation.installers.map(async (install) => {
      try {
        await install(scope)
      }
      catch (cause) {
        this.report('input', errorFromCause(cause, 'Plugin input setup failed'))
        this.lifetime.cancel('Plugin input setup failed')
      }
    })
    this.installing = Promise.all(installs).then(() => {})
  }

  update(document: TranscriptDocument) {
    for (const watcher of this.watchers)
      watcher.push(document)
  }

  /** Drops debounced watcher inputs. Active runs continue, because a finalization stage can await their results. */
  stopWatching() {
    for (const watcher of this.watchers)
      watcher.cancelPending()
  }

  /** Runs this plugin's stages in registration order. A failed or timed-out stage does not stop the next one. */
  async finalize() {
    await this.installing
    for (const stage of this.stages) {
      if (this.lifetime.settled)
        return
      await this.runStage(stage.run, stage.options)
    }
  }

  private async runStage(run: (ctx: FinalizeContext) => Promise<void> | void, options: FinalizeOptions) {
    const input = this.owner.input
    const task = runTask(async (self) => {
      const live = () => !self.settled
      await run({
        document: input.document,
        signal: self.signal,
        patch: (edits, evidenceIds = []) => live() ? input.patch(this.name, { edits, evidenceIds }) : closed,
        attach: (key, value) => live() ? this.owner.attach(this.name, key, value) : closed,
      })
    }, { signal: this.lifetime.signal })

    // A timeout ends the wait, not the plugin. It is a cancellation, so it is not reported as an error.
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => task.cancel('Finalization stage timed out'), options.timeoutMs)
    const outcome = await task.done
    clearTimeout(timer)
    if (outcome.status === 'failed')
      this.report('finalize', outcome.error)
  }

  /** Aborts watchers and stages, then waits for this plugin's cleanups. */
  dispose(reason: string): Promise<void> {
    this.lifetime.cancel(reason)
    return this.lifetime.closed
  }

  private report(stage: VoicePluginError['stage'], error: Error) {
    this.installation.report(stage, error, this.owner.input.id)
  }
}

/**
 * Owns all plugin work of one accepted input.
 *
 * Phases:
 * - Watching: from install until `finish`. Each new document reaches every watcher.
 * - Finalizing: `finish` stops document delivery, then runs every stage in plugin installation order. Speculative
 *   watcher runs continue, because a stage can await their results.
 * - Closed: `close` aborts all work and waits for plugin cleanups. The attempt calls it once it settles.
 */
export class InputPlugins {
  private readonly lifetime = new AbortController()
  private readonly entries: PluginInput[]
  // Context entries keyed by plugin, then by key, in attach order.
  private readonly attached = new Map<string, Map<string, unknown>>()
  private readonly unsubscribe: () => void
  watching = true

  constructor(readonly input: SpeechInput, installations: readonly InputPluginInstallation[]) {
    this.entries = installations.map(installation => new PluginInput(installation, this))
    for (const entry of this.entries) {
      entry.installation.inputs.add(entry)
      entry.install()
    }
    this.unsubscribe = input.subscribe((document) => {
      for (const entry of this.entries)
        entry.update(document)
    })
  }

  get signal(): AbortSignal {
    return this.lifetime.signal
  }

  get context(): readonly SpeechContextEntry[] {
    return [...this.attached].flatMap(([plugin, values]) => [...values].map(([key, value]) => Object.freeze({ plugin, key, value })))
  }

  attach(plugin: string, key: string, value: unknown): WriteResult {
    if (this.lifetime.signal.aborted)
      return closed
    const values = this.attached.get(plugin) ?? new Map<string, unknown>()
    values.set(key, value)
    this.attached.set(plugin, values)
    return { status: 'applied' }
  }

  async finish() {
    this.watching = false
    this.unsubscribe()
    for (const entry of this.entries)
      entry.stopWatching()
    for (const entry of this.entries)
      await entry.finalize()
  }

  async close(reason: string) {
    this.watching = false
    this.unsubscribe()
    this.lifetime.abort(reason)
    await Promise.all(this.entries.map(async (entry) => {
      await entry.dispose(reason)
      entry.installation.inputs.delete(entry)
    }))
  }
}
