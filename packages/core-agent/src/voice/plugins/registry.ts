import type { AudioInput, Observer, Scope } from '@proj-airi/pipelines-audio'

import type { SpeechInputAttempt } from '../input/attempt'
import type { BeginSpeechInput } from '../input/attempt-types'
import type { SpeechInput } from '../input/speech-input'
import type { Interruption } from '../interruption'
import type { TurnRef } from '../turn'
import type { InputPluginInstallation, PluginInput } from './input-plugins'
import type { Cleanup } from './task-lifetime'
import type {
  SpeechInputControl,
  VoicePlugin,
  VoicePluginControls,
  VoicePluginError,
  VoicePluginHandle,
  VoicePluginScope,
  VoicePluginSettings,
} from './types'

import { createScope, observe } from '@proj-airi/pipelines-audio'

import { errorFromCause } from '../../utils/error'
import { InputPlugins } from './input-plugins'
import { TaskLifetime } from './task-lifetime'

interface VoicePluginHost {
  activeInput: () => SpeechInputAttempt | undefined
  audio: () => AudioInput | undefined
  beginInput: (options: BeginSpeechInput) => SpeechInputAttempt
  cancelInput: (inputId: string, reason: string) => 'cancelled' | 'closed'
  interrupt: (options: { turns: readonly TurnRef[], cause: string }) => Interruption
  reportError: (stage: string, cause: unknown) => void
}

class PluginInstallation implements VoicePluginHandle, InputPluginInstallation {
  readonly abort = new AbortController()
  readonly inputs = new Set<PluginInput>()
  readonly installers: Parameters<VoicePluginScope['onSpeechInput']>[0][] = []
  private readonly cleanups: Cleanup[] = []
  private readonly detectors = new Set<Observer>()
  private disposing: ReturnType<VoicePluginHandle['dispose']> | undefined

  constructor(readonly host: VoicePlugins, private readonly actions: VoicePluginHost, readonly plugin: VoicePlugin, readonly settings: VoicePluginSettings) {}

  report(stage: VoicePluginError['stage'], error: Error, inputId?: string) {
    try {
      if (this.settings.onError)
        this.settings.onError({ plugin: this.plugin.name, stage, error, ...(inputId ? { inputId } : {}) })
      else
        this.actions.reportError(`plugin:${this.plugin.name}:${stage}`, error)
    }
    catch (cause) {
      this.actions.reportError('plugin-diagnostic', cause)
    }
  }

  controls(live: () => boolean): VoicePluginControls {
    const allows = (grant: NonNullable<VoicePluginSettings['grants']>[number]) => live() && !this.abort.signal.aborted && !!this.settings.grants?.includes(grant)
    const control = (attempt: SpeechInputAttempt): SpeechInputControl => ({
      id: attempt.id,
      sessionId: attempt.sessionId,
      noteActivity: evidence => allows('input-control') && attempt.noteActivity(evidence),
      end: () => allows('input-control') ? { status: 'accepted', done: attempt.end() } : { status: 'denied' },
      cancel: reason => allows('cancel-input') ? this.actions.cancelInput(attempt.id, reason) : 'denied',
      detectEnd: (options, detector) => {
        if (!allows('input-control'))
          return { status: 'denied' }

        const observer = attempt.detectEnd(options, detector)
        this.detectors.add(observer)
        void observer.done.then(() => this.detectors.delete(observer))

        return { status: 'installed', observer }
      },
    })
    return {
      activeInput: () => {
        const attempt = this.actions.activeInput()
        return attempt && allows('input-control') ? control(attempt) : undefined
      },
      beginInput: settings => allows('input-control') ? { status: 'started', input: control(this.actions.beginInput(settings)) } : { status: 'denied' },
      cancelInput: (id, reason) => allows('cancel-input') ? this.actions.cancelInput(id, reason) : 'denied',
      interrupt: (turns, cause) => allows('interrupt-turns') ? { status: 'started', interruption: this.actions.interrupt({ turns, cause }) } : { status: 'denied' },
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
        const scope = createScope(settings.signal ? AbortSignal.any([this.abort.signal, settings.signal]) : this.abort.signal)
        // One child scope per shared input. Replacing the input closes the old child and observes the new one.
        let generation: Scope | undefined

        const detect = async (window: Parameters<typeof run>[0]['window'], signal: AbortSignal) => {
          const task = new TaskLifetime()
          signal.addEventListener('abort', () => task.stop({ status: 'cancelled', reason: 'Audio observer closed' }), { once: true, signal: task.signal })
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
          if (outcome.status === 'failed')
            throw outcome.error
        }

        const start = () => {
          void generation?.close('Audio input replaced')
          const audio = this.actions.audio()
          // Without an input, the observation waits for the next replaceAudio call.
          if (!audio || scope.signal.aborted)
            return

          const current = scope.child()
          generation = current
          // The detector publishes through task controls, so observation results need no callback.
          const observer = observe(audio, { ...settings, signal: current.signal }, detect, () => {})
          void observer.done.then((outcome) => {
            // A replaced generation ends quietly. Source failure or completion ends the whole observation.
            if (current.signal.aborted)
              return
            if (outcome.status === 'failed')
              this.report('subscription', outcome.error)
            if (outcome.status !== 'cancelled')
              completion.resolve(outcome)
            void scope.close()
          })
        }

        const observation = { restart: start, cancel: () => void scope.close('Plugin observation cancelled') }
        scope.defer(() => {
          completion.resolve({ status: 'cancelled', reason: 'Plugin observation closed' })
          this.host.removeAudioObservation(observation)
        })
        if (!scope.signal.aborted) {
          this.host.addAudioObservation(observation)
          start()
        }

        return { done: completion.promise, cancel: reason => void scope.close(reason) }
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
      scope.fail(errorFromCause(cause, 'Plugin setup failed'))
    }
  }

  dispose(): ReturnType<VoicePluginHandle['dispose']> {
    if (this.disposing)
      return this.disposing

    this.abort.abort()
    this.host.remove(this)
    for (const detector of this.detectors)
      detector.cancel('Plugin disposed')
    this.detectors.clear()

    this.disposing = (async () => {
      await Promise.all([...this.inputs].map(scope => scope.dispose({ status: 'cancelled', reason: 'Plugin disposed' })))
      const errors: Error[] = []

      for (const cleanup of this.cleanups.reverse()) {
        try {
          await cleanup()
        }
        catch (cause) {
          errors.push(errorFromCause(cause, 'Plugin cleanup failed'))
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
  private readonly audioObservations = new Set<{ restart: () => void, cancel: () => void }>()

  constructor(private readonly actions: VoicePluginHost) {}

  /** Source replacement cancels this controller's observations, including pending source acquisition. */
  replaceAudio() {
    for (const observation of this.audioObservations)
      observation.restart()
  }

  addAudioObservation(observation: { restart: () => void, cancel: () => void }) {
    this.audioObservations.add(observation)
  }

  removeAudioObservation(observation: { restart: () => void, cancel: () => void }) {
    this.audioObservations.delete(observation)
  }

  use(plugin: VoicePlugin, settings: VoicePluginSettings = {}): VoicePluginHandle {
    if (this.installations.has(plugin.name))
      throw new Error(`Plugin already installed: ${plugin.name}`)

    for (const dependency of settings.dependsOn ?? []) {
      if (!this.installations.has(dependency))
        throw new Error(`Missing plugin dependency: ${dependency}`)
    }

    const installation = new PluginInstallation(this, this.actions, plugin, settings)
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
