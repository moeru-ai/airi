import type { ComputerUseServerRuntime } from '../server/runtime'

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

import { findReferences, searchSymbol, searchText } from './search'

const execAsync = promisify(exec)

export class CodingPrimitives {
  constructor(private runtime: ComputerUseServerRuntime) {}

  private getCodingState() {
    return this.runtime.stateManager.getState().coding
  }

  private getLatestTerminalResult() {
    return this.runtime.stateManager.getState().lastTerminalResult
  }

  private inferAutoUnresolvedIssues() {
    const latestTerminalResult = this.getLatestTerminalResult()
    const state = this.getCodingState()

    const issues: string[] = []

    if (state?.pendingIssues && state.pendingIssues.length > 0) {
      issues.push(...state.pendingIssues)
    }

    if (latestTerminalResult && latestTerminalResult.exitCode !== 0) {
      issues.push(`Most recent command "${latestTerminalResult.command}" exited with code ${latestTerminalResult.exitCode}.`)
    }

    if (issues.length > 0) {
      return issues.join('\n')
    }

    if ((state?.recentEdits.length ?? 0) === 0) {
      return 'No edits have been applied yet.'
    }

    return 'No unresolved issues inferred from current coding state.'
  }

  private inferAutoNextStepRecommendation() {
    const latestTerminalResult = this.getLatestTerminalResult()
    const state = this.getCodingState()

    if ((state?.recentEdits.length ?? 0) === 0) {
      return 'Apply the planned patch to the target file.'
    }

    if (!latestTerminalResult) {
      return 'Run validation or tests after reviewing the patch.'
    }

    if (latestTerminalResult.exitCode !== 0) {
      return 'Inspect the failing validation output and update the patch.'
    }

    return 'Report the current status or proceed with the next requested change.'
  }

  private deriveTerminalSurface() {
    const state = this.runtime.stateManager.getState()

    if (state.activePtySessionId) {
      return 'pty' as const
    }

    if (state.terminalState || state.lastTerminalResult) {
      return 'exec' as const
    }

    return 'unknown' as const
  }

  private deriveTerminalStateSummary() {
    const terminalState = this.runtime.stateManager.getState().terminalState

    return {
      effectiveCwd: terminalState?.effectiveCwd,
      lastExitCode: terminalState?.lastExitCode,
      lastCommandSummary: terminalState?.lastCommandSummary,
    }
  }

  private derivePendingIssues() {
    const issues: string[] = []
    const latestTerminalResult = this.getLatestTerminalResult()
    const state = this.getCodingState()

    if (latestTerminalResult?.timedOut) {
      issues.push(`Latest command "${latestTerminalResult.command}" timed out.`)
    }
    else if (latestTerminalResult && latestTerminalResult.exitCode !== 0) {
      issues.push(`Latest command "${latestTerminalResult.command}" failed with exit code ${latestTerminalResult.exitCode}.`)
    }

    if ((state?.recentReads.length ?? 0) === 0) {
      issues.push('No files have been read yet.')
    }

    if ((state?.recentEdits.length ?? 0) === 0) {
      issues.push('No edits have been applied yet.')
    }

    return issues
  }

  private inferAutoReportStatus(): 'completed' | 'in_progress' | 'blocked' | 'failed' {
    const latestTerminalResult = this.getLatestTerminalResult()
    const state = this.getCodingState()

    if (latestTerminalResult?.timedOut) {
      return 'failed'
    }

    if (latestTerminalResult && latestTerminalResult.exitCode !== 0) {
      return 'blocked'
    }

    if ((state?.recentEdits.length ?? 0) > 0 && latestTerminalResult?.exitCode === 0) {
      return 'completed'
    }

    return 'in_progress'
  }

  private inferAutoReportSummary(status: 'completed' | 'in_progress' | 'blocked' | 'failed') {
    const latestTerminalResult = this.getLatestTerminalResult()
    const state = this.getCodingState()
    const editCount = state?.recentEdits.length ?? 0

    if (status === 'failed' && latestTerminalResult?.timedOut) {
      return `Latest validation command timed out: ${latestTerminalResult.command}.`
    }

    if (status === 'blocked' && latestTerminalResult) {
      return `Latest validation command failed: ${latestTerminalResult.command} (exit ${latestTerminalResult.exitCode}).`
    }

    if (status === 'completed' && latestTerminalResult) {
      return `Applied edits to ${editCount} file(s) and validated successfully with ${latestTerminalResult.command}.`
    }

    if (editCount > 0) {
      return `Applied edits to ${editCount} file(s) and awaiting validation or follow-up work.`
    }

    if ((state?.recentReads.length ?? 0) > 0) {
      return 'Workspace reviewed and relevant files inspected.'
    }

    return 'Coding loop is in progress.'
  }

  private inferAutoReportNextStep(status: 'completed' | 'in_progress' | 'blocked' | 'failed') {
    if (status === 'blocked') {
      return 'Inspect the failing command output and revise the patch before reporting completion.'
    }

    if (status === 'failed') {
      return 'Retry the failed validation step or narrow the scope before continuing.'
    }

    if (status === 'completed') {
      return 'Await the next instruction or expand validation if needed.'
    }

    return this.inferAutoNextStepRecommendation()
  }

  private getWorkspaceRoot(): string {
    const root = this.runtime.stateManager.getState().coding?.workspacePath
    if (!root) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace not reviewed yet. Call coding_review_workspace first.')
    }
    return root
  }

  private resolveWorkspacePath(relativePath: string): string {
    const root = this.getWorkspaceRoot()
    const absPath = path.resolve(root, relativePath)
    if (absPath !== root && !absPath.startsWith(root + path.sep)) {
      throw new McpError(ErrorCode.InvalidParams, `Access denied. Path ${relativePath} is outside of workspace ${root}`)
    }
    return absPath
  }

  async reviewWorkspace(workspacePath: string) {
    let gitSummary = 'Not a git repository or git error.'
    try {
      const { stdout: diff } = await execAsync('git diff --stat', { cwd: workspacePath })
      const { stdout: status } = await execAsync('git status -s', { cwd: workspacePath })
      gitSummary = `Status:\n${status}\nDiff Stat:\n${diff}`
    }
    catch {
      // Ignore git errors
    }

    const state = this.runtime.stateManager.getState().coding
    this.runtime.stateManager.updateCodingState({
      workspacePath,
      gitSummary,
      recentReads: state?.recentReads ?? [],
      recentEdits: state?.recentEdits ?? [],
      recentCommandResults: state?.recentCommandResults ?? [],
      recentSearches: state?.recentSearches ?? [],
      pendingIssues: state?.pendingIssues ?? [],
    })

    const newState = this.runtime.stateManager.getState().coding!

    // We should construct it based on interface CodingWorkspaceReview
    const review = {
      workspacePath: newState.workspacePath,
      gitSummary: newState.gitSummary,
      terminalSurface: this.deriveTerminalSurface(),
      terminalStateSummary: this.deriveTerminalStateSummary(),
      recentReads: newState.recentReads,
      recentEdits: newState.recentEdits,
      recentCommandResults: newState.recentCommandResults,
      recentSearches: newState.recentSearches,
      pendingIssues: newState.pendingIssues,
    }

    this.runtime.stateManager.updateCodingState({ lastWorkspaceReview: review })
    return review
  }

  // --- Search & Semantic ---
  async searchText(query: string, glob?: string, limit?: number) {
    const root = this.getWorkspaceRoot()
    const result = await searchText(root, query, glob, limit)

    // Add to recent searches
    const state = this.runtime.stateManager.getState().coding
    if (state) {
      const summary = `Text search: "${query}" (glob: ${glob || 'all'})`
      this.runtime.stateManager.updateCodingState({
        recentSearches: [...(state.recentSearches || []), summary].slice(-5),
      })
    }

    return result
  }

  async searchSymbol(symbolName: string, glob?: string, limit?: number) {
    const root = this.getWorkspaceRoot()
    const result = await searchSymbol(root, symbolName, glob, limit)

    const state = this.runtime.stateManager.getState().coding
    if (state) {
      const summary = `Symbol search: "${symbolName}"`
      this.runtime.stateManager.updateCodingState({
        recentSearches: [...(state.recentSearches || []), summary].slice(-5),
      })
    }

    return result
  }

  async findReferences(filePath: string, line: number, column: number, limit?: number) {
    const root = this.getWorkspaceRoot()
    const state = this.runtime.stateManager.getState().coding
    if (state) {
      const summary = `Find references: ${filePath}:${line}:${column}`
      this.runtime.stateManager.updateCodingState({
        recentSearches: [...(state.recentSearches || []), summary].slice(-5),
      })
    }
    return findReferences(root, filePath, line, column, limit)
  }

  async readFile(filePath: string, startLine?: number, endLine?: number) {
    const absPath = this.resolveWorkspacePath(filePath)
    try {
      const content = await fs.readFile(absPath, 'utf8')
      const lines = content.split('\n')

      let output = content
      let rangeStr = 'all'
      if (startLine !== undefined && endLine !== undefined) {
        output = lines.slice(startLine - 1, endLine).join('\n')
        rangeStr = `${startLine}-${endLine}`
      }

      const state = this.runtime.stateManager.getState().coding ?? { recentReads: [], recentEdits: [], workspacePath: '', gitSummary: '', recentCommandResults: [] }
      const recentReads = [...state.recentReads, { path: filePath, range: rangeStr }]
      this.runtime.stateManager.updateCodingState({ recentReads })

      return output
    }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new McpError(ErrorCode.InternalError, `Failed to read file: ${msg}`)
    }
  }

  async applyPatch(filePath: string, oldString: string, newString: string) {
    const absPath = this.resolveWorkspacePath(filePath)
    try {
      const content = await fs.readFile(absPath, 'utf8')
      const occurrences = content.split(oldString).length - 1

      if (occurrences === 0) {
        throw new Error('oldString not found in file exactly as provided.')
      }
      if (occurrences > 1) {
        throw new Error(`oldString found ${occurrences} times in file. Please provide a more specific oldString to ensure exact match.`)
      }

      const newContent = content.replace(oldString, newString)
      await fs.writeFile(absPath, newContent, 'utf8')

      const state = this.runtime.stateManager.getState().coding ?? { recentReads: [], recentEdits: [], workspacePath: '', gitSummary: '', recentCommandResults: [], recentSearches: [], pendingIssues: [] }
      const summary = `Replaced ${oldString.length} chars with ${newString.length} chars (1 occurrence)`
      const recentEdits = [...state.recentEdits, { path: filePath, summary }]
      this.runtime.stateManager.updateCodingState({ recentEdits })

      return `Patch applied successfully to ${filePath}.`
    }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new McpError(ErrorCode.InternalError, `Failed to patch file: ${msg}`)
    }
  }

  async compressContext(goal: string, filesSummary: string, recentResultSummary: string, unresolvedIssues: string, nextStepRecommendation: string) {
    const state = this.getCodingState()

    const actualFilesSummary = filesSummary === 'auto'
      ? ([
          ...(state?.recentSearches || []).map(s => `Searched: ${s}`) ?? [],
          ...(state?.recentReads || []).map(r => `Read ${r.path} (${r.range})`) ?? [],
          ...(state?.recentEdits || []).map(e => `Edited ${e.path}${e.summary ? ` — ${e.summary}` : ''}`) ?? [],
        ].join('\n') || 'No files read or edited.')
      : filesSummary

    const actualRecentResult = recentResultSummary === 'auto'
      ? (state?.recentCommandResults.join('\n---\n') || 'No commands run.')
      : recentResultSummary

    const actualUnresolvedIssues = unresolvedIssues === 'auto'
      ? ((Array.isArray(this.inferAutoUnresolvedIssues()) ? this.inferAutoUnresolvedIssues() : [this.inferAutoUnresolvedIssues()]) || []).join('\n')
      : unresolvedIssues

    const actualNextStepRecommendation = nextStepRecommendation === 'auto'
      ? this.inferAutoNextStepRecommendation()
      : nextStepRecommendation

    const lastCompressedContext = {
      goal,
      filesSummary: actualFilesSummary,
      recentResultSummary: actualRecentResult,
      unresolvedIssues: actualUnresolvedIssues,
      nextStepRecommendation: actualNextStepRecommendation,
    }

    this.runtime.stateManager.updateCodingState({ lastCompressedContext })
    return lastCompressedContext
  }

  async reportStatus(status: 'completed' | 'in_progress' | 'blocked' | 'failed' | 'auto', summary: string, filesTouched: string[], commandsRun: string[], checks: string[], nextStep: string) {
    const state = this.getCodingState()
    const actualStatus = status === 'auto'
      ? this.inferAutoReportStatus()
      : status

    const actualFilesTouched = filesTouched.length === 1 && filesTouched[0] === 'auto'
      ? ((state?.recentEdits || []).map(e => e.path) || [])
      : filesTouched

    const actualCommandsRun = commandsRun.length === 1 && commandsRun[0] === 'auto'
      ? ((state?.recentCommandResults || []).map(r => r.split('\n')[0]) || [])
      : commandsRun

    const actualChecks = checks.length === 1 && checks[0] === 'auto'
      ? ((state?.recentCommandResults || []).map(r => r.split('\n')[1]) || [])
      : checks

    const actualSummary = summary === 'auto'
      ? this.inferAutoReportSummary(actualStatus)
      : summary

    const actualNextStep = nextStep === 'auto'
      ? this.inferAutoReportNextStep(actualStatus)
      : nextStep

    const lastCodingReport = {
      status: actualStatus,
      summary: actualSummary,
      filesTouched: actualFilesTouched,
      commandsRun: actualCommandsRun,
      checks: actualChecks,
      nextStep: actualNextStep,
    }

    this.runtime.stateManager.updateCodingState({ lastCodingReport })
    return lastCodingReport
  }
}
