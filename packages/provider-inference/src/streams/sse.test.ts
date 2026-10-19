import { describe, expect, it } from 'vitest'

import { parseServerSentEvents } from './sse'

function createByteStream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('parseServerSentEvents', () => {
  it('parses events when a UTF-8 character spans byte chunks', async () => {
    const bytes = new TextEncoder().encode('event: message\r\ndata: {"text":"あ"}\r\n\r\n')
    const characterStart = bytes.indexOf(0xE3)
    const stream = createByteStream([
      bytes.slice(0, characterStart + 1),
      bytes.slice(characterStart + 1),
    ])
    const events = []

    for await (const event of parseServerSentEvents(stream))
      events.push(event)

    expect(events).toEqual([{ event: 'message', data: '{"text":"あ"}' }])
  })

  it('joins multiple data lines into one event', async () => {
    const stream = createByteStream([
      new TextEncoder().encode('data: first\ndata: second\n\n'),
    ])
    const events = []

    for await (const event of parseServerSentEvents(stream))
      events.push(event)

    expect(events).toEqual([{ data: 'first\nsecond' }])
  })
})
