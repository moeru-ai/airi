/** Link text longer than this is spoken as is, so an unclosed bracket cannot hold back speech for long. */
const MAX_LINK_TEXT = 200

/**
 * Removes written-only markup from streamed text before speech.
 *
 * Use when:
 * - A reply that also appears as chat text goes to text-to-speech.
 *
 * Expects:
 * - Chunks arrive in order. Call `flush` once after the last chunk.
 *
 * Returns:
 * - Speakable text for each chunk. Fenced code is dropped. Inline code keeps its text without backticks.
 *   Heading, quote, and list markers at a line start are dropped. A link keeps its text and drops its address.
 */
export function createSpeakableTextFilter() {
  let backticks = 0
  let inFence = false
  let lineStart = true
  let lineMarker = ''
  let linkText: string | undefined
  let linkState: 'none' | 'text' | 'closed' | 'address' = 'none'

  function closeBackticks() {
    // Three or more backticks toggle a fence. Fewer mark inline code, which keeps its text.
    if (backticks >= 3)
      inFence = !inFence
    backticks = 0
  }

  function write(char: string, out: string[]) {
    if (linkState === 'text') {
      if (char === ']') {
        linkState = 'closed'
        return
      }
      linkText += char
      if ((linkText?.length ?? 0) > MAX_LINK_TEXT) {
        out.push(`[${linkText}`)
        linkText = undefined
        linkState = 'none'
      }
      return
    }
    if (linkState === 'closed') {
      if (char === '(') {
        linkState = 'address'
        return
      }
      out.push(linkText ?? '')
      linkText = undefined
      linkState = 'none'
    }
    if (linkState === 'address') {
      if (char === ')') {
        out.push(linkText ?? '')
        linkText = undefined
        linkState = 'none'
      }
      return
    }
    if (char === '[') {
      linkState = 'text'
      linkText = ''
      return
    }
    out.push(char)
  }

  function push(chunk: string): string {
    const out: string[] = []
    for (const char of chunk) {
      if (char === '`') {
        backticks += 1
        continue
      }
      if (backticks)
        closeBackticks()
      if (inFence) {
        lineStart = char === '\n'
        continue
      }

      if (lineStart) {
        // Markers wait until the line shows whether they are markup.
        if (char === '#' || char === '>' || ((char === '-' || char === '*' || char === '+') && !lineMarker)) {
          lineMarker += char
          continue
        }
        if (lineMarker && char === ' ') {
          lineMarker = ''
          lineStart = false
          continue
        }
        if (lineMarker) {
          // Not markup, for example "-5" or "*emphasis*". The characters are speech.
          for (const markerChar of lineMarker)
            write(markerChar, out)
          lineMarker = ''
        }
        if (char !== ' ' && char !== '\t')
          lineStart = false
      }

      write(char, out)
      if (char === '\n')
        lineStart = true
    }
    return out.join('')
  }

  /** Returns text held back at the end, such as an unclosed link. Fenced code stays dropped. */
  function flush(): string {
    const out: string[] = []
    if (backticks)
      closeBackticks()
    if (!inFence && lineMarker)
      out.push(lineMarker)
    if (linkState === 'text')
      out.push(`[${linkText ?? ''}`)
    else if (linkState === 'closed' || linkState === 'address')
      out.push(linkText ?? '')
    backticks = 0
    inFence = false
    lineStart = true
    lineMarker = ''
    linkText = undefined
    linkState = 'none'
    return out.join('')
  }

  return { push, flush }
}
