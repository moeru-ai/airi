import type { WebSocket } from 'ws'

import { Buffer } from 'node:buffer'

import { WebSocketServer } from 'ws'

import { MemoryService } from '../services/memory.js'

/**
 * WebSocket server for real-time updates
 */
const wss = new WebSocketServer({ port: 8080 })

// Singleton memory service instance
const _memoryService = MemoryService.getInstance()

wss.on('connection', (ws: WebSocket) => {
  console.warn('New WebSocket connection established')

  ws.on('message', (data: WebSocket.RawData) => {
    // Convert RawData to string safely
    const message
      = typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf-8')
          : data.toString()

    console.warn(`Received message: ${message}`)
  })

  ws.on('close', () => {
    console.warn('WebSocket connection closed')
  })
})

export default wss
