import type { Task } from '@proj-airi/stream-kit'

import type { SpeechOutputEvent, VoiceResponse } from '../output/response'
import type { TurnRef } from '../turn'
import type { SpeechOutputScope, VoicePluginControls, VoicePluginError } from './types'

import { createTask } from '@proj-airi/stream-kit'

import { errorFromCause } from '../../utils/error'

function isEventOf<T extends SpeechOutputEvent['type']>(event: SpeechOutputEvent, type: T): event is Extract<SpeechOutputEvent, { type: T }> {
  return event.type === type
}

/** What one response needs from a plugin installation. The registry implements it. */
export interface OutputPluginInstallation {
  readonly name: string
  /** Aborts when the plugin is disposed. */
  readonly signal: AbortSignal
  readonly installers: readonly ((ctx: SpeechOutputScope) => void | Promise<void>)[]
  /** The registry disposes these outputs when the plugin is disposed. */
  readonly outputs: Set<PluginOutput>
  /** `live` turns false when the response closes or the plugin is disposed. */
  controls: (live: () => boolean) => VoicePluginControls
  report: (stage: VoicePluginError['stage'], error: Error, turn?: TurnRef) => void
}

/**
 * One plugin's work on one response.
 *
 * `lifetime` aborts when the response closes or the plugin is disposed. Event listeners and cleanups registered
 * through `onDispose` belong to it, so one abort stops all of them.
 *
 * Events wait in `pending` until every installer of the plugin settles. An installer can await before it registers a
 * listener, and it still receives the events of the response from the start, also when the response closed meanwhile.
 * A disposed plugin receives nothing.
 */
export class PluginOutput {
  private readonly lifetime: Task
  private readonly listeners = new Set<(event: SpeechOutputEvent) => void>()
  private pending: SpeechOutputEvent[] | undefined = []

  constructor(readonly installation: OutputPluginInstallation, private readonly response: VoiceResponse) {
    this.lifetime = createTask({
      signal: AbortSignal.any([installation.signal, response.closedSignal]),
      onCleanupError: cause => this.report(errorFromCause(cause, 'Plugin cleanup failed')),
    })
  }

  install() {
    const { response } = this
    this.lifetime.defer(response.subscribe((event) => {
      if (this.pending)
        this.pending.push(event)
      else
        this.dispatch(event)
    }))

    const scope: SpeechOutputScope = {
      turn: response.turn,
      signal: this.lifetime.signal,
      controls: this.installation.controls(() => !this.lifetime.settled),
      on: (type, listener) => {
        // While installers run, a listener can still register after the response closes. The flush delivers to it.
        if (this.installation.signal.aborted || (this.lifetime.settled && !this.pending))
          return
        const filtered = (event: SpeechOutputEvent) => {
          if (isEventOf(event, type))
            listener(event)
        }
        this.listeners.add(filtered)
        // `defer` on a settled task runs at once. The flush clears late listeners instead.
        if (!this.lifetime.settled)
          this.lifetime.defer(() => this.listeners.delete(filtered))
      },
      onDispose: cleanup => this.lifetime.defer(cleanup),
    }

    const installs = this.installation.installers.map(async (install) => {
      try {
        await install(scope)
      }
      catch (cause) {
        this.report(errorFromCause(cause, 'Plugin output setup failed'))
      }
    })
    void Promise.all(installs).then(() => {
      const events = this.pending ?? []
      this.pending = undefined
      if (!this.installation.signal.aborted)
        events.forEach(event => this.dispatch(event))
      // A response that closed during installation already ran its cleanups, so the late listeners end here.
      if (this.lifetime.settled)
        this.listeners.clear()
    })
  }

  private dispatch(event: SpeechOutputEvent) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      }
      catch (cause) {
        this.report(errorFromCause(cause, 'Speech output listener failed'))
      }
    }
  }

  /** Removes the listeners, then waits for this plugin's cleanups. */
  dispose(reason: string): Promise<void> {
    this.lifetime.cancel(reason)
    return this.lifetime.closed
  }

  private report(error: Error) {
    this.installation.report('output', error, this.response.turn)
  }
}

/**
 * Installs every plugin on a new response, in plugin installation order.
 *
 * Each installation forgets the output after the response closes, so a long session keeps no closed responses.
 */
export function installOutputPlugins(response: VoiceResponse, installations: readonly OutputPluginInstallation[]) {
  for (const installation of installations) {
    if (!installation.installers.length)
      continue
    const output = new PluginOutput(installation, response)
    installation.outputs.add(output)
    output.install()
    response.closedSignal.addEventListener('abort', () => installation.outputs.delete(output), { once: true })
  }
}
