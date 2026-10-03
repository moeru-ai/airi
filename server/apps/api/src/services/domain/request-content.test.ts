import { describe, expect, it } from 'vitest'

import { captureErrorResponse, captureRequestContent, captureResponseText, createResponseContentCapture } from './request-content'

describe('request content', () => {
  it('preserves tools and reasoning while replacing inline media with metadata', () => {
    const content = captureRequestContent({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Question' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,c2VjcmV0' } }, { type: 'input_audio', input_audio: { data: 'c2VjcmV0', format: 'wav' } }] }],
      reasoning: 'Plan',
      tool_calls: [{ function: { name: 'weather', arguments: '{"city":"Paris"}' } }],
      audio: { data: 'c2VjcmV0', transcript: 'Spoken answer' },
    })
    expect(content.state).toBe('complete')
    expect(content.omittedMedia).toBe(true)
    expect(content.text).not.toContain('c2VjcmV0')
    expect(JSON.parse(content.text)).toMatchObject({ reasoning: 'Plan', tool_calls: [{ function: { name: 'weather', arguments: '{"city":"Paris"}' } }] })
    expect(content.text).toContain('image/png')
    expect(content.text).toContain('Spoken answer')
  })

  it('retains ordered partial SSE events, including errors and tool deltas', () => {
    const capture = createResponseContentCapture()
    capture.append('{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\\"city\\\":"}}]}}]}')
    capture.append('{"error":{"message":"provider disconnected"}}')
    expect(capture.snapshot(false)).toMatchObject({ format: 'sse', state: 'partial' })
    expect(capture.snapshot(false).text).toContain('tool_calls')
    expect(capture.snapshot(false).text).toContain('provider disconnected')
  })

  it('distinguishes empty bodies, invalid JSON, and truncation', () => {
    expect(captureResponseText('')).toMatchObject({ text: '', state: 'complete', format: 'text' })
    expect(captureResponseText('<html>upstream unavailable</html>').text).toBe('<html>upstream unavailable</html>')
    expect(captureRequestContent('x'.repeat(8 * 1024 * 1024)).state).toBe('truncated')
    const capture = createResponseContentCapture()
    capture.append('x'.repeat(8 * 1024 * 1024 + 1))
    expect(capture.snapshot(true).state).toBe('truncated')
  })

  it('captures an error copy without consuming the client response', async () => {
    const response = Response.json({ error: { code: 429, message: 'Rate limited', metadata: { provider: 'test' } } }, { status: 429 })
    const captured = await captureErrorResponse(response.clone())
    expect(captured.state).toBe('complete')
    expect(JSON.parse(captured.text).error.message).toBe('Rate limited')
    expect(await response.json()).toMatchObject({ error: { code: 429 } })
  })

  it('retains a partial body when the diagnostic reader fails', async () => {
    let reads = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1
        if (reads === 1)
          controller.enqueue(new TextEncoder().encode('upstream disconnected'))
        else
          controller.error(new Error('connection reset'))
      },
    })
    expect(await captureErrorResponse(new Response(body))).toMatchObject({ text: 'upstream disconnected', state: 'partial' })
  })

  it('stores metadata instead of a binary error body', async () => {
    const content = await captureErrorResponse(new Response('private-audio', { headers: { 'Content-Type': 'audio/wav' } }))
    expect(content.omittedMedia).toBe(true)
    expect(content.text).toContain('audio/wav')
    expect(content.text).not.toContain('private-audio')
  })

  it('omits Responses audio and image bytes while preserving transcripts', () => {
    const capture = createResponseContentCapture()
    capture.append('{"type":"response.output_audio.delta","delta":"c2VjcmV0"}')
    capture.append('{"type":"response.image_generation_call.partial_image","partial_image_b64":"c2VjcmV0"}')
    capture.append('{"type":"response.output_audio_transcript.delta","delta":"Spoken answer"}')
    capture.append('{"type":"response.output_item.done","item":{"type":"image_generation_call","result":"c2VjcmV0"}}')
    const content = capture.snapshot(true)
    expect(content.text).not.toContain('c2VjcmV0')
    expect(content.text).toContain('Spoken answer')
    expect(content.omittedMedia).toBe(true)
  })
})
