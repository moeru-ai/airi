export interface BilingualParserOptions {
  enabled: boolean
  /** The tag whose content should be routed to TTS, e.g. "[TTS]" */
  ttsTag: string
  /**
   * The complete set of known language/role tags (e.g. ["[TTS]", "[SUB1]", "[SUB2]"]).
   * Only brackets whose content matches one of these will trigger a section
   * switch; all other bracketed text (Markdown links, product names, etc.)
   * is treated as normal prose and is NOT consumed as a tag.
   */
  knownTags: string[]
}

export function isBilingualResponse(text: string): boolean {
  if (!text)
    return false

  const lineStartTags = [...text.matchAll(/^\[(TTS|SUB1|SUB2)\]/gm)]
  if (lineStartTags.length === 0)
    return false

  const distinctTags = new Set(lineStartTags.map(m => m[1]))
  const startsWithTag = /^\s*\[(?:TTS|SUB1|SUB2)\]/.test(text)

  return startsWithTag || distinctTags.size >= 2
}

/**
 * Strips internal bilingual routing tags ([TTS], [SUB1], [SUB2]) and deduplicates
 * identical subtitle sections for display in the chat transcript and persistence.
 */
export function cleanBilingualMessageText(text: string): string {
  if (!isBilingualResponse(text)) {
    return text
  }

  const tagRegex = /^\[(TTS|SUB1|SUB2)\]/gm
  const matches = [...text.matchAll(tagRegex)]
  if (matches.length === 0) {
    return text
  }

  const sections: Record<string, string> = {}
  let lastIndex = 0
  let currentTag: string | null = null

  for (const match of matches) {
    if (currentTag) {
      const content = text.slice(lastIndex, match.index).trim()
      if (content) {
        sections[currentTag] = content
      }
    }
    currentTag = match[1]
    lastIndex = match.index! + match[0].length
  }

  if (currentTag && lastIndex < text.length) {
    const content = text.slice(lastIndex).trim()
    if (content) {
      sections[currentTag] = content
    }
  }

  const resultParts: string[] = []
  const sub1 = sections.SUB1
  const sub2 = sections.SUB2
  const tts = sections.TTS

  if (sub1) {
    resultParts.push(sub1)
  }
  else if (tts) {
    resultParts.push(tts)
  }

  if (sub2 && sub2 !== sub1 && sub2 !== tts) {
    resultParts.push(sub2)
  }

  return resultParts.join('\n')
}

export class BilingualStreamParser {
  private enabled: boolean
  private ttsTag: string
  /** Normalised set of known tags for fast lookup, e.g. {"[TTS]", "[SUB1]", "[SUB2]"} */
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
    let captionChunk = ''

    while (this.buffer.length > 0) {
      // Try to match a known tag at the current buffer head.
      const tagMatch = this.buffer.match(/^\[([\w-]+)\]/)
      if (tagMatch) {
        const fullTag = tagMatch[0].toUpperCase()
        if (this.knownTagSet.has(fullTag)) {
          // Real role tag — switch section and discard the tag from output
          this.currentTag = fullTag
          this.buffer = this.buffer.slice(tagMatch[0].length)
          continue
        }
        // Unknown bracketed text (e.g. [AIRI], [docs]).
        const char = this.buffer[0]
        this.buffer = this.buffer.slice(1)
        if (this.isCaptionActive()) {
          captionChunk += char
        }
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
        if (this.isCaptionActive()) {
          captionChunk += textSegment
        }
        if (this.isTtsActive()) {
          ttsChunk += textSegment
        }
      }
      else if (nextTagIdx > 0) {
        const textSegment = this.buffer.slice(0, nextTagIdx)
        this.buffer = this.buffer.slice(nextTagIdx)
        if (this.isCaptionActive()) {
          captionChunk += textSegment
        }
        if (this.isTtsActive()) {
          ttsChunk += textSegment
        }
      }
      else {
        const char = this.buffer[0]
        this.buffer = this.buffer.slice(1)
        if (this.isCaptionActive()) {
          captionChunk += char
        }
        if (this.isTtsActive()) {
          ttsChunk += char
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
    let captionChunk = ''
    if (this.isCaptionActive()) {
      captionChunk = this.buffer
    }
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

  private isCaptionActive(): boolean {
    if (this.currentTag === null)
      return true
    // Captions show SUB1 and SUB2 sections (ignoring TTS section to prevent duplicating SUB1)
    return this.currentTag === '[SUB1]' || this.currentTag === '[SUB2]'
  }
}
