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
  /** Manual dictation takes ownership while active; a test panel outranks automatic send. */
  priority: 'automatic' | 'manual' | 'playground'
}

/**
 * Routes one provider session to one current input owner.
 *
 * A consumer can replace its callbacks without restarting the provider.
 * The newest consumer wins at the same priority. This prevents a transcript
 * from entering both the composer and the automatic-send path.
 */
export class StreamingTranscriptionConsumers {
  private readonly consumers = new Map<string, { consumer: StreamingTranscriptionConsumer }>()

  /** Registers or replaces the callbacks for one consumer. */
  register(consumer: StreamingTranscriptionConsumer) {
    const registration = this.consumers.get(consumer.consumerId)
    if (registration) {
      registration.consumer = consumer
      this.consumers.delete(consumer.consumerId)
      this.consumers.set(consumer.consumerId, registration)
    }
    else {
      this.consumers.set(consumer.consumerId, { consumer })
    }
  }

  /** Removes callbacks for one consumer. */
  remove(consumerId: string) {
    this.consumers.delete(consumerId)
  }

  /** Whether any owner still needs the shared provider session. */
  hasConsumers() {
    return this.consumers.size > 0
  }

  /** Captures result ownership for one speech segment, including late final results. */
  beginUtterance(): StreamingTranscriptionCallbacks {
    const rank = { automatic: 0, playground: 1, manual: 2 }
    let owner: { consumer: StreamingTranscriptionConsumer } | undefined
    for (const registration of this.consumers.values()) {
      if (!owner || rank[registration.consumer.priority] >= rank[owner.consumer.priority])
        owner = registration
    }
    const registration = owner
    const emit = (callbackName: keyof StreamingTranscriptionCallbacks, text: string) => {
      if (!registration || this.consumers.get(registration.consumer.consumerId) !== registration)
        return

      // A newly selected owner can suppress an in-flight result, but cannot inherit it.
      let currentOwner = registration
      for (const current of this.consumers.values()) {
        if (rank[current.consumer.priority] >= rank[currentOwner.consumer.priority])
          currentOwner = current
      }
      if (currentOwner !== registration)
        return

      try {
        registration.consumer[callbackName]?.(text)
      }
      catch (cause) {
        console.error(`[Hearing Pipeline] Streaming consumer ${registration.consumer.consumerId} ${callbackName} failed:`, cause)
      }
    }

    return {
      onSentenceEnd: delta => emit('onSentenceEnd', delta),
      onSpeechEnd: text => emit('onSpeechEnd', text),
      onTranscriptionUpdate: text => emit('onTranscriptionUpdate', text),
    }
  }
}
