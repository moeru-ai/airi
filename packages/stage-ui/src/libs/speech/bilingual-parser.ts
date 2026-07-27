export interface BilingualParserOptions {
  enabled: boolean
  ttsTag: string
}

export class BilingualStreamParser {
  private enabled: boolean
  private ttsTag: string
  private currentTag: string | null = null
  private buffer = ''

  constructor(options: BilingualParserOptions) {
    this.enabled = options.enabled
    this.ttsTag = options.ttsTag.toUpperCase().trim()
  }

  public feed(chunk: string): { ttsChunk: string, captionChunk: string } {
    if (!this.enabled) {
      return { ttsChunk: chunk, captionChunk: chunk }
    }

    this.buffer += chunk
    let ttsChunk = ''
    const captionChunk = chunk

    while (this.buffer.length > 0) {
      const tagMatch = this.buffer.match(/^\[([\w-]+)\]/)
      if (tagMatch) {
        const fullTag = tagMatch[0].toUpperCase()
        this.currentTag = fullTag
        this.buffer = this.buffer.slice(tagMatch[0].length)
        continue
      }

      const potentialTagMatch = this.buffer.match(/^\[[\w-]*$/)
      if (potentialTagMatch) {
        break
      }

      const nextTagIdx = this.buffer.indexOf('[')
      if (nextTagIdx === -1) {
        const textSegment = this.buffer
        this.buffer = ''
        if (this.isTtsActive()) {
          ttsChunk += textSegment
        }
      }
      else if (nextTagIdx === 0) {
        const char = this.buffer[0]
        this.buffer = this.buffer.slice(1)
        if (this.isTtsActive()) {
          ttsChunk += char
        }
      }
      else {
        const textSegment = this.buffer.slice(0, nextTagIdx)
        this.buffer = this.buffer.slice(nextTagIdx)
        if (this.isTtsActive()) {
          ttsChunk += textSegment
        }
      }
    }

    return { ttsChunk, captionChunk }
  }

  public flush(): { ttsChunk: string, captionChunk: string } {
    if (!this.enabled || this.buffer.length === 0) {
      const remaining = this.buffer
      this.buffer = ''
      return { ttsChunk: remaining, captionChunk: remaining }
    }

    let ttsChunk = ''
    if (this.isTtsActive()) {
      ttsChunk = this.buffer
    }
    const captionChunk = this.buffer
    this.buffer = ''
    return { ttsChunk, captionChunk }
  }

  public reset() {
    this.currentTag = null
    this.buffer = ''
  }

  private isTtsActive(): boolean {
    if (this.currentTag === null)
      return true
    return this.currentTag === this.ttsTag
  }
}
