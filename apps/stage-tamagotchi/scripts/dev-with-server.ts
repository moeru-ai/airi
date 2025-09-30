#!/usr/bin/env tsx
/**
 * Development script to start both the WebSocket server and Tamagotchi app
 * This ensures the server-runtime is running before starting the app
 */

import type { Buffer } from 'node:buffer'

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
    stdio: ['pipe', 'pipe', 'pipe'], // Change from 'inherit' to capture output
    shell: isWindows,
  },
)

// Wait for the server to be ready by listening for a ready message
console.log('⏳ Waiting for server to initialize...\n')
const serverReady = new Promise<void>((resolve, reject) => {
  // Listen typically outputs a URL when ready, looking for patterns like:
  // "Listening on http://localhost:6121" or similar
  const readyPatterns = [
    /listening.*:6121/i,
    /ready.*:6121/i,
    /localhost:6121/i,
    /http:\/\/localhost:6121/i,
  ]

  const timeout = setTimeout(() => {
    console.log('⚠️ Server ready timeout reached, continuing anyway...')
    resolve() // Resolve even if we don't see the message to avoid hanging
  }, 10000) // 10 second timeout

  // Handle errors from the server process
  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error)
    clearTimeout(timeout)
    reject(error)
  })

  const checkOutput = (data: Buffer) => {
    const output = data.toString()
    console.log(output) // Still output to console for visibility

    if (readyPatterns.some(pattern => pattern.test(output))) {
      clearTimeout(timeout)
      resolve()
    }
  }

  serverProcess.stdout?.on('data', checkOutput)
  serverProcess.stderr?.on('data', checkOutput)
})

await serverReady

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
  try {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill()
    }
  }
  catch (error) {
    console.error('Error killing server process:', error)
  }
  try {
    if (tamagotchiProcess && !tamagotchiProcess.killed) {
      tamagotchiProcess.kill()
    }
  }
  catch (error) {
    console.error('Error killing tamagotchi process:', error)
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// Wait for processes
await Promise.race([
  new Promise((resolve) => {
    serverProcess.on('exit', (code) => {
      console.log(`Server process exited with code ${code}`)
      resolve(code)
    })
  }),
  new Promise((resolve) => {
    tamagotchiProcess.on('exit', (code) => {
      console.log(`Tamagotchi process exited with code ${code}`)
      resolve(code)
    })
  }),
])

cleanup()
