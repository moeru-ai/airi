const SESSION_ID_PATTERN = /^ses_[\w-]{8,128}$/

export function isValidVisualChatSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value.trim())
}

export function normalizeVisualChatSessionId(value: string): string {
  const normalized = value.trim()
  if (!SESSION_ID_PATTERN.test(normalized))
    throw new Error(`Invalid visual chat session id: ${value}`)
  return normalized
}
