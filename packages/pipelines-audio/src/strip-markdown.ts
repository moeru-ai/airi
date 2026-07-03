/**
 * Strips Markdown formatting from text for TTS output.
 * This is a standalone function that can be imported by speech-pipeline.ts.
 */
export function stripMarkdownFromText(text: string): string {
  let result = text

  // Code fences (```...```) — must run before inline code
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
  result = result.replace(/^[-*]\s+/gm, '')

  // Numbered lists (1. item) — remove number+dot at line start, preserve text
  result = result.replace(/^\d+\.\s+/gm, '')

  // Blockquotes (> quote) — remove > marker at line start, preserve text
  result = result.replace(/^>\s+/gm, '')

  // Italic (*text*) — preserve inner text
  result = result.replace(/\*([^*]+)\*/g, '$1')

  // Italic (_text_) — preserve inner text
  result = result.replace(/_([^_]+)_/g, '$1')

  // Links [text](url) — preserve link text only
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Horizontal rules (---, ***, ___) — remove entirely
  result = result.replace(/^-{3,}$/gm, '')
  result = result.replace(/^\*{3,}$/gm, '')
  result = result.replace(/^_{3,}$/gm, '')

  // Aggressive star stripping: remove any ** that survived
  result = result.replace(/\*\*/g, '')

  return result
}
