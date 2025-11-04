import type * as vscode from 'vscode'

import type { CodingContext } from './types'

/**
 * 收集当前编码环境的上下文信息
 */
export class ContextCollector {
  constructor(
    private readonly contextLines: number = 5,
  ) {}

  /**
   * 从当前活动编辑器收集上下文
   */
  async collect(editor: vscode.TextEditor): Promise<CodingContext | null> {
    try {
      const document = editor.document
      const position = editor.selection.active

      // 文件信息
      const file = {
        path: document.uri.fsPath,
        languageId: document.languageId,
        fileName: document.fileName,
        workspaceFolder: this.getWorkspaceFolder(document.uri),
      }

      // 光标位置
      const cursor = {
        line: position.line,
        character: position.character,
      }

      // 选中的文本
      const selection = editor.selection.isEmpty
        ? undefined
        : {
            text: document.getText(editor.selection),
            start: {
              line: editor.selection.start.line,
              character: editor.selection.start.character,
            },
            end: {
              line: editor.selection.end.line,
              character: editor.selection.end.character,
            },
          }

      // 当前行
      const currentLine = {
        lineNumber: position.line,
        text: document.lineAt(position.line).text,
      }

      // 上下文(前后 N 行)
      const context = this.getContext(document, position.line)

      // Git 信息(简化版,后续可以扩展)
      // const git = await this.getGitInfo(document.uri)

      return {
        file,
        cursor,
        selection,
        currentLine,
        context,
        // git,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      console.error('Failed to collect context:', error)
      return null
    }
  }

  /**
   * 获取当前行前后的上下文
   */
  private getContext(document: vscode.TextDocument, currentLine: number) {
    const before: string[] = []
    const after: string[] = []

    // 获取前面的行
    const startLine = Math.max(0, currentLine - this.contextLines)
    for (let i = startLine; i < currentLine; i++) {
      before.push(document.lineAt(i).text)
    }

    // 获取后面的行
    const endLine = Math.min(document.lineCount - 1, currentLine + this.contextLines)
    for (let i = currentLine + 1; i <= endLine; i++) {
      after.push(document.lineAt(i).text)
    }

    return { before, after }
  }

  /**
   * 获取工作区文件夹
   */
  private getWorkspaceFolder(uri: vscode.Uri): string | undefined {
    const { workspace } = require('vscode') as typeof vscode
    const folder = workspace.getWorkspaceFolder(uri)
    return folder?.uri.fsPath
  }

  /**
   * 获取 Git 信息(简化版)
   */
  private async getGitInfo(uri: vscode.Uri): Promise<{ branch: string, isDirty: boolean } | undefined> {
    try {
      const { extensions } = require('vscode') as typeof vscode
      const gitExtension = extensions.getExtension('vscode.git')?.exports
      if (!gitExtension)
        return undefined

      const git = gitExtension.getAPI(1)
      const repo = git.getRepository(uri)
      if (!repo)
        return undefined

      return {
        branch: repo.state.HEAD?.name ?? 'unknown',
        isDirty: repo.state.workingTreeChanges.length > 0,
      }
    }
    catch {
      return undefined
    }
  }
}
