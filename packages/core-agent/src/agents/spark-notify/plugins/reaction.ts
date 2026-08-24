import type { SparkNotifyPlugin } from '../types'

/** Receives the text that is suitable for a character reaction. */
export interface SparkNotifyReactionSink {
  /** Receives a visible text delta while the model streams its reaction. */
  onDelta: (eventId: string, text: string) => void
  /** Receives the final visible reaction after the model stream ends. */
  onEnd: (eventId: string, text: string) => void
}

/** Sends model reaction text to a host-owned presentation sink. */
export function createSparkNotifyReactionPlugin(sink: SparkNotifyReactionSink): SparkNotifyPlugin {
  return {
    name: 'spark-notify-reaction',
    prepare(turn) {
      return {
        onEvent(event) {
          if (event.type === 'model-output-text') {
            const text = typeof event.payload.text === 'string' ? event.payload.text : ''
            if (text)
              sink.onDelta(turn.event.data.id, text)
            return
          }

          if (event.type === 'result') {
            const reaction = typeof event.payload.reaction === 'string' ? event.payload.reaction : ''
            sink.onEnd(turn.event.data.id, reaction)
          }
        },
      }
    },
  }
}
