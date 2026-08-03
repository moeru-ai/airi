import type { Readable } from 'node:stream'

import { Buffer } from 'node:buffer'

import { useLogg } from '@guiiai/logg'

// eliza/packages/client-discord/src/voice.ts at develop · elizaOS/eliza
// https://github.com/elizaOS/eliza/blob/develop/packages/client-discord/src/voice.ts
export class AudioMonitor {
  private readable: Readable
  private buffers: Buffer[] = []
  private maxSize: number
  private lastFlagged: number = -1
  private ended: boolean = false
  private logger = useLogg('AudioMonitor').useGlobalConfig()

  constructor(
    readable: Readable,
    maxSize: number,
    onStart: () => void,
    callback: (buffer: Buffer) => void,
  ) {
    this.readable = readable
    this.maxSize = maxSize
    this.readable.on('data', (chunk: Buffer) => {
      // this.logger.log('AudioMonitor got data');
      if (this.lastFlagged < 0) {
        this.lastFlagged = this.buffers.length
      }
      this.buffers.push(chunk)
      const currentSize = this.buffers.reduce(
        (acc, cur) => acc + cur.length,
        0,
      )
      while (currentSize > this.maxSize) {
        this.buffers.shift()
        this.lastFlagged--
      }
    })
    this.readable.on('end', () => {
      this.logger.log('AudioMonitor ended')
      this.ended = true
      if (this.lastFlagged < 0)
        return
      callback(this.getBufferFromStart())
      this.lastFlagged = -1
    })
    this.readable.on('speakingStopped', () => {
      if (this.ended)
        return
      this.logger.log('Speaking stopped')
      if (this.lastFlagged < 0)
        return
      callback(this.getBufferFromStart())
    })
    this.readable.on('speakingStarted', () => {
      if (this.ended)
        return
      onStart()
      this.logger.log('Speaking started')
      this.reset()
    })
  }

  stop() {
    this.readable.removeAllListeners('data')
    this.readable.removeAllListeners('end')
    this.readable.removeAllListeners('speakingStopped')
    this.readable.removeAllListeners('speakingStarted')
  }

  isFlagged() {
    return this.lastFlagged >= 0
  }

  getBufferFromFlag() {
    if (this.lastFlagged < 0) {
      return null
    }
    const buffer = Buffer.concat(this.buffers.slice(this.lastFlagged))
    return buffer
  }

  getBufferFromStart() {
    const buffer = Buffer.concat(this.buffers)
    return buffer
  }

  reset() {
    this.buffers = []
    this.lastFlagged = -1
  }

  isEnded() {
    return this.ended
  }
}
