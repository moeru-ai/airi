#!/usr/bin/env tsx
/**
 * Test mod: joins the AIRI server channel as `test-mod` and exercises the
 * cortico bridge end to end.
 *
 *   AIRI_CHANNEL_URL=ws://localhost:6121/ws pnpm -F @proj-airi/cortico-bridge test:mod
 *
 * Sends input:text → expects the persona's reply back as
 * output:gen-ai:chat:message; sends spark:notify and context:update; prints
 * every inbound event. Exits 0 once the chat reply arrives (or after
 * TEST_MOD_TIMEOUT ms).
 */
import { env, exit } from 'node:process'

import { Client, ContextUpdateStrategy } from '@proj-airi/server-sdk'

const url = env.AIRI_CHANNEL_URL ?? 'ws://localhost:6121/ws'
const timeout = Number(env.TEST_MOD_TIMEOUT ?? 60_000)

const client = new Client({
  name: 'test-mod',
  url,
  possibleEvents: [
    'input:text',
    'spark:notify',
    'context:update',
    'output:gen-ai:chat:message',
    'output:gen-ai:chat:complete',
    'spark:command',
  ],
})

let gotReply = false
const timer = setTimeout(() => {
  console.error(`[test-mod] timed out after ${timeout}ms; gotReply=${gotReply}`)
  exit(gotReply ? 0 : 1)
}, timeout)

client.onEvent('output:gen-ai:chat:message', (event) => {
  const data = event.data as { message?: { content?: string }, 'gen-ai:chat'?: { input?: { data?: { discord?: { channelId?: string } } } } }
  console.log('[test-mod] chat:message ←', data.message?.content)
  console.log('[test-mod] gen-ai:chat.input.data.discord.channelId =', data['gen-ai:chat']?.input?.data?.discord?.channelId)
  gotReply = true
})
client.onEvent('output:gen-ai:chat:complete', (event) => {
  const data = event.data as { message?: { content?: string } }
  console.log('[test-mod] chat:complete ←', data.message?.content)
  clearTimeout(timer)
  setTimeout(() => exit(0), 500)
})
client.onEvent('spark:command', (event) => {
  console.log('[test-mod] spark:command ←', JSON.stringify(event.data))
})

await client.connect()
console.log('[test-mod] connected to', url)

client.send({
  type: 'context:update',
  data: {
    id: `ctx-${Date.now()}`,
    contextId: 'test-mod-status',
    strategy: ContextUpdateStrategy.ReplaceSelf,
    lane: 'status',
    text: 'test-mod online; 3 players nearby',
  },
})
console.log('[test-mod] sent context:update')

client.send({
  type: 'spark:notify',
  data: {
    id: `notify-${Date.now()}`,
    eventId: `evt-${Date.now()}`,
    kind: 'ping',
    urgency: 'soon',
    headline: 'test-mod heartbeat',
    destinations: ['cortico'],
  },
})
console.log('[test-mod] sent spark:notify')
client.send({
  type: 'input:text',
  data: {
    text: '你好,我是 test-mod,听到请回复一句话。',
    textRaw: '你好,我是 test-mod,听到请回复一句话。',
    overrides: { sessionId: 'test-channel-1', messagePrefix: '(From test-mod): ' },
    contextUpdates: [{ strategy: ContextUpdateStrategy.AppendSelf, text: 'test-mod attached context' }],
    discord: { channelId: 'dc-chan-42', guildId: 'dc-guild-7' },
  },
})
console.log('[test-mod] sent input:text; waiting for reply…')
