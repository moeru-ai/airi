import type { McpBackendState, SerenaToolName } from '@proj-airi/stage-ui/coding-workspace'
import { isSerenaReadOnlyTool, SERENA_READ_ONLY_TOOL_NAMES } from '@proj-airi/stage-ui/coding-workspace'

export const SERENA_MUTATING_TOOL_NAMES = [
  'replace_symbol_body',
  'insert_before_symbol',
  'insert_after_symbol',
  'rename_symbol',
  'safe_delete_symbol',
] as const

export type SerenaMutatingToolName = (typeof SERENA_MUTATING_TOOL_NAMES)[number]

export type WorkspaceCodeIntelligenceMethod =
  | 'workspace_get_symbols_overview'
  | 'workspace_find_symbol'
  | 'workspace_find_declaration'
  | 'workspace_find_references'
  | 'workspace_get_diagnostics'
  | 'workspace_search_pattern'
  | 'workspace_ranked_context'

export interface McpToolSummary {
  name?: string
  serverName?: string
  toolName?: string
  description?: string
  inputSchema?: Record<string, unknown>
  [key: string]: unknown
}

export interface McpToolCall {
  name: string
  serverName?: string
  toolName?: string
  arguments?: Record<string, unknown>
}

export interface McpToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
  [key: string]: unknown
}

export interface LocalSearchInput {
  query: string
  rootPath?: string
  relativePath?: string
  include?: string[]
  limit?: number
}

export interface LocalSearchResult {
  filePath: string
  line?: number
  column?: number
  text?: string
  [key: string]: unknown
}

export interface CodeIntelligenceTransport {
  listMcpTools: () => Promise<McpToolSummary[]>
  callMcpTool: (input: McpToolCall) => Promise<McpToolResult>
  searchFiles?: (input: LocalSearchInput) => Promise<LocalSearchResult[]>
}

export interface WorkspaceCodeIntelligenceResult<RawResult = unknown> {
  backend: McpBackendState
  serverName?: string
  toolName: string
  query: Record<string, unknown>
  rawResult: RawResult
}

export interface WorkspaceFileInput {
  filePath?: string
  relativePath?: string
  rootPath?: string
}

export interface WorkspaceSymbolsOverviewInput extends WorkspaceFileInput {
  [key: string]: unknown
}

export interface WorkspaceSymbolQueryInput extends WorkspaceFileInput {
  query: string
  namePath?: string
  includeBody?: boolean
  substringMatching?: boolean
  limit?: number
  [key: string]: unknown
}

export interface WorkspaceDiagnosticsInput extends WorkspaceFileInput {
  [key: string]: unknown
}

export interface WorkspaceSearchPatternInput extends WorkspaceFileInput {
  query?: string
  pattern?: string
  include?: string[]
  limit?: number
  [key: string]: unknown
}

export interface WorkspaceRankedContextInput extends WorkspaceFileInput {
  query: string
  includeDiagnostics?: boolean
  limit?: number
  [key: string]: unknown
}

export interface WorkspaceRankedContextItem {
  kind: 'symbol' | 'pattern' | 'diagnostics'
  result: WorkspaceCodeIntelligenceResult
}

export interface WorkspaceRankedContextRawResult {
  items: WorkspaceRankedContextItem[]
}

interface NormalizedMcpToolSummary {
  name: string
  serverName?: string
  toolName: string
  original: McpToolSummary
}

interface SelectedMcpTool {
  backend: Extract<McpBackendState, 'available' | 'serena'>
  tool: NormalizedMcpToolSummary
}

interface ToolCatalog {
  tools: NormalizedMcpToolSummary[]
  serenaTools: Map<SerenaToolName, NormalizedMcpToolSummary>
}

interface MethodDefinition<Input extends Record<string, unknown>> {
  serenaToolName: SerenaToolName
  fallbackToolNames: string[]
  buildSerenaArguments: (input: Input) => Record<string, unknown>
}

type MethodInputByName = {
  workspace_get_symbols_overview: WorkspaceSymbolsOverviewInput
  workspace_find_symbol: WorkspaceSymbolQueryInput
  workspace_find_declaration: WorkspaceSymbolQueryInput
  workspace_find_references: WorkspaceSymbolQueryInput
  workspace_get_diagnostics: WorkspaceDiagnosticsInput
  workspace_search_pattern: WorkspaceSearchPatternInput
}

const METHOD_DEFINITIONS: {
  [MethodName in keyof MethodInputByName]: MethodDefinition<MethodInputByName[MethodName]>
} = {
  workspace_get_symbols_overview: {
    serenaToolName: 'get_symbols_overview',
    fallbackToolNames: ['workspace_get_symbols_overview', 'get_symbols_overview', 'symbols_overview', 'list_symbols'],
    buildSerenaArguments: (input) =>
      compactRecord({
        relative_path: readString(input, 'relativePath', 'relative_path', 'filePath', 'path'),
      }),
  },
  workspace_find_symbol: {
    serenaToolName: 'find_symbol',
    fallbackToolNames: ['workspace_find_symbol', 'find_symbol', 'search_symbols', 'symbol_search'],
    buildSerenaArguments: (input) =>
      compactRecord({
        include_body: readBoolean(input, 'includeBody', 'include_body'),
        name_path: readString(input, 'namePath', 'name_path', 'query', 'symbol'),
        relative_path: readString(input, 'relativePath', 'relative_path', 'filePath', 'path'),
        substring_matching: readBoolean(input, 'substringMatching', 'substring_matching'),
      }),
  },
  workspace_find_declaration: {
    serenaToolName: 'find_declaration',
    fallbackToolNames: ['workspace_find_declaration', 'find_declaration', 'go_to_definition', 'definition'],
    buildSerenaArguments: (input) =>
      compactRecord({
        name_path: readString(input, 'namePath', 'name_path', 'query', 'symbol'),
        relative_path: readString(input, 'relativePath', 'relative_path', 'filePath', 'path'),
      }),
  },
  workspace_find_references: {
    serenaToolName: 'find_referencing_symbols',
    fallbackToolNames: ['workspace_find_references', 'find_references', 'find_referencing_symbols', 'references'],
    buildSerenaArguments: (input) =>
      compactRecord({
        name_path: readString(input, 'namePath', 'name_path', 'query', 'symbol'),
        relative_path: readString(input, 'relativePath', 'relative_path', 'filePath', 'path'),
      }),
  },
  workspace_get_diagnostics: {
    serenaToolName: 'get_diagnostics_for_file',
    fallbackToolNames: ['workspace_get_diagnostics', 'get_diagnostics', 'get_diagnostics_for_file', 'diagnostics'],
    buildSerenaArguments: (input) =>
      compactRecord({
        relative_path: readString(input, 'relativePath', 'relative_path', 'filePath', 'path'),
      }),
  },
  workspace_search_pattern: {
    serenaToolName: 'search_for_pattern',
    fallbackToolNames: ['workspace_search_pattern', 'search_pattern', 'search_for_pattern', 'search', 'text_search'],
    buildSerenaArguments: (input) =>
      compactRecord({
        relative_path: readString(input, 'relativePath', 'relative_path', 'filePath', 'path'),
        substring_pattern: readString(input, 'pattern', 'substringPattern', 'substring_pattern', 'query'),
      }),
  },
}

export interface CodeIntelligenceFacade {
  workspace_get_symbols_overview: (
    input: WorkspaceSymbolsOverviewInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<McpToolResult | unknown[]>>
  workspace_find_symbol: (
    input: WorkspaceSymbolQueryInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<McpToolResult | unknown[]>>
  workspace_find_declaration: (
    input: WorkspaceSymbolQueryInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<McpToolResult | unknown[]>>
  workspace_find_references: (
    input: WorkspaceSymbolQueryInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<McpToolResult | unknown[]>>
  workspace_get_diagnostics: (
    input: WorkspaceDiagnosticsInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<McpToolResult | unknown[]>>
  workspace_search_pattern: (
    input: WorkspaceSearchPatternInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<McpToolResult | LocalSearchResult[] | unknown[]>>
  workspace_ranked_context: (
    input: WorkspaceRankedContextInput,
  ) => Promise<WorkspaceCodeIntelligenceResult<WorkspaceRankedContextRawResult>>
}

export function createCodeIntelligenceFacade(transport: CodeIntelligenceTransport): CodeIntelligenceFacade {
  return {
    workspace_get_symbols_overview(input) {
      return callWorkspaceMethod(transport, 'workspace_get_symbols_overview', input)
    },
    workspace_find_symbol(input) {
      return callWorkspaceMethod(transport, 'workspace_find_symbol', input)
    },
    workspace_find_declaration(input) {
      return callWorkspaceMethod(transport, 'workspace_find_declaration', input)
    },
    workspace_find_references(input) {
      return callWorkspaceMethod(transport, 'workspace_find_references', input)
    },
    workspace_get_diagnostics(input) {
      return callWorkspaceMethod(transport, 'workspace_get_diagnostics', input)
    },
    workspace_search_pattern(input) {
      return callWorkspaceMethod(transport, 'workspace_search_pattern', input)
    },
    async workspace_ranked_context(input) {
      const query = serializableQuery(input)
      const items: WorkspaceRankedContextItem[] = []

      const symbolResult = await callWorkspaceMethod(transport, 'workspace_find_symbol', {
        ...input,
        includeBody: true,
      })
      if (!isEmptyUnavailableResult(symbolResult)) {
        items.push({ kind: 'symbol', result: symbolResult })
      }

      const patternResult = await callWorkspaceMethod(transport, 'workspace_search_pattern', input)
      if (!isEmptyUnavailableResult(patternResult)) {
        items.push({ kind: 'pattern', result: patternResult })
      }

      if (input.includeDiagnostics) {
        const diagnosticsResult = await callWorkspaceMethod(transport, 'workspace_get_diagnostics', input)
        if (!isEmptyUnavailableResult(diagnosticsResult)) {
          items.push({ kind: 'diagnostics', result: diagnosticsResult })
        }
      }

      return {
        backend: strongestBackend(items.map((item) => item.result.backend)),
        serverName: firstDefined(items.map((item) => item.result.serverName)),
        toolName: 'workspace_ranked_context',
        query,
        rawResult: { items },
      }
    },
  }
}

export function isSerenaMutatingTool(toolName: string): toolName is SerenaMutatingToolName {
  return (SERENA_MUTATING_TOOL_NAMES as readonly string[]).includes(toolName)
}

export function assertReadOnlySerenaTool(toolName: string): asserts toolName is SerenaToolName {
  if (isSerenaMutatingTool(toolName)) {
    throw new Error(`Refusing to proxy mutating Serena tool "${toolName}" through code intelligence facade.`)
  }

  if (!isSerenaReadOnlyTool(toolName)) {
    throw new Error(`Unsupported Serena code intelligence tool "${toolName}".`)
  }
}

export async function callReadOnlyMcpTool(
  transport: CodeIntelligenceTransport,
  tool: McpToolSummary,
  query: Record<string, unknown>,
  options: {
    arguments?: Record<string, unknown>
    backend?: Extract<McpBackendState, 'available' | 'serena'>
  } = {},
): Promise<WorkspaceCodeIntelligenceResult<McpToolResult>> {
  const normalizedTool = normalizeMcpToolSummary(tool)
  if (!normalizedTool) {
    throw new Error('Cannot proxy MCP tool without a tool name.')
  }

  if (isSerenaMutatingTool(normalizedTool.toolName)) {
    throw new Error(
      `Refusing to proxy mutating Serena tool "${normalizedTool.toolName}" through code intelligence facade.`,
    )
  }

  const rawResult = await transport.callMcpTool({
    name: normalizedTool.name,
    serverName: normalizedTool.serverName,
    toolName: normalizedTool.toolName,
    arguments: options.arguments ?? query,
  })

  return {
    backend: options.backend ?? inferBackendForTool(normalizedTool),
    serverName: normalizedTool.serverName,
    toolName: normalizedTool.toolName,
    query: serializableQuery(query),
    rawResult,
  }
}

async function callWorkspaceMethod<MethodName extends keyof MethodInputByName>(
  transport: CodeIntelligenceTransport,
  methodName: MethodName,
  input: MethodInputByName[MethodName],
): Promise<WorkspaceCodeIntelligenceResult<McpToolResult | LocalSearchResult[] | unknown[]>> {
  const query = serializableQuery(input)
  const selectedTool = selectTool(await createToolCatalog(transport), METHOD_DEFINITIONS[methodName])

  if (selectedTool) {
    return callReadOnlyMcpTool(transport, selectedTool.tool.original, query, {
      backend: selectedTool.backend,
      arguments: selectedTool.backend === 'serena' ? METHOD_DEFINITIONS[methodName].buildSerenaArguments(input) : query,
    })
  }

  if (methodName === 'workspace_search_pattern' && transport.searchFiles) {
    const rawResult = await transport.searchFiles(toLocalSearchInput(input))
    return {
      backend: 'unavailable',
      serverName: undefined,
      toolName: 'local_search',
      query,
      rawResult,
    }
  }

  return {
    backend: 'unavailable',
    serverName: undefined,
    toolName: methodName,
    query,
    rawResult: [],
  }
}

async function createToolCatalog(transport: CodeIntelligenceTransport): Promise<ToolCatalog> {
  const tools = (await transport.listMcpTools())
    .map(normalizeMcpToolSummary)
    .filter((tool): tool is NormalizedMcpToolSummary => tool != null)

  return {
    tools,
    serenaTools: selectSerenaReadOnlyTools(tools),
  }
}

function selectTool<Input extends Record<string, unknown>>(
  catalog: ToolCatalog,
  definition: MethodDefinition<Input>,
): SelectedMcpTool | undefined {
  const serenaTool = catalog.serenaTools.get(definition.serenaToolName)
  if (serenaTool) {
    return { backend: 'serena', tool: serenaTool }
  }

  const fallbackToolNames = new Set(definition.fallbackToolNames)
  const fallbackTool = catalog.tools.find((tool) => {
    return !isSerenaMutatingTool(tool.toolName) && fallbackToolNames.has(tool.toolName)
  })

  if (!fallbackTool) {
    return undefined
  }

  return { backend: 'available', tool: fallbackTool }
}

function pickBestSerenaGroup(
  groups: Iterable<[string, NormalizedMcpToolSummary[]]>,
): NormalizedMcpToolSummary[] | undefined {
  return [...groups]
    .filter(([, group]) => isLikelySerenaGroup(group))
    .sort(([, left], [, right]) => distinctReadOnlyToolCount(right) - distinctReadOnlyToolCount(left))
    .at(0)?.[1]
}

function selectSerenaReadOnlyTools(tools: NormalizedMcpToolSummary[]): Map<SerenaToolName, NormalizedMcpToolSummary> {
  const groups = groupReadOnlySerenaTools(tools)
  const selectedGroup = pickBestSerenaGroup(groups.entries())

  const serenaTools = new Map<SerenaToolName, NormalizedMcpToolSummary>()
  for (const tool of selectedGroup ?? []) {
    if (isSerenaReadOnlyTool(tool.toolName) && !serenaTools.has(tool.toolName)) {
      serenaTools.set(tool.toolName, tool)
    }
  }

  return serenaTools
}

function groupReadOnlySerenaTools(tools: NormalizedMcpToolSummary[]): Map<string, NormalizedMcpToolSummary[]> {
  const groups = new Map<string, NormalizedMcpToolSummary[]>()

  for (const tool of tools) {
    if (!isSerenaReadOnlyTool(tool.toolName)) {
      continue
    }

    const groupKey = tool.serverName ?? inferServerNameFromToolName(tool.name) ?? '__unknown_serena__'
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), tool])
  }

  return groups
}

function isLikelySerenaGroup(group: NormalizedMcpToolSummary[]): boolean {
  return distinctReadOnlyToolCount(group) >= 2 || group.some((tool) => containsSerenaHint(tool))
}

function containsSerenaHint(tool: NormalizedMcpToolSummary): boolean {
  return [tool.serverName, tool.name, readString(tool.original, 'server', 'serverId')]
    .filter((value): value is string => value != null)
    .some((value) => value.toLowerCase().includes('serena'))
}

function distinctReadOnlyToolCount(group: NormalizedMcpToolSummary[]): number {
  return new Set(group.map((tool) => tool.toolName).filter(isSerenaReadOnlyTool)).size
}

function normalizeMcpToolSummary(tool: McpToolSummary): NormalizedMcpToolSummary | undefined {
  const qualifiedName = readString(tool, 'name', 'id')
  const toolName = readString(tool, 'toolName', 'tool', 'functionName') ?? inferToolNameFromQualifiedName(qualifiedName)
  const serverName = readString(tool, 'serverName', 'server', 'serverId') ?? inferServerNameFromToolName(qualifiedName)

  if (!toolName && !qualifiedName) {
    return undefined
  }

  const name = qualifiedName ?? toolName
  if (!name) {
    return undefined
  }

  return {
    name,
    serverName,
    toolName: toolName ?? name,
    original: tool,
  }
}

function inferBackendForTool(tool: NormalizedMcpToolSummary): Extract<McpBackendState, 'available' | 'serena'> {
  if (isSerenaReadOnlyTool(tool.toolName) && containsSerenaHint(tool)) {
    return 'serena'
  }

  return 'available'
}

function inferToolNameFromQualifiedName(name?: string): string | undefined {
  if (!name) {
    return undefined
  }

  const separator = findQualifiedNameSeparator(name)
  return separator ? name.slice(separator.index + separator.value.length) : name
}

function inferServerNameFromToolName(name?: string): string | undefined {
  if (!name) {
    return undefined
  }

  const separator = findQualifiedNameSeparator(name)
  return separator ? name.slice(0, separator.index) : undefined
}

function findQualifiedNameSeparator(name: string): { value: string; index: number } | undefined {
  const separators = ['::', '/']
  for (const value of separators) {
    const index = name.indexOf(value)
    if (index > 0 && index < name.length - value.length) {
      return { value, index }
    }
  }

  return undefined
}

function serializableQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactRecord({ ...input })
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value
    }
  }

  return output
}

function readString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return undefined
}

function readBoolean(input: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'boolean') {
      return value
    }
  }

  return undefined
}

function readNumber(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'number') {
      return value
    }
  }

  return undefined
}

function readStringArray(input: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = input[key]
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value
    }
  }

  return undefined
}

function toLocalSearchInput(input: Record<string, unknown>): LocalSearchInput {
  const searchInput: LocalSearchInput = {
    query: readString(input, 'pattern', 'query', 'substringPattern', 'substring_pattern') ?? '',
  }
  const include = readStringArray(input, 'include')
  const limit = readNumber(input, 'limit')
  const relativePath = readString(input, 'relativePath', 'relative_path', 'filePath', 'path')
  const rootPath = readString(input, 'rootPath', 'root_path')

  if (include) {
    searchInput.include = include
  }
  if (limit !== undefined) {
    searchInput.limit = limit
  }
  if (relativePath) {
    searchInput.relativePath = relativePath
  }
  if (rootPath) {
    searchInput.rootPath = rootPath
  }

  return searchInput
}

function isEmptyUnavailableResult(result: WorkspaceCodeIntelligenceResult): boolean {
  return result.backend === 'unavailable' && Array.isArray(result.rawResult) && result.rawResult.length === 0
}

function strongestBackend(backends: McpBackendState[]): McpBackendState {
  if (backends.includes('serena')) {
    return 'serena'
  }

  if (backends.includes('available')) {
    return 'available'
  }

  return 'unavailable'
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value): value is T => value !== undefined)
}

export const WORKSPACE_CODE_INTELLIGENCE_METHODS = [
  'workspace_get_symbols_overview',
  'workspace_find_symbol',
  'workspace_find_declaration',
  'workspace_find_references',
  'workspace_get_diagnostics',
  'workspace_search_pattern',
  'workspace_ranked_context',
] as const satisfies readonly WorkspaceCodeIntelligenceMethod[]

export const SERENA_CODE_INTELLIGENCE_TOOL_MAPPING = {
  workspace_get_symbols_overview: 'get_symbols_overview',
  workspace_find_symbol: 'find_symbol',
  workspace_find_declaration: 'find_declaration',
  workspace_find_references: 'find_referencing_symbols',
  workspace_get_diagnostics: 'get_diagnostics_for_file',
  workspace_search_pattern: 'search_for_pattern',
} as const satisfies Record<Exclude<WorkspaceCodeIntelligenceMethod, 'workspace_ranked_context'>, SerenaToolName>

export const SERENA_READ_ONLY_CODE_INTELLIGENCE_TOOL_NAMES = SERENA_READ_ONLY_TOOL_NAMES
