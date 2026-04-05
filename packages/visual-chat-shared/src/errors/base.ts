import type { ErrorCode } from './codes'

export class VisualChatError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'VisualChatError'
  }
}
