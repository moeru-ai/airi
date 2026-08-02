export interface BilingualParserOptions {
  enabled: boolean
  /** The tag whose content should be routed to TTS, e.g. "[EN]" */
  ttsTag: string
  /**
   * The complete set of known language tags (e.g. ["[EN]", "[ZH]", "[JA]"]).
   * Only brackets whose content matches one of these will trigger a section
   * switch; all other bracketed text (Markdown links, product names, etc.)
   * is treated as normal prose and is NOT consumed as a tag.
   */
  knownTags: string[]
}

export class BilingualStreamParser {
  private enabled: boolean
  private ttsTag: string
  /** Normalised set of known tags for fast lookup, e.g. {"[EN]", "[ZH]"} */
  private knownTagSet: Set<string>
  private currentTag: string | null = null
  private buffer = ''

  constructor(options: BilingualParserOptions) {
    this.enabled = options.enabled
    this.ttsTag = options.ttsTag.toUpperCase().trim()
    this.knownTagSet = new Set(options.knownTags.map(t => t.toUpperCase().trim()))
  }

  public feed(chunk: string): { ttsChunk: string, captionChunk: string } {
    if (!this.enabled) {
      return { ttsChunk: chunk, captionChunk: chunk }
    }

    this.buffer += chunk
    let ttsChunk = ''
    const captionChunk = chunk

    while (this.buffer.length > 0) {
      // Try to match a known language tag at the current buffer head.
      const tagMatch = this.buffer.match(/^\[([\w-]+)\]/)
      if (tagMatch) {
        const fullTag = tagMatch[0].toUpperCase()
        if (this.knownTagSet.has(fullTag)) {
          // It's a real language tag — switch sections and discard it.
          this.currentTag = fullTag
          this.buffer = this.buffer.slice(tagMatch[0].length)
          continue
        }
        // It's some other bracketed word (e.g. [AIRI], [docs]).
        // Treat the opening bracket as literal text and advance past it.
        const char = this.buffer[0]
        this.buffer = this.buffer.slice(1)
        if (this.isTtsActive()) {
          ttsChunk += char
        }
        continue
      }

      // Buffer starts with an incomplete potential tag — wait for more data.
      if (/^\[[\w-]*$/.test(this.buffer)) {
        break
      }

      // Consume text up to the next '['.
      const nextTagIdx = this.buffer.indexOf('[')
      if (nextTagIdx === -1) {
        const textSegment = this.buffer
        this.buffer = ''
        if (this.isTtsActive()) {
          ttsChunk += textSegment
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
