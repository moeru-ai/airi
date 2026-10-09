/* eslint-disable test/no-import-node-test, no-restricted-syntax -- custom/ is outside the AIRI Vitest workspace and runs on node --test. Plain Node.js ESM needs file extensions. */
import assert from 'node:assert/strict'

import { describe, it } from 'node:test'

import { createLlm } from '../llm.mjs'
import { describeImage, imageChunks } from '../vision.mjs'
import { PNG_BYTES } from './fixtures.mjs'

/** A fake SDK client that replays scripted messages and records each request. */
function fakeClient(replies) {
  const requests = []
  const stream = params => ({
    finalMessage: async () => {
      requests.push(params)
      return replies.shift()
    },
  })
  return { requests, client: { messages: { stream }, beta: { messages: { stream } } } }
}

function reply(text, stopReason = 'end_turn', extra = {}) {
  return { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason: stopReason, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 }, ...extra }
}

describe('createLlm', () => {
  it('returns undefined without a key or client', () => {
    assert.equal(createLlm({}), undefined)
  })

  it('caches the system prompt, sets effort, and ignores thinking blocks', async () => {
    const { client, requests } = fakeClient([reply('xin chào')])
    const llm = createLlm({ client })
    const result = await llm({ model: 'claude-haiku-5-5', system: 'quy tắc', content: 'hỏi' })
    assert.equal(result.text, 'xin chào')
    assert.deepEqual(requests[0].system, [{ type: 'text', text: 'quy tắc', cache_control: { type: 'ephemeral' } }])
    assert.deepEqual(requests[0].output_config, { effort: 'low' })
    assert.equal(requests[0].betas, undefined)
    assert.deepEqual(result.usage, { input: 10, output: 5, cacheRead: 2 })
  })

  it('enables the server-side refusal fallback for Sonnet 5.5', async () => {
    const { client, requests } = fakeClient([reply('ok')])
    await createLlm({ client })({ model: 'claude-sonnet-5-5', system: 's', content: 'c' })
    assert.deepEqual(requests[0].betas, ['server-side-fallback-2026-07-01'])
    assert.equal(requests[0].fallbacks, 'default')
  })

  it('continues a reply cut by max_tokens with a new user turn, not a prefill', async () => {
    const { client, requests } = fakeClient([reply('phần một ', 'max_tokens'), reply('phần hai')])
    const result = await createLlm({ client })({ model: 'claude-haiku-5-5', system: 's', content: 'c' })
    assert.equal(result.text, 'phần một phần hai')
    assert.equal(requests[1].messages.at(-1).role, 'user')
    assert.equal(requests[1].messages[1].role, 'assistant')
  })

  it('parses JSON output and sends the schema as output_config.format', async () => {
    const schema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }
    const { client, requests } = fakeClient([reply('{"a":1}')])
    const result = await createLlm({ client })({ model: 'claude-haiku-5-5', system: 's', content: 'c', schema })
    assert.deepEqual(result.json, { a: 1 })
    assert.deepEqual(requests[0].output_config.format, { type: 'json_schema', schema })
  })

  it('throws on a refusal with its category', async () => {
    const { client } = fakeClient([reply('', 'refusal', { stop_details: { category: 'cyber' } })])
    await assert.rejects(createLlm({ client })({ model: 'claude-haiku-5-5', system: 's', content: 'c' }), /từ chối.*cyber/)
  })
})

describe('describeImage', () => {
  it('sends the image as base64 and returns caption and OCR chunks', async () => {
    const { client, requests } = fakeClient([reply('{"caption":" Sơ đồ kiến trúc ","ocr_text":"AIRI → MCP"}')])
    const result = await describeImage(createLlm({ client }), 'claude-haiku-5-5', { name: 'arch.png', mediaType: 'image/png', data: PNG_BYTES })
    const image = requests[0].messages[0].content[0]
    assert.equal(image.source.media_type, 'image/png')
    assert.equal(image.source.data, PNG_BYTES.toString('base64'))
    assert.equal(result.caption, 'Sơ đồ kiến trúc')
    assert.deepEqual(imageChunks('arch.png', result).map(chunk => chunk.type), ['image_caption', 'image_ocr'])
  })

  it('skips the OCR chunk when the image has no text', () => {
    assert.deepEqual(imageChunks('x.png', { caption: 'Ảnh chụp', ocrText: '' }).map(chunk => chunk.type), ['image_caption'])
  })
})
