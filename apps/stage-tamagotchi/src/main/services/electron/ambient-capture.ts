import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { AmbientCaptureFrame, AmbientCaptureOptions } from '../../../shared/screen-ambient-capture'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'

/**
 * Owns a ScreenCaptureKit helper and its bounded binary protocol. Only one frame
 * request can be pending. Stop, process exit, malformed output, and timeout
 * reject pending work; no saved image or frame queue survives the session.
 */
export class AmbientCapture {
  readonly ready: Promise<void>
  private readonly child: ChildProcessWithoutNullStreams
  private readonly packet: Buffer
  private used = 0
  private failure?: Error
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  private pending?: { resolve: (frame: AmbientCaptureFrame | null) => void, reject: (error: Error) => void }
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(binary: string, private readonly options: AmbientCaptureOptions, windowId: number) {
    this.packet = Buffer.alloc(Math.max(options.width * options.height * 4, 4096) + 5)
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.child = spawn(binary, [options.displayId, windowId, options.width, options.height, options.frameRate].map(String), { stdio: 'pipe' })
    this.child.stdout.on('data', (chunk: Buffer) => this.accept(chunk))
    this.child.stdin.on('error', error => this.fail(error))
    // Startup diagnostics belong to stderr, never to the framed image stream.
    this.child.stderr.on('data', () => {})
    this.child.on('error', error => this.fail(error))
    this.child.on('exit', (code, signal) => this.fail(new Error(`ScreenCaptureKit stopped (${signal ?? code}).`)))
    this.timer = setTimeout(() => this.fail(new Error('ScreenCaptureKit startup timed out.')), 15000)
  }

  /** Requests one fresh frame; callers must await it before requesting another. */
  async read(): Promise<AmbientCaptureFrame | null> {
    await this.ready
    if (this.failure)
      throw this.failure
    if (this.pending)
      throw new Error('A screen capture read is already pending.')
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      this.timer = setTimeout(() => this.fail(new Error('ScreenCaptureKit frame timed out.')), 5000)
      this.child.stdin.write('frame\n', (error) => {
        if (error)
          this.fail(error)
      })
    })
  }

  /** Closing the process releases its native stream and rejects pending reads. */
  stop() {
    this.fail(new Error('Screen capture session stopped.'))
  }

  private fail(error: Error) {
    if (this.failure)
      return
    this.failure = error
    clearTimeout(this.timer)
    this.readyReject(error)
    this.pending?.reject(error)
    this.pending = undefined
    this.child.kill()
  }

  private accept(chunk: Buffer) {
    let offset = 0
    while (offset < chunk.length && !this.failure) {
      const needed = this.used < 5 ? 5 : 5 + this.packet.readUInt32LE(1)
      const size = Math.min(needed - this.used, chunk.length - offset)
      chunk.copy(this.packet, this.used, offset, offset + size)
      this.used += size
      offset += size
      if (this.used < 5)
        continue
      const length = this.packet.readUInt32LE(1)
      if (length > this.packet.length - 5) {
        this.fail(new Error('Invalid ScreenCaptureKit packet length.'))
        return
      }
      if (this.used !== length + 5)
        continue
      const kind = this.packet[0]
      if (kind === 2) {
        this.fail(new Error(this.packet.toString('utf8', 5, 5 + length)))
        return
      }
      if (kind === 0 && length === 0 && !this.pending) {
        clearTimeout(this.timer)
        this.readyResolve()
      }
      else if (this.pending && ((kind === 1 && length === this.options.width * this.options.height * 4) || (kind === 3 && length === 0))) {
        clearTimeout(this.timer)
        const pending = this.pending
        this.pending = undefined
        pending.resolve(kind === 3 ? null : { width: this.options.width, height: this.options.height, data: new Uint8Array(this.packet.subarray(5, 5 + length)) })
      }
      else {
        this.fail(new Error('Unexpected ScreenCaptureKit packet.'))
      }
      this.used = 0
    }
  }
}
