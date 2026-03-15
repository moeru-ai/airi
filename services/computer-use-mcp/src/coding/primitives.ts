import type { ComputerUseServerRuntime } from '../server/runtime'
import type {
  CausalLink,
  CodingArchitectureLayer,
  CodingChangeDiagnosis,
  CodingChangeIntent,
  CodingChangePlan,
  CodingChangeReview,
  CodingChangeRootCauseType,
  CodingCounterfactualCheck,
  CodingDiagnosisCandidateScore,
  CodingDiagnosisCompetition,
  CodingDiagnosisConfidenceBreakdown,
  CodingDiagnosisConflict,
  CodingDiagnosisJudgeInput,
  CodingImpactAnalysis,
  CodingIntentDecomposition,
  CodingInvestigation,
  CodingPlanFrontier,
  CodingPlanGraph,
  CodingPlannerDecision,
  CodingPlanSession,
  CodingPlanSessionTransition,
  CodingPlanStep,
  CodingReplanDraftInput,
  CodingReviewRisk,
  CodingScopedValidationCommand,
  CodingTargetCandidate,
  CodingTargetCompetition,
  CodingTargetHypothesis,
  CodingTargetKind,
  CodingTargetSelection,
  CodingTargetSourceKind,
  CodingValidationBaseline,
  DiagnosisEvidence,
  DiagnosisJudgement,
  TargetDecisionCase,
  TargetJudgement,
} from '../state'

import { exec, execFile } from 'node:child_process'
import { env } from 'node:process'
import { promisify } from 'node:util'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

import {
  buildCausalTrace,
  buildCounterfactualChecks,
  validateCausalTrace,
} from './causal-trace'
import { buildDiagnosisCase, resolveDiagnosisJudgement } from './diagnosis-case'
import { validatePlanDraft } from './judgement-schema'
import {
  applyGraphToSession,
  buildPlanDraftFromGraph,
  buildPlanGraphFromSession,
  computePlanFrontier,
  decideNextPlannerNode,
  insertMissedDependencyNode,
  markCheckpointOutcome,
  promoteNodeRunning,
  recoverNeedsReplanNode,
  validatePlanGraphInvariants,
} from './planner-graph'
import {
  clampSearchLimit,
  findReferences,
  searchSymbol,
  searchText,
} from './search'
import { buildTargetDecisionCase, resolveTargetJudgement } from './target-case'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export class CodingPrimitives {
  constructor(private runtime: ComputerUseServerRuntime) {}

  private readonly maxAutoStringLength = 300
  private readonly maxAutoArrayLength = 10

  private clampString(value: string) {
    const normalized = value || ''
    if (normalized.length <= this.maxAutoStringLength) {
      return normalized
    }

    return `${normalized.slice(0, this.maxAutoStringLength - 1)}…`
  }

  private clampStringArray(values: string[]) {
    return values
      .filter(Boolean)
      .slice(0, this.maxAutoArrayLength)
      .map(value => this.clampString(value))
  }

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

    const stillRelevantIssue = (issue: string) => {
      if (issue === 'No files have been read yet.' && (state?.recentReads.length ?? 0) > 0) {
        return false
      }

      if (issue === 'No edits have been applied yet.' && (state?.recentEdits.length ?? 0) > 0) {
        return false
      }

      if (issue.startsWith('Latest command') || issue.startsWith('Most recent command')) {
        return latestTerminalResult != null && (latestTerminalResult.timedOut || latestTerminalResult.exitCode !== 0)
      }

      return true
    }

    if (state?.lastChangeReview?.unresolvedIssues?.length) {
      issues.push(...state.lastChangeReview.unresolvedIssues)
    }

    if (state?.pendingIssues && state.pendingIssues.length > 0) {
      issues.push(...state.pendingIssues.filter(stillRelevantIssue))
    }

    if (latestTerminalResult && latestTerminalResult.exitCode !== 0) {
      issues.push(`Most recent command "${latestTerminalResult.command}" exited with code ${latestTerminalResult.exitCode}.`)
    }

    if (issues.length > 0) {
      return issues
    }

    if ((state?.recentEdits.length ?? 0) === 0) {
      return ['No edits have been applied yet.']
    }

    return ['No unresolved issues inferred from current coding state.']
  }

  private getSourcePriority(kind: CodingTargetSourceKind) {
    switch (kind) {
      case 'explicit':
        return 400
      case 'symbol':
        return 300
      case 'text':
        return 200
      case 'references':
        return 100
    }
  }

  private deriveScopedPathForBonus(targetPath?: string) {
    const state = this.getCodingState()
    const workspaceRoot = this.getWorkspaceRoot()

    const scoped = targetPath || state?.lastScopedTargetPath
    if (!scoped) {
      return undefined
    }

    const scopedAbsolute = this.resolveSearchRoot(scoped)
    return path.relative(workspaceRoot, scopedAbsolute) || '.'
  }

  private candidateIsInScopedPath(filePath: string, scopedPath?: string) {
    if (!scopedPath || scopedPath === '.') {
      return false
    }

    return filePath === scopedPath || filePath.startsWith(`${scopedPath}${path.sep}`)
  }

  private getLatestSearchMatchesBySource() {
    const state = this.getCodingState()
    return state?.latestSearchMatchesBySource ?? {}
  }

  private rememberSearchMatches(source: CodingTargetSourceKind, files: string[], scopedTargetPath?: string) {
    const state = this.getCodingState()
    if (!state) {
      return
    }

    this.runtime.stateManager.updateCodingState({
      latestSearchMatchesBySource: {
        ...state.latestSearchMatchesBySource,
        [source]: files,
      },
      ...(scopedTargetPath !== undefined ? { lastScopedTargetPath: scopedTargetPath } : {}),
    })
  }

  private buildTargetCandidates(params: {
    explicitTargetFile?: string
    targetPath?: string
    targetSymbol?: string
    searchQuery?: string
  }): CodingTargetCandidate[] {
    const state = this.getCodingState()
    const recentReads = new Set((state?.recentReads || []).map(entry => entry.path))
    const recentEdits = new Set((state?.recentEdits || []).map(entry => entry.path))
    const scopedPath = this.deriveScopedPathForBonus(params.targetPath)

    interface AggregatedCandidate {
      filePath: string
      sourceCounts: Partial<Record<CodingTargetSourceKind, number>>
      sourceLabels: Partial<Record<CodingTargetSourceKind, string>>
      inScopedPath: boolean
      recentlyEdited: boolean
      recentlyRead: boolean
    }

    const candidates = new Map<string, AggregatedCandidate>()

    const ensureCandidate = (filePath: string) => {
      const existing = candidates.get(filePath)
      if (existing) {
        return existing
      }

      const next: AggregatedCandidate = {
        filePath,
        sourceCounts: {},
        sourceLabels: {},
        inScopedPath: this.candidateIsInScopedPath(filePath, scopedPath),
        recentlyEdited: recentEdits.has(filePath),
        recentlyRead: recentReads.has(filePath),
      }

      candidates.set(filePath, next)
      return next
    }

    const registerSource = (sourceKind: CodingTargetSourceKind, filePath: string, sourceLabel: string) => {
      const candidate = ensureCandidate(filePath)
      candidate.sourceCounts[sourceKind] = (candidate.sourceCounts[sourceKind] || 0) + 1
      candidate.sourceLabels[sourceKind] = sourceLabel
    }

    if (params.explicitTargetFile) {
      registerSource('explicit', params.explicitTargetFile, `explicit:${params.explicitTargetFile}`)
    }

    const latestMatchesBySource = this.getLatestSearchMatchesBySource()
    const sourceLabels: Partial<Record<CodingTargetSourceKind, string>> = {
      symbol: params.targetSymbol ? `symbol:${params.targetSymbol}` : 'symbol:latest',
      text: params.searchQuery ? `text:${params.searchQuery}` : 'text:latest',
      references: 'references:latest',
    }

    const activeSearchSources: CodingTargetSourceKind[] = []
    if (params.targetSymbol) {
      activeSearchSources.push('symbol', 'references')
    }
    if (params.searchQuery) {
      activeSearchSources.push('text')
    }

    ;(activeSearchSources as CodingTargetSourceKind[]).forEach((sourceKind) => {
      const sourceFiles = latestMatchesBySource[sourceKind] || []
      for (const filePath of sourceFiles) {
        registerSource(sourceKind, filePath, sourceLabels[sourceKind] || `${sourceKind}:latest`)
      }
    })

    const result: CodingTargetCandidate[] = []
    for (const entry of candidates.values()) {
      const sourceKinds = Object.keys(entry.sourceCounts) as CodingTargetSourceKind[]
      if (sourceKinds.length === 0) {
        continue
      }

      const bestSourceKind = sourceKinds.sort((a, b) => this.getSourcePriority(b) - this.getSourcePriority(a))[0]!
      const base = this.getSourcePriority(bestSourceKind)
      const score = base
        + (entry.inScopedPath ? 20 : 0)
        + (entry.recentlyEdited ? 2 : 0)
        + (entry.recentlyRead ? 1 : 0)

      const reasons: string[] = [`source=${bestSourceKind}(${base})`]
      if (entry.inScopedPath) {
        reasons.push('scoped_path(+20)')
      }
      if (entry.recentlyEdited) {
        reasons.push('recent_edit(+2)')
      }
      if (entry.recentlyRead) {
        reasons.push('recent_read(+1)')
      }

      result.push({
        filePath: entry.filePath,
        sourceKind: bestSourceKind,
        sourceLabel: entry.sourceLabels[bestSourceKind] || `${bestSourceKind}:latest`,
        score,
        matchCount: sourceKinds.reduce((sum, kind) => sum + (entry.sourceCounts[kind] || 0), 0),
        inScopedPath: entry.inScopedPath,
        recentlyEdited: entry.recentlyEdited,
        recentlyRead: entry.recentlyRead,
        reasons,
      })
    }

    return result.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
  }

  private resolveSearchRoot(targetPath?: string) {
    const workspaceRoot = this.getWorkspaceRoot()

    if (!targetPath) {
      return workspaceRoot
    }

    const absPath = path.resolve(workspaceRoot, targetPath)
    if (absPath !== workspaceRoot && !absPath.startsWith(`${workspaceRoot}${path.sep}`)) {
      throw new McpError(ErrorCode.InvalidParams, `Search targetPath ${targetPath} is outside workspace ${workspaceRoot}`)
    }

    return absPath
  }

  private runPlanGraphSingleSourceGate(params: {
    graph?: CodingPlanGraph
    mirrorSession?: CodingPlanSession
    context: string
  }): {
    graph?: CodingPlanGraph
    rebuilt: boolean
    rejected: boolean
    reasons: string[]
  } {
    const { graph, mirrorSession, context } = params
    if (!graph) {
      return {
        graph: undefined,
        rebuilt: false,
        rejected: false,
        reasons: [],
      }
    }

    const validation = validatePlanGraphInvariants(graph)
    if (validation.ok) {
      return {
        graph,
        rebuilt: false,
        rejected: false,
        reasons: [],
      }
    }

    const reasons = ('issues' in validation)
      ? validation.issues.slice(0, 8).map(issue => `${context}:${issue.code}`)
      : []

    if (mirrorSession && mirrorSession.id === graph.sessionId) {
      const rebuiltGraph = buildPlanGraphFromSession(mirrorSession)
      const rebuiltValidation = validatePlanGraphInvariants(rebuiltGraph)

      if (rebuiltValidation.ok) {
        return {
          graph: rebuiltGraph,
          rebuilt: true,
          rejected: false,
          reasons: [...reasons, `${context}:rebuilt_from_session`],
        }
      }

      return {
        graph: undefined,
        rebuilt: false,
        rejected: true,
        reasons: [
          ...reasons,
          ...(('issues' in rebuiltValidation)
            ? rebuiltValidation.issues.slice(0, 8).map(issue => `${context}:rebuilt_invalid:${issue.code}`)
            : []),
        ],
      }
    }

    return {
      graph: undefined,
      rebuilt: false,
      rejected: true,
      reasons,
    }
  }

  private getPlannerWorkflowSignal() {
    const state = this.getCodingState()
    const graphGate = this.runPlanGraphSingleSourceGate({
      graph: state?.currentPlanGraph,
      mirrorSession: state?.currentPlanSession,
      context: 'planner_workflow_signal',
    })
    const graph = graphGate.graph
    let frontier = state?.lastPlanFrontier
    const draft = state?.lastPlanDraft
    const plannerDecisionFile = state?.lastPlannerDecision?.selectedFile

    if (graphGate.rebuilt || graphGate.rejected) {
      this.runtime.stateManager.updateCodingState({
        currentPlanGraph: graph,
        ...(graphGate.rejected ? { lastPlanFrontier: undefined } : {}),
      })
      if (graphGate.rejected) {
        frontier = undefined
      }
    }

    const nodeById = new Map((graph?.nodes || []).map(node => [node.id, node]))
    const hasGraphNodes = nodeById.size > 0
    const frontierReferencesUnknownNode = Boolean(
      frontier
      && [...(frontier.readyNodeIds || []), ...(frontier.blockedNodeIds || [])].some(nodeId => !nodeById.has(nodeId)),
    )

    if (hasGraphNodes && (!frontier || frontierReferencesUnknownNode)) {
      frontier = computePlanFrontier(graph!)
      this.runtime.stateManager.updateCodingState({ lastPlanFrontier: frontier })
    }

    const readyFiles = (frontier?.readyNodeIds || [])
      .map(nodeId => nodeById.get(nodeId)?.filePath)
      .filter((filePath): filePath is string => Boolean(filePath))
    const blockedFiles = (frontier?.blockedNodeIds || [])
      .map(nodeId => nodeById.get(nodeId)?.filePath)
      .filter((filePath): filePath is string => Boolean(filePath))

    if (hasGraphNodes) {
      const runningFile = graph?.nodes.find(node => node.status === 'running')?.filePath
      if (runningFile) {
        return {
          selectedFile: runningFile,
          source: 'graph_running' as const,
          reason: `graph node ${runningFile} is currently running.`,
          readyFiles,
          blockedFiles,
        }
      }

      const plannerDecisionNodeStatus = plannerDecisionFile
        ? graph?.nodes.find(node => node.filePath === plannerDecisionFile)?.status
        : undefined
      const plannerDecisionIsExecutable = Boolean(
        plannerDecisionFile
        && (
          readyFiles.includes(plannerDecisionFile)
          || plannerDecisionNodeStatus === 'running'
          || plannerDecisionNodeStatus === 'ready'
        ),
      )
      if (plannerDecisionFile && plannerDecisionIsExecutable) {
        return {
          selectedFile: plannerDecisionFile,
          source: 'planner_decision' as const,
          reason: state?.lastPlannerDecision?.decisionReason || `planner selected ${plannerDecisionFile}`,
          readyFiles,
          blockedFiles,
        }
      }

      const frontierReadyFile = readyFiles[0]
      if (frontierReadyFile) {
        return {
          selectedFile: frontierReadyFile,
          source: 'frontier_ready' as const,
          reason: `frontier head selected ${frontierReadyFile}`,
          readyFiles,
          blockedFiles,
        }
      }

      return {
        selectedFile: undefined,
        source: undefined,
        reason: 'graph has no executable frontier node.',
        readyFiles,
        blockedFiles,
      }
    }

    if (plannerDecisionFile) {
      return {
        selectedFile: plannerDecisionFile,
        source: 'planner_decision' as const,
        reason: state?.lastPlannerDecision?.decisionReason || `planner selected ${plannerDecisionFile}`,
        readyFiles,
        blockedFiles,
      }
    }

    const draftFile = draft?.nodes.find(node => !blockedFiles.includes(node.filePath))?.filePath
      || draft?.nodes[0]?.filePath
    if (draftFile) {
      return {
        selectedFile: draftFile,
        source: 'plan_draft' as const,
        reason: `plan draft proposes ${draftFile}`,
        readyFiles,
        blockedFiles,
      }
    }

    return {
      selectedFile: undefined,
      source: undefined,
      reason: undefined,
      readyFiles,
      blockedFiles,
    }
  }

  private resolveTargetFileInput(filePath: string) {
    if (filePath !== 'auto') {
      return filePath
    }

    const codingState = this.getCodingState()
    const plannerWorkflowSignal = this.getPlannerWorkflowSignal()
    const selectedFile = codingState?.lastTargetSelection?.selectedFile

    if (
      selectedFile
      && plannerWorkflowSignal.selectedFile
      && plannerWorkflowSignal.selectedFile !== selectedFile
      && plannerWorkflowSignal.blockedFiles.includes(selectedFile)
      && !plannerWorkflowSignal.blockedFiles.includes(plannerWorkflowSignal.selectedFile)
    ) {
      return plannerWorkflowSignal.selectedFile
    }

    if (selectedFile) {
      return selectedFile
    }

    if (plannerWorkflowSignal.selectedFile) {
      return plannerWorkflowSignal.selectedFile
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      'targetFile is "auto" but no deterministic target is selected. Run coding_select_target first or provide targetFile explicitly.',
    )
  }

  private inferSelectionMissingInformation(params: {
    targetFile?: string
    targetPath?: string
    targetSymbol?: string
    searchQuery?: string
  }, candidates: CodingTargetCandidate[], status: 'ambiguous' | 'no_match') {
    const missing: string[] = []

    if (!params.targetFile && !params.targetSymbol) {
      missing.push('缺少 targetSymbol：提供符号名可区分 definition 与 callsite。')
    }

    if (!params.targetFile && !params.searchQuery) {
      missing.push('缺少 searchQuery：提供具体现象/报错片段可缩小候选。')
    }

    if (!params.targetPath) {
      missing.push('缺少 targetPath：提供子目录范围可降低跨模块歧义。')
    }

    if (status === 'ambiguous' && candidates.length > 1) {
      const top = candidates[0]!
      const second = candidates[1]!
      missing.push(`Top 候选 ${top.filePath} 与 ${second.filePath} 评分接近，请补充更细上下文（symbol/line/targetPath）。`)
    }

    if (status === 'no_match') {
      missing.push('当前证据不足，请先执行 coding_search_text / coding_search_symbol 生成候选。')
    }

    return Array.from(new Set(missing)).slice(0, 5)
  }

  private async fileExists(absolutePath: string) {
    try {
      await fs.access(absolutePath)
      return true
    }
    catch {
      return false
    }
  }

  private normalizeRelativePath(filePath: string) {
    return filePath.replace(/\\/g, '/')
  }

  private quoteForShell(value: string) {
    return `"${value.replace(/"/g, '\\"')}"`
  }

  private async findNearestScopedTestFile(filePath: string) {
    const normalized = this.normalizeRelativePath(filePath)
    if (!this.isJsTsSemanticPath(normalized)) {
      return undefined
    }

    if (this.isTestLikePath(normalized)) {
      return normalized
    }

    const ext = path.extname(normalized)
    const baseWithoutExt = normalized.slice(0, normalized.length - ext.length)
    const candidates = Array.from(new Set([
      `${baseWithoutExt}.test${ext}`,
      `${baseWithoutExt}.spec${ext}`,
      `${baseWithoutExt}.test.ts`,
      `${baseWithoutExt}.spec.ts`,
      `${baseWithoutExt}.test.tsx`,
      `${baseWithoutExt}.spec.tsx`,
      `${baseWithoutExt}.test.js`,
      `${baseWithoutExt}.spec.js`,
      `${baseWithoutExt}.test.mts`,
      `${baseWithoutExt}.spec.mts`,
      `${baseWithoutExt}.test.cts`,
      `${baseWithoutExt}.spec.cts`,
    ]))

    for (const relativeCandidate of candidates) {
      const absoluteCandidate = this.resolveWorkspacePath(relativeCandidate)
      if (await this.fileExists(absoluteCandidate)) {
        return relativeCandidate
      }
    }

    return undefined
  }

  async resolveScopedValidationCommand(currentFilePath?: string): Promise<CodingScopedValidationCommand> {
    const state = this.getCodingState()
    const plannerWorkflowSignal = this.getPlannerWorkflowSignal()
    const resolvedFilePath = currentFilePath
      || plannerWorkflowSignal.selectedFile
      || state?.lastTargetSelection?.selectedFile
    const plannerSourceNote = !currentFilePath && plannerWorkflowSignal.selectedFile
      ? ` (planner source: ${plannerWorkflowSignal.source || 'unknown'})`
      : ''

    const now = new Date().toISOString()

    if (!resolvedFilePath) {
      const fallback: CodingScopedValidationCommand = {
        command: 'pnpm typecheck',
        scope: 'workspace',
        reason: `No deterministic target file is selected; fallback to workspace-level typecheck.${plannerSourceNote}`,
        resolvedAt: now,
      }
      this.runtime.stateManager.updateCodingState({ lastScopedValidationCommand: fallback })
      return fallback
    }

    const normalizedFilePath = this.normalizeRelativePath(resolvedFilePath)
    const nearestTestFile = await this.findNearestScopedTestFile(normalizedFilePath)
    if (nearestTestFile) {
      const recommendation: CodingScopedValidationCommand = {
        command: `pnpm exec vitest run ${this.quoteForShell(nearestTestFile)}`,
        scope: 'file',
        reason: nearestTestFile === normalizedFilePath
          ? `Current file is test-like; run direct file-level test validation.${plannerSourceNote}`
          : `Found colocated test file ${nearestTestFile}; run file-level test validation.${plannerSourceNote}`,
        filePath: normalizedFilePath,
        resolvedAt: now,
      }
      this.runtime.stateManager.updateCodingState({ lastScopedValidationCommand: recommendation })
      return recommendation
    }

    if (this.isJsTsSemanticPath(normalizedFilePath)) {
      const recommendation: CodingScopedValidationCommand = {
        command: `pnpm exec eslint ${this.quoteForShell(normalizedFilePath)}`,
        scope: 'file',
        reason: `No colocated test found; use file-level lint validation to keep checkpoint scope minimal.${plannerSourceNote}`,
        filePath: normalizedFilePath,
        resolvedAt: now,
      }
      this.runtime.stateManager.updateCodingState({ lastScopedValidationCommand: recommendation })
      return recommendation
    }

    const fallback: CodingScopedValidationCommand = {
      command: 'pnpm typecheck',
      scope: 'workspace',
      reason: `Target file is non JS/TS semantic path; fallback to workspace typecheck.${plannerSourceNote}`,
      filePath: normalizedFilePath,
      resolvedAt: now,
    }
    this.runtime.stateManager.updateCodingState({ lastScopedValidationCommand: fallback })
    return fallback
  }

  private extractModuleSpecifiers(sourceText: string) {
    const specifiers: string[] = []
    const fromClause = /\bfrom\s+['"]([^'"\n]+)['"]/g
    const bareImportOrExport = /\b(?:import|export)\s+['"]([^'"\n]+)['"]/g
    const dynamicImport = /import\(\s*['"]([^'"\n]+)['"]\s*\)/g

    for (const match of sourceText.matchAll(fromClause)) {
      if (match[1]) {
        specifiers.push(match[1])
      }
    }

    for (const match of sourceText.matchAll(bareImportOrExport)) {
      if (match[1]) {
        specifiers.push(match[1])
      }
    }

    for (const match of sourceText.matchAll(dynamicImport)) {
      if (match[1]) {
        specifiers.push(match[1])
      }
    }

    return specifiers
  }

  private async resolveLocalModuleSpecifier(fromFilePath: string, specifier: string) {
    if (!specifier.startsWith('.')) {
      return undefined
    }

    const workspaceRoot = this.getWorkspaceRoot()
    const fromAbsolute = this.resolveWorkspacePath(fromFilePath)
    const fromDir = path.dirname(fromAbsolute)
    const raw = path.resolve(fromDir, specifier)

    const candidates = [
      raw,
      `${raw}.ts`,
      `${raw}.tsx`,
      `${raw}.js`,
      `${raw}.jsx`,
      `${raw}.mts`,
      `${raw}.cts`,
      path.join(raw, 'index.ts'),
      path.join(raw, 'index.tsx'),
      path.join(raw, 'index.js'),
      path.join(raw, 'index.jsx'),
      path.join(raw, 'index.mts'),
      path.join(raw, 'index.cts'),
    ]

    for (const absoluteCandidate of candidates) {
      const normalized = path.resolve(absoluteCandidate)
      if (normalized !== workspaceRoot && !normalized.startsWith(`${workspaceRoot}${path.sep}`)) {
        continue
      }

      if (await this.fileExists(normalized)) {
        return path.relative(workspaceRoot, normalized)
      }
    }

    return undefined
  }

  private async collectImportExportNeighbors(seedFiles: string[]) {
    const neighbors = new Set<string>()

    for (const filePath of seedFiles.slice(0, 20)) {
      if (!this.isJsTsSemanticPath(filePath)) {
        continue
      }

      let sourceText = ''
      try {
        sourceText = await fs.readFile(this.resolveWorkspacePath(filePath), 'utf8')
      }
      catch {
        continue
      }

      if (typeof sourceText !== 'string' || sourceText.length === 0) {
        continue
      }

      const specs = this.extractModuleSpecifiers(sourceText)
      for (const specifier of specs) {
        const resolved = await this.resolveLocalModuleSpecifier(filePath, specifier)
        if (resolved) {
          neighbors.add(resolved)
        }
      }
    }

    return Array.from(neighbors).slice(0, 20)
  }

  private sanitizeValidationOutput(output: string) {
    return output.replace(/\u001B\[[\d;]*[A-Z]/gi, '')
  }

  private normalizeFailureLine(line: string) {
    return this.sanitizeValidationOutput(line)
      .trim()
      .toLowerCase()
      .replace(/0x[\da-f]+/gi, '0x#')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
  }

  private buildFailureSignature(output: string) {
    const sanitized = this.sanitizeValidationOutput(output)
    const lines = sanitized
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      return undefined
    }

    const signalLines = lines.filter(line => /error|fail|exception|assert|expect\(|received|expected|traceback|panic|^at\s/i.test(line))
    const signatureLines = (signalLines.length > 0 ? signalLines : lines)
      .slice(0, 6)
      .map(line => this.normalizeFailureLine(line))
      .filter(Boolean)

    if (signatureLines.length === 0) {
      return undefined
    }

    return this.clampString(signatureLines.join(' | '))
  }

  private extractFailingTests(output: string) {
    const sanitized = this.sanitizeValidationOutput(output)
    const lines = sanitized
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)

    const tests = new Set<string>()
    for (const line of lines) {
      const failTokenMatch = line.match(/(?:FAIL|✕|×)\s+(.+)/i)
      if (failTokenMatch?.[1]) {
        tests.add(this.normalizeFailureLine(failTokenMatch[1]))
      }

      const fileCaseMatch = line.match(/(\S+\.(?:test|spec)\.[cm]?[jt]s\S*)/i)
      if (fileCaseMatch?.[1] && /fail|error|[>✕×]/i.test(line)) {
        tests.add(this.normalizeFailureLine(fileCaseMatch[1]))
      }
    }

    return Array.from(tests).slice(0, 20)
  }

  private computeTestSetSimilarity(baselineTests: string[], currentTests: string[]) {
    if (baselineTests.length === 0 || currentTests.length === 0) {
      return 0
    }

    const baselineSet = new Set(baselineTests)
    const currentSet = new Set(currentTests)
    let intersection = 0
    for (const item of baselineSet) {
      if (currentSet.has(item)) {
        intersection += 1
      }
    }

    return intersection / Math.max(1, baselineSet.size)
  }

  private inferBaselineComparison(params: {
    latestTerminalResult: ReturnType<CodingPrimitives['getLatestTerminalResult']>
    baseline?: CodingValidationBaseline
    currentValidationOutput: string
    currentDiffFiles: string[]
  }): 'new_red' | 'baseline_noise' | 'unknown' {
    const {
      latestTerminalResult,
      baseline,
      currentValidationOutput,
      currentDiffFiles,
    } = params

    if (!latestTerminalResult || latestTerminalResult.exitCode === 0) {
      return 'unknown'
    }

    if (!baseline || baseline.baselineFailingChecks.length === 0) {
      return 'new_red'
    }

    const normalizedCommand = latestTerminalResult.command.trim().toLowerCase()
    const baselineCommandMatched = baseline.baselineFailingChecks.some((entry) => {
      const commandPart = entry.split('(exit ')[0]?.trim().toLowerCase() || ''
      return commandPart.length > 0 && (normalizedCommand.includes(commandPart) || commandPart.includes(normalizedCommand))
    })

    if (!baselineCommandMatched) {
      return 'new_red'
    }

    const currentFailureSignature = this.buildFailureSignature(currentValidationOutput)
    const baselineFailureSignature = baseline.baselineFailureSignature
    const signatureMatched = Boolean(
      currentFailureSignature
      && baselineFailureSignature
      && currentFailureSignature === baselineFailureSignature,
    )

    if (signatureMatched) {
      return 'baseline_noise'
    }

    const baselineFailingTests = baseline.baselineFailingTests || []
    const currentFailingTests = this.extractFailingTests(currentValidationOutput)
    const testSetSimilarity = this.computeTestSetSimilarity(baselineFailingTests, currentFailingTests)
    const testSetMatched = testSetSimilarity >= 0.6

    const baselineDirtyFiles = new Set(baseline.baselineDirtyFiles || [])
    const hasNewDirtyFiles = currentDiffFiles.some(file => !baselineDirtyFiles.has(file))
    const diffWithinBaseline = !hasNewDirtyFiles

    if (testSetMatched && diffWithinBaseline) {
      return 'baseline_noise'
    }

    if (!diffWithinBaseline) {
      return 'new_red'
    }

    if (
      baselineFailingTests.length === 0
      && currentFailingTests.length === 0
      && !baselineFailureSignature
      && !currentFailureSignature
    ) {
      return 'unknown'
    }

    return 'new_red'
  }

  private findDiffEscapeFiles(currentDiffFiles: string[], baseline?: CodingValidationBaseline) {
    if (!baseline) {
      return []
    }

    const baselineDirtyFiles = new Set(baseline.baselineDirtyFiles || [])
    return currentDiffFiles.filter(file => !baselineDirtyFiles.has(file)).slice(0, 10)
  }

  private isLikelyTestOnlyBreakage(validationOutput: string) {
    return /assert|expect\(|snapshot|golden|toequal|tomatch|test failed|spec failed/i.test(validationOutput)
  }

  private extractTouchedSymbolsFromPatch(diffPatchExcerpt: string) {
    if (!diffPatchExcerpt) {
      return []
    }

    const lines = diffPatchExcerpt
      .split(/\r?\n/)
      .filter((line) => {
        if (line.startsWith('+++') || line.startsWith('---')) {
          return false
        }
        return line.startsWith('+') || line.startsWith('-')
      })

    const identifiers = new Set<string>()
    for (const line of lines) {
      const matches = line.match(/\b\w{3,}\b/g) || []
      for (const token of matches) {
        const normalized = token.trim()
        if (!normalized) {
          continue
        }
        if (!/^[a-z_]/i.test(normalized)) {
          continue
        }
        if (/^(?:const|let|var|function|return|import|from|export|class|extends|if|else|for|while|switch|case|break|continue|new|await|async|true|false|null|undefined)$/.test(normalized)) {
          continue
        }
        identifiers.add(normalized)
      }
    }

    return Array.from(identifiers).slice(0, 20)
  }

  private buildCausalHints(params: {
    affectedFiles: string[]
    validationOutput: string
    touchedSymbols: string[]
    impact?: CodingImpactAnalysis
  }) {
    const hints = new Set<string>()
    const validationOutput = params.validationOutput || ''
    const validationLower = validationOutput.toLowerCase()

    for (const symbol of params.touchedSymbols) {
      if (validationLower.includes(symbol.toLowerCase())) {
        hints.add(`validation_mentions_symbol:${symbol}`)
      }
    }

    for (const file of params.affectedFiles) {
      if (validationOutput.includes(file)) {
        hints.add(`validation_mentions_file:${file}`)
      }
    }

    const impact = params.impact
    if (impact) {
      const companionSet = new Set(impact.likelyCompanionFiles || [])
      const testsSet = new Set(impact.likelyImpactedTests || [])
      for (const file of params.affectedFiles) {
        if (companionSet.has(file)) {
          hints.add(`file_in_impact_companions:${file}`)
        }
        if (testsSet.has(file)) {
          hints.add(`file_in_impact_tests:${file}`)
        }
      }
    }

    return Array.from(hints).slice(0, 12)
  }

  private inferRecommendedRepairWindow(params: {
    rootCauseType: CodingChangeDiagnosis['rootCauseType']
    currentFilePath?: string
    affectedFiles: string[]
    impact?: CodingImpactAnalysis
    currentPlanSession?: CodingPlanSession
  }): NonNullable<CodingChangeDiagnosis['recommendedRepairWindow']> {
    const { rootCauseType, currentFilePath, affectedFiles, impact, currentPlanSession } = params
    const companionSlice = [
      ...(currentFilePath ? [currentFilePath] : []),
      ...((impact?.likelyCompanionFiles || []).slice(0, 3)),
    ]

    switch (rootCauseType) {
      case 'wrong_target':
      case 'incomplete_change':
      case 'test_only_breakage':
        return {
          scope: 'current_file',
          files: this.clampStringArray(currentFilePath ? [currentFilePath] : affectedFiles.slice(0, 1)),
          reason: 'Repair should stay localized to the currently selected file before widening scope.',
        }
      case 'missed_dependency':
        return {
          scope: 'dependency_slice',
          files: this.clampStringArray(companionSlice.length > 0 ? companionSlice : affectedFiles.slice(0, 3)),
          reason: 'Repair should cover current file plus nearest dependency companions indicated by impact evidence.',
        }
      case 'baseline_noise':
      case 'validation_command_mismatch':
        return {
          scope: 'plan_window',
          files: this.clampStringArray((currentPlanSession?.steps || []).map(step => step.filePath).slice(0, 3)),
          reason: 'Repair should stay within current planned window and avoid expanding target surface.',
        }
      case 'validation_environment_issue':
        return {
          scope: 'workspace',
          files: this.clampStringArray(affectedFiles.slice(0, 3)),
          reason: 'Environment-level failure requires workspace-wide remediation before code-level retries.',
        }
      default:
        return {
          scope: 'plan_window',
          files: this.clampStringArray(affectedFiles.slice(0, 3)),
          reason: 'Insufficient certainty; keep repair bounded to current plan window.',
        }
    }
  }

  private buildDiagnosisJudgeInput(params: {
    state: NonNullable<ReturnType<CodingPrimitives['getCodingState']>>
    review: CodingChangeReview
    currentFilePath?: string
    touchedSymbols: string[]
    confidenceBreakdown: CodingDiagnosisConfidenceBreakdown
    competition: CodingDiagnosisCompetition
    evidenceMatrix: DiagnosisEvidence
  }): CodingDiagnosisJudgeInput {
    const {
      state,
      review,
      currentFilePath,
      touchedSymbols,
      confidenceBreakdown,
      competition,
      evidenceMatrix,
    } = params

    const sessionStep = currentFilePath
      ? state.currentPlanSession?.steps.find(step => step.filePath === currentFilePath)
      : undefined
    const planStep = currentFilePath
      ? state.currentPlan?.steps.find(step => step.filePath === currentFilePath)
      : undefined

    const taskIntent = state.currentPlanSession?.changeIntent
      || state.lastTargetSelection?.changeIntent
      || 'behavior_fix'

    return {
      preparedAt: new Date().toISOString(),
      taskIntent,
      currentFilePath,
      currentPlanStep: sessionStep || planStep
        ? {
            filePath: (sessionStep?.filePath || planStep?.filePath)!,
            status: String(sessionStep?.status || planStep?.status || 'unknown'),
            dependsOn: [...(sessionStep?.dependsOn || planStep?.dependsOn || [])],
            checkpoint: String(sessionStep?.checkpoint || planStep?.checkpoint || ''),
          }
        : undefined,
      diffSummary: this.clampString(review.diffSummary || ''),
      touchedSymbols: this.clampStringArray(touchedSymbols),
      impactedCompanions: this.clampStringArray(state.lastImpactAnalysis?.likelyCompanionFiles || []),
      failingTests: this.clampStringArray(evidenceMatrix.failingTests || []),
      stderrSignature: evidenceMatrix.stderrSignature,
      baselineComparison: review.baselineComparison || 'unknown',
      scopedValidationCommand: state.lastScopedValidationCommand?.command,
      candidateRootCauses: confidenceBreakdown.candidateScores.slice(0, 6).map(candidate => ({
        rootCauseType: candidate.rootCauseType,
        score: Number(candidate.score.toFixed(3)),
        signals: this.clampStringArray(candidate.signals),
      })),
      competition: {
        winner: {
          rootCauseType: competition.winner.rootCauseType,
          score: Number(competition.winner.score.toFixed(3)),
          signals: this.clampStringArray(competition.winner.signals),
        },
        runnerUp: {
          rootCauseType: competition.runnerUp.rootCauseType,
          score: Number(competition.runnerUp.score.toFixed(3)),
          signals: this.clampStringArray(competition.runnerUp.signals),
        },
        whyNotRunnerUp: this.clampString(competition.whyNotRunnerUpReason),
      },
    }
  }

  private buildReplanDraftInput(params: {
    state: NonNullable<ReturnType<CodingPrimitives['getCodingState']>>
    diagnosis: CodingChangeDiagnosis
    currentFilePath?: string
    plannerDecision?: CodingPlannerDecision
  }): CodingReplanDraftInput {
    const {
      state,
      diagnosis,
      currentFilePath,
      plannerDecision,
    } = params

    const session = state.currentPlanSession
    const plan = state.currentPlan
    const maxFiles = session?.maxFiles || plan?.maxPlannedFiles || 1
    const filesUsed = session?.steps.length || plan?.steps.length || 0
    const maxAmendCount = session?.maxAmendCount || 0
    const amendUsed = session?.amendCount || 0
    const maxBacktrackCount = session?.maxBacktrackCount || 0
    const backtrackUsed = session?.backtrackCount || 0

    const referenceFiles = Array.from(new Set((state.lastImpactAnalysis?.directReferences || []).map(reference => reference.file)))
    const candidateNextFiles = (plannerDecision?.candidateScores || []).slice(0, 6).map(candidate => ({
      filePath: candidate.filePath,
      status: candidate.status,
      score: Number(candidate.score.toFixed(3)),
      reasons: this.clampStringArray(candidate.reasons),
    }))

    return {
      preparedAt: new Date().toISOString(),
      taskIntent: session?.changeIntent || state.lastTargetSelection?.changeIntent || 'behavior_fix',
      currentTarget: plannerDecision?.selectedFile || currentFilePath || state.lastTargetSelection?.selectedFile,
      diagnosis: {
        rootCauseType: diagnosis.rootCauseType,
        nextAction: diagnosis.nextAction,
        confidence: Number(diagnosis.confidence.toFixed(3)),
      },
      planBudget: {
        maxFiles,
        filesUsed,
        maxAmendCount,
        amendUsed,
        maxBacktrackCount,
        backtrackUsed,
      },
      dependencyHints: {
        impactedCompanions: this.clampStringArray(state.lastImpactAnalysis?.likelyCompanionFiles || []),
        referenceFiles: this.clampStringArray(referenceFiles),
        likelyTests: this.clampStringArray(state.lastImpactAnalysis?.likelyImpactedTests || []),
      },
      candidateNextFiles,
    }
  }

  private isLikelyValidationCommandMismatch(command: string | undefined, risks: Set<CodingReviewRisk>) {
    if (risks.has('no_validation_run')) {
      return true
    }

    if (!command) {
      return true
    }

    const normalized = command.trim().toLowerCase()
    if (!normalized) {
      return true
    }

    const validationHint = /test|vitest|jest|mocha|ava|pytest|go test|cargo test|grep -q|pnpm test|npm test/i
    const obviousNoop = /^(?:echo\s+.+|pwd|ls(?:\s|$)|cat\s+)/i

    if (obviousNoop.test(normalized)) {
      return true
    }

    return !validationHint.test(normalized)
  }

  private shouldPreferTestDependency(changeIntent: CodingChangeIntent, validationOutput: string) {
    if (changeIntent === 'test_fix') {
      return true
    }

    return /\.test\.|\.spec\.|expect\(|assert|received|expected/i.test(validationOutput)
  }

  private pickMissedDependencyCandidate(params: {
    state: NonNullable<ReturnType<CodingPrimitives['getCodingState']>
    >
    currentSession: CodingPlanSession
    currentFilePath?: string
    validationOutput: string
  }) {
    const {
      state,
      currentSession,
      currentFilePath,
      validationOutput,
    } = params

    const existing = new Set(currentSession.steps.map(step => step.filePath))
    const currentDir = currentFilePath ? path.dirname(currentFilePath) : undefined
    const prefersTestDependency = this.shouldPreferTestDependency(currentSession.changeIntent, validationOutput)
    const validationLower = validationOutput.toLowerCase()

    interface RankedDependencyCandidate {
      filePath: string
      source: string
      score: number
      reasons: string[]
    }

    const ranked = new Map<string, RankedDependencyCandidate>()
    const upsert = (filePath: string, source: string, baseScore: number, reason: string) => {
      if (!filePath || existing.has(filePath)) {
        return
      }
      if (currentFilePath && filePath === currentFilePath) {
        return
      }

      const normalizedFilePath = this.normalizeRelativePath(filePath)
      let score = baseScore

      if (currentDir && path.dirname(normalizedFilePath) === currentDir) {
        score += 10
      }

      if (validationLower.includes(normalizedFilePath.toLowerCase())) {
        score += 25
      }

      const isTestDependency = this.isTestLikePath(normalizedFilePath)
      if (isTestDependency && !prefersTestDependency) {
        score -= 15
      }

      const existingRank = ranked.get(normalizedFilePath)
      if (!existingRank || score > existingRank.score) {
        ranked.set(normalizedFilePath, {
          filePath: normalizedFilePath,
          source,
          score,
          reasons: [reason],
        })
      }
      else {
        existingRank.reasons.push(reason)
      }
    }

    for (const reference of state.lastImpactAnalysis?.directReferences || []) {
      upsert(reference.file, 'impact_direct_reference', 120, 'ranked_from_direct_reference')
    }

    for (const companionFile of state.lastImpactAnalysis?.likelyCompanionFiles || []) {
      upsert(companionFile, 'impact_companion', 100, 'ranked_from_companion')
    }

    for (const impactedTest of state.lastImpactAnalysis?.likelyImpactedTests || []) {
      upsert(impactedTest, 'impact_test', 70, 'ranked_from_impacted_test')
    }

    for (const selectionCandidate of state.lastTargetSelection?.candidates || []) {
      const sourceScoreByKind: Record<CodingTargetSourceKind, number> = {
        explicit: 50,
        symbol: 65,
        text: 60,
        references: 55,
      }
      upsert(
        selectionCandidate.filePath,
        `selection_${selectionCandidate.sourceKind}`,
        sourceScoreByKind[selectionCandidate.sourceKind],
        `ranked_from_selection_${selectionCandidate.sourceKind}`,
      )
    }

    const rankedList = Array.from(ranked.values())
      .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))

    return rankedList[0]
  }

  private inferAutoNextStepRecommendation() {
    const plannerDecision = this.getCodingState()?.lastPlannerDecision
    if (plannerDecision?.decisionReason) {
      return plannerDecision.decisionReason
    }

    const plannerWorkflowSignal = this.getPlannerWorkflowSignal()
    if (plannerWorkflowSignal.selectedFile) {
      return plannerWorkflowSignal.reason || `Proceed with ${plannerWorkflowSignal.selectedFile}.`
    }

    const review = this.getCodingState()?.lastChangeReview
    if (review?.recommendedNextAction) {
      return review.recommendedNextAction
    }

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

  private derivePendingIssues(codingState = this.getCodingState()) {
    const issues: string[] = []
    const latestTerminalResult = this.getLatestTerminalResult()
    const state = codingState

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

    if (state?.lastChangeReview?.detectedRisks?.length) {
      issues.push(...state.lastChangeReview.detectedRisks.map(risk => `Review risk: ${risk}`))
    }

    return issues
  }

  private inferAutoReportStatus(): 'completed' | 'in_progress' | 'blocked' | 'failed' {
    const state = this.getCodingState()
    const diagnosis = state?.lastChangeDiagnosis
    if (diagnosis) {
      if (diagnosis.shouldAbortPlan || diagnosis.nextAction === 'abort') {
        return 'failed'
      }

      if (diagnosis.nextAction === 'amend' || diagnosis.nextAction === 'continue') {
        return 'in_progress'
      }
    }

    const review = state?.lastChangeReview
    const plannerWorkflowSignal = this.getPlannerWorkflowSignal()
    const hasPendingPlanStep = (state?.currentPlan?.steps || []).some(step => step.status === 'pending')
    const hasUnfinishedSessionStep = (state?.currentPlanSession?.steps || [])
      .some(step => step.status !== 'validated' && step.status !== 'abandoned')
    const hasGraphWork = (state?.currentPlanGraph?.nodes || [])
      .some(node => node.status !== 'validated' && node.status !== 'aborted')
    const hasPendingPlannerWork = hasPendingPlanStep
      || hasUnfinishedSessionStep
      || hasGraphWork
      || plannerWorkflowSignal.readyFiles.length > 0

    if (review) {
      if (review.status === 'failed') {
        return 'failed'
      }

      if (review.status === 'blocked') {
        return 'blocked'
      }

      if (review.status === 'needs_follow_up') {
        return 'in_progress'
      }

      return hasPendingPlannerWork ? 'in_progress' : 'completed'
    }

    const latestTerminalResult = this.getLatestTerminalResult()

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
    const state = this.getCodingState()
    const review = state?.lastChangeReview
    const diagnosis = state?.lastChangeDiagnosis
    const plannerDecision = state?.lastPlannerDecision
    const plannerWorkflowSignal = this.getPlannerWorkflowSignal()
    const diagnosisCompetition = diagnosis?.confidenceBreakdown?.competition || state?.lastDiagnosisCompetition
    if (diagnosis) {
      const winnerReason = diagnosisCompetition?.winnerReason
      const plannerReason = status === 'in_progress' ? plannerDecision?.decisionReason : undefined
      if (winnerReason) {
        return `Diagnosis root cause is ${diagnosis.rootCauseType}; nextAction=${diagnosis.nextAction}; winnerReason=${winnerReason}${plannerReason ? `; plannerReason=${plannerReason}` : ''}.`
      }

      return `Diagnosis root cause is ${diagnosis.rootCauseType}; nextAction=${diagnosis.nextAction}.`
    }

    if (status === 'in_progress' && plannerDecision?.decisionReason) {
      return `Planner selected ${plannerDecision.selectedFile}: ${plannerDecision.decisionReason}`
    }

    if (status === 'in_progress' && plannerWorkflowSignal.selectedFile) {
      return `Planner workflow selected ${plannerWorkflowSignal.selectedFile} via ${plannerWorkflowSignal.source || 'unknown'}: ${plannerWorkflowSignal.reason || 'no reason provided'}.`
    }

    if (review) {
      const riskSummary = review.detectedRisks.length > 0
        ? ` Risks: ${review.detectedRisks.join(', ')}.`
        : ''
      return `Review status is ${review.status}.${riskSummary}`
    }

    const latestTerminalResult = this.getLatestTerminalResult()
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
    const plannerDecision = this.getCodingState()?.lastPlannerDecision
    if (status === 'in_progress' && plannerDecision?.decisionReason) {
      return plannerDecision.decisionReason
    }

    const plannerWorkflowSignal = this.getPlannerWorkflowSignal()
    if (status === 'in_progress' && plannerWorkflowSignal.selectedFile) {
      return plannerWorkflowSignal.reason || `Proceed with ${plannerWorkflowSignal.selectedFile}.`
    }

    const diagnosis = this.getCodingState()?.lastChangeDiagnosis
    if (diagnosis?.recommendedAction) {
      return diagnosis.recommendedAction
    }

    const review = this.getCodingState()?.lastChangeReview
    if (review?.recommendedNextAction) {
      return review.recommendedNextAction
    }

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
    const isSameWorkspace = state?.workspacePath === workspacePath
    const nextCodingState = {
      workspacePath,
      gitSummary,
      recentReads: isSameWorkspace ? state?.recentReads ?? [] : [],
      recentEdits: isSameWorkspace ? state?.recentEdits ?? [] : [],
      recentCommandResults: isSameWorkspace ? state?.recentCommandResults ?? [] : [],
      recentSearches: isSameWorkspace ? state?.recentSearches ?? [] : [],
      pendingIssues: [] as string[],
      latestSearchMatchesBySource: isSameWorkspace ? state?.latestSearchMatchesBySource ?? {} : {},
      targetCandidates: isSameWorkspace ? state?.targetCandidates : undefined,
      lastTargetSelection: isSameWorkspace ? state?.lastTargetSelection : undefined,
      currentPlan: isSameWorkspace ? state?.currentPlan : undefined,
      lastChangeReview: isSameWorkspace ? state?.lastChangeReview : undefined,
      lastScopedTargetPath: isSameWorkspace ? state?.lastScopedTargetPath : undefined,
      lastCompressedContext: isSameWorkspace ? state?.lastCompressedContext : undefined,
      lastCodingReport: isSameWorkspace ? state?.lastCodingReport : undefined,
      lastValidationSummary: isSameWorkspace ? state?.lastValidationSummary : undefined,
      lastImpactAnalysis: isSameWorkspace ? state?.lastImpactAnalysis : undefined,
      impactGraphSnapshot: isSameWorkspace ? state?.impactGraphSnapshot : undefined,
      lastTargetHypothesis: isSameWorkspace ? state?.lastTargetHypothesis : undefined,
      currentPlanSession: isSameWorkspace ? state?.currentPlanSession : undefined,
      lastInvestigation: isSameWorkspace ? state?.lastInvestigation : undefined,
      planHistory: isSameWorkspace ? state?.planHistory : undefined,
      lastChangeDiagnosis: isSameWorkspace ? state?.lastChangeDiagnosis : undefined,
      lastDiagnosisCompetition: isSameWorkspace ? state?.lastDiagnosisCompetition : undefined,
      lastDiagnosisJudgeInput: isSameWorkspace ? state?.lastDiagnosisJudgeInput : undefined,
      lastReplanDraftInput: isSameWorkspace ? state?.lastReplanDraftInput : undefined,
      currentPlanGraph: isSameWorkspace ? state?.currentPlanGraph : undefined,
      lastPlanFrontier: isSameWorkspace ? state?.lastPlanFrontier : undefined,
      lastPlanDraft: isSameWorkspace ? state?.lastPlanDraft : undefined,
      lastTargetDecisionCase: isSameWorkspace ? state?.lastTargetDecisionCase : undefined,
      lastTargetJudgement: isSameWorkspace ? state?.lastTargetJudgement : undefined,
      lastDiagnosisCase: isSameWorkspace ? state?.lastDiagnosisCase : undefined,
      lastDiagnosisJudgement: isSameWorkspace ? state?.lastDiagnosisJudgement : undefined,
      validationBaseline: isSameWorkspace ? state?.validationBaseline : undefined,
      lastPlannerDecision: isSameWorkspace ? state?.lastPlannerDecision : undefined,
      compactionMeta: isSameWorkspace ? state?.compactionMeta : undefined,
      roundContext: isSameWorkspace ? state?.roundContext : undefined,
    }
    const pendingIssues = this.derivePendingIssues(nextCodingState)

    this.runtime.stateManager.updateCodingState({
      ...nextCodingState,
      pendingIssues,
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
  async searchText(query: string, targetPath?: string, glob?: string, limit?: number) {
    const workspaceRoot = this.getWorkspaceRoot()
    const searchRoot = this.resolveSearchRoot(targetPath)
    const effectiveLimit = clampSearchLimit(limit)
    const result = await searchText(workspaceRoot, query, {
      searchRoot,
      glob,
      limit: effectiveLimit,
    })

    const uniqueCandidateFiles = Array.from(new Set(result.matches.map(match => match.file)))

    // Add to recent searches
    const state = this.runtime.stateManager.getState().coding
    if (state) {
      const summary = `Text search: "${query}" (glob: ${glob || 'all'})`
      this.runtime.stateManager.updateCodingState({
        recentSearches: [...(state.recentSearches || []), summary].slice(-5),
      })
      this.rememberSearchMatches('text', uniqueCandidateFiles, targetPath)
    }

    return result
  }

  async searchSymbol(symbolName: string, targetPath?: string, glob?: string, limit?: number) {
    const workspaceRoot = this.getWorkspaceRoot()
    const searchRoot = this.resolveSearchRoot(targetPath)
    const effectiveLimit = clampSearchLimit(limit)
    const result = await searchSymbol(workspaceRoot, symbolName, {
      searchRoot,
      glob,
      limit: effectiveLimit,
    })

    const matches = Array.isArray(result.matches) ? result.matches : []
    const uniqueCandidateFiles = Array.from(new Set(matches.map(match => match.file)))

    const state = this.runtime.stateManager.getState().coding
    if (state) {
      const summary = `Symbol search: "${symbolName}"`
      this.runtime.stateManager.updateCodingState({
        recentSearches: [...(state.recentSearches || []), summary].slice(-5),
      })
      this.rememberSearchMatches('symbol', uniqueCandidateFiles, targetPath)
    }

    return result
  }

  async findReferences(filePath: string, line: number, column: number, limit?: number) {
    const resolvedFilePath = this.resolveTargetFileInput(filePath)
    const root = this.getWorkspaceRoot()
    const effectiveLimit = clampSearchLimit(limit)
    const state = this.runtime.stateManager.getState().coding
    if (state) {
      const summary = `Find references: ${resolvedFilePath}:${line}:${column}`
      this.runtime.stateManager.updateCodingState({
        recentSearches: [...(state.recentSearches || []), summary].slice(-5),
      })
    }

    const result = await findReferences(root, resolvedFilePath, line, column, effectiveLimit)
    const matches = Array.isArray(result.matches) ? result.matches : []
    const uniqueCandidateFiles = Array.from(new Set(matches.map(match => match.file)))
    this.rememberSearchMatches('references', uniqueCandidateFiles)
    return result
  }

  private isJsTsSemanticPath(filePath: string) {
    const normalized = filePath.toLowerCase()
    return normalized.endsWith('.ts')
      || normalized.endsWith('.tsx')
      || normalized.endsWith('.js')
      || normalized.endsWith('.jsx')
      || normalized.endsWith('.mts')
      || normalized.endsWith('.cts')
  }

  private isTestLikePath(filePath: string) {
    const normalized = filePath.toLowerCase()
    return normalized.includes('__tests__')
      || normalized.includes('/test/')
      || normalized.includes('/tests/')
      || normalized.endsWith('.test.ts')
      || normalized.endsWith('.test.tsx')
      || normalized.endsWith('.test.js')
      || normalized.endsWith('.test.jsx')
      || normalized.endsWith('.spec.ts')
      || normalized.endsWith('.spec.tsx')
      || normalized.endsWith('.spec.js')
      || normalized.endsWith('.spec.jsx')
  }

  private inferTargetKindFromPath(filePath: string): CodingTargetKind {
    const normalized = filePath.toLowerCase()
    if (this.isTestLikePath(normalized)) {
      return 'test'
    }
    if (normalized.includes('config') || normalized.includes('setting') || normalized.endsWith('.env') || normalized.endsWith('.json')) {
      return 'config'
    }
    if (normalized.includes('index') || normalized.includes('register') || normalized.includes('router') || normalized.includes('bootstrap') || normalized.includes('main') || normalized.includes('entry')) {
      return 'wiring'
    }
    if (normalized.includes('call') || normalized.includes('handler') || normalized.includes('controller') || normalized.includes('service') || normalized.includes('use-')) {
      return 'callsite'
    }
    return 'definition'
  }

  private inferArchitectureLayerFromPath(filePath: string): CodingArchitectureLayer {
    const normalized = filePath.toLowerCase()
    if (this.isTestLikePath(normalized)) {
      return 'test'
    }
    if (normalized.includes('/store/') || normalized.includes('/stores/') || normalized.includes('pinia') || normalized.includes('state')) {
      return 'store'
    }
    if (normalized.includes('schema') || normalized.includes('validator') || normalized.includes('validation') || normalized.includes('valibot') || normalized.includes('zod') || normalized.includes('eslint') || normalized.includes('vitest')) {
      return 'validation'
    }
    if (normalized.includes('protocol') || normalized.includes('rpc') || normalized.includes('ipc') || normalized.includes('/api/') || normalized.includes('/sdk/') || normalized.includes('contract')) {
      return 'protocol'
    }
    if (normalized.includes('component') || normalized.includes('/ui/') || normalized.includes('/pages/') || normalized.includes('/layouts/') || normalized.endsWith('.vue') || normalized.endsWith('.tsx') || normalized.endsWith('.jsx')) {
      return 'ui'
    }
    return 'unknown'
  }

  private inferIntentDecomposition(changeIntent?: CodingChangeIntent): CodingIntentDecomposition {
    switch (changeIntent || 'behavior_fix') {
      case 'behavior_fix':
        return 'bugfix'
      case 'refactor':
        return 'refactor'
      case 'api_change':
        return 'api_change'
      case 'config_change':
        return 'wiring'
      case 'test_fix':
        return 'test_only'
    }
  }

  private targetKindAffinity(kind: CodingTargetKind, intent: CodingChangeIntent) {
    switch (intent) {
      case 'behavior_fix':
        return kind === 'definition' || kind === 'callsite' ? 30 : kind === 'test' ? 12 : 6
      case 'refactor':
        return kind === 'definition' || kind === 'wiring' ? 30 : kind === 'callsite' ? 18 : 6
      case 'api_change':
        return kind === 'definition' || kind === 'wiring' ? 32 : kind === 'callsite' ? 16 : 5
      case 'config_change':
        return kind === 'config' ? 34 : kind === 'wiring' ? 12 : 4
      case 'test_fix':
        return kind === 'test' ? 34 : kind === 'callsite' ? 14 : 4
    }
  }

  private buildTargetHypotheses(params: {
    candidates: CodingTargetCandidate[]
    changeIntent: CodingChangeIntent
    impact?: CodingImpactAnalysis
  }) {
    const { candidates, changeIntent, impact } = params
    const symbolOwnerFile = impact?.symbolOwner?.definitionFile
    const references = new Set((impact?.directReferences || []).map(item => item.file))

    const hypotheses: CodingTargetHypothesis[] = candidates.map((candidate, index) => {
      const targetKind = this.inferTargetKindFromPath(candidate.filePath)
      const evidence: string[] = [...candidate.reasons]
      let score = candidate.score

      const intentBonus = this.targetKindAffinity(targetKind, changeIntent)
      score += intentBonus
      evidence.push(`intent_affinity(+${intentBonus})`)

      if (symbolOwnerFile && candidate.filePath === symbolOwnerFile) {
        score += 36
        evidence.push('symbol_owner(+36)')
      }

      if (references.has(candidate.filePath)) {
        score += 8
        evidence.push('direct_reference(+8)')
      }

      const confidence = Math.max(0.05, Math.min(0.99, score / 500))

      return {
        id: `hyp_${index + 1}`,
        filePath: candidate.filePath,
        targetKind,
        changeIntent,
        score,
        confidence,
        evidence,
      }
    }).sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))

    return hypotheses
  }

  private buildTargetCompetitionFromCandidates(candidates: CodingTargetCandidate[]): CodingTargetCompetition | undefined {
    const winner = candidates[0]
    if (!winner) {
      return undefined
    }

    const runnerUp = candidates[1]
    const winnerKind = this.inferTargetKindFromPath(winner.filePath)
    const runnerKind = runnerUp ? this.inferTargetKindFromPath(runnerUp.filePath) : undefined

    return {
      winner: {
        filePath: winner.filePath,
        score: winner.score || 0,
        targetKind: winnerKind,
        evidenceChain: [...(Array.isArray(winner.reasons) ? winner.reasons : [])],
      },
      runnerUp: runnerUp
        ? {
            filePath: runnerUp.filePath,
            score: runnerUp.score || 0,
            targetKind: runnerKind!,
            evidenceChain: [...(Array.isArray(runnerUp.reasons) ? runnerUp.reasons : [])],
          }
        : undefined,
      whyNotRunnerUp: runnerUp
        ? `winner=${winner.filePath}(${winnerKind}, score=${winner.score}) outranks runnerUp=${runnerUp.filePath}(${runnerKind}, score=${runnerUp.score}) by ${winner.score - runnerUp.score}.`
        : `No runner-up candidate exists; ${winner.filePath} is the only deterministic option.`,
    }
  }

  private buildTargetCompetitionFromHypotheses(hypotheses: CodingTargetHypothesis[]): CodingTargetCompetition | undefined {
    const winner = hypotheses[0]
    if (!winner) {
      return undefined
    }

    const runnerUp = hypotheses[1]

    return {
      winner: {
        filePath: winner.filePath,
        score: winner.score,
        targetKind: winner.targetKind,
        evidenceChain: [...winner.evidence],
      },
      runnerUp: runnerUp
        ? {
            filePath: runnerUp.filePath,
            score: runnerUp.score,
            targetKind: runnerUp.targetKind,
            evidenceChain: [...runnerUp.evidence],
          }
        : undefined,
      whyNotRunnerUp: runnerUp
        ? `winner=hypothesis(${winner.id}) score=${winner.score} beats runnerUp=hypothesis(${runnerUp.id}) score=${runnerUp.score}; intent=${winner.changeIntent}.`
        : `Only one validated hypothesis remained after intent+impact scoring.`,
    }
  }

  private buildTargetCompetitionFromPlannerCandidates(candidateScores: CodingPlannerDecision['candidateScores']): CodingTargetCompetition | undefined {
    const winner = candidateScores[0]
    if (!winner) {
      return undefined
    }

    const runnerUp = candidateScores[1]
    const winnerKind = this.inferTargetKindFromPath(winner.filePath)
    const runnerKind = runnerUp ? this.inferTargetKindFromPath(runnerUp.filePath) : undefined

    return {
      winner: {
        filePath: winner.filePath,
        score: winner.score,
        targetKind: winnerKind,
        evidenceChain: [...winner.reasons],
      },
      runnerUp: runnerUp
        ? {
            filePath: runnerUp.filePath,
            score: runnerUp.score,
            targetKind: runnerKind!,
            evidenceChain: [...runnerUp.reasons],
          }
        : undefined,
      whyNotRunnerUp: runnerUp
        ? `planner winner=${winner.filePath}(${winner.status}, score=${winner.score}) outranks runnerUp=${runnerUp.filePath}(${runnerUp.status}, score=${runnerUp.score}).`
        : `Planner produced a single executable candidate.`,
    }
  }

  private deriveTargetJudgeHintsFromDiagnosis(params: {
    diagnosis?: CodingChangeDiagnosis
    candidateFiles: string[]
    winnerFileHint?: string
    missingInformationHints?: string[]
  }) {
    const candidateSet = new Set(params.candidateFiles)
    const repairWindowFiles = params.diagnosis?.recommendedRepairWindow?.files || []
    const diagnosisPreferredFile = repairWindowFiles.find(file => candidateSet.has(file))
    const diagnosisMissingHints = [
      ...((params.diagnosis?.contestedSignals || []).slice(0, 2).map(signal => `diagnosis_contested_signal:${signal}`)),
      ...((params.diagnosis?.conflictingEvidence || []).slice(0, 2).map(signal => `diagnosis_conflict:${signal}`)),
    ]

    return {
      winnerFileHint: params.winnerFileHint || diagnosisPreferredFile,
      missingInformationHints: Array.from(new Set([
        ...(params.missingInformationHints || []),
        ...diagnosisMissingHints,
      ])).slice(0, 5),
    }
  }

  private buildTargetCaseAndJudgement(params: {
    changeIntent: CodingChangeIntent
    candidates: CodingTargetCandidate[]
    winnerFileHint?: string
    missingInformationHints?: string[]
  }): {
    targetCase: TargetDecisionCase
    targetJudgement: TargetJudgement
    fallbackReason?: string
  } {
    const state = this.getCodingState()
    const candidates = [...params.candidates]
    const diagnosisHints = this.deriveTargetJudgeHintsFromDiagnosis({
      diagnosis: state?.lastChangeDiagnosis,
      candidateFiles: candidates.map(candidate => candidate.filePath),
      winnerFileHint: params.winnerFileHint,
      missingInformationHints: params.missingInformationHints,
    })

    if (diagnosisHints.winnerFileHint && !candidates.some(candidate => candidate.filePath === diagnosisHints.winnerFileHint)) {
      candidates.unshift({
        filePath: diagnosisHints.winnerFileHint,
        sourceKind: 'explicit',
        sourceLabel: `planner:${diagnosisHints.winnerFileHint}`,
        score: 999,
        matchCount: 1,
        inScopedPath: false,
        recentlyEdited: false,
        recentlyRead: false,
        reasons: ['planner_selected(+999)'],
      })
    }

    const impactNeighborsByFile = Object.fromEntries(candidates.map(candidate => [
      candidate.filePath,
      (state?.lastImpactAnalysis?.likelyCompanionFiles || [])
        .filter(file => file !== candidate.filePath)
        .slice(0, 4),
    ]))

    const targetCase = buildTargetDecisionCase({
      changeIntent: params.changeIntent,
      candidates,
      impactNeighborsByFile,
      failingTests: state?.lastImpactAnalysis?.likelyImpactedTests || [],
      frontier: state?.lastPlanFrontier,
      missingInformationHints: diagnosisHints.missingInformationHints,
    })

    // NOTICE: This env hook exists only for smoke validation that schema rejection
    // falls back to deterministic target judgement; normal runtime should never set it.
    const forceInvalidJudge = env.COMPUTER_USE_FORCE_INVALID_TARGET_JUDGEMENT === '1'

    const resolved = resolveTargetJudgement({
      targetCase,
      proposedJudgement: forceInvalidJudge
        ? {
            winner: '',
            candidateScores: [],
          }
        : undefined,
    })

    return {
      targetCase,
      targetJudgement: resolved.judgement,
      fallbackReason: resolved.fallbackReason,
    }
  }

  private buildTargetCandidatesFromPlannerDecision(
    plannerDecision: CodingPlannerDecision,
    fallbackCandidates: CodingTargetCandidate[],
  ): CodingTargetCandidate[] {
    const fallbackByPath = new Map(fallbackCandidates.map(candidate => [candidate.filePath, candidate]))

    return plannerDecision.candidateScores.map((candidate, index) => {
      const fallback = fallbackByPath.get(candidate.filePath)
      return {
        filePath: candidate.filePath,
        sourceKind: fallback?.sourceKind || (index === 0 ? 'explicit' : 'references'),
        sourceLabel: fallback?.sourceLabel || `planner:${candidate.status}`,
        score: Number(candidate.score.toFixed(3)),
        matchCount: fallback?.matchCount || 1,
        inScopedPath: fallback?.inScopedPath || false,
        recentlyEdited: fallback?.recentlyEdited || false,
        recentlyRead: fallback?.recentlyRead || false,
        reasons: candidate.reasons.length > 0
          ? [...candidate.reasons]
          : [`planner_score:${candidate.score}`],
      }
    })
  }

  private buildTargetCompetitionFromJudgement(judgement: TargetJudgement): CodingTargetCompetition | undefined {
    const winnerScore = judgement.candidateScores.find(candidate => candidate.filePath === judgement.winner)
    if (!winnerScore) {
      return undefined
    }

    const runnerUpScore = judgement.runnerUp
      ? judgement.candidateScores.find(candidate => candidate.filePath === judgement.runnerUp)
      : judgement.candidateScores.find(candidate => candidate.filePath !== judgement.winner)

    return {
      winner: {
        filePath: winnerScore.filePath,
        score: winnerScore.score,
        targetKind: this.inferTargetKindFromPath(winnerScore.filePath),
        evidenceChain: [winnerScore.reason, judgement.winnerReason],
      },
      runnerUp: runnerUpScore
        ? {
            filePath: runnerUpScore.filePath,
            score: runnerUpScore.score,
            targetKind: this.inferTargetKindFromPath(runnerUpScore.filePath),
            evidenceChain: [runnerUpScore.reason, judgement.runnerUpReason || 'runner_up_from_judgement_scores'],
          }
        : undefined,
      whyNotRunnerUp: runnerUpScore
        ? judgement.whyNotRunnerUp || judgement.runnerUpReason || `winner=${winnerScore.filePath}(${winnerScore.score}) outranks runnerUp=${runnerUpScore.filePath}(${runnerUpScore.score}).`
        : judgement.winnerReason,
    }
  }

  private resolveTargetFileFromJudgement(params: {
    judgement: TargetJudgement
    availableFiles: string[]
    fallbackFile: string
  }) {
    const availableSet = new Set(params.availableFiles)
    if (params.judgement.winner && availableSet.has(params.judgement.winner)) {
      return params.judgement.winner
    }

    if (params.judgement.runnerUp && availableSet.has(params.judgement.runnerUp)) {
      return params.judgement.runnerUp
    }

    return params.fallbackFile
  }

  private applyTargetJudgementToPlannerDecision(
    plannerDecision: CodingPlannerDecision,
    targetJudgement: TargetJudgement,
    context: {
      frontier?: CodingPlanFrontier
      diagnosis?: Pick<CodingChangeDiagnosis, 'nextAction' | 'recommendedRepairWindow'>
    } = {},
  ): CodingPlannerDecision {
    const judgementWinnerCandidate = plannerDecision.candidateScores.find(candidate => candidate.filePath === targetJudgement.winner)
    const plannerSelectedScore = targetJudgement.candidateScores.find(candidate => candidate.filePath === plannerDecision.selectedFile)?.score
    const judgementWinnerScore = targetJudgement.candidateScores.find(candidate => candidate.filePath === targetJudgement.winner)?.score
    const diagnosisRepairWindowFiles = new Set(context.diagnosis?.recommendedRepairWindow?.files || [])
    const diagnosisPrefersWinner = context.diagnosis?.nextAction === 'amend'
      && diagnosisRepairWindowFiles.has(targetJudgement.winner)
    const nodeIdByFilePath = new Map(plannerDecision.candidateScores.map(candidate => [candidate.filePath, `node:${candidate.filePath.replace(/\\/g, '/')}`]))
    const frontierReadyNodeIds = new Set(context.frontier?.readyNodeIds || [])
    const frontierPrefersWinner = Boolean(
      nodeIdByFilePath.get(targetJudgement.winner)
      && frontierReadyNodeIds.has(nodeIdByFilePath.get(targetJudgement.winner)!)
      && nodeIdByFilePath.get(plannerDecision.selectedFile)
      && !frontierReadyNodeIds.has(nodeIdByFilePath.get(plannerDecision.selectedFile)!),
    )
    const winnerHasComparableScore = typeof judgementWinnerScore === 'number'
      && (typeof plannerSelectedScore !== 'number' || judgementWinnerScore >= plannerSelectedScore)
    const judgeTieBreakPreference = Boolean(
      targetJudgement.mode === 'judge'
      && winnerHasComparableScore
      && (diagnosisPrefersWinner || frontierPrefersWinner),
    )

    const canPromoteWinner = targetJudgement.winner !== plannerDecision.selectedFile
      && Boolean(judgementWinnerCandidate)
      && (
        (typeof judgementWinnerScore === 'number' && (typeof plannerSelectedScore !== 'number' || judgementWinnerScore > plannerSelectedScore))
        || (winnerHasComparableScore && diagnosisPrefersWinner)
        || frontierPrefersWinner
        || judgeTieBreakPreference
      )

    if (!canPromoteWinner) {
      return plannerDecision
    }

    const judgedFile = this.resolveTargetFileFromJudgement({
      judgement: targetJudgement,
      availableFiles: plannerDecision.candidateScores.map(candidate => candidate.filePath),
      fallbackFile: plannerDecision.selectedFile,
    })

    return this.enforcePlannerDecisionConstraint(plannerDecision, {
      preferredFilePath: judgedFile,
      reasonTag: 'target_judgement',
    }) || plannerDecision
  }

  private inferNextActionFromRootCause(rootCauseType: CodingChangeRootCauseType): CodingChangeDiagnosis['nextAction'] {
    if (rootCauseType === 'validation_environment_issue') {
      return 'abort'
    }

    if (['wrong_target', 'incomplete_change', 'missed_dependency', 'test_only_breakage'].includes(rootCauseType)) {
      return 'amend'
    }

    return 'continue'
  }

  private computeCounterfactualSupport(check?: CodingCounterfactualCheck) {
    const observedCount = check?.observedEvidence?.length || 0
    const passed = Boolean(check?.passed)

    const strength = passed
      ? Math.max(0.25, Math.min(1, observedCount / 2))
      : 0

    return {
      passed,
      observedCount,
      strength,
    }
  }

  private applyCounterfactualActionOverride(params: {
    rootCauseType: CodingChangeDiagnosis['rootCauseType']
    nextAction: CodingChangeDiagnosis['nextAction']
    competition: CodingDiagnosisCompetition
    diagnosisJudgement: DiagnosisJudgement
    allowRootCauseOverride: boolean
  }): {
    rootCauseType: CodingChangeDiagnosis['rootCauseType']
    nextAction: CodingChangeDiagnosis['nextAction']
    notes: string[]
  } {
    const checks = params.diagnosisJudgement.counterfactualChecks || []
    const winnerCheck = checks.find(check => check.hypothesis === params.diagnosisJudgement.winner)
    const runnerUpCheck = params.diagnosisJudgement.runnerUp
      ? checks.find(check => check.hypothesis === params.diagnosisJudgement.runnerUp)
      : undefined
    const winnerSupport = this.computeCounterfactualSupport(winnerCheck)
    const runnerUpSupport = this.computeCounterfactualSupport(runnerUpCheck)

    const notes: string[] = []
    let rootCauseType = params.rootCauseType
    let nextAction = params.nextAction

    const finalize = () => {
      const margin = params.competition.winner.score - params.competition.runnerUp.score
      const supportGap = Number((runnerUpSupport.strength - winnerSupport.strength).toFixed(3))
      notes.push(
        `counterfactual_arbitration:margin=${margin.toFixed(3)};winner_passed=${winnerSupport.passed ? 1 : 0};runner_up_passed=${runnerUpSupport.passed ? 1 : 0};support_gap=${supportGap}`,
      )

      return { rootCauseType, nextAction, notes }
    }

    const winnerAction = this.inferNextActionFromRootCause(params.diagnosisJudgement.winner)
    const runnerUpAction = params.diagnosisJudgement.runnerUp
      ? this.inferNextActionFromRootCause(params.diagnosisJudgement.runnerUp)
      : undefined

    const margin = params.competition.winner.score - params.competition.runnerUp.score
    const closeMargin = margin <= 0.1
    const disagreementOverrideMargin = margin <= 0.2
    const missedDependencyGuardSignals = new Set([
      'impact_companion_or_reference_hit',
      'unexpected_files_touched',
      'baseline_diff_escape',
    ])
    const missedDependencyRepairWindow = params.diagnosisJudgement.recommendedRepairWindow
    const strongMissedDependencyEvidence = Boolean(
      (params.rootCauseType === 'missed_dependency'
        || params.diagnosisJudgement.winner === 'missed_dependency'
        || params.competition.winner.rootCauseType === 'missed_dependency')
      && (
        params.competition.winner.signals.some(signal => missedDependencyGuardSignals.has(signal))
        || (
          missedDependencyRepairWindow?.scope === 'dependency_slice'
          && (missedDependencyRepairWindow.files?.length || 0) > 0
        )
      ),
    )
    const winnerFailedCounterfactual = Boolean(winnerCheck && !winnerSupport.passed)
    const runnerUpPassedCounterfactual = Boolean(runnerUpSupport.passed)
    const winnerRunnerUpActionDisagree = Boolean(
      runnerUpAction
      && winnerAction !== runnerUpAction,
    )
    const runnerUpSupportAtLeastWinner = runnerUpSupport.strength >= winnerSupport.strength
      || runnerUpSupport.observedCount >= winnerSupport.observedCount
    const hasCounterfactualDisagreement = Boolean(
      params.diagnosisJudgement.runnerUp
      && runnerUpPassedCounterfactual
      && winnerRunnerUpActionDisagree
      && disagreementOverrideMargin,
    )

    if (params.allowRootCauseOverride
      && params.diagnosisJudgement.runnerUp
      && runnerUpPassedCounterfactual
      && winnerFailedCounterfactual
      && (disagreementOverrideMargin || winnerRunnerUpActionDisagree)) {
      if (strongMissedDependencyEvidence && this.inferNextActionFromRootCause(params.diagnosisJudgement.runnerUp) === 'continue') {
        notes.push('counterfactual_guard:missed_dependency_strong_evidence_preserve_amend')
        return finalize()
      }

      rootCauseType = params.diagnosisJudgement.runnerUp
      nextAction = this.inferNextActionFromRootCause(rootCauseType)
      notes.push(`counterfactual_override:runner_up_promoted:${rootCauseType}`)
      return finalize()
    }

    if (hasCounterfactualDisagreement && runnerUpAction && runnerUpSupportAtLeastWinner) {
      if (strongMissedDependencyEvidence && runnerUpAction === 'continue') {
        notes.push('counterfactual_guard:missed_dependency_strong_evidence_preserve_amend')
        return finalize()
      }

      nextAction = runnerUpAction
      notes.push(`counterfactual_override:next_action:${params.nextAction}->${runnerUpAction}`)
      return finalize()
    }

    if (hasCounterfactualDisagreement && runnerUpAction && !runnerUpSupportAtLeastWinner) {
      notes.push('counterfactual_arbitration:keep_winner_action_due_to_support_gap')
      return finalize()
    }

    if (winnerFailedCounterfactual && runnerUpPassedCounterfactual && runnerUpAction && winnerRunnerUpActionDisagree) {
      if (strongMissedDependencyEvidence && runnerUpAction === 'continue') {
        notes.push('counterfactual_guard:missed_dependency_strong_evidence_preserve_amend')
        return finalize()
      }

      nextAction = runnerUpAction
      notes.push(`counterfactual_override:runner_up_action_override:${params.nextAction}->${runnerUpAction}`)
      return finalize()
    }

    if (winnerCheck && !winnerSupport.passed && params.nextAction === 'amend' && closeMargin && !runnerUpPassedCounterfactual) {
      if (strongMissedDependencyEvidence) {
        notes.push('counterfactual_guard:missed_dependency_strong_evidence_preserve_amend')
        return finalize()
      }

      nextAction = 'continue'
      notes.push('counterfactual_override:weak_winner_deescalate_to_continue')
    }

    return finalize()
  }

  private deriveCounterfactualPlannerConstraint(params: {
    state: NonNullable<ReturnType<CodingPrimitives['getCodingState']>>
    plannerDecision?: CodingPlannerDecision
    currentFilePath?: string
    diagnosis: Pick<CodingChangeDiagnosis, 'rootCauseType' | 'nextAction' | 'counterfactualChecks'>
  }): {
    preferredFilePath?: string
    reasonTag: 'causal_counterfactual'
    rationale?: string
  } | undefined {
    const { plannerDecision } = params
    if (!plannerDecision || params.diagnosis.nextAction !== 'amend') {
      return undefined
    }

    const passedAlternative = (params.diagnosis.counterfactualChecks || []).find((check) => {
      return check.passed && check.hypothesis !== params.diagnosis.rootCauseType
    })

    if (!passedAlternative) {
      return undefined
    }

    const availableFiles = plannerDecision.candidateScores.map(candidate => candidate.filePath)
    const availableSet = new Set(availableFiles)
    const currentFocusFile = params.currentFilePath || plannerDecision.selectedFile
    const hasCompetingInProgressCandidate = plannerDecision.candidateScores.some((candidate) => {
      return candidate.status === 'in_progress' && candidate.filePath !== currentFocusFile
    })

    if (params.diagnosis.rootCauseType === 'wrong_target' && hasCompetingInProgressCandidate) {
      return undefined
    }

    let preferredFilePath: string | undefined

    if (passedAlternative.hypothesis === 'missed_dependency') {
      preferredFilePath = (params.state.lastImpactAnalysis?.likelyCompanionFiles || []).find(file => availableSet.has(file) && file !== currentFocusFile)
    }
    else if (passedAlternative.hypothesis === 'wrong_target') {
      preferredFilePath = availableFiles.find(file => file !== currentFocusFile)
    }
    else if (passedAlternative.hypothesis === 'test_only_breakage') {
      preferredFilePath = availableFiles.find(file => this.isTestLikePath(file))
    }
    else if (passedAlternative.hypothesis === 'incomplete_change' && currentFocusFile && availableSet.has(currentFocusFile)) {
      preferredFilePath = currentFocusFile
    }

    if (!preferredFilePath) {
      return undefined
    }

    return {
      preferredFilePath,
      reasonTag: 'causal_counterfactual',
      rationale: `counterfactual(${passedAlternative.hypothesis}) suggests prioritizing ${preferredFilePath}`,
    }
  }

  private appendSessionTransitions(previousSession: CodingPlanSession | undefined, nextSession: CodingPlanSession, reason: string): CodingPlanSession {
    if (!previousSession) {
      return nextSession
    }

    const previousStatusByFile = new Map(previousSession.steps.map(step => [step.filePath, step.status]))
    const transitions: CodingPlanSessionTransition[] = []

    for (const step of nextSession.steps) {
      const previousStatus = previousStatusByFile.get(step.filePath)
      if (!previousStatus || previousStatus === step.status) {
        continue
      }

      transitions.push({
        at: new Date().toISOString(),
        filePath: step.filePath,
        from: previousStatus,
        to: step.status,
        reason,
      })
    }

    if (transitions.length === 0) {
      return nextSession
    }

    return {
      ...nextSession,
      recentTransitions: [...(previousSession.recentTransitions || []), ...transitions].slice(-30),
    }
  }

  async analyzeImpact(params: {
    targetFile?: string
    targetPath?: string
    targetSymbol?: string
    searchQuery?: string
    maxDepth?: number
  }) {
    const state = this.getCodingState()
    if (!state) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace not reviewed yet. Call coding_review_workspace first.')
    }

    const maxDepth = 1 as const
    const candidates = this.buildTargetCandidates({
      explicitTargetFile: params.targetFile,
      targetPath: params.targetPath,
      targetSymbol: params.targetSymbol,
      searchQuery: params.searchQuery,
    }).slice(0, 20)

    const explicitFile = params.targetFile || candidates[0]?.filePath
    if (explicitFile && !this.isJsTsSemanticPath(explicitFile)) {
      const unsupported: CodingImpactAnalysis = {
        status: 'unsupported',
        targetFile: explicitFile,
        targetSymbol: params.targetSymbol,
        searchQuery: params.searchQuery,
        languageSupport: 'unsupported',
        explanation: '当前仅支持 JS/TS/JSX/TSX/MTS/CTS 的语义影响分析，请回退到 coding_search_text。',
        targetCandidates: candidates,
        importExportNeighbors: [],
        directReferences: [],
        likelyImpactedTests: [],
        likelyCompanionFiles: [],
        graphSnapshot: {
          maxDepth,
          truncated: false,
          nodes: [],
          edges: [],
        },
      }

      this.runtime.stateManager.updateCodingState({
        lastImpactAnalysis: unsupported,
        impactGraphSnapshot: unsupported.graphSnapshot,
      })

      return unsupported
    }

    let symbolOwner: CodingImpactAnalysis['symbolOwner']
    let directReferences: CodingImpactAnalysis['directReferences'] = []
    const workspaceRoot = this.getWorkspaceRoot()

    if (params.targetSymbol) {
      const symbolResult = await searchSymbol(workspaceRoot, params.targetSymbol, {
        searchRoot: this.resolveSearchRoot(params.targetPath),
        limit: 20,
      })

      if ('status' in symbolResult && symbolResult.status === 'unsupported') {
        const unsupported: CodingImpactAnalysis = {
          status: 'unsupported',
          targetFile: explicitFile,
          targetSymbol: params.targetSymbol,
          searchQuery: params.searchQuery,
          languageSupport: 'unsupported',
          explanation: symbolResult.explanation,
          targetCandidates: candidates,
          importExportNeighbors: [],
          directReferences: [],
          likelyImpactedTests: [],
          likelyCompanionFiles: [],
          graphSnapshot: {
            maxDepth,
            truncated: false,
            nodes: [],
            edges: [],
          },
        }

        this.runtime.stateManager.updateCodingState({
          lastImpactAnalysis: unsupported,
          impactGraphSnapshot: unsupported.graphSnapshot,
        })

        return unsupported
      }

      const firstDefinition = symbolResult.matches?.[0]
      if (firstDefinition) {
        symbolOwner = {
          symbolName: params.targetSymbol,
          definitionFile: firstDefinition.file,
        }

        const refsResult = await findReferences(
          workspaceRoot,
          firstDefinition.file,
          firstDefinition.line,
          firstDefinition.column,
          20,
        )
        if (!('status' in refsResult)) {
          directReferences = refsResult.matches.slice(0, 20)
        }
      }
    }

    const neighborSet = new Set<string>()
    for (const candidate of candidates) {
      neighborSet.add(candidate.filePath)
    }
    for (const ref of directReferences) {
      neighborSet.add(ref.file)
    }
    if (symbolOwner?.definitionFile) {
      neighborSet.add(symbolOwner.definitionFile)
    }

    const neighbors = Array.from(neighborSet).slice(0, 20)
    const importExportNeighbors = await this.collectImportExportNeighbors(neighbors)
    for (const importNeighbor of importExportNeighbors) {
      neighborSet.add(importNeighbor)
    }

    const expandedNeighbors = Array.from(neighborSet).slice(0, 20)
    const likelyImpactedTests = expandedNeighbors
      .filter(filePath => this.isTestLikePath(filePath))
      .slice(0, 10)
    const likelyCompanionFiles = expandedNeighbors
      .filter(filePath => !likelyImpactedTests.includes(filePath))
      .slice(0, 10)

    const nodes = [] as CodingImpactAnalysis['graphSnapshot']['nodes']
    const edges = [] as CodingImpactAnalysis['graphSnapshot']['edges']
    if (symbolOwner) {
      const ownerNodeId = `owner:${symbolOwner.definitionFile}`
      nodes.push({
        id: ownerNodeId,
        filePath: symbolOwner.definitionFile,
        kind: 'symbol_owner',
        symbolName: symbolOwner.symbolName,
        distance: 0,
      })

      for (const ref of directReferences.slice(0, 12)) {
        const refNodeId = `ref:${ref.file}:${ref.line}:${ref.column}`
        nodes.push({
          id: refNodeId,
          filePath: ref.file,
          kind: 'reference',
          distance: 1,
        })
        edges.push({ from: ownerNodeId, to: refNodeId, relation: 'references' })
      }
    }

    for (const testFile of likelyImpactedTests.slice(0, 6)) {
      const testNodeId = `test:${testFile}`
      nodes.push({ id: testNodeId, filePath: testFile, kind: 'test_candidate', distance: 1 })
      if (symbolOwner?.definitionFile) {
        edges.push({ from: `owner:${symbolOwner.definitionFile}`, to: testNodeId, relation: 'tests' })
      }
    }

    for (const companion of likelyCompanionFiles.slice(0, 8)) {
      const companionNodeId = `companion:${companion}`
      nodes.push({ id: companionNodeId, filePath: companion, kind: 'companion_file', distance: 1 })
      if (symbolOwner?.definitionFile) {
        edges.push({ from: `owner:${symbolOwner.definitionFile}`, to: companionNodeId, relation: 'companions' })
      }
    }

    for (const importNeighbor of importExportNeighbors.slice(0, 8)) {
      const importNodeId = `import:${importNeighbor}`
      nodes.push({ id: importNodeId, filePath: importNeighbor, kind: 'import_neighbor', distance: 1 })
      if (symbolOwner?.definitionFile) {
        edges.push({ from: `owner:${symbolOwner.definitionFile}`, to: importNodeId, relation: 'imports' })
      }
    }

    const graphSnapshot: CodingImpactAnalysis['graphSnapshot'] = {
      maxDepth,
      truncated: nodes.length > 30 || edges.length > 40,
      nodes: nodes.slice(0, 30),
      edges: edges.slice(0, 40),
    }

    const analysis: CodingImpactAnalysis = {
      status: candidates.length > 0 || symbolOwner ? 'ok' : 'no_match',
      targetFile: explicitFile,
      targetSymbol: params.targetSymbol,
      searchQuery: params.searchQuery,
      languageSupport: 'js_ts',
      explanation: candidates.length > 0 || symbolOwner
        ? '已基于局部 1-hop 图生成影响分析。'
        : '未找到可用于构建影响图的候选。',
      targetCandidates: candidates,
      symbolOwner,
      importExportNeighbors: importExportNeighbors.slice(0, 12),
      directReferences: directReferences.slice(0, 20),
      likelyImpactedTests,
      likelyCompanionFiles,
      graphSnapshot,
    }

    this.runtime.stateManager.updateCodingState({
      lastImpactAnalysis: analysis,
      impactGraphSnapshot: graphSnapshot,
    })

    return analysis
  }

  async validateHypothesis(params: {
    targetFile?: string
    targetPath?: string
    targetSymbol?: string
    searchQuery?: string
    changeIntent: CodingChangeIntent
  }) {
    const impact = await this.analyzeImpact({
      targetFile: params.targetFile,
      targetPath: params.targetPath,
      targetSymbol: params.targetSymbol,
      searchQuery: params.searchQuery,
    })

    if (impact.status === 'unsupported') {
      return {
        status: 'unsupported' as const,
        changeIntent: params.changeIntent,
        reason: impact.explanation,
        hypotheses: [] as CodingTargetHypothesis[],
      }
    }

    const hypotheses = this.buildTargetHypotheses({
      candidates: impact.targetCandidates,
      changeIntent: params.changeIntent,
      impact,
    })

    if (hypotheses.length === 0) {
      return {
        status: 'no_match' as const,
        changeIntent: params.changeIntent,
        reason: 'No hypothesis candidates were produced from current search/impact evidence.',
        hypotheses,
      }
    }

    const top = hypotheses[0]!
    const second = hypotheses[1]
    if (second && second.score === top.score) {
      return {
        status: 'ambiguous' as const,
        changeIntent: params.changeIntent,
        reason: `Top hypotheses are tied at score ${top.score}.`,
        hypotheses,
      }
    }

    this.runtime.stateManager.updateCodingState({
      lastTargetHypothesis: top,
    })

    return {
      status: 'validated' as const,
      changeIntent: params.changeIntent,
      reason: `Validated hypothesis ${top.id} for ${top.filePath}.`,
      selectedHypothesis: top,
      hypotheses,
    }
  }

  async selectTarget(params: {
    targetFile?: string
    targetPath?: string
    targetSymbol?: string
    searchQuery?: string
    changeIntent?: CodingChangeIntent
  }) {
    const state = this.getCodingState()
    if (!state) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace not reviewed yet. Call coding_review_workspace first.')
    }

    if (!params.targetFile) {
      if (state.currentPlanGraph?.nodes?.length) {
        const graphDecision = this.buildPlannerDecisionFromGraph({
          graph: state.currentPlanGraph,
          changeIntent: params.changeIntent || state.currentPlanSession?.changeIntent || state.lastTargetSelection?.changeIntent || 'behavior_fix',
          preferredFilePath: state.lastTargetSelection?.selectedFile,
          mirrorSession: state.currentPlanSession?.id === state.currentPlanGraph.sessionId
            ? state.currentPlanSession
            : undefined,
        })

        if (graphDecision) {
          const graphCandidatesForJudge = this.buildTargetCandidatesFromPlannerDecision(
            graphDecision,
            state.targetCandidates || [],
          )
          const targetDecisionArtifacts = this.buildTargetCaseAndJudgement({
            changeIntent: params.changeIntent || state.currentPlanSession?.changeIntent || state.lastTargetSelection?.changeIntent || 'behavior_fix',
            candidates: graphCandidatesForJudge,
            winnerFileHint: graphDecision.selectedFile,
          })
          const judgedGraphDecision = this.applyTargetJudgementToPlannerDecision(
            graphDecision,
            targetDecisionArtifacts.targetJudgement,
            {
              frontier: this.getCodingState()?.lastPlanFrontier,
              diagnosis: state.lastChangeDiagnosis,
            },
          )
          const selectedFile = judgedGraphDecision.selectedFile
          const winnerCandidate = judgedGraphDecision.candidateScores.find(candidate => candidate.filePath === selectedFile)

          const selection: CodingTargetSelection = {
            status: 'selected',
            selectedFile,
            targetKind: targetDecisionArtifacts.targetJudgement.targetKind,
            architectureLayer: targetDecisionArtifacts.targetJudgement.architectureLayer,
            intentDecomposition: targetDecisionArtifacts.targetJudgement.intentDecomposition,
            candidates: graphCandidatesForJudge,
            reason: targetDecisionArtifacts.fallbackReason
              ? `${judgedGraphDecision.decisionReason} ${targetDecisionArtifacts.targetJudgement.winnerReason} (fallback: ${targetDecisionArtifacts.fallbackReason})`
              : `${judgedGraphDecision.decisionReason} ${targetDecisionArtifacts.targetJudgement.winnerReason}`,
            recommendedNextAction: judgedGraphDecision.decisionReason,
            changeIntent: params.changeIntent || state.currentPlanSession?.changeIntent,
            missingInformation: targetDecisionArtifacts.targetJudgement.missingInformation,
            evidenceChain: winnerCandidate?.reasons || [judgedGraphDecision.decisionReason],
            competition: this.buildTargetCompetitionFromJudgement(targetDecisionArtifacts.targetJudgement)
              || this.buildTargetCompetitionFromPlannerCandidates(judgedGraphDecision.candidateScores),
          }

          this.runtime.stateManager.updateCodingState({
            lastPlannerDecision: judgedGraphDecision,
            lastTargetDecisionCase: targetDecisionArtifacts.targetCase,
            lastTargetJudgement: targetDecisionArtifacts.targetJudgement,
            lastTargetSelection: selection,
          })

          return selection
        }
      }

      const activeSession = state.currentPlanSession
      const advancedSession = activeSession
        ? this.advancePlanSession(activeSession, {
            promoteNextStep: true,
            transitionReason: 'select_target_session_refresh',
          })
        : undefined
      const generatedPlannerDecision = advancedSession
        ? this.buildPlannerDecision(advancedSession, activeSession, state.lastTargetSelection?.selectedFile)
        : undefined
      const canReuseLastPlannerDecision = Boolean(
        state.lastPlannerDecision
        && generatedPlannerDecision?.candidateScores.some(candidate => candidate.filePath === state.lastPlannerDecision!.selectedFile),
      )
      const plannerDecision = canReuseLastPlannerDecision
        ? state.lastPlannerDecision
        : generatedPlannerDecision
      const nextExecutableSessionStep = plannerDecision && advancedSession
        ? advancedSession.steps.find(step => step.filePath === plannerDecision.selectedFile)
        : undefined

      if (advancedSession && nextExecutableSessionStep && plannerDecision) {
        const plannerCandidatesForJudge = this.buildTargetCandidatesFromPlannerDecision(
          plannerDecision,
          state.targetCandidates || [],
        )
        const targetDecisionArtifacts = this.buildTargetCaseAndJudgement({
          changeIntent: advancedSession.changeIntent,
          candidates: plannerCandidatesForJudge,
          winnerFileHint: plannerDecision.selectedFile,
        })
        const judgedPlannerDecision = this.applyTargetJudgementToPlannerDecision(
          plannerDecision,
          targetDecisionArtifacts.targetJudgement,
          {
            frontier: state.lastPlanFrontier,
            diagnosis: state.lastChangeDiagnosis,
          },
        )
        const plannerSelectionOverriddenByJudgement = judgedPlannerDecision.selectedFile !== plannerDecision.selectedFile
        const selectedFile = judgedPlannerDecision.selectedFile
        const winnerPlannerCandidate = judgedPlannerDecision.candidateScores.find(candidate => candidate.filePath === selectedFile)

        const selection: CodingTargetSelection = {
          status: 'selected',
          selectedFile,
          targetKind: targetDecisionArtifacts.targetJudgement.targetKind,
          architectureLayer: targetDecisionArtifacts.targetJudgement.architectureLayer,
          intentDecomposition: targetDecisionArtifacts.targetJudgement.intentDecomposition,
          candidates: plannerCandidatesForJudge,
          reason: targetDecisionArtifacts.fallbackReason
            ? `${judgedPlannerDecision.decisionReason} ${targetDecisionArtifacts.targetJudgement.winnerReason} (fallback: ${targetDecisionArtifacts.fallbackReason})`
            : `${judgedPlannerDecision.decisionReason} ${targetDecisionArtifacts.targetJudgement.winnerReason}`,
          recommendedNextAction: judgedPlannerDecision.decisionReason,
          changeIntent: advancedSession.changeIntent,
          missingInformation: targetDecisionArtifacts.targetJudgement.missingInformation,
          evidenceChain: winnerPlannerCandidate?.reasons || [judgedPlannerDecision.decisionReason, targetDecisionArtifacts.targetJudgement.winnerReason],
          competition: plannerSelectionOverriddenByJudgement
            ? this.buildTargetCompetitionFromJudgement(targetDecisionArtifacts.targetJudgement)
            || this.buildTargetCompetitionFromPlannerCandidates(judgedPlannerDecision.candidateScores)
            : this.buildTargetCompetitionFromPlannerCandidates(judgedPlannerDecision.candidateScores),
        }

        this.runtime.stateManager.updateCodingState({
          currentPlanSession: advancedSession,
          lastPlannerDecision: judgedPlannerDecision,
          lastTargetDecisionCase: targetDecisionArtifacts.targetCase,
          lastTargetJudgement: targetDecisionArtifacts.targetJudgement,
          lastTargetSelection: selection,
        })

        return selection
      }

      const pendingStep = state.currentPlanGraph?.nodes?.length
        ? undefined
        : this.nextPendingPlanStep(state.currentPlan)
      if (pendingStep) {
        const targetDecisionArtifacts = this.buildTargetCaseAndJudgement({
          changeIntent: params.changeIntent || state.currentPlanSession?.changeIntent || 'behavior_fix',
          candidates: state.targetCandidates || [],
          winnerFileHint: pendingStep.filePath,
        })

        const selection: CodingTargetSelection = {
          status: 'selected',
          selectedFile: pendingStep.filePath,
          targetKind: targetDecisionArtifacts.targetJudgement.targetKind,
          architectureLayer: targetDecisionArtifacts.targetJudgement.architectureLayer,
          intentDecomposition: targetDecisionArtifacts.targetJudgement.intentDecomposition,
          candidates: state.targetCandidates || [],
          reason: targetDecisionArtifacts.fallbackReason
            ? `${targetDecisionArtifacts.targetJudgement.winnerReason} (fallback: ${targetDecisionArtifacts.fallbackReason})`
            : targetDecisionArtifacts.targetJudgement.winnerReason,
          recommendedNextAction: `Proceed with ${pendingStep.filePath} for the current plan.`,
          changeIntent: params.changeIntent,
          missingInformation: targetDecisionArtifacts.targetJudgement.missingInformation,
          evidenceChain: [`pending_plan_step:${pendingStep.filePath}`],
          competition: this.buildTargetCompetitionFromCandidates(state.targetCandidates || []),
        }

        this.runtime.stateManager.updateCodingState({
          lastTargetDecisionCase: targetDecisionArtifacts.targetCase,
          lastTargetJudgement: targetDecisionArtifacts.targetJudgement,
          lastTargetSelection: selection,
        })

        return selection
      }
    }

    if (params.changeIntent) {
      const hypothesis = await this.validateHypothesis({
        targetFile: params.targetFile,
        targetPath: params.targetPath,
        targetSymbol: params.targetSymbol,
        searchQuery: params.searchQuery,
        changeIntent: params.changeIntent,
      })

      if (hypothesis.status === 'validated' && hypothesis.selectedHypothesis) {
        const hypothesisCandidates = (this.getCodingState()?.lastImpactAnalysis?.targetCandidates || []).slice(0, 20)
        const targetDecisionArtifacts = this.buildTargetCaseAndJudgement({
          changeIntent: params.changeIntent,
          candidates: hypothesisCandidates,
          winnerFileHint: hypothesis.selectedHypothesis.filePath,
        })
        const selectedFile = this.resolveTargetFileFromJudgement({
          judgement: targetDecisionArtifacts.targetJudgement,
          availableFiles: hypothesisCandidates.map(candidate => candidate.filePath),
          fallbackFile: hypothesis.selectedHypothesis.filePath,
        })
        const selectedCandidate = hypothesisCandidates.find(candidate => candidate.filePath === selectedFile)

        const selection: CodingTargetSelection = {
          status: 'selected',
          selectedFile,
          targetKind: targetDecisionArtifacts.targetJudgement.targetKind,
          architectureLayer: targetDecisionArtifacts.targetJudgement.architectureLayer,
          intentDecomposition: targetDecisionArtifacts.targetJudgement.intentDecomposition,
          candidates: hypothesisCandidates,
          reason: targetDecisionArtifacts.fallbackReason
            ? `${targetDecisionArtifacts.targetJudgement.winnerReason} (fallback: ${targetDecisionArtifacts.fallbackReason})`
            : targetDecisionArtifacts.targetJudgement.winnerReason,
          recommendedNextAction: `Proceed with filePath="auto"; target judgement selected ${selectedFile}.`,
          changeIntent: params.changeIntent,
          selectedHypothesisId: hypothesis.selectedHypothesis.id,
          hypotheses: hypothesis.hypotheses,
          missingInformation: targetDecisionArtifacts.targetJudgement.missingInformation,
          evidenceChain: selectedCandidate?.reasons || hypothesis.selectedHypothesis.evidence,
          competition: this.buildTargetCompetitionFromJudgement(targetDecisionArtifacts.targetJudgement)
            || this.buildTargetCompetitionFromHypotheses(hypothesis.hypotheses),
        }

        this.runtime.stateManager.updateCodingState({
          lastTargetDecisionCase: targetDecisionArtifacts.targetCase,
          lastTargetJudgement: targetDecisionArtifacts.targetJudgement,
          lastTargetSelection: selection,
          targetCandidates: selection.candidates,
          ...(params.targetPath !== undefined ? { lastScopedTargetPath: params.targetPath } : {}),
        })

        return selection
      }

      const failureCandidates = (this.getCodingState()?.lastImpactAnalysis?.targetCandidates || []).slice(0, 20)
      const targetDecisionArtifacts = this.buildTargetCaseAndJudgement({
        changeIntent: params.changeIntent,
        candidates: failureCandidates,
        missingInformationHints: this.inferSelectionMissingInformation(params, failureCandidates, hypothesis.status === 'ambiguous' ? 'ambiguous' : 'no_match'),
      })

      const failedSelection: CodingTargetSelection = {
        status: hypothesis.status === 'ambiguous' ? 'ambiguous' : 'no_match',
        candidates: failureCandidates,
        reason: targetDecisionArtifacts.fallbackReason
          ? `${hypothesis.reason} (fallback: ${targetDecisionArtifacts.fallbackReason})`
          : hypothesis.reason,
        recommendedNextAction: hypothesis.status === 'ambiguous'
          ? 'Narrow search scope/targetPath or provide targetFile explicitly to disambiguate.'
          : 'Provide targetFile explicitly or run coding_search_text / coding_search_symbol first.',
        missingInformation: targetDecisionArtifacts.targetJudgement.missingInformation,
        changeIntent: params.changeIntent,
        hypotheses: hypothesis.hypotheses,
        ambiguityReason: hypothesis.status === 'ambiguous' ? hypothesis.reason : undefined,
        competition: this.buildTargetCompetitionFromHypotheses(hypothesis.hypotheses),
      }

      this.runtime.stateManager.updateCodingState({
        lastTargetDecisionCase: targetDecisionArtifacts.targetCase,
        lastTargetJudgement: targetDecisionArtifacts.targetJudgement,
        lastTargetSelection: failedSelection,
        targetCandidates: failedSelection.candidates,
        ...(params.targetPath !== undefined ? { lastScopedTargetPath: params.targetPath } : {}),
      })

      return failedSelection
    }

    const candidates = this.buildTargetCandidates({
      explicitTargetFile: params.targetFile,
      targetPath: params.targetPath,
      targetSymbol: params.targetSymbol,
      searchQuery: params.searchQuery,
    })

    const defaultTargetDecisionArtifacts = this.buildTargetCaseAndJudgement({
      changeIntent: params.changeIntent || 'behavior_fix',
      candidates,
      missingInformationHints: this.inferSelectionMissingInformation(params, candidates, candidates.length === 0 ? 'no_match' : 'ambiguous'),
    })

    let selection: CodingTargetSelection
    if (candidates.length === 0) {
      selection = {
        status: 'no_match',
        candidates,
        reason: 'No deterministic candidate was found from explicit input/search/references.',
        recommendedNextAction: 'Provide targetFile explicitly or run coding_search_text / coding_search_symbol first.',
        missingInformation: defaultTargetDecisionArtifacts.targetJudgement.missingInformation,
      }
    }
    else {
      const judgedWinnerCandidate = candidates.find(candidate => candidate.filePath === defaultTargetDecisionArtifacts.targetJudgement.winner)
      const judgedRunnerUpCandidate = defaultTargetDecisionArtifacts.targetJudgement.runnerUp
        ? candidates.find(candidate => candidate.filePath === defaultTargetDecisionArtifacts.targetJudgement.runnerUp)
        : undefined
      const top = candidates[0]!
      const second = candidates[1]
      const judgedTarget = judgedWinnerCandidate || judgedRunnerUpCandidate

      if (!judgedTarget && second && second.score === top.score) {
        selection = {
          status: 'ambiguous',
          candidates,
          reason: `Top candidates are tied at score ${top.score}. ${top.filePath} and ${second.filePath} cannot be deterministically ordered.`,
          recommendedNextAction: 'Narrow search scope/targetPath, provide targetSymbol/targetLine, or set targetFile explicitly to disambiguate.',
          ambiguityReason: `Tie on score=${top.score}; evidence1=${top.reasons.join(', ')}; evidence2=${second.reasons.join(', ')}.`,
          missingInformation: defaultTargetDecisionArtifacts.targetJudgement.missingInformation,
          competition: this.buildTargetCompetitionFromCandidates(candidates),
        }
      }
      else {
        selection = {
          status: 'selected',
          selectedFile: judgedTarget?.filePath || top.filePath,
          targetKind: defaultTargetDecisionArtifacts.targetJudgement.targetKind,
          architectureLayer: defaultTargetDecisionArtifacts.targetJudgement.architectureLayer,
          intentDecomposition: defaultTargetDecisionArtifacts.targetJudgement.intentDecomposition,
          candidates,
          reason: defaultTargetDecisionArtifacts.fallbackReason
            ? `${defaultTargetDecisionArtifacts.targetJudgement.winnerReason} (fallback: ${defaultTargetDecisionArtifacts.fallbackReason})`
            : defaultTargetDecisionArtifacts.targetJudgement.winnerReason,
          recommendedNextAction: `Proceed with filePath="auto"; the selected target is ${judgedTarget?.filePath || top.filePath}.`,
          changeIntent: params.changeIntent,
          missingInformation: defaultTargetDecisionArtifacts.targetJudgement.missingInformation,
          evidenceChain: [...(judgedTarget?.reasons || top.reasons)],
          competition: this.buildTargetCompetitionFromJudgement(defaultTargetDecisionArtifacts.targetJudgement)
            || this.buildTargetCompetitionFromCandidates(candidates),
        }
      }
    }

    this.runtime.stateManager.updateCodingState({
      targetCandidates: candidates,
      lastTargetDecisionCase: defaultTargetDecisionArtifacts.targetCase,
      lastTargetJudgement: defaultTargetDecisionArtifacts.targetJudgement,
      lastTargetSelection: selection,
      ...(params.targetPath !== undefined ? { lastScopedTargetPath: params.targetPath } : {}),
    })

    return selection
  }

  private async listDiffFiles(workspacePath: string, specificFilePath?: string) {
    try {
      const args = ['diff', '--name-only']
      if (specificFilePath) {
        args.push('--', specificFilePath)
      }
      const { stdout } = await execFileAsync('git', args, { cwd: workspacePath })
      return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    }
    catch {
      return []
    }
  }

  private async readDiffStat(workspacePath: string, specificFilePath?: string) {
    try {
      const args = ['diff', '--stat']
      if (specificFilePath) {
        args.push('--', specificFilePath)
      }
      const { stdout } = await execFileAsync('git', args, { cwd: workspacePath })
      return stdout.trim()
    }
    catch {
      return ''
    }
  }

  private async readDiffPatch(workspacePath: string, specificFilePath?: string) {
    try {
      const args = ['diff', '--unified=3']
      if (specificFilePath) {
        args.push('--', specificFilePath)
      }

      const { stdout } = await execFileAsync('git', args, { cwd: workspacePath })
      const normalized = stdout.trim()
      if (!normalized) {
        return ''
      }

      const lines = normalized.split('\n').slice(0, 120)
      return lines.join('\n')
    }
    catch {
      return ''
    }
  }

  private nextPendingPlanStep(currentPlan?: CodingChangePlan) {
    if (!currentPlan) {
      return undefined
    }

    const completedFiles = new Set(
      currentPlan.steps
        .filter(step => step.status === 'completed')
        .map(step => step.filePath),
    )

    return currentPlan.steps.find((step) => {
      if (step.status !== 'pending') {
        return false
      }

      const deps = step.dependsOn || []
      return deps.every(dep => completedFiles.has(dep))
    })
  }

  private getSessionStepByFilePath(session: CodingPlanSession, filePath: string) {
    return session.steps.find(step => step.filePath === filePath)
  }

  private computeSessionStepRuntimeStatus(session: CodingPlanSession, step: CodingPlanSession['steps'][number]) {
    if (step.status === 'validated' || step.status === 'needs_replan' || step.status === 'abandoned') {
      return step.status
    }

    const deps = step.dependsOn || []
    if (deps.length === 0) {
      return 'ready' as const
    }

    const dependencySteps = deps.map(dep => this.getSessionStepByFilePath(session, dep))
    if (dependencySteps.some(dep => !dep)) {
      return 'blocked_by_dependency' as const
    }

    if (dependencySteps.some(dep => dep!.status === 'needs_replan')) {
      return 'blocked_by_dependency' as const
    }

    if (dependencySteps.some(dep => dep!.status === 'in_progress' || dep!.status === 'ready' || dep!.status === 'awaiting_checkpoint')) {
      return 'awaiting_checkpoint' as const
    }

    if (dependencySteps.some(dep => dep!.status !== 'validated')) {
      return 'blocked_by_dependency' as const
    }

    return 'ready' as const
  }

  private buildPlannerDecision(session: CodingPlanSession, previousSession?: CodingPlanSession, preferredFilePath?: string): CodingPlannerDecision | undefined {
    const state = this.getCodingState()
    const graph = state?.currentPlanGraph?.sessionId === session.id
      ? state.currentPlanGraph
      : buildPlanGraphFromSession(session)
    const previousGraph = previousSession ? buildPlanGraphFromSession(previousSession) : undefined

    return this.buildPlannerDecisionFromGraph({
      graph,
      previousGraph,
      changeIntent: session.changeIntent,
      preferredFilePath,
      mirrorSession: session,
    })
  }

  private buildPlannerDecisionFromGraph(params: {
    graph: CodingPlanGraph
    previousGraph?: CodingPlanGraph
    changeIntent: CodingChangeIntent
    preferredFilePath?: string
    mirrorSession?: CodingPlanSession
  }): CodingPlannerDecision | undefined {
    const state = this.getCodingState()

    const inputGraphGate = this.runPlanGraphSingleSourceGate({
      graph: params.graph,
      mirrorSession: params.mirrorSession,
      context: 'build_planner_decision_input',
    })
    const safeGraph = inputGraphGate.graph
    const safePreviousGraph = this.runPlanGraphSingleSourceGate({
      graph: params.previousGraph,
      context: 'build_planner_decision_previous',
    }).graph

    if (!safeGraph) {
      this.runtime.stateManager.updateCodingState({
        currentPlanGraph: undefined,
        lastPlanFrontier: undefined,
        lastPlanDraft: undefined,
        lastPlannerDecision: undefined,
        pendingIssues: this.clampStringArray(Array.from(new Set([
          ...(state?.pendingIssues || []),
          ...inputGraphGate.reasons,
        ]))),
      })
      return undefined
    }

    const decisionBundle = decideNextPlannerNode({
      graph: safeGraph,
      previousGraph: safePreviousGraph,
      changeIntent: params.changeIntent,
      lastSelectionFile: state?.lastTargetSelection?.selectedFile,
      companionFiles: state?.lastImpactAnalysis?.likelyCompanionFiles || [],
      scopedValidationFilePath: state?.lastScopedValidationCommand?.scope === 'file'
        ? state.lastScopedValidationCommand.filePath
        : undefined,
      preferredFilePath: params.preferredFilePath,
    })

    const graphWithRunningNode = decisionBundle.decision
      ? promoteNodeRunning({
          graph: safeGraph,
          filePath: decisionBundle.decision.selectedFile,
        })
      : safeGraph

    const runningGraphGate = this.runPlanGraphSingleSourceGate({
      graph: graphWithRunningNode,
      mirrorSession: params.mirrorSession,
      context: 'build_planner_decision_running',
    })
    const stableGraph = runningGraphGate.graph
    if (!stableGraph) {
      this.runtime.stateManager.updateCodingState({
        currentPlanGraph: undefined,
        lastPlanFrontier: undefined,
        lastPlanDraft: undefined,
        lastPlannerDecision: undefined,
        pendingIssues: this.clampStringArray(Array.from(new Set([
          ...(state?.pendingIssues || []),
          ...runningGraphGate.reasons,
        ]))),
      })
      return undefined
    }

    const planDraftCandidate = buildPlanDraftFromGraph({
      graph: stableGraph,
      mode: safePreviousGraph ? 'replan' : 'initial',
      rationale: decisionBundle.decision?.decisionReason || 'No executable node in current frontier.',
    })
    const validatedDraft = validatePlanDraft(planDraftCandidate)
    const graphBackedSession = params.mirrorSession
      ? applyGraphToSession(params.mirrorSession, stableGraph)
      : undefined

    this.runtime.stateManager.updateCodingState({
      ...(graphBackedSession ? { currentPlanSession: graphBackedSession } : {}),
      currentPlanGraph: stableGraph,
      lastPlanFrontier: decisionBundle.frontier,
      ...(validatedDraft.ok ? { lastPlanDraft: validatedDraft.value } : {}),
      pendingIssues: this.clampStringArray(Array.from(new Set([
        ...(state?.pendingIssues || []),
        ...inputGraphGate.reasons,
        ...runningGraphGate.reasons,
      ]))),
    })

    return decisionBundle.decision
  }

  private enforcePlannerDecisionConstraint(
    plannerDecision: CodingPlannerDecision | undefined,
    params: {
      preferredFilePath?: string
      reasonTag: 'wrong_target_recovery' | 'missed_dependency_recovery' | 'amend_retry' | 'target_judgement' | 'causal_counterfactual'
    },
  ): CodingPlannerDecision | undefined {
    if (!plannerDecision || !params.preferredFilePath) {
      return plannerDecision
    }

    const constraintReason = `Planner constraint(${params.reasonTag}) keeps ${params.preferredFilePath} as recovery focus.`

    if (plannerDecision.selectedFile === params.preferredFilePath) {
      if (plannerDecision.decisionReason.includes(constraintReason)) {
        return plannerDecision
      }

      return {
        ...plannerDecision,
        decisionReason: `${constraintReason} Base decision: ${plannerDecision.decisionReason}`,
      }
    }

    const preferredCandidate = plannerDecision.candidateScores.find(candidate => candidate.filePath === params.preferredFilePath)
    if (!preferredCandidate) {
      return plannerDecision
    }

    return {
      ...plannerDecision,
      selectedFile: params.preferredFilePath,
      selectionMode: preferredCandidate.status === 'in_progress' ? 'resume_current' : 'recovery_retry',
      decisionReason: `${constraintReason} Base decision: ${plannerDecision.decisionReason}`,
    }
  }

  private selectNextExecutableStep(session: CodingPlanSession, previousSession?: CodingPlanSession, preferredFilePath?: string) {
    const plannerDecision = this.buildPlannerDecision(session, previousSession, preferredFilePath)
    if (!plannerDecision) {
      return undefined
    }

    return session.steps.find(step => step.filePath === plannerDecision.selectedFile)
      || session.steps.find(step => step.status === 'in_progress')
      || session.steps.find(step => step.status === 'ready')
  }

  private advancePlanSession(session: CodingPlanSession, options: {
    promoteNextStep?: boolean
    preferredFilePath?: string
    transitionReason?: string
  } = {}) {
    const normalizedSteps = session.steps.map((step) => {
      if (step.status === 'validated' || step.status === 'needs_replan' || step.status === 'abandoned') {
        return step
      }

      return {
        ...step,
        status: 'ready' as const,
      }
    })

    let nextSession: CodingPlanSession = {
      ...session,
      updatedAt: new Date().toISOString(),
      steps: normalizedSteps,
    }

    nextSession = {
      ...nextSession,
      steps: nextSession.steps.map((step) => {
        if (step.status === 'validated' || step.status === 'needs_replan' || step.status === 'abandoned') {
          return step
        }

        return {
          ...step,
          status: this.computeSessionStepRuntimeStatus(nextSession, step),
        }
      }),
    }

    const executableStep = options.promoteNextStep
      ? this.selectNextExecutableStep(nextSession, session, options.preferredFilePath)
      : undefined

    if (!executableStep) {
      return this.appendSessionTransitions(session, nextSession, options.transitionReason || 'advance_session')
    }

    const promotedSession: CodingPlanSession = {
      ...nextSession,
      steps: nextSession.steps.map((step) => {
        if (step.status === 'validated' || step.status === 'needs_replan' || step.status === 'abandoned') {
          return step
        }

        if (step.filePath === executableStep.filePath) {
          return { ...step, status: 'in_progress' as const }
        }

        return {
          ...step,
          status: this.computeSessionStepRuntimeStatus(nextSession, step),
        }
      }),
    }

    return this.appendSessionTransitions(session, promotedSession, options.transitionReason || 'promote_executable_step')
  }

  private applyCheckpointOutcome(session: CodingPlanSession, params: {
    filePath: string
    passed: boolean
  }) {
    const state = this.getCodingState()
    const baseGraph = state?.currentPlanGraph?.sessionId === session.id
      ? state.currentPlanGraph
      : buildPlanGraphFromSession(session)
    const graphWithOutcome = markCheckpointOutcome({
      graph: baseGraph,
      filePath: params.filePath,
      passed: params.passed,
    })
    const withOutcome = applyGraphToSession(session, graphWithOutcome)

    return this.advancePlanSession(withOutcome, {
      promoteNextStep: params.passed,
      transitionReason: params.passed ? 'checkpoint_passed' : 'checkpoint_failed',
    })
  }

  private insertMissedDependencyStep(session: CodingPlanSession, params: {
    currentFilePath?: string
    dependencyFilePath: string
    source: CodingPlanSession['steps'][number]['source']
  }) {
    const state = this.getCodingState()
    let graph = state?.currentPlanGraph?.sessionId === session.id
      ? state.currentPlanGraph
      : buildPlanGraphFromSession(session)

    if (params.currentFilePath) {
      graph = markCheckpointOutcome({
        graph,
        filePath: params.currentFilePath,
        passed: true,
      })
    }

    const insertion = insertMissedDependencyNode({
      graph,
      currentFilePath: params.currentFilePath,
      dependencyFilePath: params.dependencyFilePath,
      intent: session.changeIntent,
      source: params.source,
    })

    if (!insertion.ok) {
      const rejectionReason = 'reason' in insertion ? insertion.reason : 'unknown'
      return this.advancePlanSession(session, {
        promoteNextStep: true,
        transitionReason: `insert_missed_dependency_rejected:${rejectionReason}`,
      })
    }

    const graphAfterRecovery = params.currentFilePath
      ? recoverNeedsReplanNode({ graph: insertion.graph, filePath: params.currentFilePath })
      : insertion.graph

    const graphWithPromotion = promoteNodeRunning({
      graph: graphAfterRecovery,
      filePath: params.dependencyFilePath,
    })

    const nextSession = applyGraphToSession(session, graphWithPromotion)
    return this.advancePlanSession(nextSession, {
      promoteNextStep: true,
      preferredFilePath: params.dependencyFilePath,
      transitionReason: 'insert_missed_dependency_graph',
    })
  }

  private createDeterministicPlanFromSession(session: CodingPlanSession, diffBaselineFiles: string[]): CodingChangePlan {
    const state = this.getCodingState()
    if (state?.currentPlanGraph?.sessionId === session.id) {
      const graphGate = this.runPlanGraphSingleSourceGate({
        graph: state.currentPlanGraph,
        mirrorSession: session,
        context: 'deterministic_plan_from_session',
      })

      if (graphGate.graph) {
        if (graphGate.rebuilt || graphGate.rejected) {
          this.runtime.stateManager.updateCodingState({
            currentPlanGraph: graphGate.graph,
            ...(graphGate.rejected ? { lastPlanFrontier: undefined } : {}),
          })
        }
        return this.createDeterministicPlanFromGraph(graphGate.graph, diffBaselineFiles)
      }
    }

    const graph = buildPlanGraphFromSession(session)
    return this.createDeterministicPlanFromGraph(graph, diffBaselineFiles)
  }

  private createDeterministicPlanFromGraph(graph: CodingPlanGraph, diffBaselineFiles: string[]): CodingChangePlan {
    const graphNodes = [...(graph.nodes || [])].sort((left, right) => left.order - right.order)
    const graphStepLike = graphNodes.map((node) => {
      const dependsOn = node.dependsOn
        .map(depId => graphNodes.find(candidate => candidate.id === depId)?.filePath)
        .filter((dep): dep is string => Boolean(dep))

      const status: CodingPlanSession['steps'][number]['status'] = node.status === 'validated'
        ? 'validated'
        : node.status === 'needs_replan'
          ? 'needs_replan'
          : node.status === 'aborted'
            ? 'abandoned'
            : node.status === 'running'
              ? 'in_progress'
              : node.status === 'blocked'
                ? 'blocked_by_dependency'
                : node.status === 'awaiting_checkpoint'
                  ? 'awaiting_checkpoint'
                  : 'ready'

      return {
        filePath: node.filePath,
        intent: node.intent,
        source: node.source,
        status,
        dependsOn,
        checkpoint: node.checkpoint,
      }
    })

    const steps: CodingPlanStep[] = graphStepLike.map((step) => {
      let status: CodingPlanStep['status'] = 'pending'
      if (step.status === 'validated') {
        status = 'completed'
      }
      else if (step.status === 'needs_replan' || step.status === 'abandoned') {
        status = 'blocked'
      }

      return {
        filePath: step.filePath,
        intent: step.intent,
        source: step.source,
        status,
        dependsOn: step.dependsOn,
        checkpoint: step.checkpoint,
      }
    })

    return {
      maxPlannedFiles: Math.min(Math.max(graph.maxNodes, 1), 3) as 1 | 2 | 3,
      diffBaselineFiles,
      steps,
      reason: `Mirrored deterministic plan from graph ${graph.sessionId}.`,
    }
  }

  async planChanges(params: {
    intent: string
    allowMultiFile?: boolean
    maxPlannedFiles?: number
    changeIntent?: CodingChangeIntent
    sessionAware?: boolean
  }) {
    const state = this.getCodingState()
    if (!state) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace not reviewed yet. Call coding_review_workspace first.')
    }

    const changeIntent = params.changeIntent || 'behavior_fix'
    const sessionAware = params.sessionAware ?? false

    if (sessionAware) {
      const activeSession = state.currentPlanSession
      if (activeSession && ['active', 'investigating', 'amended'].includes(activeSession.status)) {
        const advancedSession = this.advancePlanSession(activeSession, {
          promoteNextStep: true,
          transitionReason: 'plan_changes_reuse_session',
        })
        const plannerDecision = this.buildPlannerDecision(advancedSession, activeSession, state.lastTargetSelection?.selectedFile)
        const nextExecutableStep = plannerDecision
          ? advancedSession.steps.find(step => step.filePath === plannerDecision.selectedFile)
          : this.selectNextExecutableStep(advancedSession, activeSession)
        this.runtime.stateManager.updateCodingState({
          currentPlanSession: advancedSession,
          lastPlannerDecision: plannerDecision,
          ...(nextExecutableStep
            ? {
                lastTargetSelection: {
                  status: 'selected',
                  selectedFile: nextExecutableStep.filePath,
                  targetKind: this.inferTargetKindFromPath(nextExecutableStep.filePath),
                  architectureLayer: this.inferArchitectureLayerFromPath(nextExecutableStep.filePath),
                  intentDecomposition: this.inferIntentDecomposition(advancedSession.changeIntent),
                  candidates: state.targetCandidates || [],
                  reason: plannerDecision?.decisionReason || `Continue session with executable step ${nextExecutableStep.filePath}.`,
                  recommendedNextAction: plannerDecision?.decisionReason || `Proceed with ${nextExecutableStep.filePath} in the active session.`,
                  changeIntent: advancedSession.changeIntent,
                  evidenceChain: plannerDecision?.candidateScores.find(candidate => candidate.filePath === nextExecutableStep.filePath)?.reasons,
                  competition: plannerDecision ? this.buildTargetCompetitionFromPlannerCandidates(plannerDecision.candidateScores) : this.buildTargetCompetitionFromCandidates(state.targetCandidates || []),
                } satisfies CodingTargetSelection,
              }
            : {}),
        })

        return advancedSession
      }
    }

    const activePlan = state.currentPlan
    if (!sessionAware && activePlan && activePlan.steps.some(step => step.status === 'pending')) {
      const pending = this.nextPendingPlanStep(activePlan)
      if (pending) {
        this.runtime.stateManager.updateCodingState({
          lastTargetSelection: {
            status: 'selected',
            selectedFile: pending.filePath,
            targetKind: this.inferTargetKindFromPath(pending.filePath),
            architectureLayer: this.inferArchitectureLayerFromPath(pending.filePath),
            intentDecomposition: this.inferIntentDecomposition(state.lastTargetSelection?.changeIntent),
            candidates: state.targetCandidates || [],
            reason: `Continue existing plan at pending step ${pending.filePath}.`,
            recommendedNextAction: `Proceed on ${pending.filePath} for the active plan.`,
            evidenceChain: [`pending_plan_step:${pending.filePath}`],
            competition: this.buildTargetCompetitionFromCandidates(state.targetCandidates || []),
          },
        })
      }
      return activePlan
    }

    const requestedMax = params.maxPlannedFiles ?? 2
    const allowMulti = params.allowMultiFile ?? true
    const maxPlannedFiles = (allowMulti ? Math.min(Math.max(requestedMax, 1), 3) : 1) as 1 | 2 | 3

    const selection = state.lastTargetSelection
    if (!selection || selection.status !== 'selected' || !selection.selectedFile) {
      throw new McpError(ErrorCode.InvalidParams, 'No selected target available. Run coding_select_target first.')
    }

    const candidateFiles = selection.candidates.map(candidate => candidate.filePath)
    if (new Set(candidateFiles).size !== candidateFiles.length) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid target candidate set: duplicate files detected. A single plan cannot include the same file twice.',
      )
    }

    const orderedFiles = [
      selection.selectedFile,
      ...candidateFiles.filter(filePath => filePath !== selection.selectedFile),
    ]

    const plannedFiles = orderedFiles.slice(0, maxPlannedFiles)
    if (new Set(plannedFiles).size !== plannedFiles.length) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Plan generation rejected duplicate file steps. Re-run target selection before planning.',
      )
    }

    if (plannedFiles.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'No files available for planning.')
    }

    const steps: CodingPlanStep[] = plannedFiles.map((filePath, index) => {
      const candidate = selection.candidates.find(item => item.filePath === filePath)
      const source: CodingPlanStep['source'] = candidate?.sourceKind === 'explicit'
        ? 'explicit'
        : index === 0
          ? 'target_selection'
          : 'search'

      return {
        filePath,
        intent: params.intent,
        source,
        status: 'pending',
        dependsOn: index === 0 ? [] : [plannedFiles[index - 1]!],
        checkpoint: index === 0 ? 'none' : 'validation_required_before_next',
      }
    })

    if (sessionAware) {
      const now = new Date().toISOString()
      const sessionSteps: CodingPlanSession['steps'] = plannedFiles.map((filePath, index) => {
        const candidate = selection.candidates.find(item => item.filePath === filePath)
        const source: CodingPlanSession['steps'][number]['source'] = candidate?.sourceKind === 'explicit'
          ? 'explicit'
          : index === 0
            ? 'target_selection'
            : 'search'

        return {
          filePath,
          intent: changeIntent,
          source,
          status: index === 0 ? 'ready' : 'blocked_by_dependency',
          dependsOn: index === 0 ? [] : [plannedFiles[index - 1]!],
          checkpoint: index === 0 ? 'none' : 'validation_required_before_next',
        }
      })

      const session: CodingPlanSession = {
        id: `plan_session_${Date.now()}`,
        createdAt: now,
        updatedAt: now,
        status: 'active',
        amendCount: 0,
        backtrackCount: 0,
        maxAmendCount: 2,
        maxBacktrackCount: 1,
        maxFiles: maxPlannedFiles,
        changeIntent,
        steps: sessionSteps,
        reason: `Session planned with ${sessionSteps.length} file(s) for ${changeIntent} (dependsOn + checkpoint enabled).`,
      }

      const advancedSession = this.advancePlanSession(session, {
        promoteNextStep: true,
        transitionReason: 'plan_session_initialized',
      })
      const plannerDecision = this.buildPlannerDecision(advancedSession, session, selection.selectedFile)
      const nextExecutableStep = plannerDecision
        ? advancedSession.steps.find(step => step.filePath === plannerDecision.selectedFile)
        : this.selectNextExecutableStep(advancedSession, session)

      const nextPlanHistory = [...(state.planHistory || []), advancedSession].slice(-10)
      this.runtime.stateManager.updateCodingState({
        currentPlanSession: advancedSession,
        planHistory: nextPlanHistory,
        lastPlannerDecision: plannerDecision,
        ...(nextExecutableStep
          ? {
              lastTargetSelection: {
                status: 'selected',
                selectedFile: nextExecutableStep.filePath,
                targetKind: this.inferTargetKindFromPath(nextExecutableStep.filePath),
                architectureLayer: this.inferArchitectureLayerFromPath(nextExecutableStep.filePath),
                intentDecomposition: this.inferIntentDecomposition(changeIntent),
                candidates: selection.candidates,
                reason: plannerDecision?.decisionReason || `Session initialized, current target is ${nextExecutableStep.filePath}.`,
                recommendedNextAction: plannerDecision?.decisionReason || `Edit ${nextExecutableStep.filePath} for intent ${changeIntent}.`,
                changeIntent,
                evidenceChain: plannerDecision?.candidateScores.find(candidate => candidate.filePath === nextExecutableStep.filePath)?.reasons,
                competition: plannerDecision ? this.buildTargetCompetitionFromPlannerCandidates(plannerDecision.candidateScores) : this.buildTargetCompetitionFromCandidates(selection.candidates),
              } satisfies CodingTargetSelection,
            }
          : {}),
      })

      return advancedSession
    }

    const diffBaselineFiles = await this.listDiffFiles(state.workspacePath)

    const plan: CodingChangePlan = {
      maxPlannedFiles,
      diffBaselineFiles,
      steps,
      reason: `Planned ${steps.length} file(s) with maxPlannedFiles=${maxPlannedFiles} (dependsOn + checkpoint enabled).`,
    }

    this.runtime.stateManager.updateCodingState({
      currentPlan: plan,
      lastTargetSelection: {
        status: 'selected',
        selectedFile: steps[0]!.filePath,
        targetKind: this.inferTargetKindFromPath(steps[0]!.filePath),
        architectureLayer: this.inferArchitectureLayerFromPath(steps[0]!.filePath),
        intentDecomposition: this.inferIntentDecomposition(changeIntent),
        candidates: selection.candidates,
        reason: `Plan initialized, current target is ${steps[0]!.filePath}.`,
        recommendedNextAction: `Edit ${steps[0]!.filePath} for intent: ${params.intent}.`,
        evidenceChain: [`planned_step_0:${steps[0]!.filePath}`],
        competition: this.buildTargetCompetitionFromCandidates(selection.candidates),
      },
    })

    return plan
  }

  async reviewChanges(params: {
    currentFilePath?: string
  } = {}) {
    const state = this.getCodingState()
    if (!state) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace not reviewed yet. Call coding_review_workspace first.')
    }

    let currentPlan = state.currentPlan
    if (!currentPlan && state.currentPlanGraph?.nodes?.length) {
      const graphGate = this.runPlanGraphSingleSourceGate({
        graph: state.currentPlanGraph,
        mirrorSession: state.currentPlanSession,
        context: 'review_changes_graph_mirror',
      })
      const diffBaselineFiles = state.validationBaseline?.baselineDirtyFiles ?? []
      if (graphGate.graph) {
        currentPlan = this.createDeterministicPlanFromGraph(graphGate.graph, diffBaselineFiles)
        this.runtime.stateManager.updateCodingState({
          currentPlan,
          ...(graphGate.rebuilt || graphGate.rejected
            ? {
                currentPlanGraph: graphGate.graph,
                ...(graphGate.rejected ? { lastPlanFrontier: undefined } : {}),
              }
            : {}),
        })
      }
    }

    if (!currentPlan) {
      throw new McpError(ErrorCode.InvalidParams, 'No active plan found. Run coding_plan_changes first.')
    }

    const currentFilePath = params.currentFilePath
      || state.lastTargetSelection?.selectedFile
      || this.nextPendingPlanStep(currentPlan)?.filePath

    if (!currentFilePath) {
      throw new McpError(ErrorCode.InvalidParams, 'No file can be reviewed. Missing selected target and pending plan step.')
    }

    const expectedFiles = currentPlan.steps.map(step => step.filePath)
    const currentDiffFiles = await this.listDiffFiles(state.workspacePath)
    const actualTouchedFilesFromDiff = currentDiffFiles.filter(file => !currentPlan.diffBaselineFiles.includes(file))
    const recentEditFilesForExpectedTargets = (state.recentEdits || [])
      .map(edit => edit.path)
      .filter(file => file && expectedFiles.includes(file) && !currentPlan.diffBaselineFiles.includes(file))
    const actualTouchedFiles = Array.from(new Set([...actualTouchedFilesFromDiff, ...recentEditFilesForExpectedTargets])).sort((a, b) => a.localeCompare(b))
    const planExternalTouchedFiles = actualTouchedFilesFromDiff.filter(file => !expectedFiles.includes(file))

    const detectedRisks: CodingReviewRisk[] = []
    const latestTerminalResult = this.getLatestTerminalResult()
    const currentValidationOutput = this.sanitizeValidationOutput(`${latestTerminalResult?.stderr || ''}\n${latestTerminalResult?.stdout || ''}`)
    let validationSummary = 'No validation command detected for current plan step.'
    let baselineComparison: 'new_red' | 'baseline_noise' | 'unknown' = 'unknown'

    if (!latestTerminalResult) {
      detectedRisks.push('no_validation_run')
    }
    else if (latestTerminalResult.timedOut) {
      detectedRisks.push('validation_timed_out')
      validationSummary = `Validation timed out: ${latestTerminalResult.command}`
    }
    else if (latestTerminalResult.exitCode !== 0) {
      detectedRisks.push('validation_failed')
      baselineComparison = this.inferBaselineComparison({
        latestTerminalResult,
        baseline: state.validationBaseline,
        currentValidationOutput,
        currentDiffFiles,
      })

      const diffEscapeFiles = this.findDiffEscapeFiles(currentDiffFiles, state.validationBaseline)
      if (diffEscapeFiles.length > 0 && baselineComparison !== 'baseline_noise') {
        detectedRisks.push('baseline_diff_escape')
      }

      validationSummary = `Validation failed with exit ${latestTerminalResult.exitCode}: ${latestTerminalResult.command}`
      if (baselineComparison === 'baseline_noise') {
        validationSummary += ' (matched known baseline failing check)'
      }
      else if (diffEscapeFiles.length > 0) {
        validationSummary += ` (baseline diff escape: ${diffEscapeFiles.join(', ')})`
      }
    }
    else {
      validationSummary = `Validation passed: ${latestTerminalResult.command}`
    }

    if (planExternalTouchedFiles.length > 0) {
      detectedRisks.push('unexpected_files_touched')
    }

    const touchedCurrentFile = actualTouchedFiles.includes(currentFilePath)
    if (!touchedCurrentFile) {
      detectedRisks.push('patch_verification_mismatch')
    }

    const unresolvedIssues = this.inferAutoUnresolvedIssues().filter(issue => issue !== 'No unresolved issues inferred from current coding state.')
    if (unresolvedIssues.length > 0) {
      detectedRisks.push('unresolved_issues_remain')
    }

    const uniqueRisks = Array.from(new Set(detectedRisks))

    const reviewStatus: CodingChangeReview['status'] = uniqueRisks.includes('validation_timed_out') || uniqueRisks.includes('validation_failed')
      ? 'failed'
      : uniqueRisks.includes('unexpected_files_touched') || uniqueRisks.includes('patch_verification_mismatch')
        ? 'blocked'
        : uniqueRisks.includes('no_validation_run') || uniqueRisks.includes('unresolved_issues_remain')
          ? 'needs_follow_up'
          : 'ready_for_next_file'

    const updatedSteps = currentPlan.steps.map((step) => {
      if (step.filePath !== currentFilePath) {
        return step
      }

      if (reviewStatus === 'ready_for_next_file') {
        return { ...step, status: 'completed' as const }
      }

      if (reviewStatus === 'blocked' || reviewStatus === 'failed') {
        return { ...step, status: 'blocked' as const }
      }

      return step
    })

    const updatedPlan: CodingChangePlan = {
      ...currentPlan,
      steps: updatedSteps,
    }

    const nextPending = this.nextPendingPlanStep(updatedPlan)
    const checkpointStatus: CodingChangeReview['checkpointStatus'] = reviewStatus === 'ready_for_next_file'
      ? nextPending
        ? 'pending_next_file'
        : 'passed'
      : 'needs_recovery'

    const scopedValidation = await this.resolveScopedValidationCommand(currentFilePath)
    const diffSummary = (await this.readDiffStat(state.workspacePath, currentFilePath))
      || (await this.readDiffStat(state.workspacePath))
      || 'No git diff --stat output available.'
    const diffPatchExcerpt = (await this.readDiffPatch(state.workspacePath, currentFilePath))
      || (await this.readDiffPatch(state.workspacePath))
      || ''

    const recommendedNextAction = reviewStatus === 'ready_for_next_file'
      ? nextPending
        ? `Checkpoint passed. Proceed to next planned file: ${nextPending.filePath}.`
        : 'All planned files are completed. You can report completion.'
      : reviewStatus === 'needs_follow_up'
        ? `Run scoped validation first (${scopedValidation.command}), then continue.`
        : reviewStatus === 'blocked'
          ? `Resolve blocked risks and re-validate with scoped command (${scopedValidation.command}).`
          : `Resolve validation failure/timeouts, then re-run scoped validation (${scopedValidation.command}).`

    const review: CodingChangeReview = {
      status: reviewStatus,
      checkpointStatus,
      filesReviewed: this.clampStringArray(actualTouchedFiles.length > 0 ? actualTouchedFiles : [currentFilePath]),
      diffSummary: this.clampString(diffSummary || 'No diff summary available.'),
      diffPatchExcerpt: this.clampString(diffPatchExcerpt),
      validationSummary: this.clampString(validationSummary),
      validationCommand: latestTerminalResult?.command,
      baselineComparison,
      detectedRisks: uniqueRisks,
      unresolvedIssues: this.clampStringArray(unresolvedIssues),
      recommendedNextAction: this.clampString(recommendedNextAction),
      nextExecutableFile: undefined,
      nextExecutableReason: undefined,
      plannerDecisionRef: undefined,
    }

    const currentSession = state.currentPlanSession
    let nextSession = currentSession
    let nextInvestigation: CodingInvestigation | undefined
    let nextPlannerDecision: CodingPlannerDecision | undefined

    if (currentSession) {
      const now = new Date().toISOString()
      const checkpointPassed = reviewStatus === 'ready_for_next_file'
      const checkpointFailed = reviewStatus === 'blocked' || reviewStatus === 'failed'

      if (checkpointPassed || checkpointFailed) {
        nextSession = this.applyCheckpointOutcome(currentSession, {
          filePath: currentFilePath,
          passed: checkpointPassed,
        })
      }
      else {
        nextSession = this.advancePlanSession(currentSession, {
          preferredFilePath: currentFilePath,
          transitionReason: 'review_follow_up_refresh',
        })
      }

      nextPlannerDecision = nextSession
        ? this.buildPlannerDecision(nextSession, currentSession, currentFilePath)
        : undefined

      const isCompleted = nextSession?.steps.every(step => step.status === 'validated') || false
      const needsInvestigation = reviewStatus === 'blocked' || reviewStatus === 'failed'

      let trigger: CodingInvestigation['trigger'] | undefined
      if (needsInvestigation) {
        if (uniqueRisks.includes('patch_verification_mismatch')) {
          trigger = 'patch_verification_mismatch'
        }
        else if (uniqueRisks.includes('validation_timed_out')) {
          trigger = 'validation_timed_out'
        }
        else if (uniqueRisks.includes('validation_failed')) {
          trigger = 'validation_failed'
        }
        else if (uniqueRisks.includes('unexpected_files_touched')) {
          trigger = 'unexpected_impacted_file_discovered'
        }
      }

      if (trigger) {
        nextInvestigation = {
          at: now,
          trigger,
          summary: `Session entered investigation due to ${trigger}.`,
          evidence: uniqueRisks,
          recommendedAction: recommendedNextAction,
        }
      }

      nextSession = {
        ...nextSession,
        status: isCompleted
          ? 'completed'
          : needsInvestigation
            ? 'investigating'
            : 'active',
        updatedAt: now,
      }

      if (nextPlannerDecision) {
        review.nextExecutableFile = nextPlannerDecision.selectedFile
        review.nextExecutableReason = nextPlannerDecision.decisionReason
        review.plannerDecisionRef = {
          selectedFile: nextPlannerDecision.selectedFile,
          selectionMode: nextPlannerDecision.selectionMode,
          decisionReason: nextPlannerDecision.decisionReason,
        }
      }
    }

    this.runtime.stateManager.updateCodingState({
      currentPlan: updatedPlan,
      currentPlanSession: nextSession,
      lastChangeReview: review,
      lastValidationSummary: review.validationSummary,
      lastPlannerDecision: nextPlannerDecision,
      ...(nextInvestigation ? { lastInvestigation: nextInvestigation } : {}),
      pendingIssues: this.clampStringArray(unresolvedIssues),
      ...(nextPending
        ? {
            lastTargetSelection: {
              status: 'selected',
              selectedFile: nextPending.filePath,
              targetKind: this.inferTargetKindFromPath(nextPending.filePath),
              architectureLayer: this.inferArchitectureLayerFromPath(nextPending.filePath),
              intentDecomposition: this.inferIntentDecomposition(nextSession?.changeIntent),
              candidates: state.targetCandidates || [],
              reason: `Next pending planned file is ${nextPending.filePath}.`,
              recommendedNextAction: `Continue with ${nextPending.filePath}.`,
              evidenceChain: [`next_pending_step:${nextPending.filePath}`],
              competition: this.buildTargetCompetitionFromCandidates(state.targetCandidates || []),
            } satisfies CodingTargetSelection,
          }
        : nextPlannerDecision
          ? {
              lastTargetSelection: {
                status: 'selected',
                selectedFile: nextPlannerDecision.selectedFile,
                targetKind: this.inferTargetKindFromPath(nextPlannerDecision.selectedFile),
                architectureLayer: this.inferArchitectureLayerFromPath(nextPlannerDecision.selectedFile),
                intentDecomposition: this.inferIntentDecomposition(nextSession?.changeIntent),
                candidates: state.targetCandidates || [],
                reason: nextPlannerDecision.decisionReason,
                recommendedNextAction: nextPlannerDecision.decisionReason,
                changeIntent: nextSession?.changeIntent,
                evidenceChain: nextPlannerDecision.candidateScores.find(candidate => candidate.filePath === nextPlannerDecision.selectedFile)?.reasons,
                competition: this.buildTargetCompetitionFromPlannerCandidates(nextPlannerDecision.candidateScores),
              } satisfies CodingTargetSelection,
            }
          : {}),
    })

    return review
  }

  async diagnoseChanges(params: {
    currentFilePath?: string
    validationOutput?: string
  } = {}) {
    const state = this.getCodingState()
    if (!state) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace not reviewed yet. Call coding_review_workspace first.')
    }

    const review = state.lastChangeReview
    if (!review) {
      throw new McpError(ErrorCode.InvalidParams, 'No review context available. Run coding_review_changes first.')
    }

    const latestTerminalResult = this.getLatestTerminalResult()
    const validationOutput = params.validationOutput || review.validationSummary || latestTerminalResult?.stderr || latestTerminalResult?.stdout || ''
    const risks = new Set(review.detectedRisks)
    const evidence: string[] = [review.status, ...Array.from(risks), ...(review.unresolvedIssues || [])]

    if (review.validationCommand) {
      evidence.push(`validation_command:${review.validationCommand}`)
    }
    if (review.baselineComparison) {
      evidence.push(`baseline_comparison:${review.baselineComparison}`)
    }
    if (review.diffPatchExcerpt) {
      evidence.push(`diff_patch_excerpt:${review.diffPatchExcerpt}`)
    }
    if (state.currentPlanSession) {
      evidence.push(`plan_session_status:${state.currentPlanSession.status}`)
    }
    if (state.lastImpactAnalysis) {
      evidence.push(`impact_candidates:${state.lastImpactAnalysis.targetCandidates.length}`)
      evidence.push(`impact_companions:${state.lastImpactAnalysis.likelyCompanionFiles.length}`)
    }

    const validationCommand = review.validationCommand || latestTerminalResult?.command

    const currentFilePath = params.currentFilePath
      || state.lastTargetSelection?.selectedFile
      || state.currentPlanSession?.steps.find(step => step.status === 'in_progress')?.filePath
      || state.currentPlan?.steps.find(step => step.status === 'pending')?.filePath

    const affectedFiles = Array.from(new Set([
      ...(review.filesReviewed || []),
      ...(currentFilePath ? [currentFilePath] : []),
      ...(state.lastImpactAnalysis?.likelyCompanionFiles || []).slice(0, 4),
      ...(state.lastImpactAnalysis?.likelyImpactedTests || []).slice(0, 3),
    ])).slice(0, 12)

    const touchedSymbols = this.extractTouchedSymbolsFromPatch(review.diffPatchExcerpt || '')
    const hasJsTsScope = affectedFiles.some(file => this.isJsTsSemanticPath(file))
    const causalHints = hasJsTsScope
      ? this.buildCausalHints({
          affectedFiles,
          validationOutput,
          touchedSymbols,
          impact: state.lastImpactAnalysis,
        })
      : []
    if (causalHints.length > 0) {
      evidence.push(...causalHints.map(hint => `causal_hint:${hint}`))
    }

    const changedFiles = review.filesReviewed || []
    const currentFileTouched = currentFilePath ? changedFiles.includes(currentFilePath) : false
    const mentionedValidationFiles = Array.from(new Set(validationOutput.match(/[\w./-]+\.(?:tsx|jsx|mts|cts|ts|js)/g) || []))
    const validationMentionsOtherFile = mentionedValidationFiles.some(file => file !== currentFilePath)
    const assertionLikeFailure = this.isLikelyTestOnlyBreakage(validationOutput)
    const impactCompanionHits = (state.lastImpactAnalysis?.likelyCompanionFiles || []).filter(file => changedFiles.includes(file) || validationOutput.includes(file))
    const impactReferenceHits = (state.lastImpactAnalysis?.directReferences || []).filter(reference => changedFiles.includes(reference.file) || validationOutput.includes(reference.file))
    const impactTestHits = (state.lastImpactAnalysis?.likelyImpactedTests || []).filter(file => changedFiles.includes(file) || validationOutput.includes(file))
    const hasImpactHit = impactCompanionHits.length > 0 || impactReferenceHits.length > 0 || impactTestHits.length > 0
    const filesMostlyTestsOrFixtures = changedFiles.length > 0
      && changedFiles.every(file => this.isTestLikePath(file) || /fixture/i.test(file))
    const validationCommandMismatch = this.isLikelyValidationCommandMismatch(validationCommand, risks)
    const scopedValidationDivergent = Boolean(
      state.lastScopedValidationCommand?.command
      && validationCommand
      && state.lastScopedValidationCommand.command.trim().toLowerCase() !== validationCommand.trim().toLowerCase(),
    )
    const baselineAligned = review.baselineComparison === 'baseline_noise' && !risks.has('baseline_diff_escape')

    const buildDiagnosisCandidate = (
      rootCauseType: CodingDiagnosisCandidateScore['rootCauseType'],
      entries: Array<{ signal: string, active: boolean, weight: number }>,
      baseScore = 0.05,
    ): CodingDiagnosisCandidateScore => {
      const activeEntries = entries.filter(entry => entry.active)
      const score = Math.max(0.01, Math.min(0.99, baseScore + activeEntries.reduce((sum, entry) => sum + entry.weight, 0)))
      return {
        rootCauseType,
        score,
        signals: activeEntries.map(entry => entry.signal),
      }
    }

    const confidenceCandidates: CodingDiagnosisConfidenceBreakdown['candidateScores'] = [
      buildDiagnosisCandidate('wrong_target', [
        { signal: 'patch_verification_mismatch', active: risks.has('patch_verification_mismatch'), weight: 0.45 },
        { signal: 'current_file_not_touched', active: Boolean(currentFilePath) && !currentFileTouched, weight: 0.2 },
        { signal: 'validation_mentions_other_file_or_symbol', active: validationMentionsOtherFile, weight: 0.16 },
      ]),
      buildDiagnosisCandidate('missed_dependency', [
        { signal: 'unexpected_files_touched', active: risks.has('unexpected_files_touched'), weight: 0.36 },
        { signal: 'baseline_diff_escape', active: risks.has('baseline_diff_escape'), weight: 0.26 },
        { signal: 'impact_companion_or_reference_hit', active: hasImpactHit, weight: 0.18 },
      ]),
      buildDiagnosisCandidate('incomplete_change', [
        { signal: 'validation_failed', active: risks.has('validation_failed') && review.baselineComparison !== 'baseline_noise', weight: 0.28 },
        { signal: 'unresolved_issues_remain', active: risks.has('unresolved_issues_remain') && review.baselineComparison !== 'baseline_noise', weight: 0.22 },
        { signal: 'current_file_touched_without_impact_hit', active: currentFileTouched && !hasImpactHit, weight: 0.18 },
      ]),
      buildDiagnosisCandidate('baseline_noise', [
        { signal: 'baseline_comparison_baseline_noise', active: review.baselineComparison === 'baseline_noise', weight: 0.4 },
        { signal: 'baseline_signature_test_diff_aligned', active: baselineAligned, weight: 0.22 },
      ]),
      buildDiagnosisCandidate('validation_command_mismatch', [
        { signal: 'command_not_validation_like', active: validationCommandMismatch, weight: 0.28 },
        { signal: 'no_validation_run', active: risks.has('no_validation_run'), weight: 0.28 },
        { signal: 'scoped_validation_command_divergent', active: scopedValidationDivergent, weight: 0.2 },
      ]),
      buildDiagnosisCandidate('test_only_breakage', [
        { signal: 'assertion_snapshot_failure', active: assertionLikeFailure, weight: 0.34 },
        { signal: 'changed_files_primarily_tests_or_fixtures', active: filesMostlyTestsOrFixtures, weight: 0.22 },
      ]),
      buildDiagnosisCandidate('validation_environment_issue', [
        { signal: 'validation_timed_out', active: risks.has('validation_timed_out'), weight: 0.5 },
      ], 0.02),
      buildDiagnosisCandidate('unknown', [
        { signal: 'insufficient_structured_signals', active: true, weight: 0.01 },
      ], 0.01),
    ]
      .sort((a, b) => b.score - a.score || a.rootCauseType.localeCompare(b.rootCauseType))

    const winner = confidenceCandidates[0]!
    const runnerUp = confidenceCandidates[1] || {
      rootCauseType: 'unknown',
      score: 0.01,
      signals: ['insufficient_structured_signals'],
    }

    const winnerMargin = Math.max(0, winner.score - runnerUp.score)
    const contestedSignals = winner.signals.filter(signal => runnerUp.signals.includes(signal))
    const disambiguationSignals = winner.signals.filter(signal => !runnerUp.signals.includes(signal))
    const conflictSignals = Array.from(new Set([...winner.signals, ...runnerUp.signals]))
    const conflicts: CodingDiagnosisConflict[] = conflictSignals.map((signal) => {
      const winnerSupports = winner.signals.includes(signal)
      const runnerUpSupports = runnerUp.signals.includes(signal)

      if (winnerSupports && !runnerUpSupports) {
        return {
          signal,
          winnerSupports,
          runnerUpSupports,
          resolution: 'favor_winner',
          reason: `Signal ${signal} supports winner(${winner.rootCauseType}) but not runner-up(${runnerUp.rootCauseType}).`,
        }
      }

      if (!winnerSupports && runnerUpSupports) {
        return {
          signal,
          winnerSupports,
          runnerUpSupports,
          resolution: 'favor_runner_up',
          reason: `Signal ${signal} supports runner-up(${runnerUp.rootCauseType}) but total score remained lower than winner(${winner.rootCauseType}).`,
        }
      }

      return {
        signal,
        winnerSupports,
        runnerUpSupports,
        resolution: 'tie',
        reason: `Signal ${signal} is shared by both winner(${winner.rootCauseType}) and runner-up(${runnerUp.rootCauseType}).`,
      }
    })

    const competition: CodingDiagnosisCompetition = {
      winner,
      runnerUp,
      winnerReason: `winner=${winner.rootCauseType}; winner_signals=${winner.signals.join(', ') || 'none'}; margin=${winnerMargin.toFixed(3)}`,
      runnerUpReason: `runner_up=${runnerUp.rootCauseType}; runner_up_signals=${runnerUp.signals.join(', ') || 'none'}; missing_winner_signals=${disambiguationSignals.join(', ') || 'none'}`,
      whyNotRunnerUpReason: `runner_up_lost_margin=${winnerMargin.toFixed(3)}; disambiguation_signals=${disambiguationSignals.join(', ') || 'none'}; contested_signals=${contestedSignals.join(', ') || 'none'}`,
      disambiguationSignals,
      contestedSignals,
      conflicts,
    }

    const counterfactualChecks: CodingCounterfactualCheck[] = buildCounterfactualChecks({
      winner: winner.rootCauseType === 'validation_environment_issue' || winner.rootCauseType === 'unknown'
        ? 'incomplete_change'
        : winner.rootCauseType,
      runnerUp: runnerUp.rootCauseType === 'validation_environment_issue' || runnerUp.rootCauseType === 'unknown'
        ? undefined
        : runnerUp.rootCauseType,
      winnerSignals: winner.signals,
      runnerUpSignals: runnerUp.signals,
    })

    const conflictingEvidence = conflicts
      .filter(conflict => conflict.resolution !== 'favor_winner' || contestedSignals.includes(conflict.signal))
      .map(conflict => `${conflict.signal}:${conflict.reason}`)
      .slice(0, 8)

    const confidenceBreakdown: CodingDiagnosisConfidenceBreakdown = {
      candidateScores: confidenceCandidates,
      winnerMargin,
      competition,
    }

    let rootCauseType: CodingChangeDiagnosis['rootCauseType'] = winner.rootCauseType
    if (rootCauseType !== 'validation_environment_issue' && winner.score < 0.2) {
      rootCauseType = 'unknown'
    }

    let confidence = winner.score
    const lowMarginPenalty = confidenceBreakdown.winnerMargin < 0.15 ? 0.08 : 0
    confidence = Math.max(0.05, Math.min(0.99, confidence - lowMarginPenalty))

    let shouldAmendPlan = ['wrong_target', 'incomplete_change', 'missed_dependency', 'test_only_breakage'].includes(rootCauseType)
    let shouldAbortPlan = rootCauseType === 'validation_environment_issue'
    let nextAction: CodingChangeDiagnosis['nextAction'] = shouldAmendPlan ? 'amend' : shouldAbortPlan ? 'abort' : 'continue'

    const diagnosisCase = buildDiagnosisCase({
      taskGoal: state.lastCompressedContext?.goal || state.lastCodingReport?.summary || 'coding_task',
      changeIntent: state.currentPlanSession?.changeIntent || state.lastTargetSelection?.changeIntent || 'behavior_fix',
      currentNode: currentFilePath || review.filesReviewed?.[0],
      changedFiles: review.filesReviewed || [],
      touchedSymbols,
      impactCompanions: state.lastImpactAnalysis?.likelyCompanionFiles || [],
      failingTests: this.extractFailingTests(validationOutput),
      stderrSignature: this.buildFailureSignature(validationOutput),
      baselineComparison: review.baselineComparison || 'unknown',
      scopedValidationCommand: state.lastScopedValidationCommand?.command,
      unresolvedIssues: review.unresolvedIssues || [],
      candidateRootCauses: confidenceCandidates,
    })

    const strongestSignals = new Set<string>()
    if (risks.has('patch_verification_mismatch')) {
      strongestSignals.add('patch_verification_mismatch')
    }
    if (risks.has('baseline_diff_escape')) {
      strongestSignals.add('baseline_diff_escape')
    }
    if (risks.has('unexpected_files_touched')) {
      strongestSignals.add('unexpected_files_touched')
    }
    if (review.baselineComparison === 'baseline_noise') {
      strongestSignals.add('baseline_noise_signature_match')
    }
    if (risks.has('validation_timed_out')) {
      strongestSignals.add('validation_timed_out')
    }
    if (risks.has('validation_failed') && this.isLikelyTestOnlyBreakage(validationOutput)) {
      strongestSignals.add('assertion_like_failure')
    }

    const evidenceMatrix: DiagnosisEvidence = {
      changedFiles: this.clampStringArray(review.filesReviewed || []),
      touchedSymbols: this.clampStringArray(touchedSymbols),
      impactCompanions: this.clampStringArray(state.lastImpactAnalysis?.likelyCompanionFiles || []),
      failingTests: this.clampStringArray(this.extractFailingTests(validationOutput)),
      stderrSignature: this.buildFailureSignature(validationOutput),
      baselineComparison: review.baselineComparison || 'unknown',
      scopedValidationCommand: state.lastScopedValidationCommand?.command,
      strongestSignals: this.clampStringArray(Array.from(strongestSignals)),
    }

    let recommendedRepairWindow = this.inferRecommendedRepairWindow({
      rootCauseType,
      currentFilePath,
      affectedFiles,
      impact: state.lastImpactAnalysis,
      currentPlanSession: state.currentPlanSession,
    })

    // NOTICE: This env hook exists only for smoke validation that schema rejection
    // falls back to deterministic diagnosis; normal runtime should never set it.
    const forceInvalidDiagnosisJudge = env.COMPUTER_USE_FORCE_INVALID_DIAGNOSIS_JUDGEMENT === '1'
    const diagnosisJudgementResolution = resolveDiagnosisJudgement({
      diagnosisCase,
      competition,
      recommendedNextAction: nextAction,
      recommendedRepairWindow,
      conflictingEvidence,
      counterfactualChecks,
      proposedJudgement: forceInvalidDiagnosisJudge
        ? {
            winner: 'invalid-root-cause',
            candidateScores: [],
          }
        : undefined,
    })

    const deterministicLockedRootCause = rootCauseType === 'validation_environment_issue' || rootCauseType === 'unknown'
    if (!deterministicLockedRootCause) {
      rootCauseType = diagnosisJudgementResolution.judgement.winner
      nextAction = diagnosisJudgementResolution.judgement.recommendedNextAction
      shouldAmendPlan = nextAction === 'amend'
      shouldAbortPlan = nextAction === 'abort'
      recommendedRepairWindow = diagnosisJudgementResolution.judgement.recommendedRepairWindow
    }

    const counterfactualOverride = this.applyCounterfactualActionOverride({
      rootCauseType,
      nextAction,
      competition,
      diagnosisJudgement: diagnosisJudgementResolution.judgement,
      allowRootCauseOverride: !deterministicLockedRootCause,
    })
    const judgementRecommendedNextAction = diagnosisJudgementResolution.judgement.recommendedNextAction
    rootCauseType = counterfactualOverride.rootCauseType
    nextAction = counterfactualOverride.nextAction
    const counterfactualRewroteNextAction = nextAction !== judgementRecommendedNextAction
    shouldAmendPlan = nextAction === 'amend'
    shouldAbortPlan = nextAction === 'abort'
    if (counterfactualOverride.notes.length > 0) {
      evidence.push(...counterfactualOverride.notes)
      recommendedRepairWindow = this.inferRecommendedRepairWindow({
        rootCauseType,
        currentFilePath,
        affectedFiles,
        impact: state.lastImpactAnalysis,
        currentPlanSession: state.currentPlanSession,
      })
    }
    if (counterfactualRewroteNextAction) {
      evidence.push(`counterfactual_priority_action:${judgementRecommendedNextAction}->${nextAction}`)
    }

    if (diagnosisJudgementResolution.usedFallback && diagnosisJudgementResolution.fallbackReason) {
      evidence.unshift(`diagnosis_judgement_fallback:${diagnosisJudgementResolution.fallbackReason}`)
    }
    else {
      evidence.push(`diagnosis_judgement_winner:${diagnosisJudgementResolution.judgement.winner}`)
    }

    const causalLinks: CausalLink[] = this.clampStringArray(Array.from(strongestSignals)).map((signal) => {
      return {
        from: signal,
        to: rootCauseType,
        reason: `Signal ${signal} supports ${rootCauseType}.`,
        strength: Math.max(0.3, Math.min(0.95, confidence)),
      }
    })

    evidence.push(`repair_window:${recommendedRepairWindow.scope}:${recommendedRepairWindow.files.join(',') || 'none'}`)

    const currentSession = state.currentPlanSession
    let nextSession = currentSession
    let plannerConstraintPreferredFilePath: string | undefined
    let plannerConstraintReasonTag: 'wrong_target_recovery' | 'missed_dependency_recovery' | 'amend_retry' | undefined
    const prioritizedNextAction = nextAction
    evidence.push(`next_action_priority:${prioritizedNextAction}`)
    if (currentSession) {
      const now = new Date().toISOString()
      let workingSession = this.advancePlanSession(currentSession, {
        promoteNextStep: true,
        ...(currentFilePath ? { preferredFilePath: currentFilePath } : {}),
        transitionReason: 'diagnosis_prep_refresh',
      })

      if (prioritizedNextAction === 'abort') {
        shouldAbortPlan = true
        shouldAmendPlan = false
      }
      else if (prioritizedNextAction === 'continue') {
        shouldAbortPlan = false
        shouldAmendPlan = false
      }

      if (!shouldAbortPlan && prioritizedNextAction === 'amend' && rootCauseType === 'wrong_target') {
        if (currentSession.backtrackCount >= currentSession.maxBacktrackCount) {
          shouldAbortPlan = true
          shouldAmendPlan = false
        }
        else {
          shouldAmendPlan = true
          if (currentFilePath) {
            plannerConstraintPreferredFilePath = currentFilePath
            plannerConstraintReasonTag = 'wrong_target_recovery'
            workingSession = this.applyCheckpointOutcome(workingSession, {
              filePath: currentFilePath,
              passed: false,
            })
            workingSession = this.advancePlanSession({
              ...workingSession,
              steps: workingSession.steps.map((step) => {
                if (step.filePath === currentFilePath && step.status === 'needs_replan') {
                  return { ...step, status: 'ready' as const }
                }
                return step
              }),
            }, {
              promoteNextStep: true,
              preferredFilePath: currentFilePath,
              transitionReason: 'wrong_target_recovery_retry',
            })
          }

          workingSession = {
            ...workingSession,
            status: 'amended',
            backtrackCount: currentSession.backtrackCount + 1,
            updatedAt: now,
          }
        }
      }
      else if (!shouldAbortPlan && prioritizedNextAction === 'amend' && shouldAmendPlan && currentSession.amendCount < currentSession.maxAmendCount) {
        if (rootCauseType === 'missed_dependency') {
          const candidate = this.pickMissedDependencyCandidate({
            state,
            currentSession: workingSession,
            currentFilePath,
            validationOutput,
          })
          const hasCapacity = workingSession.steps.length < currentSession.maxFiles

          if (candidate && hasCapacity) {
            plannerConstraintPreferredFilePath = candidate.filePath
            plannerConstraintReasonTag = 'missed_dependency_recovery'
            workingSession = this.insertMissedDependencyStep(workingSession, {
              currentFilePath,
              dependencyFilePath: candidate.filePath,
              source: 'search',
            })
            evidence.push(`added_dependency_file:${candidate.filePath}`)
            evidence.push(`dependency_source:${candidate.source}`)
            evidence.push(`dependency_score:${candidate.filePath}:${candidate.score}`)
          }
          else if (candidate && !hasCapacity) {
            evidence.unshift(`missed_dependency_capacity_exhausted:max_files=${currentSession.maxFiles}`)
            shouldAbortPlan = true
            shouldAmendPlan = false
          }
          else {
            evidence.unshift('missed_dependency_without_capacity_or_candidate')
            shouldAbortPlan = true
            shouldAmendPlan = false
          }
        }
        else if (currentFilePath) {
          plannerConstraintPreferredFilePath = currentFilePath
          plannerConstraintReasonTag = 'amend_retry'
          workingSession = this.applyCheckpointOutcome(workingSession, {
            filePath: currentFilePath,
            passed: false,
          })
          workingSession = this.advancePlanSession({
            ...workingSession,
            steps: workingSession.steps.map((step) => {
              if (step.filePath === currentFilePath && step.status === 'needs_replan') {
                return { ...step, status: 'ready' as const }
              }
              return step
            }),
          }, {
            promoteNextStep: true,
            preferredFilePath: currentFilePath,
            transitionReason: 'amend_retry_current_file',
          })
        }

        if (!shouldAbortPlan) {
          workingSession = {
            ...workingSession,
            status: 'amended',
            amendCount: currentSession.amendCount + 1,
            updatedAt: now,
          }
        }
      }
      else if (!shouldAbortPlan && prioritizedNextAction === 'amend' && shouldAmendPlan && currentSession.amendCount >= currentSession.maxAmendCount) {
        shouldAbortPlan = true
        shouldAmendPlan = false
      }

      if ((rootCauseType === 'baseline_noise' || rootCauseType === 'validation_command_mismatch' || prioritizedNextAction === 'continue') && !shouldAbortPlan) {
        shouldAmendPlan = false
        workingSession = {
          ...this.advancePlanSession(workingSession, {
            promoteNextStep: true,
            transitionReason: 'diagnosis_continue_without_amend',
          }),
          status: 'active',
          updatedAt: now,
        }
      }

      if (shouldAbortPlan) {
        shouldAmendPlan = false
        plannerConstraintPreferredFilePath = undefined
        plannerConstraintReasonTag = undefined
        workingSession = {
          ...workingSession,
          status: 'aborted',
          updatedAt: new Date().toISOString(),
          steps: workingSession.steps.map(step => step.status === 'in_progress' ? { ...step, status: 'needs_replan' as const } : step),
        }
      }

      nextSession = workingSession

      nextAction = shouldAbortPlan ? 'abort' : shouldAmendPlan ? 'amend' : 'continue'
      if (nextAction !== prioritizedNextAction) {
        evidence.push(`next_action_resolved:${prioritizedNextAction}->${nextAction}`)
      }
    }

    const postDiagnosisPlannerDecisionBase = (!shouldAbortPlan && nextSession)
      ? this.buildPlannerDecision(nextSession, state.currentPlanSession, currentFilePath)
      : undefined
    const constrainedPlannerDecision = this.enforcePlannerDecisionConstraint(postDiagnosisPlannerDecisionBase, {
      preferredFilePath: plannerConstraintPreferredFilePath,
      reasonTag: plannerConstraintReasonTag || 'amend_retry',
    })
    const counterfactualPlannerConstraint = this.deriveCounterfactualPlannerConstraint({
      state,
      plannerDecision: constrainedPlannerDecision,
      currentFilePath,
      diagnosis: {
        rootCauseType,
        nextAction,
        counterfactualChecks: diagnosisJudgementResolution.judgement.counterfactualChecks,
      },
    })
    const postDiagnosisPlannerDecision = counterfactualPlannerConstraint
      ? this.enforcePlannerDecisionConstraint(constrainedPlannerDecision, {
          preferredFilePath: counterfactualPlannerConstraint.preferredFilePath,
          reasonTag: counterfactualPlannerConstraint.reasonTag,
        })
      : constrainedPlannerDecision

    const postDiagnosisPlannerCandidates = postDiagnosisPlannerDecision
      ? this.buildTargetCandidatesFromPlannerDecision(postDiagnosisPlannerDecision, state.targetCandidates || [])
      : []
    const postDiagnosisTargetDecisionArtifacts = postDiagnosisPlannerDecision
      ? this.buildTargetCaseAndJudgement({
          changeIntent: nextSession?.changeIntent || state.currentPlanSession?.changeIntent || state.lastTargetSelection?.changeIntent || 'behavior_fix',
          candidates: postDiagnosisPlannerCandidates,
          winnerFileHint: postDiagnosisPlannerDecision.selectedFile,
          missingInformationHints: [
            ...(contestedSignals || []).slice(0, 2).map(signal => `diagnosis_contested_signal:${signal}`),
            ...(conflictingEvidence || []).slice(0, 2).map(item => `diagnosis_conflict:${item}`),
          ],
        })
      : undefined
    const postDiagnosisPlannerDecisionWithTargetJudge = (postDiagnosisPlannerDecision && postDiagnosisTargetDecisionArtifacts)
      ? this.applyTargetJudgementToPlannerDecision(
          postDiagnosisPlannerDecision,
          postDiagnosisTargetDecisionArtifacts.targetJudgement,
          {
            frontier: this.getCodingState()?.lastPlanFrontier,
            diagnosis: {
              nextAction,
              recommendedRepairWindow,
            },
          },
        )
      : postDiagnosisPlannerDecision

    if (counterfactualPlannerConstraint?.rationale) {
      evidence.push(counterfactualPlannerConstraint.rationale)
    }
    if (postDiagnosisTargetDecisionArtifacts?.fallbackReason) {
      evidence.push(`diagnosis_target_judgement_fallback:${postDiagnosisTargetDecisionArtifacts.fallbackReason}`)
    }
    else if (postDiagnosisTargetDecisionArtifacts) {
      evidence.push(`diagnosis_target_judgement_winner:${postDiagnosisTargetDecisionArtifacts.targetJudgement.winner}`)
    }
    if (
      postDiagnosisPlannerDecision
      && postDiagnosisPlannerDecisionWithTargetJudge
      && postDiagnosisPlannerDecision.selectedFile !== postDiagnosisPlannerDecisionWithTargetJudge.selectedFile
    ) {
      evidence.push(`diagnosis_target_judgement_override:${postDiagnosisPlannerDecision.selectedFile}->${postDiagnosisPlannerDecisionWithTargetJudge.selectedFile}`)
    }

    const recommendedAction = (() => {
      switch (rootCauseType) {
        case 'wrong_target':
          return 'Backtrack one step, select a corrected target file, and re-apply the patch to the right location.'
        case 'missed_dependency':
          return 'Amend the plan with newly impacted companion files/callsites, then validate again.'
        case 'test_only_breakage':
          return 'Update failing test assertions/fixtures to match intended behavior change, then rerun tests.'
        case 'baseline_noise':
          return 'Treat the failure as baseline noise and continue with scoped/new-red checks instead of aborting the session.'
        case 'validation_command_mismatch':
          return 'Run a validation command aligned with the current change intent and planned files.'
        case 'validation_environment_issue':
          return 'Abort current plan session and request environment/infra intervention before retry.'
        case 'incomplete_change':
          return 'Amend the current plan, complete missed edits, and rerun validation.'
        default:
          return 'Continue investigation with narrower scope and collect additional evidence.'
      }
    })()

    const diagnosis: CodingChangeDiagnosis = {
      rootCauseType,
      confidence,
      evidence: this.clampStringArray(evidence),
      affectedFiles: this.clampStringArray(affectedFiles),
      evidenceMatrix,
      causalHints: this.clampStringArray(causalHints),
      causalLinks,
      confidenceBreakdown,
      contestedSignals: this.clampStringArray(contestedSignals),
      conflictingEvidence: this.clampStringArray(conflictingEvidence),
      counterfactualChecks: diagnosisJudgementResolution.judgement.counterfactualChecks,
      recommendedRepairWindow,
      nextAction,
      recommendedAction: this.clampString(recommendedAction),
      shouldAmendPlan,
      shouldAbortPlan,
    }

    const causalTraceCandidate = buildCausalTrace({
      diagnosis: {
        rootCauseType: diagnosis.rootCauseType,
        nextAction: diagnosis.nextAction,
      },
      competition,
      evidenceMatrix,
      counterfactualChecks: diagnosis.counterfactualChecks || [],
    })
    const validatedCausalTrace = validateCausalTrace(causalTraceCandidate)
    const nextCausalTrace = validatedCausalTrace.ok ? validatedCausalTrace.value : undefined
    const nextCausalTraceLog = nextCausalTrace
      ? [...(state.causalTraceLog || []), nextCausalTrace].slice(-20)
      : state.causalTraceLog
    const diagnosisJudgeInput = this.buildDiagnosisJudgeInput({
      state,
      review,
      currentFilePath,
      touchedSymbols,
      confidenceBreakdown,
      competition,
      evidenceMatrix,
    })
    const replanDraftInput = this.buildReplanDraftInput({
      state,
      diagnosis,
      currentFilePath,
      plannerDecision: postDiagnosisPlannerDecisionWithTargetJudge,
    })

    this.runtime.stateManager.updateCodingState({
      lastChangeDiagnosis: diagnosis,
      lastDiagnosisCompetition: competition,
      lastDiagnosisCase: diagnosisCase,
      lastDiagnosisJudgement: diagnosisJudgementResolution.judgement,
      lastDiagnosisJudgeInput: diagnosisJudgeInput,
      lastReplanDraftInput: replanDraftInput,
      ...(nextCausalTrace
        ? {
            lastCausalTrace: nextCausalTrace,
            causalTraceLog: nextCausalTraceLog,
          }
        : {}),
      currentPlanSession: nextSession,
      lastPlannerDecision: postDiagnosisPlannerDecisionWithTargetJudge,
      ...(postDiagnosisTargetDecisionArtifacts
        ? {
            lastTargetDecisionCase: postDiagnosisTargetDecisionArtifacts.targetCase,
            lastTargetJudgement: postDiagnosisTargetDecisionArtifacts.targetJudgement,
          }
        : {}),
      ...(postDiagnosisPlannerDecisionWithTargetJudge
        ? {
            lastTargetSelection: {
              status: 'selected',
              selectedFile: postDiagnosisPlannerDecisionWithTargetJudge.selectedFile,
              targetKind: postDiagnosisTargetDecisionArtifacts
                ? postDiagnosisTargetDecisionArtifacts.targetJudgement.targetKind
                : this.inferTargetKindFromPath(postDiagnosisPlannerDecisionWithTargetJudge.selectedFile),
              architectureLayer: postDiagnosisTargetDecisionArtifacts
                ? postDiagnosisTargetDecisionArtifacts.targetJudgement.architectureLayer
                : this.inferArchitectureLayerFromPath(postDiagnosisPlannerDecisionWithTargetJudge.selectedFile),
              intentDecomposition: postDiagnosisTargetDecisionArtifacts
                ? postDiagnosisTargetDecisionArtifacts.targetJudgement.intentDecomposition
                : this.inferIntentDecomposition(nextSession?.changeIntent),
              candidates: postDiagnosisPlannerCandidates.length > 0 ? postDiagnosisPlannerCandidates : (state.targetCandidates || []),
              reason: postDiagnosisTargetDecisionArtifacts
                ? postDiagnosisTargetDecisionArtifacts.fallbackReason
                  ? `${postDiagnosisPlannerDecisionWithTargetJudge.decisionReason} ${postDiagnosisTargetDecisionArtifacts.targetJudgement.winnerReason} (fallback: ${postDiagnosisTargetDecisionArtifacts.fallbackReason})`
                  : `${postDiagnosisPlannerDecisionWithTargetJudge.decisionReason} ${postDiagnosisTargetDecisionArtifacts.targetJudgement.winnerReason}`
                : postDiagnosisPlannerDecisionWithTargetJudge.decisionReason,
              recommendedNextAction: postDiagnosisPlannerDecisionWithTargetJudge.decisionReason,
              changeIntent: nextSession?.changeIntent,
              evidenceChain: postDiagnosisPlannerDecisionWithTargetJudge.candidateScores.find(candidate => candidate.filePath === postDiagnosisPlannerDecisionWithTargetJudge.selectedFile)?.reasons,
              competition: postDiagnosisTargetDecisionArtifacts
                ? this.buildTargetCompetitionFromJudgement(postDiagnosisTargetDecisionArtifacts.targetJudgement)
                || this.buildTargetCompetitionFromPlannerCandidates(postDiagnosisPlannerDecisionWithTargetJudge.candidateScores)
                : this.buildTargetCompetitionFromPlannerCandidates(postDiagnosisPlannerDecisionWithTargetJudge.candidateScores),
            } satisfies CodingTargetSelection,
          }
        : {}),
    })

    return diagnosis
  }

  async captureValidationBaseline(params: {
    workspacePath?: string
    createTemporaryWorktree?: boolean
  } = {}) {
    const codingState = this.getCodingState()
    const workspacePath = params.workspacePath || codingState?.workspacePath
    if (!workspacePath) {
      throw new McpError(ErrorCode.InvalidParams, 'Workspace path is required. Run coding_review_workspace first or provide workspacePath.')
    }

    const baselineDirtyFiles = await this.listDiffFiles(workspacePath)
    const baselineDiffSummary = await this.readDiffStat(workspacePath)
    const latestTerminalResult = this.getLatestTerminalResult()
    const baselineValidationOutput = this.sanitizeValidationOutput(`${latestTerminalResult?.stderr || ''}\n${latestTerminalResult?.stdout || ''}`)
    const baselineFailingChecks: string[] = []
    let baselineFailureSignature: string | undefined
    let baselineFailingTests: string[] | undefined
    if (latestTerminalResult && latestTerminalResult.exitCode !== 0) {
      baselineFailingChecks.push(`${latestTerminalResult.command} (exit ${latestTerminalResult.exitCode})`)
      baselineFailureSignature = this.buildFailureSignature(baselineValidationOutput)
      baselineFailingTests = this.extractFailingTests(baselineValidationOutput)
    }

    let gitAvailable = true
    try {
      await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: workspacePath })
    }
    catch {
      gitAvailable = false
    }

    let worktreePath: string | undefined
    const createTemporaryWorktree = params.createTemporaryWorktree ?? true
    if (createTemporaryWorktree && gitAvailable) {
      const candidatePath = path.join(workspacePath, '.airi-agentic-worktree')
      try {
        await fs.rm(candidatePath, { recursive: true, force: true })
        await execFileAsync('git', ['worktree', 'add', '--detach', candidatePath, 'HEAD'], { cwd: workspacePath })
        worktreePath = candidatePath
      }
      catch {
        worktreePath = undefined
      }
    }

    const baseline: CodingValidationBaseline = {
      capturedAt: new Date().toISOString(),
      workspacePath: worktreePath || workspacePath,
      baselineDirtyFiles,
      baselineDiffSummary: baselineDiffSummary || 'No diff summary available.',
      baselineFailingChecks,
      baselineFailureSignature,
      baselineFailingTests,
      baselineValidationOutputExcerpt: baselineValidationOutput ? this.clampString(baselineValidationOutput) : undefined,
      baselineSkippedValidations: [],
      workspaceMetadata: {
        gitAvailable,
        worktreePath,
        sourceWorkspacePath: worktreePath ? workspacePath : undefined,
      },
    }

    this.runtime.stateManager.updateCodingState({
      validationBaseline: baseline,
      workspacePath: baseline.workspacePath,
    })

    return baseline
  }

  async readFile(filePath: string, startLine?: number, endLine?: number) {
    const resolvedFilePath = this.resolveTargetFileInput(filePath)
    const absPath = this.resolveWorkspacePath(resolvedFilePath)
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
      const recentReads = [...state.recentReads, { path: resolvedFilePath, range: rangeStr }]
      this.runtime.stateManager.updateCodingState({ recentReads })

      return output
    }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new McpError(ErrorCode.InternalError, `Failed to read file: ${msg}`)
    }
  }

  async applyPatch(filePath: string, oldString: string, newString: string) {
    const resolvedFilePath = this.resolveTargetFileInput(filePath)
    const absPath = this.resolveWorkspacePath(resolvedFilePath)
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
      const recentEdits = [...state.recentEdits, { path: resolvedFilePath, summary }]
      this.runtime.stateManager.updateCodingState({ recentEdits })

      return `Patch applied successfully to ${resolvedFilePath}.`
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
          state?.lastTargetSelection?.selectedFile ? `Selected target: ${state.lastTargetSelection.selectedFile}` : '',
          state?.currentPlan ? `Plan: ${state.currentPlan.steps.map(step => `${step.filePath}[${step.status}]`).join(', ')}` : '',
          ...(state?.recentSearches || []).map(s => `Searched: ${s}`),
          ...(state?.recentReads || []).map(r => `Read ${r.path} (${r.range})`),
          ...(state?.recentEdits || []).map(e => `Edited ${e.path}${e.summary ? ` — ${e.summary}` : ''}`),
        ].filter(Boolean).join('\n') || 'No tracked file activity.')
      : filesSummary

    const actualRecentResult = recentResultSummary === 'auto'
      ? ((state?.recentCommandResults || []).slice(-this.maxAutoArrayLength).join('\n---\n') || 'No commands run.')
      : recentResultSummary

    const actualUnresolvedIssues = unresolvedIssues === 'auto'
      ? this.inferAutoUnresolvedIssues().join('\n')
      : unresolvedIssues

    const actualNextStepRecommendation = nextStepRecommendation === 'auto'
      ? this.inferAutoNextStepRecommendation()
      : nextStepRecommendation

    const lastCompressedContext = {
      goal: this.clampString(goal),
      filesSummary: this.clampString(actualFilesSummary),
      recentResultSummary: this.clampString(actualRecentResult),
      unresolvedIssues: this.clampString(actualUnresolvedIssues),
      nextStepRecommendation: this.clampString(actualNextStepRecommendation),
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
      ? (state?.currentPlan?.steps.filter(step => step.status === 'completed').map(step => step.filePath)
        || (state?.recentEdits || []).map(e => e.path)
        || [])
      : filesTouched

    const actualCommandsRun = commandsRun.length === 1 && commandsRun[0] === 'auto'
      ? ((state?.recentCommandResults || []).map(r => r.split('\n')[0] || '') || [])
      : commandsRun

    const actualChecks = checks.length === 1 && checks[0] === 'auto'
      ? ((state?.lastChangeReview?.detectedRisks.length
          ? state.lastChangeReview.detectedRisks.map(risk => `risk:${risk}`)
          : (state?.recentCommandResults || []).map(r => r.split('\n')[1] || '')) || [])
      : checks

    const actualSummary = summary === 'auto'
      ? this.inferAutoReportSummary(actualStatus)
      : summary

    const actualNextStep = nextStep === 'auto'
      ? this.inferAutoReportNextStep(actualStatus)
      : nextStep

    const lastCodingReport = {
      status: actualStatus,
      summary: this.clampString(actualSummary),
      filesTouched: this.clampStringArray(actualFilesTouched),
      commandsRun: this.clampStringArray(actualCommandsRun),
      checks: this.clampStringArray(actualChecks),
      nextStep: this.clampString(actualNextStep),
    }

    this.runtime.stateManager.updateCodingState({ lastCodingReport })
    return lastCodingReport
  }
}
