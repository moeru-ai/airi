import type { AudioInput, Observer } from '@proj-airi/pipelines-audio'
import type { Scope } from '@proj-airi/stream-kit'

import type { SpeechInputAttempt } from '../input/attempt'
import type { ConversationContext } from '../input/ports'
import type { SpeechInput } from '../input/speech-input'
import type { BeginSpeechInput } from '../input/types'
import type { Interruption } from '../interruption'
import type { VoicePolicy } from '../policy/engine'
import type { VoiceCommand, VoiceRule } from '../policy/types'
import type { TurnRef } from '../turn'
import type { InputPluginInstallation, PluginInput } from './input-plugins'
import type {
  SpeechInputControl,
  VoicePlugin,
  VoicePluginControls,
  VoicePluginError,
  VoicePluginHandle,
  VoicePluginScope,
  VoicePluginSettings,
} from './types'

import { observe } from '@proj-airi/pipelines-audio'
import { createScope, runTask } from '@proj-airi/stream-kit'

import { errorFromCause } from '../../utils/error'
import { InputPlugins } from './input-plugins'

interface VoicePluginHost {
  activeInput: () => SpeechInputAttempt | undefined
  audio: () => AudioInput | undefined
  beginInput: (options: BeginSpeechInput) => SpeechInputAttempt
  cancelInput: (inputId: string, reason: string) => 'cancelled' | 'closed'
  interrupt: (options: { turns: readonly TurnRef[], cause: string }) => Interruption
  reportError: (stage: string, cause: unknown) => void
  policy: VoicePolicy
  conversationContext: (sessionId: string) => ConversationContext
}

class PluginInstallation implements VoicePluginHandle {
  readonly abort = new AbortController()
  readonly inputs = new Set<PluginInput>()
  readonly installers: Parameters<VoicePluginScope['onSpeechInput']>[0][] = []
  private readonly cleanups: (() => void | Promise<void>)[] = []
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

  private allows(grant: NonNullable<VoicePluginSettings['grants']>[number], live: () => boolean) {
    return live() && !this.abort.signal.aborted && !!this.settings.grants?.includes(grant)
  }

  /** Drops rule commands that this installation has no grant for. A rule has the grants of the plugin that added it. */
  private granted<S>(rule: VoiceRule<S>): VoiceRule<S> {
    const grantOf: Record<VoiceCommand['type'], NonNullable<VoicePluginSettings['grants']>[number]> = {
      begin: 'input-control',
      seal: 'input-control',
      cancel: 'cancel-input',
      interrupt: 'interrupt-turns',
    }
    return {
      ...rule,
      reduce: (state, event, context) => {
        const step = rule.reduce(state, event, context)
        if (!step.commands?.length)
          return step
        return { ...step, commands: step.commands.filter(command => this.allows(grantOf[command.type], () => true)) }
      },
    }
  }

  /** The commands on one attempt. Each command checks the grant and `live` when it runs, not when it is created. */
  control(attempt: SpeechInputAttempt, live: () => boolean): SpeechInputControl {
    const allows = (grant: NonNullable<VoicePluginSettings['grants']>[number]) => this.allows(grant, live)
    return {
      id: attempt.id,
      sessionId: attempt.sessionId,
      end: () => allows('input-control') ? { status: 'accepted', done: attempt.end() } : { status: 'denied' },
      cancel: reason => allows('cancel-input') ? this.actions.cancelInput(attempt.id, reason) : 'denied',
    }
  }

  /** The input scope receives commands only with the `input-control` grant. */
  inputInstallation(attempt: SpeechInputAttempt): InputPluginInstallation {
    return {
      plugin: this.plugin,
      signal: this.abort.signal,
      installers: this.installers,
      inputs: this.inputs,
      control: live => this.settings.grants?.includes('input-control') ? this.control(attempt, live) : undefined,
      report: (stage, error, inputId) => this.report(stage, error, inputId),
    }
  }

  controls(live: () => boolean): VoicePluginControls {
    const allows = (grant: NonNullable<VoicePluginSettings['grants']>[number]) => this.allows(grant, live)
    return {
      activeInput: () => {
        const attempt = this.actions.activeInput()
        return attempt && allows('input-control') ? this.control(attempt, live) : undefined
      },
      beginInput: settings => allows('input-control') ? { status: 'started', input: this.control(this.actions.beginInput(settings), live) } : { status: 'denied' },
      cancelInput: (id, reason) => allows('cancel-input') ? this.actions.cancelInput(id, reason) : 'denied',
      interrupt: (turns, cause) => allows('interrupt-turns') ? { status: 'started', interruption: this.actions.interrupt({ turns, cause }) } : { status: 'denied' },
    }
  }

  setup() {
    const { policy } = this.actions
    const scope: VoicePluginScope = {
      signal: this.abort.signal,
      onSpeechInput: install => this.installers.push(install),
      emit: (eventa, body) => {
        if (!this.abort.signal.aborted)
          void policy.events.emit(eventa, body)
      },
      on: (eventa, listener) => {
        if (this.abort.signal.aborted)
          return
        const stop = policy.events.on(eventa, (event) => {
          try {
            listener(event.body!)
          }
          catch (cause) {
            this.report('setup', errorFromCause(cause, 'Voice event listener failed'))
          }
        })
        this.abort.signal.addEventListener('abort', stop, { once: true })
      },
      rule: (rule) => {
        if (this.abort.signal.aborted)
          return
        const remove = policy.addRule(this.granted(rule))
        this.abort.signal.addEventListener('abort', remove, { once: true })
      },
      revisions: inputId => policy.revisions(inputId),
      conversationContext: sessionId => this.actions.conversationContext(sessionId),
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

        // Each window runs as one task. The observer signal cancels it, and controls expire when it settles.
        const detect = async (window: Parameters<typeof run>[0]['window'], signal: AbortSignal) => {
          const task = runTask(self => run({
            window,
            signal: self.signal,
            controls: this.controls(() => !self.settled),
            publish: (value) => {
              if (self.settled || this.abort.signal.aborted)
                return { status: 'rejected', reason: 'closed' }
              this.settings.onAudioEvidence?.({ plugin: this.plugin.name, range: window.range, value })
              return { status: 'applied' }
            },
            cancel: reason => self.cancel(reason),
            fail: error => self.fail(error),
          }), { signal })
          const outcome = await task.done
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
              this.report('audio', outcome.error)
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

    this.disposing = (async () => {
      await Promise.all([...this.inputs].map(input => input.dispose('Plugin disposed')))
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

    const installation = new PluginInstallation(this, this.actions, plugin, settings)
    this.installations.set(plugin.name, installation)
    installation.setup()

    return installation
  }

  /** Installations take part in the inputs that start after them. Their install order is the finalization order. */
  input(attempt: SpeechInputAttempt, input: SpeechInput): InputPlugins {
    return new InputPlugins(input, [...this.installations.values()].map(installation => installation.inputInstallation(attempt)))
  }

  remove(installation: PluginInstallation) {
    this.installations.delete(installation.plugin.name)
  }

  async close() {
    await Promise.all([...this.installations.values()].map(installation => installation.dispose()))
  }
}
