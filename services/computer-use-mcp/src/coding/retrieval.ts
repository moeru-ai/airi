import type { ComputerUseServerRuntime } from '../server/runtime'
import type { TaskMemory } from '../task-memory/types'
import type { SessionTraceEntry } from '../types'

import { searchSymbol, searchText, toSingleLineSnippet } from './search'

// NOTICE: Internal retrieval layer for coding line.
// Phase 1 constraints:
// - Only serves coding line (not browser reroute)
// - Only repo_code produces selectedFiles
// - session_trace and task_memory only provide evidence
// - No caching, no persistence
// - No new public MCP tools

export type SearchRetrievalScope = 'repo_code' | 'session_trace' | 'task_memory'

export interface SearchPlan {
  workspacePath: string
  searchRoot?: string
  query?: string
  targetSymbol?: string
  targetPath?: string
  scopes: SearchRetrievalScope[]
  limitPerScope: number
  maxSelectedFiles: number
  maxTraceEntries: number
  maxEvidenceItems: number
}

export type SelectionMode = 'repo_only' | 'repo_plus_context' | 'no_repo_hits'

export interface SearchDiagnostics {
  repoHitCount: number
  traceHitCount: number
  taskMemoryHitCount: number
  selectedFileCount: number
  selectionMode: SelectionMode
}

export interface RepoHit {
  file: string
  line?: number
  column?: number
  snippet: string
  source: 'symbol' | 'text'
}

export interface TraceHit {
  id: string
  event: string
  toolName?: string
  snippet: string
  matchedField: string
}

export interface TaskMemoryHit {
  field: string
  snippet: string
}

export interface SearchEvidenceBundle {
  plan: SearchPlan
  repoHits: RepoHit[]
  traceHits: TraceHit[]
  taskMemoryHits: TaskMemoryHit[]
  selectedFiles: string[]
  diagnostics: SearchDiagnostics
  summary: string
}

// NOTICE: Execute search plan across all requested scopes.
// repo_code is the only source of selectedFiles.
// session_trace and task_memory only provide evidence snippets.
export async function executeSearchPlan(
  runtime: ComputerUseServerRuntime,
  plan: SearchPlan,
): Promise<SearchEvidenceBundle> {
  const repoHits: RepoHit[] = []
  const traceHits: TraceHit[] = []
  const taskMemoryHits: TaskMemoryHit[] = []
  const selectedFilesSet = new Set<string>()
  const searchRoot = plan.searchRoot || plan.targetPath

  // Phase 1: repo_code search (only source of selectedFiles)
  if (plan.scopes.includes('repo_code')) {
    if (plan.targetSymbol) {
      const symbolResult = await searchSymbol(plan.workspacePath, plan.targetSymbol, {
        searchRoot,
        limit: plan.limitPerScope,
      })

      if (!('status' in symbolResult)) {
        for (const match of symbolResult.matches.slice(0, plan.limitPerScope)) {
          repoHits.push({
            file: match.file,
            line: match.line,
            column: match.column,
            snippet: match.snippet || '',
            source: 'symbol',
          })
          selectedFilesSet.add(match.file)
        }
      }
    }

    if (plan.query) {
      const textResult = await searchText(plan.workspacePath, plan.query, {
        searchRoot,
        limit: plan.limitPerScope,
      })

      for (const match of textResult.matches.slice(0, plan.limitPerScope)) {
        repoHits.push({
          file: match.file,
          line: match.line,
          column: match.column,
          snippet: match.snippet,
          source: 'text',
        })
        selectedFilesSet.add(match.file)
      }
    }
  }

  // Phase 2: session_trace search (evidence only, no file nomination)
  if (plan.scopes.includes('session_trace')) {
    const recentTrace = runtime.session.getRecentTrace(plan.maxTraceEntries)
    const queryLower = (plan.query || plan.targetSymbol || '').toLowerCase()

    if (queryLower) {
      for (const entry of recentTrace) {
        const hits = matchTraceEntry(entry, queryLower)
        traceHits.push(...hits.slice(0, plan.maxEvidenceItems - traceHits.length))
        if (traceHits.length >= plan.maxEvidenceItems) {
          break
        }
      }
    }
  }

  // Phase 3: task_memory search (evidence only, no file nomination)
  if (plan.scopes.includes('task_memory')) {
    const taskMem = runtime.taskMemory.get()
    if (taskMem) {
      const queryLower = (plan.query || plan.targetSymbol || '').toLowerCase()
      if (queryLower) {
        const hits = matchTaskMemory(taskMem, queryLower)
        taskMemoryHits.push(...hits.slice(0, plan.maxEvidenceItems))
      }
    }
  }

  // Deduplicate and sort selectedFiles
  const selectedFiles = deduplicateAndSortFiles(
    Array.from(selectedFilesSet),
    repoHits,
    plan.targetPath,
    plan.workspacePath,
  ).slice(0, plan.maxSelectedFiles)

  // Build diagnostics
  const diagnostics: SearchDiagnostics = {
    repoHitCount: repoHits.length,
    traceHitCount: traceHits.length,
    taskMemoryHitCount: taskMemoryHits.length,
    selectedFileCount: selectedFiles.length,
    selectionMode: determineSelectionMode(repoHits, traceHits, taskMemoryHits),
  }

  const summary = buildSummary(diagnostics, plan)

  return {
    plan,
    repoHits,
    traceHits,
    taskMemoryHits,
    selectedFiles,
    diagnostics,
    summary,
  }
}

// NOTICE: Match trace entry fields with case-insensitive substring search.
// Only returns snippets, does not extract file paths.
function matchTraceEntry(entry: SessionTraceEntry, queryLower: string): TraceHit[] {
  const hits: TraceHit[] = []

  const checkField = (field: string, value: unknown) => {
    if (typeof value === 'string' && value.toLowerCase().includes(queryLower)) {
      hits.push({
        id: entry.id,
        event: entry.event,
        toolName: entry.toolName,
        snippet: toSingleLineSnippet(value),
        matchedField: field,
      })
      return true
    }
    return false
  }

  checkField('event', entry.event)

  if (entry.toolName) {
    checkField('toolName', entry.toolName)
  }

  if (entry.metadata) {
    for (const [key, value] of Object.entries(entry.metadata)) {
      if (checkField(`metadata.${key}`, value)) {
        break
      }
    }
  }

  if (entry.result) {
    const resultStr = JSON.stringify(entry.result)
    if (resultStr.toLowerCase().includes(queryLower)) {
      hits.push({
        id: entry.id,
        event: entry.event,
        toolName: entry.toolName,
        snippet: toSingleLineSnippet(resultStr),
        matchedField: 'result',
      })
    }
  }

  return hits
}

// NOTICE: Match task memory fields with case-insensitive substring search.
// Only returns snippets, does not extract file paths.
function matchTaskMemory(taskMem: TaskMemory, queryLower: string): TaskMemoryHit[] {
  const hits: TaskMemoryHit[] = []

  const checkField = (field: string, value: string | null | undefined) => {
    if (value && value.toLowerCase().includes(queryLower)) {
      hits.push({
        field,
        snippet: toSingleLineSnippet(value),
      })
    }
  }

  checkField('goal', taskMem.goal)
  checkField('currentStep', taskMem.currentStep)
  checkField('nextStep', taskMem.nextStep)

  for (const [index, fact] of taskMem.confirmedFacts.entries()) {
    checkField(`confirmedFacts[${index}]`, fact)
  }

  for (const [index, blocker] of taskMem.blockers.entries()) {
    checkField(`blockers[${index}]`, blocker)
  }

  if (taskMem.plan) {
    for (const [index, step] of taskMem.plan.entries()) {
      checkField(`plan[${index}]`, step)
    }
  }

  if (taskMem.workingAssumptions) {
    for (const [index, assumption] of taskMem.workingAssumptions.entries()) {
      checkField(`workingAssumptions[${index}]`, assumption)
    }
  }

  return hits
}

// NOTICE: Deduplicate and sort files by stable priority.
// Priority order: symbol hit > text hit > scoped path bonus > deterministic path sort
function deduplicateAndSortFiles(
  files: string[],
  repoHits: RepoHit[],
  targetPath: string | undefined,
  workspacePath: string,
): string[] {
  const fileScores = new Map<string, { symbol: number, text: number, scoped: boolean }>()

  for (const file of files) {
    if (!fileScores.has(file)) {
      fileScores.set(file, { symbol: 0, text: 0, scoped: false })
    }
  }

  for (const hit of repoHits) {
    const score = fileScores.get(hit.file)
    if (score) {
      if (hit.source === 'symbol') {
        score.symbol++
      }
      else if (hit.source === 'text') {
        score.text++
      }
    }
  }

  // Apply scoped path bonus
  if (targetPath) {
    for (const [file, score] of fileScores.entries()) {
      if (file === targetPath || file.startsWith(`${targetPath}/`)) {
        score.scoped = true
      }
    }
  }

  const sortedFiles = Array.from(fileScores.entries()).sort((a, b) => {
    const [fileA, scoreA] = a
    const [fileB, scoreB] = b

    // Priority 1: symbol hits
    if (scoreA.symbol !== scoreB.symbol) {
      return scoreB.symbol - scoreA.symbol
    }

    // Priority 2: text hits
    if (scoreA.text !== scoreB.text) {
      return scoreB.text - scoreA.text
    }

    // Priority 3: scoped path bonus
    if (scoreA.scoped !== scoreB.scoped) {
      return scoreA.scoped ? -1 : 1
    }

    // Priority 4: deterministic file path sort
    return fileA.localeCompare(fileB)
  })

  return sortedFiles.map(([file]) => file)
}

function determineSelectionMode(
  repoHits: RepoHit[],
  traceHits: TraceHit[],
  taskMemoryHits: TaskMemoryHit[],
): SelectionMode {
  const hasRepoHits = repoHits.length > 0
  const hasContextHits = traceHits.length > 0 || taskMemoryHits.length > 0

  if (hasRepoHits && hasContextHits) {
    return 'repo_plus_context'
  }
  if (hasRepoHits) {
    return 'repo_only'
  }
  return 'no_repo_hits'
}

function buildSummary(diagnostics: SearchDiagnostics, plan: SearchPlan): string {
  const parts: string[] = []

  if (diagnostics.selectedFileCount > 0) {
    parts.push(`Found ${diagnostics.selectedFileCount} candidate file(s) from repo code`)
  }
  else {
    parts.push('No candidate files found in repo code')
  }

  if (diagnostics.traceHitCount > 0) {
    parts.push(`${diagnostics.traceHitCount} session trace evidence`)
  }

  if (diagnostics.taskMemoryHitCount > 0) {
    parts.push(`${diagnostics.taskMemoryHitCount} task memory evidence`)
  }

  parts.push(`mode=${diagnostics.selectionMode}`)

  return parts.join('; ')
}

// NOTICE: Build evidence preview for tool results.
// Keeps snippets short for context efficiency.
export interface EvidencePreview {
  repoSnippets: string[]
  traceSnippets: string[]
  taskMemorySnippets: string[]
}

export function buildEvidencePreview(bundle: SearchEvidenceBundle): EvidencePreview {
  return {
    repoSnippets: bundle.repoHits.slice(0, 3).map(hit =>
      `${hit.file}:${hit.line || '?'} [${hit.source}] ${hit.snippet}`,
    ),
    traceSnippets: bundle.traceHits.slice(0, 3).map(hit =>
      `${hit.event} (${hit.matchedField}) ${hit.snippet}`,
    ),
    taskMemorySnippets: bundle.taskMemoryHits.slice(0, 3).map(hit =>
      `${hit.field}: ${hit.snippet}`,
    ),
  }
}
