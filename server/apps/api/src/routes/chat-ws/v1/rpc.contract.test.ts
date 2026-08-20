import { parsePullMessagesRequest, parseSendMessagesRequest } from '@proj-airi/server-sdk-shared'
import { describe, expect, it } from 'vitest'

describe('v1 chat WebSocket request contracts', () => {
  // https://github.com/moeru-ai/airi/pull/2308#discussion_r3796624651
  // ROOT CAUSE:
  //
  // Eventa decodes the invoke envelope but does not validate its body. The
  // handlers used body fields directly, so malformed authenticated requests
  // reached ChatService.
  //
  // The shared protocol now owns the request schemas. The v1 handlers parse
  // every invoke body before logging or calling ChatService.
  it('rejects malformed send-messages requests', () => {
    expect(() => parseSendMessagesRequest({ chatId: 'chat-1', messages: [{ id: 'message-1', content: 'hello' }] }))
      .toThrow()
  })

  it('rejects malformed pull-messages requests', () => {
    expect(() => parsePullMessagesRequest({ chatId: 'chat-1', afterSeq: -1 }))
      .toThrow()
  })
})
