import type { AudioRange, Observer } from '@proj-airi/pipelines-audio'

import type { SpeechInput } from './speech-input'
import type { SpeechInputAttempt } from './speech-input-attempt'
import type { VoiceController } from './voice-controller'
import type {
  SpeechInputControl,
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
  VoicePluginHandle,
  VoicePluginScope,
} from './voice-plugin-types'

type Settlement = Awaited<SpeechSubscription['done']>
type Cleanup = () => void | Promise<void>
type Registration
  = { kind: 'subscribe', settings: Parameters<SpeechInputScope['subscribe']>[0], run: (ctx: SpeechTask) => Promise<void> }
    | { kind: 'task', settings: Parameters<SpeechInputScope['task']>[0], run: (ctx: SpeechLifecycleTask) => Promise<void> }

/** Grants authorize domain operations. They do not sandbox trusted in-process plugins. */
export interface VoicePluginSettings {
  readonly grants?: readonly ('input-control' | 'cancel-input' | 'interrupt-turns' | 'transcript-patch')[]
  readonly dependsOn?: readonly string[]
  readonly onAudioEvidence?: (event: { plugin: string, range: AudioRange, value: unknown }) => void
  readonly onError?: (event: VoicePluginError) => void
}

class TaskLifetime {
  private readonly abort = new AbortController()
  private readonly completion = Promise.withResolvers<Settlement>()
  private timer: ReturnType<typeof setTimeout> | undefined
  closed = false
  readonly signal = this.abort.signal
  readonly done = this.completion.promise

  constructor(timeoutMs?: number) {
    if (timeoutMs !== undefined) {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
        throw new Error('Plugin timeout must be finite and nonnegative')
      this.timer = setTimeout(() => this.stop({ status: 'failed', error: new Error('Plugin task timed out') }), timeoutMs)
    }
  }

  stop(outcome: Settlement) {
    if (this.closed)
      return
    this.closed = true
    clearTimeout(this.timer)
    if (outcome.status !== 'finished')
      this.abort.abort(outcome)
    this.completion.resolve(outcome)
  }

  async run(callback: () => Promise<void>): Promise<Settlement> {
    void Promise.resolve().then(() => this.closed ? undefined : callback()).then(
      () => this.stop({ status: 'finished' }),
      cause => this.stop({ status: 'failed', error: cause instanceof Error ? cause : new Error('Plugin callback failed', { cause }) }),
    )
    return this.done
  }
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

class PluginInput {
  private readonly abort = new AbortController()
  private readonly cleanups: Cleanup[] = []
  private readonly subscriptions: InputSubscription[] = []
  private registering = true
  private disposed: Promise<void> | undefined
  readonly state = new Map<string, unknown>()
  readonly done = Promise.withResolvers<Settlement>()
  readonly dependencies: Set<string>

  constructor(readonly installation: PluginInstallation, readonly input: SpeechInput, readonly group: InputPlugins) {
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
      const error = cause instanceof Error ? cause : new Error('Plugin input setup failed', { cause })
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
      const result = await this.group.scopes.get(name)!.done.promise
      if (result.status !== 'finished') {
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
          this.report('cleanup', cause instanceof Error ? cause : new Error('Plugin cleanup failed', { cause }))
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

  constructor(readonly input: SpeechInput, installations: readonly PluginInstallation[]) {
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
        scope.failDependency(cause instanceof Error ? cause : new Error('Plugin dependency failed', { cause }))
        active.clear()
      }
    }
    for (const scope of this.scopes.values())
      scope.start()
  }

  async finish() {
    this.transcription.resolve({ status: 'finished' })
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

class PluginInstallation implements VoicePluginHandle {
  readonly abort = new AbortController()
  readonly inputs = new Set<PluginInput>()
  readonly installers: Parameters<VoicePluginScope['onSpeechInput']>[0][] = []
  private readonly cleanups: Cleanup[] = []
  private disposing: ReturnType<VoicePluginHandle['dispose']> | undefined

  constructor(readonly host: VoicePlugins, readonly plugin: VoicePlugin, readonly settings: VoicePluginSettings) {}

  report(stage: VoicePluginError['stage'], error: Error, inputId?: string) {
    try {
      if (this.settings.onError)
        this.settings.onError({ plugin: this.plugin.name, stage, error, ...(inputId ? { inputId } : {}) })
      else
        this.host.controller.reportError(`plugin:${this.plugin.name}:${stage}`, error)
    }
    catch (cause) {
      this.host.controller.reportError('plugin-diagnostic', cause)
    }
  }

  controls(live: () => boolean): VoicePluginControls {
    const allows = (grant: NonNullable<VoicePluginSettings['grants']>[number]) => live() && !this.abort.signal.aborted && !!this.settings.grants?.includes(grant)
    const control = (attempt: SpeechInputAttempt): SpeechInputControl => ({
      id: attempt.id,
      sessionId: attempt.sessionId,
      noteActivity: evidence => allows('input-control') && attempt.noteActivity(evidence),
      end: () => allows('input-control') ? { status: 'accepted', done: attempt.end() } : { status: 'denied' },
      cancel: reason => allows('cancel-input') ? this.host.controller.cancelInput(attempt.id, reason) : 'denied',
      detectEnd: (options, detector) => {
        if (!allows('input-control'))
          return { status: 'denied' }
        const observer = attempt.detectEnd(options, detector)
        this.cleanups.push(() => observer.cancel())
        return { status: 'installed', observer }
      },
    })
    return {
      activeInput: () => {
        const attempt = this.host.controller.activeInput
        return attempt && allows('input-control') ? control(attempt) : undefined
      },
      beginInput: settings => allows('input-control') ? { status: 'started', input: control(this.host.controller.beginInput(settings)) } : { status: 'denied' },
      cancelInput: (id, reason) => allows('cancel-input') ? this.host.controller.cancelInput(id, reason) : 'denied',
      interrupt: (turns, cause) => allows('interrupt-turns') ? { status: 'started', interruption: this.host.controller.interrupt({ turns, cause }) } : { status: 'denied' },
    }
  }

  setup() {
    const scope: VoicePluginScope = {
      signal: this.abort.signal,
      state: new Map(),
      onSpeechInput: install => this.installers.push(install),
      onDispose: cleanup => this.cleanups.push(cleanup),
      cancel: () => void this.dispose(),
      fail: (error) => {
        this.report('setup', error)
        void this.dispose()
      },
      observeAudio: (settings, run) => {
        const completion = Promise.withResolvers<Awaited<Observer['done']>>()
        const abort = new AbortController()
        const sourceSignal = this.host.audioSignal
        let observer: Observer | undefined
        const cancel = () => {
          abort.abort()
          observer?.cancel()
          completion.resolve({ status: 'cancelled' })
        }
        sourceSignal.addEventListener('abort', cancel, { once: true })
        this.abort.signal.addEventListener('abort', cancel, { once: true })
        settings.signal?.addEventListener('abort', cancel, { once: true })
        void completion.promise.then(() => {
          sourceSignal.removeEventListener('abort', cancel)
          this.abort.signal.removeEventListener('abort', cancel)
          settings.signal?.removeEventListener('abort', cancel)
        })
        if (sourceSignal.aborted || this.abort.signal.aborted || settings.signal?.aborted) {
          cancel()
          return { done: completion.promise, cancel }
        }
        void this.host.controller.acquireAudio().then((audio) => {
          if (abort.signal.aborted)
            return
          observer = audio.observe({ ...settings, signal: abort.signal }, async (window, signal) => {
            const task = new TaskLifetime()
            const stop = () => task.stop({ status: 'cancelled', reason: 'Audio observer closed' })
            signal.addEventListener('abort', stop, { once: true })
            const outcome = await task.run(() => run({
              window,
              signal: task.signal,
              controls: this.controls(() => !task.closed),
              publish: (value) => {
                if (task.closed || signal.aborted || this.abort.signal.aborted)
                  return { status: 'rejected', reason: 'closed' }
                this.settings.onAudioEvidence?.({ plugin: this.plugin.name, range: window.range, value })
                return { status: 'applied' }
              },
              cancel: reason => task.stop({ status: 'cancelled', reason }),
              fail: error => task.stop({ status: 'failed', error }),
            }))
            signal.removeEventListener('abort', stop)
            if (outcome.status === 'failed')
              throw outcome.error
          }, () => {})
          void observer.done.then((outcome) => {
            if (outcome.status === 'failed')
              this.report('subscription', outcome.error)
            completion.resolve(outcome)
          })
        }).catch((cause) => {
          const error = cause instanceof Error ? cause : new Error('Plugin audio observation failed', { cause })
          this.report('subscription', error)
          completion.resolve({ status: 'failed', error })
        })
        return { done: completion.promise, cancel }
      },
    }
    try {
      const cleanup = this.plugin.setup(scope)
      if (cleanup !== undefined && typeof cleanup !== 'function')
        throw new Error('Plugin setup must be synchronous')
      if (cleanup)
        this.cleanups.push(cleanup)
    }
    catch (cause) {
      scope.fail(cause instanceof Error ? cause : new Error('Plugin setup failed', { cause }))
    }
  }

  dispose(): ReturnType<VoicePluginHandle['dispose']> {
    if (this.disposing)
      return this.disposing
    this.abort.abort()
    this.host.remove(this)
    this.disposing = (async () => {
      await Promise.all([...this.inputs].map(scope => scope.dispose({ status: 'cancelled', reason: 'Plugin disposed' })))
      const errors: Error[] = []
      for (const cleanup of this.cleanups.reverse()) {
        try {
          await cleanup()
        }
        catch (cause) {
          errors.push(cause instanceof Error ? cause : new Error('Plugin cleanup failed', { cause }))
        }
      }
      return errors.length ? { status: 'failed', errors } : { status: 'disposed' }
    })()
    return this.disposing
  }
}

/** Owns trusted installations and their future input registrations. */
export class VoicePlugins {
  private readonly installations = new Map<string, PluginInstallation>()
  private audioLifetime = new AbortController()

  get audioSignal(): AbortSignal {
    return this.audioLifetime.signal
  }

  /** Source replacement cancels this controller's observations, including pending source acquisition. */
  replaceAudio() {
    const previous = this.audioLifetime
    this.audioLifetime = new AbortController()
    previous.abort('Audio input replaced')
  }

  constructor(readonly controller: VoiceController) {}

  use(plugin: VoicePlugin, settings: VoicePluginSettings = {}): VoicePluginHandle {
    if (this.installations.has(plugin.name))
      throw new Error(`Plugin already installed: ${plugin.name}`)
    for (const dependency of settings.dependsOn ?? []) {
      if (!this.installations.has(dependency))
        throw new Error(`Missing plugin dependency: ${dependency}`)
    }
    const installation = new PluginInstallation(this, plugin, settings)
    this.installations.set(plugin.name, installation)
    installation.setup()
    return installation
  }

  input(input: SpeechInput): InputPlugins {
    return new InputPlugins(input, [...this.installations.values()])
  }

  remove(installation: PluginInstallation) {
    this.installations.delete(installation.plugin.name)
    for (const input of installation.inputs) {
      for (const scope of input.group.scopes.values()) {
        if (scope.dependencies.has(installation.plugin.name))
          scope.failDependency(new Error(`Plugin dependency disposed: ${installation.plugin.name}`))
      }
    }
    for (const dependent of this.installations.values()) {
      if (dependent.settings.dependsOn?.includes(installation.plugin.name))
        void dependent.dispose()
    }
  }

  async close() {
    await Promise.all([...this.installations.values()].map(installation => installation.dispose()))
  }
}
