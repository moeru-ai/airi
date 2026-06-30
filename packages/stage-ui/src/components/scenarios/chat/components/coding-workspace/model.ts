import type {
  McpBackendState,
  SpecPhase,
  SubagentJobRecord,
  SubagentJobStatus,
} from '@proj-airi/stage-ui/coding-workspace'
import type { ChatToolCallRendererProps } from '../tool-call-renderer'

const BACKEND_STATES = ['unavailable', 'available', 'serena'] as const satisfies readonly McpBackendState[]

export interface WorkspaceRendererRow {
  title: string
  detail?: string
  meta?: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export interface WorkspaceRendererModel {
  title: string
  summary: string
  state: NonNullable<ChatToolCallRendererProps['state']>
  backend?: McpBackendState
  icon: string
  rows: WorkspaceRendererRow[]
  detail: string
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

interface NormalizedPayload {
  args: Record<string, unknown>
  result: unknown
  resultRecord: Record<string, unknown>
  raw: unknown
  rawRecord: Record<string, unknown>
  structured: unknown
  structuredRecord: Record<string, unknown>
}

const semanticTitles: Record<string, string> = {
  workspace_get_symbols_overview: 'Symbols',
  workspace_find_symbol: 'Symbol',
  workspace_find_declaration: 'Declaration',
  workspace_find_references: 'References',
  workspace_search_pattern: 'Search',
  workspace_ranked_context: 'Context',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return {}
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === undefined) {
    return ''
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function compactJson(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function textField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
  }
}

function numberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
}

function normalizePayload(props: ChatToolCallRendererProps): NormalizedPayload {
  const resultRecord = asRecord(props.result)
  const raw = resultRecord.rawResult ?? resultRecord.result ?? resultRecord.toolResult ?? props.result
  const rawRecord = asRecord(raw)
  const structured = rawRecord.structuredContent ?? rawRecord.toolResult ?? raw
  const structuredRecord = asRecord(structured)

  return {
    args: parseJsonObject(props.args),
    result: props.result,
    resultRecord,
    raw,
    rawRecord,
    structured,
    structuredRecord,
  }
}

function stateFor(props: ChatToolCallRendererProps): WorkspaceRendererModel['state'] {
  if (props.state) {
    return props.state
  }

  return props.result === undefined ? 'executing' : 'done'
}

function toneForState(state: WorkspaceRendererModel['state']): WorkspaceRendererModel['tone'] {
  if (state === 'error') {
    return 'danger'
  }

  if (state === 'executing') {
    return 'info'
  }

  return 'neutral'
}

function backendFrom(value: unknown): McpBackendState | undefined {
  if (typeof value === 'string' && (BACKEND_STATES as readonly string[]).includes(value)) {
    return value as McpBackendState
  }
}

function findBackend(payload: NormalizedPayload): McpBackendState | undefined {
  return (
    backendFrom(payload.resultRecord.backend) ??
    backendFrom(payload.resultRecord.mcpBackendState) ??
    backendFrom(payload.structuredRecord.backend) ??
    backendFrom(payload.args.backend) ??
    backendFrom(payload.args.mcpBackendState)
  )
}

function querySummary(args: Record<string, unknown>): string | undefined {
  return textField(args, ['query', 'namePath', 'name_path', 'pattern', 'relativePath', 'relative_path', 'filePath'])
}

function rowFromValue(value: unknown): WorkspaceRendererRow | undefined {
  if (typeof value === 'string') {
    return { title: value }
  }

  if (!isRecord(value)) {
    return value === undefined ? undefined : { title: compactJson(value) }
  }

  const line = numberField(value, ['line', 'lineNumber', 'startLine'])
  const filePath = textField(value, ['filePath', 'relativePath', 'path', 'uri'])
  const title =
    textField(value, ['name', 'symbol', 'title', 'message', 'kind']) ??
    (filePath && line ? `${filePath}:${line}` : filePath) ??
    compactJson(value)
  const detail = textField(value, ['detail', 'text', 'preview', 'content', 'body'])
  const meta = filePath && title !== filePath ? (line ? `${filePath}:${line}` : filePath) : undefined

  return { title, detail, meta }
}

function collectRows(value: unknown, keys: string[], limit = 4): WorkspaceRendererRow[] {
  if (Array.isArray(value)) {
    return value
      .map(rowFromValue)
      .filter((row) => row !== undefined)
      .slice(0, limit)
  }

  if (!isRecord(value)) {
    return []
  }

  for (const key of keys) {
    const rows = collectRows(value[key], keys, limit)
    if (rows.length > 0) {
      return rows
    }
  }

  return []
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}

function createDetail(payload: NormalizedPayload): string {
  const detail = stringify(payload.result ?? payload.args)
  return detail.trim() || '{}'
}

export function createSemanticSearchRendererModel(props: ChatToolCallRendererProps): WorkspaceRendererModel {
  const payload = normalizePayload(props)
  const state = stateFor(props)
  const rows =
    state === 'done' ? collectRows(payload.structured, ['items', 'symbols', 'matches', 'references', 'results']) : []
  const title = semanticTitles[props.toolName] ?? 'Search'
  const fallbackSummary = querySummary(payload.args) ?? props.toolName
  const summary =
    state === 'executing'
      ? fallbackSummary
      : rows.length > 0
        ? plural(rows.length, 'result')
        : findBackend(payload) === 'unavailable'
          ? 'Local fallback'
          : 'No results'

  return {
    title,
    summary,
    state,
    backend: findBackend(payload),
    icon: 'i-solar:magnifer-line-duotone',
    rows,
    detail: createDetail(payload),
    tone: toneForState(state),
  }
}

function collectDiagnostics(value: unknown): WorkspaceRendererRow[] {
  const diagnostics = collectRows(value, ['diagnostics', 'items', 'results'], 6)
  return diagnostics.map((row) => {
    const severity = row.meta?.toLowerCase()
    return severity ? row : row
  })
}

function diagnosticRows(value: unknown): WorkspaceRendererRow[] {
  const direct = Array.isArray(value) ? value : isRecord(value) ? value.diagnostics : undefined
  const source = direct ?? value
  const values = Array.isArray(source) ? source : collectRows(source, ['diagnostics', 'items', 'results'], 6)

  if (!Array.isArray(values)) {
    return collectDiagnostics(value)
  }

  return values
    .map((item) => {
      if (!isRecord(item)) {
        return rowFromValue(item)
      }

      const row = rowFromValue(item)
      const severity = textField(item, ['severity', 'level', 'type'])?.toLowerCase()
      const tone: WorkspaceRendererRow['tone'] =
        severity === 'error' ? 'danger' : severity === 'warning' || severity === 'warn' ? 'warning' : 'neutral'

      return row
        ? {
            ...row,
            meta: row.meta,
            tone,
          }
        : undefined
    })
    .filter((row) => row !== undefined)
}

function diagnosticSummary(rows: WorkspaceRendererRow[]): string {
  if (rows.length === 0) {
    return 'No diagnostics'
  }

  const errors = rows.filter((row) => row.tone === 'danger').length
  const warnings = rows.filter((row) => row.tone === 'warning').length
  const rest = rows.length - errors - warnings
  const parts = [
    errors > 0 ? plural(errors, 'error') : undefined,
    warnings > 0 ? plural(warnings, 'warning') : undefined,
    rest > 0 ? plural(rest, 'note') : undefined,
  ].filter((part) => part !== undefined)

  return parts.join(', ')
}

export function createDiagnosticsRendererModel(props: ChatToolCallRendererProps): WorkspaceRendererModel {
  const payload = normalizePayload(props)
  const state = stateFor(props)
  const rows = state === 'done' || state === 'error' ? diagnosticRows(payload.structured) : []

  return {
    title: 'Diagnostics',
    summary: state === 'executing' ? (querySummary(payload.args) ?? 'Checking') : diagnosticSummary(rows),
    state,
    backend: findBackend(payload),
    icon: 'i-solar:bug-bold-duotone',
    rows,
    detail: createDetail(payload),
    tone: toneForState(state),
  }
}

export function createSpecPhaseStatusRendererModel(props: ChatToolCallRendererProps): WorkspaceRendererModel {
  const payload = normalizePayload(props)
  const state = stateFor(props)
  const source = { ...payload.args, ...payload.structuredRecord, ...payload.resultRecord }
  const phase = textField(source, ['phase', 'activePhase']) as SpecPhase | undefined
  const artifact = textField(source, ['artifactName', 'artifact', 'fileName'])
  const status = textField(source, ['status', 'approvalState', 'state'])
  const approved = source.approved === true || status === 'approved'
  const summary =
    state === 'executing'
      ? (phase ?? artifact ?? 'Spec')
      : approved
        ? `${phase ?? artifact ?? 'Spec'} approved`
        : (status ?? phase ?? artifact ?? 'Updated')

  return {
    title: 'Spec',
    summary,
    state,
    icon: 'i-solar:document-text-line-duotone',
    rows: [
      phase ? { title: phase, meta: 'phase' } : undefined,
      artifact ? { title: artifact, meta: 'artifact' } : undefined,
      textField(source, ['featureSlug', 'slug'])
        ? { title: textField(source, ['featureSlug', 'slug'])!, meta: 'feature' }
        : undefined,
      textField(source, ['path', 'filePath'])
        ? { title: textField(source, ['path', 'filePath'])!, meta: 'path' }
        : undefined,
    ].filter((row) => row !== undefined),
    detail: createDetail(payload),
    tone: approved ? 'success' : toneForState(state),
  }
}

function findJob(payload: NormalizedPayload): Partial<SubagentJobRecord> | undefined {
  if (isRecord(payload.resultRecord.job)) {
    return payload.resultRecord.job as Partial<SubagentJobRecord>
  }

  if (isRecord(payload.structuredRecord.job)) {
    return payload.structuredRecord.job as Partial<SubagentJobRecord>
  }

  if (typeof payload.resultRecord.taskDescription === 'string' || typeof payload.resultRecord.status === 'string') {
    return payload.resultRecord as Partial<SubagentJobRecord>
  }

  if (
    typeof payload.structuredRecord.taskDescription === 'string' ||
    typeof payload.structuredRecord.status === 'string'
  ) {
    return payload.structuredRecord as Partial<SubagentJobRecord>
  }
}

function subagentTone(status?: SubagentJobStatus): WorkspaceRendererModel['tone'] {
  if (status === 'failed' || status === 'cancelled') {
    return 'danger'
  }

  if (status === 'blocked') {
    return 'warning'
  }

  if (status === 'completed') {
    return 'success'
  }

  return 'info'
}

export function createSubagentJobStatusRendererModel(props: ChatToolCallRendererProps): WorkspaceRendererModel {
  const payload = normalizePayload(props)
  const state = stateFor(props)
  const job = findJob(payload)
  const status = job?.status
  const task = job?.taskDescription ?? textField(payload.args, ['taskDescription', 'task'])
  const outputCount = Array.isArray(job?.outputs) ? job.outputs.length : 0

  return {
    title: 'Subagent',
    summary: status ?? (state === 'executing' ? 'running' : 'queued'),
    state,
    icon: 'i-solar:cpu-bold-duotone',
    rows: [
      task ? { title: task, meta: job?.phase ?? textField(payload.args, ['phase']) } : undefined,
      job?.engine ? { title: job.engine, meta: 'engine' } : undefined,
      outputCount > 0 ? { title: plural(outputCount, 'output'), meta: 'outputs' } : undefined,
    ].filter((row) => row !== undefined),
    detail: createDetail(payload),
    tone: state === 'error' ? 'danger' : subagentTone(status),
  }
}

export function createSerenaNoticeRendererModel(props: ChatToolCallRendererProps): WorkspaceRendererModel {
  const payload = normalizePayload(props)
  const state = stateFor(props)
  const backend = findBackend(payload)
  const summary =
    state === 'error'
      ? 'Unavailable'
      : backend === 'serena'
        ? 'Serena'
        : backend === 'available'
          ? 'Generic MCP'
          : 'Local fallback'

  return {
    title: 'Workspace',
    summary,
    state,
    backend,
    icon: backend === 'serena' ? 'i-solar:stars-line-duotone' : 'i-solar:server-path-line-duotone',
    rows: [
      textField(payload.resultRecord, ['mode'])
        ? { title: textField(payload.resultRecord, ['mode'])!, meta: 'mode' }
        : undefined,
      textField(payload.resultRecord, ['rootPath', 'workspaceRoot'])
        ? { title: textField(payload.resultRecord, ['rootPath', 'workspaceRoot'])!, meta: 'root' }
        : undefined,
      textField(payload.resultRecord, ['serverName'])
        ? { title: textField(payload.resultRecord, ['serverName'])!, meta: 'server' }
        : undefined,
      textField(payload.resultRecord, ['toolName'])
        ? { title: textField(payload.resultRecord, ['toolName'])!, meta: 'tool' }
        : undefined,
    ].filter((row) => row !== undefined),
    detail: createDetail(payload),
    tone: state === 'error' ? 'danger' : backend === 'unavailable' ? 'warning' : 'neutral',
  }
}
