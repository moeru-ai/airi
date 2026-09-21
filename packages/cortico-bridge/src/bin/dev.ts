#!/usr/bin/env tsx
import { env, exit } from 'node:process'
import { resolve } from 'node:path'

import { startBridge } from '../host.ts'

const deploymentDir = resolve(env.CORTICO_DEPLOYMENT ?? './deployments/airi')
const port = env.CORTICO_BRIDGE_PORT ? Number.parseInt(env.CORTICO_BRIDGE_PORT) : 6122
const fakeLlm = env.CORTICO_FAKE_LLM === '1' || env.CORTICO_FAKE_LLM === 'true'
const channelUrl = env.AIRI_CHANNEL_URL ?? 'ws://localhost:6121/ws'
const channelToken = env.AIRI_CHANNEL_TOKEN

console.log(`[cortico-bridge] deployment: ${deploymentDir}`)
console.log(`[cortico-bridge] stage ws port: ${port}`)
console.log(`[cortico-bridge] airi channel: ${channelUrl}`)
if (fakeLlm)
  console.log('[cortico-bridge] using fake LLM (CORTICO_FAKE_LLM=1)')

const bridge = await startBridge({ deploymentDir, port, fakeLlm, channelUrl, channelToken })
console.log('[cortico-bridge] bot started')

let stopping = false
async function shutdown() {
  if (stopping)
    return
  stopping = true
  await bridge.stop()
  exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
