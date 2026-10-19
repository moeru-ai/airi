import type { EventSourceMessage } from 'eventsource-parser'

import { EventSourceParserStream } from 'eventsource-parser/stream'

/**
 * Decodes a byte stream and parses its Server-Sent Events.
 *
 * @param body - The response body that carries the event stream.
 * @returns A stream of parsed Server-Sent Events.
 */
export function parseServerSentEvents(body: ReadableStream<Uint8Array>): ReadableStream<EventSourceMessage> {
  const decoder = new TextDecoder()
  const decodedBody = body.pipeThrough(new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      controller.enqueue(decoder.decode(chunk, { stream: true }))
    },
    flush(controller) {
      controller.enqueue(decoder.decode())
    },
  }))

  return decodedBody
    .pipeThrough(new EventSourceParserStream())
}
