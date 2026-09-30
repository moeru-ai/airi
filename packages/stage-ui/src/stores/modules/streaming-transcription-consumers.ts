/** Identifies one captured utterance independently from later speech and selection changes. */
export interface StreamingTranscriptionSegment {
  readonly id: number
}

/** Callbacks that receive results from one shared streaming transcription session. */
export interface StreamingTranscriptionCallbacks {
  onSpeechStart?: (segment: StreamingTranscriptionSegment) => void
  onSentenceEnd?: (delta: string, segment?: StreamingTranscriptionSegment) => void
  onSpeechEnd?: (text: string, segment?: StreamingTranscriptionSegment) => void
  /** Receives the complete current transcript after each provider update. */
  onTranscriptionUpdate?: (text: string, segment?: StreamingTranscriptionSegment) => void
}

/** A consumer with a stable identity and its current callbacks. */
export interface StreamingTranscriptionConsumer extends StreamingTranscriptionCallbacks {
  /** Identifies the callback owner across registration updates and cleanup. */
  consumerId: string
}

/**
 * Routes one provider session to independent consumers.
 *
 * A consumer can replace its callbacks without restarting the provider. The
 * registry isolates callback failures so one consumer cannot block another.
 */
export class StreamingTranscriptionConsumers {
  private readonly consumers = new Map<string, StreamingTranscriptionCallbacks>()

  /** Registers or replaces the callbacks for one consumer. */
  register(consumer: StreamingTranscriptionConsumer) {
    this.consumers.set(consumer.consumerId, {
      onSpeechStart: consumer.onSpeechStart,
      onSentenceEnd: consumer.onSentenceEnd,
      onSpeechEnd: consumer.onSpeechEnd,
      onTranscriptionUpdate: consumer.onTranscriptionUpdate,
    })
  }

  /** Removes callbacks for one consumer. */
  remove(consumerId: string) {
    this.consumers.delete(consumerId)
  }

  /** Whether any owner still needs the shared provider session. */
  hasConsumers() {
    return this.consumers.size > 0
  }

  /** Captures consumer ownership before any asynchronous provider startup. */
  emitSpeechStart(segment: StreamingTranscriptionSegment) {
    for (const [consumerId, callbacks] of this.consumers) {
      try {
        callbacks.onSpeechStart?.(segment)
      }
      catch (cause) {
        console.error(`[Hearing Pipeline] Streaming consumer ${consumerId} onSpeechStart failed:`, cause)
      }
    }
  }

  /** Sends a completed sentence to all current consumers. */
  emitSentenceEnd(delta: string, segment?: StreamingTranscriptionSegment) {
    this.emit('onSentenceEnd', delta, segment)
  }

  /** Sends completed speech text to all current consumers. */
  emitSpeechEnd(text: string, segment?: StreamingTranscriptionSegment) {
    this.emit('onSpeechEnd', text, segment)
  }

  /** Sends the complete current transcript to all current consumers. */
  emitTranscriptionUpdate(text: string, segment?: StreamingTranscriptionSegment) {
    this.emit('onTranscriptionUpdate', text, segment)
  }

  private emit(callbackName: Exclude<keyof StreamingTranscriptionCallbacks, 'onSpeechStart'>, text: string, segment?: StreamingTranscriptionSegment) {
    for (const [consumerId, callbacks] of this.consumers) {
      try {
        callbacks[callbackName]?.(text, segment)
      }
      catch (cause) {
        console.error(`[Hearing Pipeline] Streaming consumer ${consumerId} ${callbackName} failed:`, cause)
      }
    }
  }
}
