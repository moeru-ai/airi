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
 */
export class PluginOutput {
  private readonly lifetime: Task

  constructor(readonly installation: OutputPluginInstallation, private readonly response: VoiceResponse) {
    this.lifetime = createTask({
      signal: AbortSignal.any([installation.signal, response.closedSignal]),
      onCleanupError: cause => this.report(errorFromCause(cause, 'Plugin cleanup failed')),
    })
  }

  install() {
    const { response } = this
    const scope: SpeechOutputScope = {
      turn: response.turn,
      signal: this.lifetime.signal,
      controls: this.installation.controls(() => !this.lifetime.settled),
      on: (type, listener) => {
        if (this.lifetime.settled)
          return
        const stop = response.subscribe((event) => {
          if (!isEventOf(event, type))
            return
          try {
            listener(event)
          }
          catch (cause) {
            this.report(errorFromCause(cause, 'Speech output listener failed'))
          }
        })
        this.lifetime.defer(stop)
      },
      onDispose: cleanup => this.lifetime.defer(cleanup),
    }

    for (const install of this.installation.installers) {
      void (async () => install(scope))().catch((cause) => {
        this.report(errorFromCause(cause, 'Plugin output setup failed'))
      })
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
