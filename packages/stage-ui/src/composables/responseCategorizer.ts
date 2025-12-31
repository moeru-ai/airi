export type ResponseCategory = 'speech' | 'reasoning' | 'unknown'

export interface CategorizedSegment {
  category: ResponseCategory
  content: string
  startIndex: number
  endIndex: number
  raw: string // Original tagged content including tags
  tagName: string // The actual tag name found (e.g., "think", "thought", "reasoning")
}

export interface CategorizedResponse {
  segments: CategorizedSegment[]
  speech: string // Combined speech content (everything outside tags)
  reasoning: string // Combined reasoning/thought content
  raw: string // Original full response
}

/**
 * Maps tag names to categories
 * All tags are treated as reasoning (filtered from TTS)
 */
function mapTagNameToCategory(_tagName: string): ResponseCategory {
  // All tags are reasoning - no need to distinguish tag names
  return 'reasoning'
}

/**
 * Extracts all XML-like tags from a response dynamically
 * Works with any tag format: <tag>content</tag>
 */
function extractAllTags(response: string): Array<{
  tagName: string
  content: string
  fullMatch: string
  startIndex: number
  endIndex: number
}> {
  const tags: Array<{
    tagName: string
    content: string
    fullMatch: string
    startIndex: number
    endIndex: number
  }> = []

  // Match any XML-like tag: <tagname>content</tagname>
  // This regex finds opening tags, captures the tag name, content, and closing tag
  const tagPattern = /<([a-z_][\w-]*)>([\s\S]*?)<\/\1>/gi

  let match
  while ((match = tagPattern.exec(response)) !== null) {
    if (match.index === undefined)
      continue

    const tagName = match[1]
    const content = match[2] || ''
    const fullMatch = match[0]
    const startIndex = match.index
    const endIndex = startIndex + fullMatch.length

    tags.push({
      tagName,
      content,
      fullMatch,
      startIndex,
      endIndex,
    })
  }

  return tags
}

/**
 * Categorizes a model response by dynamically extracting any XML-like tags
 * Works with any tag format the model uses
 */
export function categorizeResponse(
  response: string,
  _providerId?: string,
): CategorizedResponse {
  // Extract all tags dynamically
  const extractedTags = extractAllTags(response)

  if (extractedTags.length === 0) {
    // No tags found, treat everything as speech
    return {
      segments: [],
      speech: response,
      reasoning: '',
      raw: response,
    }
  }

  // Convert extracted tags to categorized segments
  const segments: CategorizedSegment[] = extractedTags.map(tag => ({
    category: mapTagNameToCategory(tag.tagName),
    content: tag.content.trim(),
    startIndex: tag.startIndex,
    endIndex: tag.endIndex,
    raw: tag.fullMatch,
    tagName: tag.tagName,
  }))

  // Sort segments by position
  segments.sort((a, b) => a.startIndex - b.startIndex)

  // Extract speech content by removing complete tags from original text
  // Only process tags - preserve everything else exactly as-is (no trimming, no processing)
  let speech = response
  // Remove tags in reverse order to preserve indices
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]
    if (segment.category === 'reasoning') {
      speech = speech.slice(0, segment.startIndex) + speech.slice(segment.endIndex)
    }
  }

  // Combine segments by category
  const reasoning = segments
    .filter(s => s.category === 'reasoning')
    .map(s => s.content)
    .join('\n\n')

  return {
    segments,
    speech,
    reasoning,
    raw: response,
  }
}

/**
 * Streaming version that processes text incrementally
 */
export function createStreamingCategorizer(
  providerId?: string,
  onSegment?: (segment: CategorizedSegment) => void,
) {
  let buffer = ''
  let categorized: CategorizedResponse | null = null
  let lastEmittedSegmentIndex = -1

  return {
    consume(chunk: string) {
      buffer += chunk
      // Re-categorize on each chunk
      categorized = categorizeResponse(buffer, providerId)

      // Emit new segments if any
      if (onSegment && categorized.segments.length > 0) {
        // Emit segments that haven't been emitted yet
        for (let i = lastEmittedSegmentIndex + 1; i < categorized.segments.length; i++) {
          const segment = categorized.segments[i]
          // Only emit if the segment is complete (we've received the closing tag)
          if (buffer.length >= segment.endIndex) {
            onSegment(segment)
            lastEmittedSegmentIndex = i
          }
        }
      }
    },
    /**
     * Checks if the current position in the stream is part of speech content
     * Returns true if the text should be sent to TTS
     */
    isSpeechAt(position: number): boolean {
      if (!categorized || categorized.segments.length === 0) {
        // No categorization yet, assume it's speech
        return true
      }

      // Check if position falls within any reasoning segment
      for (const segment of categorized.segments) {
        if (segment.category === 'reasoning' && position >= segment.startIndex && position < segment.endIndex) {
          // Position is within a reasoning tag, filter it out
          return false
        }
      }

      // Position is not in any tagged segment, so it's speech
      return true
    },
    /**
     * Filters text to only include speech parts
     * Removes content that falls within thought/reasoning segments
     * Only filters based on complete tags (opening + closing)
     */
    filterToSpeech(text: string, startPosition: number): string {
      // Re-categorize to get latest complete tags
      categorized = categorizeResponse(buffer, providerId)

      if (!categorized || categorized.segments.length === 0) {
        // No complete tags detected, all text is speech
        return text
      }

      let filtered = ''
      const endPosition = startPosition + text.length

      // Find all reasoning segments that overlap with this text (explicitly filter these out)
      const overlappingReasoningSegments = categorized.segments.filter(
        segment => segment.category === 'reasoning' && segment.endIndex > startPosition && segment.startIndex < endPosition,
      )

      if (overlappingReasoningSegments.length === 0) {
        // No overlapping reasoning segments, all text is speech
        return text
      }

      // Build filtered text by excluding reasoning segments
      let currentPos = startPosition
      for (const segment of overlappingReasoningSegments) {
        const segmentStart = Math.max(segment.startIndex, startPosition)
        const segmentEnd = Math.min(segment.endIndex, endPosition)

        // Add text before this segment
        if (segmentStart > currentPos) {
          const beforeStart = currentPos - startPosition
          const beforeEnd = segmentStart - startPosition
          filtered += text.slice(beforeStart, beforeEnd)
        }

        // Skip the segment content (don't add to filtered)
        currentPos = segmentEnd
      }

      // Add remaining text after last segment
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
