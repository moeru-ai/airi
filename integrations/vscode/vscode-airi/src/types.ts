/**
 * Coding context information
 */
export interface CodingContext {
  file: {
    path: string
    languageId: string
    fileName: string
    workspaceFolder?: string
  }
  cursor: {
    line: number
    character: number
  }
  selection?: {
    text: string
    start: { line: number, character: number }
    end: { line: number, character: number }
  }
  currentLine: {
    lineNumber: number
    text: string
  }
  context: {
    before: string[]
    after: string[]
  }
  git?: {
    branch: string
    isDirty: boolean
  }
  timestamp: number
}

export type VscodeActivityEventType = 'heartbeat' | 'save' | 'switch-file'

export interface VscodeModelConfig {
  provider?: string
  model?: string
}

export interface VscodeActivityMessage {
  kind: 'vscode:activity'
  eventType: VscodeActivityEventType
  instanceId: string
  workspaceFolder?: string
  workspaceFolders: string[]
  filePath?: string
  languageId?: string
  cursor?: {
    line: number
    character: number
  }
  timestamp: number
  model?: VscodeModelConfig
}
