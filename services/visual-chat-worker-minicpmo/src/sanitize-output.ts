const THINKING_BLOCK_PATTERN = /<think\b[^>]*>[\s\S]*?<\/think>/gi
const THINKING_OPEN_TAG_PATTERN = /<think\b[^>]*>/gi
const THINKING_CLOSE_TAG_PATTERN = /<\/think>/gi
const LEADING_WHITESPACE_PATTERN = /^\s+/
const EXCESSIVE_BLANK_LINES_PATTERN = /\n{3,}/g

export function sanitizeModelOutputText(value: string): string {
  return value
    .replace(THINKING_BLOCK_PATTERN, '')
    .replace(THINKING_OPEN_TAG_PATTERN, '')
    .replace(THINKING_CLOSE_TAG_PATTERN, '')
    .replace(LEADING_WHITESPACE_PATTERN, '')
    .replace(EXCESSIVE_BLANK_LINES_PATTERN, '\n\n')
}
