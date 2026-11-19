import type { AudioInput, AudioPlayback, Observer, WindowOptions } from '@proj-airi/pipelines-audio'
import type { Scope } from '@proj-airi/stream-kit'

import type { SpeechInputAttempt } from '../input/attempt'
import type { ConversationContext } from '../input/ports'
import type { SpeechInput } from '../input/speech-input'
import type { BeginSpeechInput } from '../input/types'
import type { Interruption } from '../interruption'
import type { VoiceResponse } from '../output/response'
import type { VoicePolicy } from '../policy/engine'
import type { VoiceCommand, VoiceRule } from '../policy/types'
import type { TurnRef } from '../turn'
import type { InputPluginInstallation, PluginInput } from './input-plugins'
import type { OutputPluginInstallation, PluginOutput } from './output-plugins'
import type {
  AudioPluginTask,
  SpeechInputControl,
  SpeechInputScope,
  SpeechOutputScope,
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
import { installOutputPlugins } from './output-plugins'

interface VoicePluginHost<TNode> {
  activeInput: () => SpeechInputAttempt | undefined
  audio: () => AudioInput | undefined
  playback: () => AudioPlayback<TNode> | undefined
  beginInput: (options: BeginSpeechInput) => SpeechInputAttempt
  cancelInput: (inputId: string, reason: string) => 'cancelled' | 'closed'
  interrupt: (options: { turns: readonly TurnRef[], cause: string }) => Interruption
  reportError: (stage: string, cause: unknown) => void
  policy: VoicePolicy
  conversationContext: (sessionId: string) => ConversationContext
}

/** One side of the audio. Replacing its device restarts the observations of that side. */
type AudioSide = 'input' | 'output'

/** A plugin observation or graph connection that follows its device. */
interface DeviceBinding {
  restart: () => void
}

class PluginInstallation<TNode> implements VoicePluginHandle {
  readonly abort = new AbortController()
  readonly inputs = new Set<PluginInput>()
  readonly outputs = new Set<PluginOutput>()
  readonly installers: ((ctx: SpeechInputScope) => void | Promise<void>)[] = []
  readonly outputInstallers: ((ctx: SpeechOutputScope) => void | Promise<void>)[] = []
  private readonly cleanups: (() => void | Promise<void>)[] = []
  private disposing: ReturnType<VoicePluginHandle['dispose']> | undefined

  constructor(readonly host: VoicePlugins<TNode>, private readonly actions: VoicePluginHost<TNode>, readonly plugin: VoicePlugin<TNode>, readonly settings: VoicePluginSettings) {}

  report(stage: VoicePluginError['stage'], error: Error, inputId?: string, turn?: TurnRef) {
    try {
      if (this.settings.onError)
        this.settings.onError({ plugin: this.plugin.name, stage, error, ...(inputId ? { inputId } : {}), ...(turn ? { turn } : {}) })
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
  outputInstallation(): OutputPluginInstallation {
    return {
      name: this.plugin.name,
      signal: this.abort.signal,
      installers: this.outputInstallers,
      outputs: this.outputs,
      controls: live => this.controls(live),
      report: (stage, error, turn) => this.report(stage, error, undefined, turn),
    }
  }

  inputInstallation(attempt: SpeechInputAttempt): InputPluginInstallation {
    return {
      name: this.plugin.name,
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
    const scope: VoicePluginScope<TNode> = {
      signal: this.abort.signal,
      input: { observe: (settings, run) => this.observe('input', settings, run) },
      output: {
        observe: (settings, run) => this.observe('output', settings, run),
        connect: node => this.connect(node),
      },
      onInput: install => void this.installers.push(install),
      onOutput: install => void this.outputInstallers.push(install),
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

  /** Observes one side of the audio for the life of the plugin. A replaced device closes the old generation and observes the new one. */
  private observe(side: AudioSide, settings: WindowOptions & { minWindowMs?: number }, run: (ctx: AudioPluginTask) => Promise<void>): Observer {
    const completion = Promise.withResolvers<Awaited<Observer['done']>>()
    const scope = createScope(settings.signal ? AbortSignal.any([this.abort.signal, settings.signal]) : this.abort.signal)
    // One child scope per device. Replacing the device closes the old child and observes the new one.
    let generation: Scope | undefined

    // Each window runs as one task. The observer signal cancels it, and controls expire when it settles.
    const detect = async (window: AudioPluginTask['window'], signal: AbortSignal) => {
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
      void generation?.close('Audio device replaced')
      const audio = side === 'input' ? this.actions.audio() : this.actions.playback()?.output
      // Without a device, the observation waits for the next replacement.
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

    const binding: DeviceBinding = { restart: start }
    scope.defer(() => {
      completion.resolve({ status: 'cancelled', reason: 'Plugin observation closed' })
      this.host.unbind(side, binding)
    })
    if (!scope.signal.aborted) {
      this.host.bind(side, binding)
      start()
    }

    return { done: completion.promise, cancel: reason => void scope.close(reason) }
  }

  /** Connects a graph node to the current playback until the plugin is disposed. A replaced playback receives it again. */
  private connect(node: TNode) {
    if (this.abort.signal.aborted)
      return

    let disconnect: (() => void) | undefined
    const release = () => {
      try {
        disconnect?.()
      }
      catch (cause) {
        this.report('output', errorFromCause(cause, 'Playback disconnection failed'))
      }
      disconnect = undefined
    }
    const binding: DeviceBinding = {
      restart: () => {
        release()
        try {
          disconnect = this.actions.playback()?.connect?.(node)
        }
        catch (cause) {
          this.report('output', errorFromCause(cause, 'Playback connection failed'))
        }
      },
    }
    this.host.bind('output', binding)
    binding.restart()
    this.cleanups.push(() => {
      this.host.unbind('output', binding)
      release()
    })
  }

  dispose(): ReturnType<VoicePluginHandle['dispose']> {
    if (this.disposing)
      return this.disposing

    this.abort.abort()
    this.host.remove(this)

    this.disposing = (async () => {
      await Promise.all([
        ...[...this.inputs].map(input => input.dispose('Plugin disposed')),
        ...[...this.outputs].map(output => output.dispose('Plugin disposed')),
      ])
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

/** Owns trusted installations, their future input and output registrations, and their device bindings. */
export class VoicePlugins<TNode = never> {
  private readonly installations = new Map<string, PluginInstallation<TNode>>()
  private readonly bindings: Record<AudioSide, Set<DeviceBinding>> = { input: new Set(), output: new Set() }

  constructor(private readonly actions: VoicePluginHost<TNode>) {}

  /** A new microphone moves every input observation to it, including pending source acquisition. */
  replaceAudio() {
    this.restart('input')
  }

  /** A new playback moves every output observation and graph connection to it. */
  replacePlayback() {
    this.restart('output')
  }

  bind(side: AudioSide, binding: DeviceBinding) {
    this.bindings[side].add(binding)
  }

  unbind(side: AudioSide, binding: DeviceBinding) {
    this.bindings[side].delete(binding)
  }

  private restart(side: AudioSide) {
    for (const binding of [...this.bindings[side]])
      binding.restart()
  }

  use(plugin: VoicePlugin<TNode>, settings: VoicePluginSettings = {}): VoicePluginHandle {
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

  /** Installations take part in the responses that open after them, in install order. */
  output(response: VoiceResponse) {
    installOutputPlugins(response, [...this.installations.values()].map(installation => installation.outputInstallation()))
  }

  remove(installation: PluginInstallation<TNode>) {
    this.installations.delete(installation.plugin.name)
  }

  async close() {
    await Promise.all([...this.installations.values()].map(installation => installation.dispose()))
  }
}
