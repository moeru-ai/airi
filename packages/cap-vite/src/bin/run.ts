#!/usr/bin/env node

import process from 'node:process'

import { runCapVite } from '..'

async function main() {
  const platform = process.argv[2]
  const deviceId = process.env.CAPACITOR_DEVICE_ID || process.argv[3]
  if (!deviceId) {
    throw new Error('Usage: cap-vite <ios|android> <DEVICE_ID_OR_SIMULATOR_NAME>')
  }

  if (platform !== 'android' && platform !== 'ios') {
    process.stderr.write('Usage: cap-vite <ios|android> <DEVICE_ID_OR_SIMULATOR_NAME>\n')
    process.exit(1)
  }

  await runCapVite(platform, deviceId)
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
