import type { Buffer } from 'node:buffer'

import type { BackdropRegion } from './types'

import { createRequire } from 'node:module'
import { arch, platform } from 'node:process'

export type { BackdropClip, BackdropRegion } from './types'

interface NativeBindings {
  attach: (handle: Buffer, blurRadius: number) => number
  setRegions: (sessionId: number, regions: readonly BackdropRegion[]) => void
  detach: (sessionId: number) => void
}

export interface NativeBackdropOptions {
  /** Blur radius in content points. The default is 16. */
  blurRadius?: number
}

function isNativeBindings(value: unknown): value is NativeBindings {
  return typeof value === 'object'
    && value !== null
    && 'attach' in value && typeof value.attach === 'function'
    && 'setRegions' in value && typeof value.setRegions === 'function'
    && 'detach' in value && typeof value.detach === 'function'
}

/** Owns one window's native regions and restores the window when disposed. Call from the Electron main thread. */
export class NativeBackdrop {
  readonly #native: NativeBindings
  #sessionId: number | undefined

  constructor(handle: Buffer, options: NativeBackdropOptions = {}) {
    if (platform !== 'darwin')
      throw new Error('Native desktop backdrop supports macOS only')
    if (arch !== 'arm64' && arch !== 'x64')
      throw new Error(`Native desktop backdrop does not support architecture ${arch}`)

    const blurRadius = options.blurRadius ?? 16
    if (!Number.isFinite(blurRadius) || blurRadius < 0 || blurRadius > 128)
      throw new RangeError('Backdrop blurRadius must be between 0 and 128')

    const require = createRequire(import.meta.url)
    const native: unknown = require(`./darwin-${arch}/backdrop.node`)
    if (!isNativeBindings(native))
      throw new TypeError('Native desktop backdrop has an invalid module interface')
    this.#native = native
    this.#sessionId = native.attach(handle, blurRadius)
  }

  /** Replaces all regions. An empty array clears the surfaces and retains the window session. */
  setRegions(regions: readonly BackdropRegion[]): void {
    if (this.#sessionId === undefined)
      throw new Error('Native desktop backdrop is disposed')
    this.#native.setRegions(this.#sessionId, regions)
  }

  /** Removes all surfaces and restores the window. Repeated disposal has no effect. */
  dispose(): void {
    if (this.#sessionId === undefined)
      return
    const sessionId = this.#sessionId
    this.#sessionId = undefined
    this.#native.detach(sessionId)
  }
}
