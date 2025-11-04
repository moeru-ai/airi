/**
 * 编码环境上下文信息
 */
export interface CodingContext {
  /** 文件信息 */
  file: {
    path: string
    languageId: string
    fileName: string
    workspaceFolder?: string
  }
  /** 光标位置 */
  cursor: {
    line: number
    character: number
  }
  /** 选中的文本 */
  selection?: {
    text: string
    start: { line: number, character: number }
    end: { line: number, character: number }
  }
  /** 当前行 */
  currentLine: {
    lineNumber: number
    text: string
  }
  /** 上下文(前后 N 行) */
  context: {
    before: string[]
    after: string[]
  }
  /** Git 信息 */
  git?: {
    branch: string
    isDirty: boolean
  }
  /** 时间戳 */
  timestamp: number
}

/**
 * 发送到 Airi 的事件类型
 */
export interface AiriEvent {
  type: 'coding:context' | 'coding:save' | 'coding:switch-file'
  data: CodingContext
}
