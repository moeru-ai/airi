/**
 * Coding context information
 */
export interface CodingContext {
  /**
   * File information
   *
   * @example {
   *  "path": "/home/neko/Git/github.com/moeru-ai/airi/package.json",
   *  "languageId": "json",
   *  "fileName": "/home/neko/Git/github.com/moeru-ai/airi/package.json"
   * }
   */
  file: {
    path: string
    languageId: string
    fileName: string
    workspaceFolder?: string
  }
  /**
   * Cursor position
   *
   * {
   *  "line": 5,
   *  "character": 35
   * }
   */
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
  /**
   * Context (previous and next N lines)
   *
   * @example {
   *   "before": [
   *     "{",
   *     "  \"name\": \"@proj-airi/root\",",
   *     "  \"type\": \"module\",",
   *     "  \"version\": \"0.8.1-beta.12\",",
   *     "  \"private\": true,"
   *   ],
   *   "after": [
   *     "  \"description\": \"LLM powered virtual character\",",
   *     "  \"author\": {",
   *     "    \"name\": \"Moeru AI Project AIRI Team\",",
   *     "    \"email\": \"airi@moeru.ai\",",
   *     "    \"url\": \"https://github.com/moeru-ai\""
   *   ]
   * }
   */
  context: {
    before: string[]
    after: string[]
  }
  /** Git information */
  git?: {
    branch: string
    isDirty: boolean
  }
  /**
   * Timestamp
   *
   * @example 1768584314898
   */
  timestamp: number
}

/**
 * Event types sent to Airi
 */
export interface Events {
  type: 'coding:context' | 'coding:save' | 'coding:switch-file'
  data: CodingContext
}
