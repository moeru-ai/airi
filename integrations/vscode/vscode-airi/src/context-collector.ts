import type { CodingContext } from './types'

import { useLogger } from '@guiiai/logg'

import * as vscode from 'vscode'

/**
 * Collector for coding context in VSCode
 */
export class ContextCollector {
  constructor(
    private readonly contextLines: number = 5,
  ) {}

  /**
   * Collect context from the current active editor
   */
  async collect(editor: vscode.TextEditor): Promise<CodingContext | null> {
    try {
      const document = editor.document
      const position = editor.selection.active

      // File information
      const file = {
        fileName: document.fileName,
        languageId: document.languageId,
        path: document.uri.fsPath,
        workspaceFolder: this.getWorkspaceFolder(document.uri),
      }

      // Cursor position
      const cursor = {
        character: position.character,
        line: position.line,
      }

      // Selected text
      const selection = editor.selection.isEmpty
        ? undefined
        : {
            end: {
              character: editor.selection.end.character,
              line: editor.selection.end.line,
            },
            start: {
              character: editor.selection.start.character,
              line: editor.selection.start.line,
            },
            text: document.getText(editor.selection),
          }

      // Current line
      const currentLine = {
        lineNumber: position.line,
        text: document.lineAt(position.line).text,
      }

      // Context (N lines before and after)
      const context = this.getContext(document, position.line)

      // Git information (simplified, can be extended later)
      const git = await this.getGitInfo(document.uri)

      return {
        context,
        currentLine,
        cursor,
        file,
        git,
        selection,
        timestamp: Date.now(),
      }
    }
    catch (error) {
      useLogger().errorWithError('Failed to collect context:', error)
      return null
    }
  }

  /**
   * Get context before and after the current line
   */
  private getContext(document: vscode.TextDocument, currentLine: number) {
    const before: string[] = []
    const after: string[] = []

    // Get preceding lines
    const startLine = Math.max(0, currentLine - this.contextLines)
    for (let i = startLine; i < currentLine; i++) {
      before.push(document.lineAt(i).text)
    }

    // Get following lines
    const endLine = Math.min(document.lineCount - 1, currentLine + this.contextLines)
    for (let i = currentLine + 1; i <= endLine; i++) {
      after.push(document.lineAt(i).text)
    }

    return { after, before }
  }

  /**
   * Get Git information (simplified)
   */
  private async getGitInfo(uri: vscode.Uri): Promise<undefined | { branch: string, isDirty: boolean }> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports
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

  /**
   * Get workspace folder path
   */
  private getWorkspaceFolder(uri: vscode.Uri): string | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(uri)
    return folder?.uri.fsPath
  }
}
