#!/usr/bin/env node
// Claude Code hook: tells AIRI when a Claude Code turn finishes (Stop) or needs the user (Notification).
// It sends an `input:text` event to the AIRI channel server, so the active character announces it.
// The hook never blocks Claude Code: it always exits with code 0, also when AIRI is not running.

import process, { stdin } from 'node:process'

import { Buffer } from 'node:buffer'
import { open, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const AIRI_URL = process.env.AIRI_CHANNEL_URL ?? 'ws://localhost:6121/ws'
// The desktop app creates a random token on first start and stores it here.
const AIRI_CHANNEL_CONFIG = join(process.env.APPDATA ?? '', '@proj-airi', 'stage-tamagotchi', 'server-channel-config.json')
const CONNECT_TIMEOUT_MS = 3_000
// Short turns are noise. Stop only reports turns that took at least this long.
const MIN_TURN_SECONDS = Number(process.env.AIRI_NOTIFY_MIN_SECONDS ?? 60)
// A longer gap usually means a resumed session, so the duration is not meaningful.
const MAX_REPORTED_TURN_SECONDS = 6 * 60 * 60
const TRANSCRIPT_TAIL_BYTES = 512 * 1024
const MESSAGE_PREFIX = '[Thông báo tự động từ Claude Code — không phải người dùng nói]'

async function readStdin() {
  const chunks = []
  for await (const chunk of stdin)
    chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/** Returns the seconds since the last real user prompt in the transcript, or undefined if unknown. */
async function secondsSinceLastPrompt(transcriptPath) {
  if (!transcriptPath)
    return undefined
  const file = await open(transcriptPath, 'r')
  try {
    const { size } = await file.stat()
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await file.read(buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n').reverse()
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        // A real prompt has string content. Tool results are user entries with array content.
        if (entry.type === 'user' && typeof entry.message?.content === 'string' && entry.timestamp)
          return (Date.now() - Date.parse(entry.timestamp)) / 1000
      }
      catch {
        // The first line of the tail can be cut in half. Skip lines that are not JSON.
      }
    }
    return undefined
  }
  finally {
    await file.close()
  }
}

async function buildMessage(event) {
  const project = event.cwd ? basename(event.cwd) : 'không rõ'
  // Claude Code is a separate tool. The wording makes clear that the character only relays the news.
  if (event.hook_event_name === 'Notification') {
    const detail = event.message ? ` Nội dung gốc: "${event.message}".` : ''
    return `${MESSAGE_PREFIX} Claude Code (công cụ lập trình khác, không phải bạn) ở dự án "${project}" đang chờ người dùng xử lý.${detail} Hãy chuyển lời cho người dùng trong một câu ngắn, ví dụ: "Claude Code ở dự án ${project} đang cần bạn duyệt đó".`
  }
  if (event.hook_event_name === 'Stop') {
    const seconds = await secondsSinceLastPrompt(event.transcript_path).catch(() => undefined)
    if (seconds !== undefined && seconds < MIN_TURN_SECONDS)
      return undefined
    const duration = seconds === undefined || seconds > MAX_REPORTED_TURN_SECONDS ? '' : ` sau khoảng ${Math.max(1, Math.round(seconds / 60))} phút`
    return `${MESSAGE_PREFIX} Claude Code (công cụ lập trình khác, không phải bạn) ở dự án "${project}" vừa làm xong${duration}. Hãy chuyển lời cho người dùng trong một câu ngắn để họ vào xem kết quả.`
  }
  return undefined
}

async function readChannelToken() {
  if (process.env.AIRI_CHANNEL_TOKEN)
    return process.env.AIRI_CHANNEL_TOKEN
  const config = JSON.parse(await readFile(AIRI_CHANNEL_CONFIG, 'utf8'))
  return typeof config.authToken === 'string' && config.authToken ? config.authToken : undefined
}

async function sendToAiri(text) {
  // The SDK lives in the AIRI monorepo, so this hook needs `pnpm install` in that repo first.
  // Plain Node.js resolves a file path only with its extension.
  // eslint-disable-next-line no-restricted-syntax
  const { Client } = await import('../../packages/server-sdk/dist/index.mjs')
  const client = new Client({
    name: 'proj-airi:claude-code-notify',
    url: AIRI_URL,
    token: await readChannelToken(),
    autoConnect: false,
    autoReconnect: false,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
  })
  try {
    await client.connect()
    // NOTICE:
    // Default `input:text` delivery is consumer-group, but no consumer registers on this build.
    // The server then drops the event. Broadcast reaches the main window.
    // Source: packages/plugin-protocol/src/types/events.ts (inputText).
    // Remove when the default delivery reaches the renderer.
    client.send({ type: 'input:text', data: { text }, route: { delivery: { mode: 'broadcast' } } })
  }
  finally {
    client.close()
  }
}

async function main() {
  try {
    const event = JSON.parse(await readStdin())
    const text = await buildMessage(event)
    if (text)
      await sendToAiri(text)
  }
  catch (error) {
    // AIRI is closed or the input is unexpected. Log for debugging, but never fail the hook.
    if (process.env.AIRI_NOTIFY_DEBUG)
      console.error('[notify-airi]', error)
  }
  process.exit(0)
}

void main()
