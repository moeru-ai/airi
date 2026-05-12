/**
 * Semantic bucket assigned to a segment extracted from a model response.
 */
export type ResponseCategory = 'speech' | 'reasoning' | 'unknown'

/**
 * Complete XML-like segment extracted from an assistant response.
 */
export interface CategorizedSegment {
  /** Semantic category used by downstream renderers and speech filters. */
  category: ResponseCategory
  /** Inner text after nested XML-like tags have been stripped. */
  content: string
  /** Inclusive start offset in the original response string. */
  startIndex: number
  /** Exclusive end offset in the original response string. */
  endIndex: number
  /** Raw source slice, including opening and closing tags. */
  raw: string
  /** Parsed opening tag name, without angle brackets. */
  tagName: string
}

/**
 * Categorized view of a full assistant response.
 */
export interface CategorizedResponse {
  /** Complete extracted non-speech segments in source order. */
  segments: CategorizedSegment[]
  /** Assistant text safe to surface as spoken/user-visible speech. */
  speech: string
  /** Extracted reasoning text, joined in source order. */
  reasoning: string
  /** Original unmodified model response. */
  raw: string
}

interface OpenTag {
  tagName: string
  startIndex: number
  contentStartIndex: number
}

function mapTagNameToCategory(_tagName: string): ResponseCategory {
  return 'reasoning'
}

function readTagName(value: string): string {
  const match = /^([a-z][\w:-]*)/i.exec(value.trimStart())
  return match?.[1] ?? ''
}

function openingTagAt(response: string, index: number): { tagName: string, endIndex: number } | undefined {
  if (response[index] !== '<' || response[index + 1] === '/' || response[index + 1] === '|')
    return undefined

  const closeIndex = response.indexOf('>', index + 1)
  if (closeIndex < 0)
    return undefined

  const tagName = readTagName(response.slice(index + 1, closeIndex))
  if (!tagName)
    return undefined

  return {
    tagName,
    endIndex: closeIndex + 1,
  }
}

function closingTagAt(response: string, index: number): { tagName: string, endIndex: number } | undefined {
  if (response[index] !== '<' || response[index + 1] !== '/')
    return undefined

  const closeIndex = response.indexOf('>', index + 2)
  if (closeIndex < 0)
    return undefined

  const tagName = readTagName(response.slice(index + 2, closeIndex))
  if (!tagName)
    return undefined

  return {
    tagName,
    endIndex: closeIndex + 1,
  }
}

function hasDanglingOpeningTagStart(value: string): boolean {
  const lastOpeningStart = value.lastIndexOf('<')
  if (lastOpeningStart < 0)
    return false

  if (value.includes('>', lastOpeningStart + 1))
    return false

  const nextChar = value[lastOpeningStart + 1]
  if (nextChar === '|' || nextChar === '/')
    return false

  return nextChar === undefined || /^[a-z]$/i.test(nextChar)
}

function stripReasoningTags(value: string): string {
  let output = ''

  for (let index = 0; index < value.length;) {
    if (value[index] === '<' && value[index + 1] !== '|') {
      const closeIndex = value.indexOf('>', index + 1)
      if (closeIndex >= 0) {
        index = closeIndex + 1
        continue
      }
    }

    output += value[index]
    index += 1
  }

  return output
}

function extractAllTags(response: string): CategorizedSegment[] {
  const segments: CategorizedSegment[] = []
  const stack: OpenTag[] = []

  for (let index = 0; index < response.length;) {
    const openingTag = openingTagAt(response, index)
    if (openingTag) {
      stack.push({
        tagName: openingTag.tagName,
        startIndex: index,
        contentStartIndex: openingTag.endIndex,
      })
      index = openingTag.endIndex
      continue
    }

    const closingTag = closingTagAt(response, index)
    if (closingTag) {
      const openTag = stack.at(-1)
      if (!openTag || openTag.tagName !== closingTag.tagName) {
        index = closingTag.endIndex
        continue
      }

      stack.pop()
      if (stack.length === 0) {
        const raw = response.slice(openTag.startIndex, closingTag.endIndex)
        const content = stripReasoningTags(response.slice(openTag.contentStartIndex, index)).trim()
        segments.push({
          category: mapTagNameToCategory(openTag.tagName),
          content,
          startIndex: openTag.startIndex,
          endIndex: closingTag.endIndex,
          raw,
          tagName: openTag.tagName,
        })
      }

      index = closingTag.endIndex
      continue
    }

    index += 1
  }

  return segments
}

/**
 * Categorizes a model response by extracting complete XML-like tags.
 *
 * Use when:
 * - Separating spoken assistant text from reasoning/thinking tags.
 *
 * Expects:
 * - Incomplete tags should remain speech until a complete closing tag exists.
 *
 * Returns:
 * - Speech text, reasoning text, and extracted tag segments.
 */
export function categorizeResponse(
  response: string,
  _providerId?: string,
): CategorizedResponse {
  const segments = extractAllTags(response).sort((a, b) => a.startIndex - b.startIndex)

  if (segments.length === 0) {
    return {
      segments: [],
      speech: response,
      reasoning: '',
      raw: response,
    }
  }

  const speechParts: string[] = []
  let lastEnd = 0

  for (const segment of segments) {
    if (segment.startIndex > lastEnd) {
      const text = response.slice(lastEnd, segment.startIndex).trim()
      if (text)
        speechParts.push(text)
    }
    lastEnd = Math.max(lastEnd, segment.endIndex)
  }

  if (lastEnd < response.length) {
    const text = response.slice(lastEnd).trim()
    if (text)
      speechParts.push(text)
  }

  const reasoning = segments
    .filter(s => s.category === 'reasoning')
    .map(s => s.content)
    .join('\n\n')

  return {
    segments,
    speech: speechParts.join(' ').trim(),
    reasoning,
    raw: response,
  }
}

function hasIncompleteReasoningTag(value: string): boolean {
  const stack: string[] = []

  for (let index = 0; index < value.length;) {
    const openingTag = openingTagAt(value, index)
    if (openingTag) {
      stack.push(openingTag.tagName)
      index = openingTag.endIndex
      continue
    }

    const closingTag = closingTagAt(value, index)
    if (closingTag) {
      const top = stack.at(-1)
      if (top === closingTag.tagName)
        stack.pop()
      index = closingTag.endIndex
      continue
    }

    index += 1
  }

  return stack.length > 0 || hasDanglingOpeningTagStart(value)
}

/**
 * Creates an incremental categorizer for streamed model output.
 *
 * Use when:
 * - Literal text arrives in chunks and reasoning tags should be filtered from
 *   spoken output as the response streams.
 *
 * Expects:
 * - Chunks are consumed in model order.
 *
 * Returns:
 * - A stateful categorizer with speech filtering and final categorization APIs.
 */
export function createStreamingCategorizer(
  providerId?: string,
  onSegment?: (segment: CategorizedSegment) => void,
) {
  let buffer = ''
  let categorized: CategorizedResponse | null = null
  let lastEmittedSegmentIndex = -1

  function recategorize() {
    categorized = categorizeResponse(buffer, providerId)

    if (onSegment && categorized.segments.length > 0) {
      for (let index = lastEmittedSegmentIndex + 1; index < categorized.segments.length; index += 1) {
        const segment = categorized.segments[index]
        if (buffer.length >= segment.endIndex) {
          onSegment(segment)
          lastEmittedSegmentIndex = index
        }
      }
    }
  }

  return {
    consume(chunk: string) {
      buffer += chunk
      recategorize()
    },
    isSpeechAt(position: number): boolean {
      if (!categorized || categorized.segments.length === 0)
        return true

      for (const segment of categorized.segments) {
        if (position >= segment.startIndex && position < segment.endIndex)
          return false
      }

      return true
    },
    filterToSpeech(text: string, startPosition: number): string {
      if (hasIncompleteReasoningTag(buffer))
        return ''

      if (!categorized || categorized.segments.length === 0)
        return text

      let filtered = ''
      const endPosition = startPosition + text.length
      const overlappingSegments = categorized.segments.filter(
        segment => segment.endIndex > startPosition && segment.startIndex < endPosition,
      )

      if (overlappingSegments.length === 0)
        return text

      let currentPos = startPosition
      for (const segment of overlappingSegments) {
        const segmentStart = Math.max(segment.startIndex, startPosition)
        const segmentEnd = Math.min(segment.endIndex, endPosition)

        if (segmentStart > currentPos) {
          const beforeStart = currentPos - startPosition
          const beforeEnd = segmentStart - startPosition
          filtered += text.slice(beforeStart, beforeEnd)
        }

        currentPos = segmentEnd
      }

      if (currentPos < endPosition) {
        const afterStart = currentPos - startPosition
        filtered += text.slice(afterStart)
      }

      return filtered
    },
    getCurrentPosition(): number {
      return buffer.length
    },
    end(): CategorizedResponse {
      return categorizeResponse(buffer, providerId)
    },
    getCurrent(): CategorizedResponse | null {
      return categorized
    },
  }
}
