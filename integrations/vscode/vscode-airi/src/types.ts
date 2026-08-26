/**
 * Coding context information
 */
export interface CodingContext {
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
    after: string[]
    before: string[]
  }
  /** Current line */
  currentLine: {
    lineNumber: number
    text: string
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
    character: number
    line: number
  }
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
    fileName: string
    languageId: string
    path: string
    workspaceFolder?: string
  }
  /** Git information */
  git?: {
    branch: string
    isDirty: boolean
  }
  /** Selected text */
  selection?: {
    end: { character: number, line: number }
    start: { character: number, line: number }
    text: string
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
  data: CodingContext
  type: 'coding:context' | 'coding:save' | 'coding:switch-file'
}
