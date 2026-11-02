import type { VoicePlugin } from '@proj-airi/core-agent'
import type { Observer } from '@proj-airi/pipelines-audio'

import { levelOf } from '@proj-airi/pipelines-audio'

/** One level for each window gives a 20 Hz meter, the rate of the microphone level. */
const LEVEL_WINDOW_MS = 50

/**
 * Publishes the level of the played speech while a response voices.
 *
 * The observation starts with the first played segment of a response, so the time while the model thinks and the
 * first sentence synthesizes costs nothing. Responses that overlap share one observation. When the last voicing
 * response closes, the plugin stops the observation and publishes one 0.
 */
export function createSpeechOutputLevelPlugin(options: { onLevel: (level: number) => void }): VoicePlugin {
  return {
    name: 'speech-output-level',
    setup(scope) {
      let voicing = 0
      let observer: Observer | undefined

      scope.onOutput((output) => {
        let started = false
        output.on('playback-start', () => {
          if (started)
            return
          started = true
          voicing += 1
          observer ??= scope.output.observe({ windowMs: LEVEL_WINDOW_MS, hopMs: LEVEL_WINDOW_MS }, async ctx => options.onLevel(levelOf(ctx.window.channels)))
        })
        output.onDispose(() => {
          if (!started)
            return
          voicing -= 1
          if (voicing > 0)
            return
          observer?.cancel('Speech stopped voicing')
          observer = undefined
          options.onLevel(0)
        })
      })
      return undefined
    },
  }
}
