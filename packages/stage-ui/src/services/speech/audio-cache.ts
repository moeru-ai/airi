/**
 * Options for configuring in-memory speech audio cache.
 */
export interface SpeechAudioCacheOptions {
  /**
   * Maximum number of synthesized audio items to retain in memory.
   * Defaults to 50 items.
   */
  maxEntries?: number
  /**
   * Maximum cumulative size in bytes across cached audio items.
   * Defaults to 50 MB (52,428,800 bytes).
   */
  maxBytes?: number
}

/**
 * Creates a deterministic cache key for a speech synthesis request.
 * The key reflects all parameters that alter output audio.
 */
export function createSpeechAudioCacheKey(options: {
  providerId: string
  model: string
  voiceId: string
  text: string
  pitch?: number
  speed?: number
  ssml?: boolean
  extra?: Record<string, unknown>
}): string {
  return JSON.stringify([
    options.providerId,
    options.model,
    options.voiceId,
    options.pitch ?? 0,
    options.speed ?? 1,
    options.ssml ?? false,
    options.extra ?? null,
    options.text,
  ])
}

/**
 * In-memory Least-Recently-Used (LRU) audio cache.
 * Keeps synthesized audio Blobs across turns without hitting disk.
 */
export class SpeechAudioCache {
  private readonly entries = new Map<string, Blob>()
  private readonly maxEntries: number
  private readonly maxBytes: number
  private currentBytes = 0

  constructor(options: SpeechAudioCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 50
    this.maxBytes = options.maxBytes ?? 50 * 1024 * 1024
  }

  get(key: string): Blob | undefined {
    const blob = this.entries.get(key)
    if (!blob)
      return undefined

    // Refresh LRU order by deleting and re-inserting
    this.entries.delete(key)
    this.entries.set(key, blob)
    return blob
  }

  set(key: string, blob: Blob): void {
    // Keep oversized audio out of the bounded cache
    if (blob.size > this.maxBytes)
      return

    if (this.entries.has(key)) {
      const existing = this.entries.get(key)!
      this.currentBytes -= existing.size
      this.entries.delete(key)
    }

    // Evict oldest entries until within entry limit and byte budget
    while (
      this.entries.size >= this.maxEntries
      || (this.currentBytes + blob.size > this.maxBytes && this.entries.size > 0)
    ) {
      const oldestKey = this.entries.keys().next().value
      if (!oldestKey)
        break

      const oldestBlob = this.entries.get(oldestKey)
      if (oldestBlob)
        this.currentBytes -= oldestBlob.size

      this.entries.delete(oldestKey)
    }

    this.entries.set(key, blob)
    this.currentBytes += blob.size
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  delete(key: string): boolean {
    const existing = this.entries.get(key)
    if (!existing)
      return false

    this.currentBytes -= existing.size
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
    this.currentBytes = 0
  }

  get size(): number {
    return this.entries.size
  }

  get byteSize(): number {
    return this.currentBytes
  }
}
