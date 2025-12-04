/**
 * Coding context information
 */
export interface CodingContext {
  /** File information */
  file: {
    path: string
    languageId: string
    fileName: string
    workspaceFolder?: string
  }
  /** Cursor position */
  cursor: {
    line: number
    character: number
  }
  /** Selected text */
  selection?: {
    text: string
    start: { line: number, character: number }
    end: { line: number, character: number }
  }
  /** Current line */
  currentLine: {
    lineNumber: number
    text: string
  }
  /** Context (previous and next N lines) */
  context: {
    before: string[]
    after: string[]
  }
  /** Git information */
  git?: {
    branch: string
    isDirty: boolean
  }
  /** Timestamp */
  timestamp: number
}

/**
 * Event types sent to Airi
 */
export interface Events {
  type: 'coding:context' | 'coding:save' | 'coding:switch-file'
  data: CodingContext
}
