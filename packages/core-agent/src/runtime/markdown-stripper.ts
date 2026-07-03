/**
 * Strips common Markdown formatting syntax from speech text,
 * preserving the readable content while removing visual markup markers.
 *
 * Use when:
 * - Cleaning LLM speech output before TTS or chat display
 * - Applying a fallback defense layer when the prompt instruction is ignored
 *
 * Expects:
 * - Text that has already been filtered through the response categorizer
 *   so reasoning tags and streaming control tokens are not present
 *
 * Returns:
 * - Plain text with Markdown syntax removed and inner content preserved
 *
 * @example
 * stripMarkdownFromSpeech('I **really** love this!')
 * // -> 'I really love this!'
 *
 * @example
 * stripMarkdownFromSpeech('## Heading\n- item one\n- item two')
 * // -> 'Heading\nitem one\nitem two'
 */
export function stripMarkdownFromSpeech(text: string): string {
  let result = text

  // Code fences (```...```) — must run before inline code to avoid partial matches
  // Use a line-by-line approach: match opening ``` line, content, and closing ``` line
  result = result.replace(/^```.*\n([\s\S]*?)^```$/gm, '$1')

  // Inline code (`code`) — preserve inner text
  result = result.replace(/`([^`]+)`/g, '$1')

  // Bold (**text**) — preserve inner text
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1')

  // Strikethrough (~~text~~) — preserve inner text
  result = result.replace(/~~([^~]+)~~/g, '$1')

  // Headings (# Heading) — remove # markers at line start, preserve text
  result = result.replace(/^#{1,6}\s+/gm, '')

  // Bullet lists (- item or * item) — remove marker at line start, preserve text
  // Must run before italic stripping to avoid * being consumed as italic marker
  result = result.replace(/^[-*]\s+/gm, '')

  // Numbered lists (1. item) — remove number+dot at line start, preserve text
  result = result.replace(/^\d+\.\s+/gm, '')

  // Blockquotes (> quote) — remove > marker at line start, preserve text
  result = result.replace(/^>\s+/gm, '')

  // Italic (*text*) — preserve inner text
  // Must run after bold and list stripping to avoid matching * list markers
  result = result.replace(/\*([^*]+)\*/g, '$1')

  // Italic (_text_) — preserve inner text
  result = result.replace(/_([^_]+)_/g, '$1')

  // Links [text](url) — preserve link text only
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Blockquotes (> quote) — remove > marker at line start, preserve text
  result = result.replace(/^>\s+/gm, '')

  // Horizontal rules (---, ***, ___) — remove entirely
  result = result.replace(/^-{3,}$/gm, '')
  result = result.replace(/^\*{3,}$/gm, '')
  result = result.replace(/^_{3,}$/gm, '')

  // Table pipes — remove | characters at line boundaries, preserve cell text
  result = result.replace(/^\|(.*)\|$/gm, (_match, inner: string) => {
    return inner
      .split('|')
      .map((cell: string) => cell.trim())
      .join('  ')
  })

  return result
}
