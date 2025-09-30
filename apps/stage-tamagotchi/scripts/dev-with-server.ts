#!/usr/bin/env tsx
/**
 * Development script to start both the WebSocket server and Tamagotchi app
 * This ensures the server-runtime is running before starting the app
 */

import process from 'node:process'

import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'

console.log('🚀 Starting AIRI WebSocket server and Tamagotchi app...\n')

// Start the WebSocket server in the background
console.log('📡 Starting WebSocket server on port 6121...')
const serverProcess = spawn(
  'pnpm',
  ['-F', '@proj-airi/server-runtime', 'dev'],
  {
    stdio: 'inherit',
    shell: isWindows,
  },
)

// Wait a bit for the server to start
console.log('⏳ Waiting for server to initialize...\n')
await new Promise(resolve => setTimeout(resolve, 3000))

// Start the Tamagotchi app
console.log('🎮 Starting Tamagotchi app...\n')
const tamagotchiProcess = spawn(
  'pnpm',
  ['-F', '@proj-airi/stage-tamagotchi', 'app:dev'],
  {
    stdio: 'inherit',
    shell: isWindows,
  },
)

// Handle cleanup on exit
function cleanup() {
  console.log('\n🛑 Shutting down...')
  serverProcess.kill()
  tamagotchiProcess.kill()
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// Wait for processes
await Promise.race([
  new Promise((resolve) => {
    serverProcess.on('exit', resolve)
  }),
  new Promise((resolve) => {
    tamagotchiProcess.on('exit', resolve)
  }),
])

cleanup()
