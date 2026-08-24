/** Callbacks that receive results from one shared streaming transcription session. */
export interface StreamingTranscriptionCallbacks {
  onSentenceEnd?: (delta: string) => void
  onSpeechEnd?: (text: string) => void
  /** Receives the complete current transcript after each provider update. */
  onTranscriptionUpdate?: (text: string) => void
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
      onSentenceEnd: consumer.onSentenceEnd,
      onSpeechEnd: consumer.onSpeechEnd,
      onTranscriptionUpdate: consumer.onTranscriptionUpdate,
    })
  }

  /** Removes callbacks for one consumer. */
  remove(consumerId: string) {
    this.consumers.delete(consumerId)
  }

  /** Sends a completed sentence to all current consumers. */
  emitSentenceEnd(delta: string) {
    this.emit('onSentenceEnd', delta)
  }

  /** Sends completed speech text to all current consumers. */
  emitSpeechEnd(text: string) {
    this.emit('onSpeechEnd', text)
  }

  /** Sends the complete current transcript to all current consumers. */
  emitTranscriptionUpdate(text: string) {
    this.emit('onTranscriptionUpdate', text)
  }

  private emit(callbackName: keyof StreamingTranscriptionCallbacks, text: string) {
    for (const [consumerId, callbacks] of this.consumers) {
      try {
        callbacks[callbackName]?.(text)
      }
      catch (cause) {
        console.error(`[Hearing Pipeline] Streaming consumer ${consumerId} ${callbackName} failed:`, cause)
      }
    }
  }
}
