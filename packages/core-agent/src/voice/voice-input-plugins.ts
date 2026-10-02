import type { SpeechInput } from './speech-input'
import type {
  SpeechInputScope,
  SpeechLifecycleTask,
  SpeechSelection,
  SpeechSnapshot,
  SpeechSubscription,
  SpeechTask,
  SpeechView,
  TranscriptionEnd,
  VoicePlugin,
  VoicePluginControls,
  VoicePluginError,
  VoicePluginScope,
  VoicePluginSettings,
} from './voice-plugin-types'

import { errorFromCause } from '../utils/error'
import { TaskLifetime } from './voice-plugin-task'

type Settlement = Awaited<SpeechSubscription['done']>
type Cleanup = () => void | Promise<void>
type Registration
  = { kind: 'subscribe', settings: Parameters<SpeechInputScope['subscribe']>[0], run: (ctx: SpeechTask) => Promise<void> }
    | { kind: 'task', settings: Parameters<SpeechInputScope['task']>[0], run: (ctx: SpeechLifecycleTask) => Promise<void> }

/** Installation operations used by one input without exposing the controller or registry. */
export interface InputPluginInstallation {
  readonly plugin: VoicePlugin
  readonly settings: VoicePluginSettings
  readonly installers: Parameters<VoicePluginScope['onSpeechInput']>[0][]
  readonly inputs: Set<PluginInput>
  controls: (live: () => boolean) => VoicePluginControls
  report: (stage: VoicePluginError['stage'], error: Error, inputId?: string) => void
}

class InputSubscription implements SpeechSubscription {
  private readonly completion = Promise.withResolvers<Settlement>()
  private readonly pending: SpeechSnapshot[] = []
  private active: TaskLifetime | undefined
  private closed = false
  private ending = false
  private readonly lastBasis = new Map<string | undefined, string>()
  private unsubscribe: () => void = () => {}
  readonly done = this.completion.promise

  constructor(readonly owner: PluginInput, readonly registration: Registration) {}

  start() {
    if (this.closed)
      return

    if (this.registration.kind === 'task') {
      const task = new TaskLifetime(this.registration.settings.timeoutMs)
      this.active = task
      const selection = this.registration.settings.selection
      const run = this.registration.run
      void task.run(() => run({
        signal: task.signal,
        controls: this.owner.controls(task),
        cancel: reason => task.stop({ status: 'cancelled', reason }),
        fail: error => task.stop({ status: 'failed', error }),
        untilTranscriptionEnded: () => this.owner.wait(task, selection, false),
        untilDependenciesSettled: () => this.owner.wait(task, selection, true),
      })).then(outcome => this.settle(outcome))
      return
    }

    this.unsubscribe = this.owner.input.subscribe(() => this.refresh())
    this.refresh()
  }

  /** Triggering workflow: SpeechInput publication → selected snapshot revisions → queued plugin tasks. */
  private refresh() {
    if (this.closed || this.ending || this.registration.kind !== 'subscribe')
      return

    const settings = this.registration.settings
    const targets = typeof settings.scope === 'object' ? this.owner.input.transcript.raw.segments.map(segment => segment.id) : [undefined]
    for (const target of targets) {
      const snapshot = this.owner.snapshot(settings, target)
      const basis = this.owner.input.basis(snapshot)
      if (basis === this.lastBasis.get(target))
        continue

      this.lastBasis.set(target, basis)
      if (settings.scheduling === 'latest') {
        const index = this.pending.findIndex(item => item.transcript.targetSegmentId === target)
        if (index >= 0)
          this.pending.splice(index, 1)
      }
      this.pending.push(snapshot)
    }

    void this.run()
  }

  private async run() {
    if (this.active || this.closed || this.registration.kind !== 'subscribe')
      return

    while (this.pending.length && !this.closed) {
      const snapshot = this.pending.shift()!
      const task = new TaskLifetime(this.registration.settings.timeoutMs)
      this.active = task
      const run = this.registration.run
      const outcome = await task.run(() => run({
        ...this.owner.view(task, this.registration.kind === 'subscribe' ? this.registration.settings : this.registration.settings.selection, snapshot),
        controls: this.owner.controls(task),
        signal: task.signal,
        cancel: reason => task.stop({ status: 'cancelled', reason }),
        fail: error => task.stop({ status: 'failed', error }),
      }))
      this.active = undefined
      if (outcome.status === 'failed') {
        this.settle(outcome)
        return
      }
    }

    if (this.ending)
      this.settle({ status: 'finished' })
  }

  end() {
    if (this.registration.kind === 'task')
      return

    this.ending = true
    this.unsubscribe()
    if (!this.active && !this.pending.length)
      this.settle({ status: 'finished' })
  }

  cancel(reason: string) {
    this.settle({ status: 'cancelled', reason })
  }

  fail(error: Error) {
    this.settle({ status: 'failed', error })
  }

  private settle(outcome: Settlement) {
    if (this.closed)
      return

    this.closed = true
    this.unsubscribe()
    this.pending.length = 0
    this.active?.stop(outcome)
    if (outcome.status === 'failed')
      this.owner.report(this.registration.kind === 'task' ? 'task' : 'subscription', outcome.error)

    this.completion.resolve(outcome)
  }
}

export class PluginInput {
  private readonly abort = new AbortController()
  private readonly cleanups: Cleanup[] = []
  private readonly subscriptions: InputSubscription[] = []
  private registering = true
  private disposed: Promise<void> | undefined
  readonly state = new Map<string, unknown>()
  readonly done = Promise.withResolvers<Settlement>()
  readonly dependencies: Set<string>

  constructor(readonly installation: InputPluginInstallation, readonly input: SpeechInput, readonly group: InputPlugins) {
    this.dependencies = new Set(installation.settings.dependsOn)
  }

  install() {
    const scope: SpeechInputScope = {
      inputId: this.input.id,
      sessionId: this.input.sessionId,
      signal: this.abort.signal,
      state: this.state,
      subscribe: (settings, run) => this.register({ kind: 'subscribe', settings, run }),
      task: (settings, run) => this.register({ kind: 'task', settings, run }),
      cancel: reason => void this.dispose({ status: 'cancelled', reason }),
      fail: (error) => {
        this.report('task', error)
        void this.dispose({ status: 'failed', error })
      },
      onDispose: cleanup => this.cleanups.push(cleanup),
    }
    try {
      for (const install of this.installation.installers) {
        const cleanup = install(scope)
        if (cleanup !== undefined && typeof cleanup !== 'function')
          throw new Error('Plugin input setup must be synchronous')
        if (cleanup)
          this.cleanups.push(cleanup)
      }
    }
    catch (cause) {
      const error = errorFromCause(cause, 'Plugin input setup failed')
      this.report('setup', error)
      void this.dispose({ status: 'failed', error })
    }
    finally {
      this.registering = false
    }
  }

  private register(registration: Registration): SpeechSubscription {
    if (!this.registering || this.abort.signal.aborted)
      throw new Error('Register plugin work during input setup')

    const selection = registration.kind === 'subscribe' ? registration.settings : registration.settings.selection
    const corrected = selection.transcript === 'corrected' || (typeof selection.scope === 'object' && selection.scope.neighborTranscript === 'corrected')
    if (corrected) {
      for (const name of selection.correctionPlugins ?? this.group.patchPlugins) {
        if (!this.group.patchPlugins.includes(name))
          throw new Error(`Unknown correction plugin: ${name}`)
        this.dependencies.add(name)
      }
    }

    for (const selected of selection.context ?? []) {
      if (!(this.installation.settings.dependsOn ?? []).includes(selected.plugin) || selected.plugin === this.installation.plugin.name)
        throw new Error('Selected context requires an upstream plugin dependency')
      if (selected.scope === 'target-segment' && typeof selection.scope !== 'object')
        throw new Error('Segment context requires a segment selection')
    }

    if (typeof selection.scope === 'object' && (!Number.isSafeInteger(selection.scope.neighbors) || selection.scope.neighbors < 0))
      throw new Error('Neighbor count must be a nonnegative integer')
    const grace = registration.settings.waitForSubmissionMs
    if (grace !== undefined && (!Number.isFinite(grace) || grace < 0))
      throw new Error('Submission grace must be finite and nonnegative')

    const subscription = new InputSubscription(this, registration)
    this.subscriptions.push(subscription)
    return subscription
  }

  start() {
    if (!this.abort.signal.aborted)
      this.subscriptions.forEach(subscription => subscription.start())
  }

  snapshot(selection: SpeechSelection, targetSegmentId?: string): SpeechSnapshot {
    return this.input.snapshot(selection, selection.correctionPlugins ?? this.group.patchPlugins, targetSegmentId)
  }

  view(task: TaskLifetime, selection: SpeechSelection, snapshot = this.snapshot(selection)): SpeechView {
    const basis = this.input.basis(snapshot)
    const current = () => this.input.basis(this.snapshot(selection, snapshot.transcript.targetSegmentId)) === basis
    const live = () => !task.closed && !this.abort.signal.aborted && !this.input.closed
    const closed = { status: 'rejected', reason: 'closed' } as const

    return {
      snapshot,
      context: {
        set: (key, value) => live() ? this.input.publish(this.installation.plugin.name, key, value, current, snapshot.transcript.targetSegmentId) : closed,
        delete: key => live() ? this.input.deleteContext(this.installation.plugin.name, key, current, snapshot.transcript.targetSegmentId) : closed,
      },
      patch: (proposal) => {
        if (!live())
          return closed

        if (!this.installation.settings.grants?.includes('transcript-patch') || selection.transcript !== 'raw')
          return { status: 'rejected', reason: 'denied' }
        if (proposal.edits.some(edit => !snapshot.transcript.segments.some(segment => segment.id === edit.segmentId)))
          return { status: 'rejected', reason: 'denied' }

        return this.input.patch(this.installation.plugin.name, proposal, current)
      },
    }
  }

  controls(task: TaskLifetime): VoicePluginControls {
    return this.installation.controls(() => !task.closed && !this.abort.signal.aborted && !this.input.closed)
  }

  async wait(task: TaskLifetime, selection: SpeechSelection, dependencies: boolean): Promise<TranscriptionEnd> {
    const stopped = task.done.then((outcome): TranscriptionEnd => outcome.status === 'failed' ? outcome : { status: 'cancelled', reason: 'Plugin task closed' })
    const ended = await Promise.race([this.group.transcription.promise, stopped])
    if (ended.status !== 'finished')
      return ended

    if (dependencies) {
      for (const name of this.dependencies) {
        const upstream = this.group.scopes.get(name)
        if (!upstream)
          return { status: 'failed', error: new Error(`Missing upstream plugin: ${name}`) }
        const outcome = await Promise.race([upstream.done.promise, stopped])
        if (outcome.status !== 'finished')
          return outcome
      }
    }

    if (task.closed || this.abort.signal.aborted || this.input.closed)
      return { status: 'cancelled', reason: 'Plugin task closed' }

    return { status: 'finished', value: this.view(task, selection) }
  }

  async finish() {
    const timers = new Map<InputSubscription, ReturnType<typeof setTimeout>>()
    for (const subscription of this.subscriptions) {
      const grace = subscription.registration.settings.waitForSubmissionMs ?? 0
      if (grace > 0)
        timers.set(subscription, setTimeout(() => subscription.cancel('Submission grace ended'), grace))
    }

    for (const name of this.dependencies) {
      // A missing upstream scope means dependency validation already failed this input.
      const upstream = this.group.scopes.get(name)
      const result = upstream ? await upstream.done.promise : undefined
      if (result?.status !== 'finished') {
        this.subscriptions.forEach(subscription => subscription.cancel('Upstream plugin did not finish'))
        break
      }
    }

    const results = await Promise.all(this.subscriptions.map(async (subscription) => {
      subscription.end()
      const grace = subscription.registration.settings.waitForSubmissionMs ?? 0
      if (!grace)
        subscription.cancel('Submission does not wait for this task')
      const result = await subscription.done
      clearTimeout(timers.get(subscription))
      return result
    }))

    this.done.resolve(results.find(result => result.status === 'failed') ?? results.find(result => result.status === 'cancelled') ?? { status: 'finished' })
  }

  report(stage: VoicePluginError['stage'], error: Error) {
    this.installation.report(stage, error, this.input.id)
  }

  failDependency(error: Error) {
    this.report('dependency', error)
    void this.dispose({ status: 'failed', error })
  }

  dispose(outcome: Settlement): Promise<void> {
    if (this.disposed)
      return this.disposed

    this.abort.abort(outcome)
    this.subscriptions.forEach(subscription => outcome.status === 'failed' ? subscription.fail(outcome.error) : subscription.cancel('Plugin input closed'))
    this.input.removePlugin(this.installation.plugin.name)
    this.done.resolve(outcome)

    this.disposed = (async () => {
      for (const cleanup of this.cleanups.reverse()) {
        try {
          await cleanup()
        }
        catch (cause) {
          this.report('cleanup', errorFromCause(cause, 'Plugin cleanup failed'))
        }
      }
    })()
    return this.disposed
  }
}

/** Owns a fixed set of plugin installations for one accepted input. Later installations apply to future inputs. */
export class InputPlugins {
  readonly scopes = new Map<string, PluginInput>()
  readonly transcription = Promise.withResolvers<Settlement>()
  readonly patchPlugins: readonly string[]

  constructor(readonly input: SpeechInput, installations: readonly InputPluginInstallation[]) {
    this.patchPlugins = installations.filter(installation => installation.settings.grants?.includes('transcript-patch')).map(installation => installation.plugin.name)
    for (const installation of installations) {
      const scope = new PluginInput(installation, input, this)
      this.scopes.set(installation.plugin.name, scope)
      installation.inputs.add(scope)
    }

    for (const scope of this.scopes.values())
      scope.install()

    const visited = new Set<string>()
    const active = new Set<string>()
    const visit = (name: string) => {
      if (active.has(name))
        throw new Error(`Plugin dependency feedback: ${[...active, name].join(' → ')}`)
      if (visited.has(name))
        return

      active.add(name)
      const scope = this.scopes.get(name)
      if (!scope)
        throw new Error(`Missing plugin input dependency: ${name}`)
      for (const dependency of scope.dependencies)
        visit(dependency)

      active.delete(name)
      visited.add(name)
    }

    for (const [name, scope] of this.scopes) {
      try {
        visit(name)
      }
      catch (cause) {
        scope.failDependency(errorFromCause(cause, 'Plugin dependency failed'))
        active.clear()
      }
    }

    for (const scope of this.scopes.values())
      scope.start()
  }

  async finish() {
    this.transcription.resolve({ status: 'finished' })

    // NOTICE:
    // Lifecycle tasks need one microtask to resume before finish drains their subscriptions.
    // The transcription promise resolves before its waiting task callbacks run.
    // Remove this yield when the task runner can drain resolved callbacks itself.
    await Promise.resolve()
    await Promise.all([...this.scopes.values()].map(scope => scope.finish()))
  }

  async close(outcome: Settlement) {
    this.transcription.resolve(outcome)
    await Promise.all([...this.scopes.values()].map(async (scope) => {
      await scope.dispose(outcome)
      scope.installation.inputs.delete(scope)
    }))
  }
}
