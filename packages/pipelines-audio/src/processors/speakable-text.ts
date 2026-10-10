/** Link text longer than this is spoken as is, so an unclosed bracket cannot hold back speech for long. */
const MAX_LINK_TEXT = 200
/** A link address longer than this is not an address, so an unclosed `](` cannot swallow the rest of a reply. */
const MAX_LINK_ADDRESS = 2048

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
 * - Speakable text for each chunk. Code fenced with backticks or tildes is dropped. Inline code keeps its text without backticks.
 *   Heading, quote, and list markers at a line start are dropped. A link keeps its text and drops its address.
 */
export function createSpeakableTextFilter() {
  /** A run of backticks or tildes that waits until it ends, because its length decides what it marks. */
  let run: { char: string, length: number, atLineStart: boolean } | undefined
  /** The open fence. Only a run of its own character, at least as long, closes it. */
  let fence: { char: string, length: number } | undefined
  let lineStart = true
  let lineMarker = ''
  let linkText: string | undefined
  let linkAddress = ''
  let linkState: 'none' | 'text' | 'closed' | 'address' = 'none'

  function closeRun(out: string[]) {
    if (!run)
      return
    const { char, length, atLineStart } = run
    run = undefined
    // Three or more backticks mark a fence. Tildes mark one only at a line start, like in the markdown renderer.
    const marksFence = length >= 3 && (char === '`' || atLineStart)
    if (fence) {
      if (marksFence && char === fence.char && length >= fence.length)
        fence = undefined
      return
    }
    if (marksFence) {
      fence = { char, length }
      return
    }
    // Fewer backticks mark inline code, which keeps its text. Other tildes are text.
    if (char === '~') {
      for (let index = 0; index < length; index++)
        speak(char, out)
    }
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
        linkAddress = ''
        linkState = 'none'
        return
      }
      // An address has no whitespace. Whitespace or a long run shows the text was speech after all.
      if (!/\s/.test(char) && linkAddress.length < MAX_LINK_ADDRESS) {
        linkAddress += char
        return
      }
      out.push(`${linkText ?? ''}(${linkAddress}`)
      linkText = undefined
      linkAddress = ''
      linkState = 'none'
    }
    if (char === '[') {
      linkState = 'text'
      linkText = ''
      return
    }
    out.push(char)
  }

  /** Speaks one character outside a backtick or tilde run. */
  function speak(char: string, out: string[]) {
    if (fence) {
      // Indentation keeps the line start, so an indented fence still closes.
      lineStart = char === '\n' || (lineStart && (char === ' ' || char === '\t'))
      return
    }

    if (lineStart) {
      // Markers wait until the line shows whether they are markup.
      if (char === '#' || char === '>' || ((char === '-' || char === '*' || char === '+') && !lineMarker)) {
        lineMarker += char
        return
      }
      if (lineMarker && char === ' ') {
        lineMarker = ''
        lineStart = false
        return
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

  function push(chunk: string): string {
    const out: string[] = []
    for (const char of chunk) {
      if (char === '`' || char === '~') {
        if (run?.char === char) {
          run.length += 1
          continue
        }
        closeRun(out)
        run = { char, length: 1, atLineStart: lineStart && !lineMarker }
        continue
      }
      closeRun(out)
      speak(char, out)
    }
    return out.join('')
  }

  /** Returns text held back at the end, such as an unclosed link. Fenced code stays dropped. */
  function flush(): string {
    const out: string[] = []
    closeRun(out)
    if (!fence && lineMarker)
      out.push(lineMarker)
    if (linkState === 'text')
      out.push(`[${linkText ?? ''}`)
    else if (linkState === 'closed' || linkState === 'address')
      out.push(linkText ?? '')
    fence = undefined
    lineStart = true
    lineMarker = ''
    linkText = undefined
    linkAddress = ''
    linkState = 'none'
    return out.join('')
  }

  return { push, flush }
}
