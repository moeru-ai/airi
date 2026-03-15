import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

const execFileAsync = promisify(execFile)
const defaultCodeGlobs = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mts', '*.cts']

export const SEARCH_RESULT_DEFAULT_LIMIT = 10
export const SEARCH_RESULT_MAX_LIMIT = 20
export const SEARCH_SNIPPET_MAX_LENGTH = 160
export const SEMANTIC_FALLBACK_TOOL = 'coding_search_text'

export type SemanticCapability = 'definition' | 'reference' | 'impact'

export type SemanticUnsupportedReasonCode
  = | 'unsupported_glob'
    | 'unsupported_file_extension'
    | 'capability_not_supported'
    | 'engine_unavailable'

export interface SemanticCapabilityFlags {
  definition: boolean
  reference: boolean
  impact: boolean
}

export interface SemanticEngineDescriptor {
  id: string
  capabilities: SemanticCapabilityFlags
  supportedExtensions: string[]
}

export interface SemanticUnsupportedReason {
  code: SemanticUnsupportedReasonCode
  requestedCapability: SemanticCapability
  fallbackTool: typeof SEMANTIC_FALLBACK_TOOL
  fallbackEntrypoint: 'text_search'
  message: string
}

export interface PluggableSemanticEngine {
  id: string
  supportedExtensions: string[]
  capabilityFlags: SemanticCapabilityFlags
}

const typescriptSemanticEngine: PluggableSemanticEngine = {
  id: 'typescript',
  supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'],
  capabilityFlags: {
    definition: true,
    reference: true,
    impact: false,
  },
}

const semanticEngineRegistry: PluggableSemanticEngine[] = [
  typescriptSemanticEngine,
]

const semanticExtensions = new Set(typescriptSemanticEngine.supportedExtensions)

export function getPluggableSemanticEngineRegistry() {
  return semanticEngineRegistry.map(engine => ({
    ...engine,
    capabilityFlags: { ...engine.capabilityFlags },
    capabilities: { ...engine.capabilityFlags },
    supportedExtensions: [...engine.supportedExtensions],
  }))
}

export function clampSearchLimit(limit?: number, defaultLimit = SEARCH_RESULT_DEFAULT_LIMIT) {
  if (!Number.isFinite(limit) || (limit as number) <= 0) {
    return defaultLimit
  }

  return Math.min(Math.floor(limit as number), SEARCH_RESULT_MAX_LIMIT)
}

export function toSingleLineSnippet(raw: string, maxLength = SEARCH_SNIPPET_MAX_LENGTH) {
  const singleLine = raw.replace(/[\r\n]+/g, ' ').trim()
  if (singleLine.length <= maxLength) {
    return singleLine
  }

  return `${singleLine.slice(0, Math.max(0, maxLength - 1))}…`
}

export interface SearchMatch {
  file: string
  line: number
  column: number
  snippet: string
}

export interface ReferenceMatch {
  file: string
  line: number
  column: number
  isWriteAccess: boolean
}

interface SearchOptions {
  searchRoot?: string
  glob?: string
  limit?: number
}

export interface UnsupportedSemanticResult {
  status: 'unsupported'
  explanation: string
  reasonCode: SemanticUnsupportedReasonCode
  requestedCapability: SemanticCapability
  fallbackTool: typeof SEMANTIC_FALLBACK_TOOL
  fallbackEntrypoint: 'text_search'
  semanticEngine?: string
  engine?: SemanticEngineDescriptor
  capabilities?: SemanticCapabilityFlags
  unsupportedReason: SemanticUnsupportedReason
  total: number
  matches: Array<SearchMatch | ReferenceMatch>
}

function toSemanticEngineDescriptor(engine: PluggableSemanticEngine): SemanticEngineDescriptor {
  return {
    id: engine.id,
    capabilities: { ...engine.capabilityFlags },
    supportedExtensions: [...engine.supportedExtensions],
  }
}

function ensureWithinWorkspace(root: string, candidate: string) {
  const normalizedRoot = path.resolve(root)
  const normalizedCandidate = path.resolve(candidate)
  if (normalizedCandidate !== normalizedRoot && !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new McpError(ErrorCode.InvalidParams, `Access denied: ${candidate} is outside workspace ${root}`)
  }
}

async function runRipgrep(args: string[], cwd: string) {
  try {
    const { stdout } = await execFileAsync('rg', args, { cwd })
    return stdout
  }
  catch (error: any) {
    // ripgrep exit code 1 means "no match"
    if (typeof error?.code === 'number' && error.code === 1) {
      return ''
    }

    throw new McpError(ErrorCode.InternalError, `Search failed: ${error?.message || String(error)}`)
  }
}

async function getRipgrepTotalMatches(params: {
  query: string
  cwd: string
  glob?: string
}) {
  const args = ['--count-matches', '--no-heading', '--color', 'never']

  if (params.glob) {
    args.push('-g', params.glob)
  }

  args.push(params.query, '.')
  const output = await runRipgrep(args, params.cwd)
  if (!output.trim()) {
    return 0
  }

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf(':')
      if (idx < 0) {
        return 0
      }

      const count = Number(line.slice(idx + 1))
      return Number.isFinite(count) ? count : 0
    })
    .reduce((sum, count) => sum + count, 0)
}

function buildSemanticUnsupportedResult(params: {
  semanticEngine?: PluggableSemanticEngine
  requestedCapability: SemanticCapability
  reasonCode: SemanticUnsupportedReasonCode
  explanation?: string
}): UnsupportedSemanticResult {
  const baseExplanation = '当前仅支持 JS/TS 语义导航（JS/TS/JSX/TSX/MTS/CTS）。请改用 coding_search_text。'
  const explanation = params.explanation || baseExplanation
  const engine = params.semanticEngine ? toSemanticEngineDescriptor(params.semanticEngine) : undefined
  const unsupportedReason: SemanticUnsupportedReason = {
    code: params.reasonCode,
    requestedCapability: params.requestedCapability,
    fallbackTool: SEMANTIC_FALLBACK_TOOL,
    fallbackEntrypoint: 'text_search',
    message: explanation,
  }

  return {
    status: 'unsupported',
    explanation,
    reasonCode: params.reasonCode,
    requestedCapability: params.requestedCapability,
    fallbackTool: SEMANTIC_FALLBACK_TOOL,
    fallbackEntrypoint: 'text_search',
    semanticEngine: engine?.id,
    engine,
    capabilities: engine?.capabilities,
    unsupportedReason,
    total: 0,
    matches: [],
  }
}

function isJsTsSemanticFile(filePath: string) {
  return semanticExtensions.has(path.extname(filePath).toLowerCase())
}

function resolveSemanticEngineForFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  return semanticEngineRegistry.find(engine => engine.supportedExtensions.includes(extension))
}

function resolveSemanticEngineForGlob(glob?: string) {
  if (maybeSemanticUnsupportedByGlob(glob)) {
    return undefined
  }

  return semanticEngineRegistry[0]
}

function maybeSemanticUnsupportedByGlob(glob?: string) {
  if (!glob) {
    return false
  }

  const normalized = glob.toLowerCase()
  return !Array.from(semanticExtensions).some(ext => normalized.includes(ext))
}

function resolveReportedPath(params: {
  workspacePath: string
  searchRoot: string
  reportedPath: string
}) {
  const absolutePath = path.resolve(params.searchRoot, params.reportedPath)
  ensureWithinWorkspace(params.workspacePath, absolutePath)

  return {
    absolutePath,
    workspaceRelativePath: path.relative(params.workspacePath, absolutePath),
  }
}

function parseRipgrepMatches(params: {
  output: string
  workspacePath: string
  searchRoot: string
}): SearchMatch[] {
  const { output, workspacePath, searchRoot } = params

  if (!output.trim()) {
    return []
  }

  const matches: SearchMatch[] = []
  const lines = output.split('\n').filter(Boolean)

  for (const line of lines) {
    // `rg --line-number --column --no-heading`: file:line:column:text
    const parsed = line.match(/^(.+?):(\d+):(\d+):(.*)$/)
    if (!parsed) {
      continue
    }

    const { workspaceRelativePath } = resolveReportedPath({
      workspacePath,
      searchRoot,
      reportedPath: parsed[1],
    })

    matches.push({
      file: workspaceRelativePath,
      line: Number(parsed[2]),
      column: Number(parsed[3]),
      snippet: toSingleLineSnippet(parsed[4]),
    })
  }

  return matches
}

export async function searchText(workspacePath: string, query: string, options: SearchOptions = {}) {
  const { searchRoot = workspacePath, glob, limit } = options

  ensureWithinWorkspace(workspacePath, searchRoot)

  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new McpError(ErrorCode.InvalidParams, 'query cannot be empty')
  }

  const effectiveLimit = clampSearchLimit(limit)
  const total = await getRipgrepTotalMatches({
    query: normalizedQuery,
    cwd: searchRoot,
    glob,
  })

  const args = ['--line-number', '--column', '--no-heading', '--color', 'never']

  if (glob) {
    args.push('-g', glob)
  }

  if (effectiveLimit > 0) {
    args.push('--max-count', String(effectiveLimit))
  }

  args.push(normalizedQuery, '.')
  const output = await runRipgrep(args, searchRoot)
  const matches = parseRipgrepMatches({
    output,
    workspacePath,
    searchRoot,
  }).slice(0, effectiveLimit)

  return {
    total,
    matches,
  }
}

export async function searchSymbol(workspacePath: string, symbolName: string, options: SearchOptions = {}) {
  const { searchRoot = workspacePath, glob, limit } = options

  ensureWithinWorkspace(workspacePath, searchRoot)

  const normalizedSymbolName = symbolName.trim()
  if (!normalizedSymbolName) {
    throw new McpError(ErrorCode.InvalidParams, 'symbolName cannot be empty')
  }

  const semanticEngine = resolveSemanticEngineForGlob(glob)
  if (!semanticEngine) {
    return buildSemanticUnsupportedResult({
      semanticEngine: undefined,
      requestedCapability: 'definition',
      reasonCode: 'unsupported_glob',
    })
  }

  if (!semanticEngine.capabilityFlags.definition || semanticEngine.id !== 'typescript') {
    return buildSemanticUnsupportedResult({
      semanticEngine,
      requestedCapability: 'definition',
      reasonCode: 'capability_not_supported',
    })
  }

  let ts: typeof import('typescript')
  try {
    ts = (await import('typescript')).default || await import('typescript')
  }
  catch {
    return buildSemanticUnsupportedResult({
      semanticEngine,
      requestedCapability: 'definition',
      reasonCode: 'engine_unavailable',
    })
  }

  const effectiveLimit = clampSearchLimit(limit)

  const args = ['-l', '--no-heading', '--color', 'never']

  if (glob) {
    args.push('-g', glob)
  }
  else {
    for (const codeGlob of defaultCodeGlobs) {
      args.push('-g', codeGlob)
    }
  }

  args.push(normalizedSymbolName, '.')

  const output = await runRipgrep(args, searchRoot)
  const files = output.split('\n').filter(Boolean)

  const allMatches: SearchMatch[] = []

  for (const relativeFilePath of files) {
    const { absolutePath: absoluteFilePath, workspaceRelativePath } = resolveReportedPath({
      workspacePath,
      searchRoot,
      reportedPath: relativeFilePath,
    })

    if (!isJsTsSemanticFile(absoluteFilePath)) {
      continue
    }

    const sourceCode = await fs.readFile(absoluteFilePath, 'utf8')
    const sourceFile = ts.createSourceFile(absoluteFilePath, sourceCode, ts.ScriptTarget.Latest, true)

    const pushMatch = (node: import('typescript').Node) => {
      const start = node.getStart(sourceFile)
      const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, start)
      const snippet = sourceCode.split('\n')[line] || ''
      allMatches.push({
        file: workspaceRelativePath,
        line: line + 1,
        column: character + 1,
        snippet: toSingleLineSnippet(snippet),
      })
    }

    const visit = (node: import('typescript').Node) => {
      if (
        ts.isClassDeclaration(node)
        || ts.isFunctionDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isTypeAliasDeclaration(node)
        || ts.isMethodDeclaration(node)
        || ts.isPropertyDeclaration(node)
        || ts.isVariableDeclaration(node)
        || ts.isEnumDeclaration(node)
      ) {
        const namedNode = node as import('typescript').NamedDeclaration
        if (namedNode.name && ts.isIdentifier(namedNode.name) && namedNode.name.text === normalizedSymbolName) {
          pushMatch(node)
        }
      }

      ts.forEachChild(node, visit)
    }

    ts.forEachChild(sourceFile, visit)
  }

  const matches = allMatches.slice(0, effectiveLimit)

  return {
    engine: 'typescript' as const,
    engineDescriptor: toSemanticEngineDescriptor(semanticEngine),
    capabilities: { ...semanticEngine.capabilityFlags },
    unsupportedReason: null,
    requestedCapability: 'definition' as const,
    matchKind: 'definition' as const,
    symbolName: normalizedSymbolName,
    searchRoot: path.relative(workspacePath, searchRoot) || '.',
    total: allMatches.length,
    limit: effectiveLimit,
    matches,
  }
}

async function collectProjectFiles(ts: typeof import('typescript'), workspacePath: string, entryAbsPath: string) {
  let configPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) {
    configPath = ts.findConfigFile(path.dirname(entryAbsPath), ts.sys.fileExists, 'tsconfig.json')
  }

  const defaultCompilerOptions: import('typescript').CompilerOptions = {
    allowJs: true,
    checkJs: false,
  }

  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (config.error) {
      throw new McpError(ErrorCode.InternalError, `Failed to read tsconfig: ${config.error.messageText}`)
    }

    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath))
    const fileNames = Array.from(new Set(parsed.fileNames.map(file => path.resolve(file))))
    if (!fileNames.includes(entryAbsPath)) {
      fileNames.push(entryAbsPath)
    }

    return {
      compilerOptions: { ...defaultCompilerOptions, ...parsed.options },
      fileNames,
    }
  }

  const fallbackArgs = ['-l', '--no-heading', '--color', 'never']
  for (const codeGlob of defaultCodeGlobs) {
    fallbackArgs.push('-g', codeGlob)
  }
  fallbackArgs.push('.', '.')

  const output = await runRipgrep(fallbackArgs, workspacePath)
  const discoveredFiles = output
    .split('\n')
    .filter(Boolean)
    .map(file => path.resolve(workspacePath, file))

  const fileNames = Array.from(new Set([...discoveredFiles, entryAbsPath]))
  return { compilerOptions: defaultCompilerOptions, fileNames }
}

export async function findReferences(workspacePath: string, filePath: string, line: number, column: number, limit?: number) {
  const semanticEngine = resolveSemanticEngineForFile(filePath)
  if (!semanticEngine) {
    return buildSemanticUnsupportedResult({
      semanticEngine: undefined,
      requestedCapability: 'reference',
      reasonCode: 'unsupported_file_extension',
    })
  }

  if (!semanticEngine.capabilityFlags.reference || semanticEngine.id !== 'typescript') {
    return buildSemanticUnsupportedResult({
      semanticEngine,
      requestedCapability: 'reference',
      reasonCode: 'capability_not_supported',
    })
  }

  let ts: typeof import('typescript')
  try {
    ts = (await import('typescript')).default || await import('typescript')
  }
  catch {
    return buildSemanticUnsupportedResult({
      semanticEngine,
      requestedCapability: 'reference',
      reasonCode: 'engine_unavailable',
    })
  }

  const effectiveLimit = clampSearchLimit(limit)

  const absoluteFilePath = path.resolve(workspacePath, filePath)
  ensureWithinWorkspace(workspacePath, absoluteFilePath)

  const { compilerOptions, fileNames } = await collectProjectFiles(ts, workspacePath, absoluteFilePath)
  const versions = new Map(fileNames.map(fileName => [fileName, '0']))

  const host: import('typescript').LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: fileName => versions.get(fileName) || '0',
    getScriptSnapshot: (fileName) => {
      if (!ts.sys.fileExists(fileName)) {
        return undefined
      }

      const content = ts.sys.readFile(fileName)
      if (content === undefined) {
        return undefined
      }

      return ts.ScriptSnapshot.fromString(content)
    },
    getCurrentDirectory: () => workspacePath,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  }

  const languageService = ts.createLanguageService(host, ts.createDocumentRegistry())
  const program = languageService.getProgram()
  const targetSourceFile = program?.getSourceFile(absoluteFilePath)

  if (!targetSourceFile) {
    return {
      engine: 'typescript' as const,
      engineDescriptor: toSemanticEngineDescriptor(semanticEngine),
      capabilities: { ...semanticEngine.capabilityFlags },
      unsupportedReason: null,
      requestedCapability: 'reference' as const,
      filePath,
      targetLine: line,
      targetColumn: column,
      total: 0,
      limit: effectiveLimit,
      matches: [] as ReferenceMatch[],
    }
  }

  const position = ts.getPositionOfLineAndCharacter(targetSourceFile, line - 1, column - 1)
  const references = languageService.getReferencesAtPosition(absoluteFilePath, position) || []

  const dedupe = new Set<string>()
  const matches: ReferenceMatch[] = []

  for (const reference of references) {
    ensureWithinWorkspace(workspacePath, reference.fileName)

    const sourceFile = languageService.getProgram()?.getSourceFile(reference.fileName)
    if (!sourceFile) {
      continue
    }

    const loc = ts.getLineAndCharacterOfPosition(sourceFile, reference.textSpan.start)
    const file = path.relative(workspacePath, reference.fileName)
    const lineNo = loc.line + 1
    const columnNo = loc.character + 1
    const key = `${file}:${lineNo}:${columnNo}:${reference.isWriteAccess ? 'w' : 'r'}`

    if (dedupe.has(key)) {
      continue
    }
    dedupe.add(key)

    matches.push({
      file,
      line: lineNo,
      column: columnNo,
      isWriteAccess: reference.isWriteAccess,
    })
  }

  const limitedMatches = matches.slice(0, effectiveLimit)

  return {
    engine: 'typescript' as const,
    engineDescriptor: toSemanticEngineDescriptor(semanticEngine),
    capabilities: { ...semanticEngine.capabilityFlags },
    unsupportedReason: null,
    requestedCapability: 'reference' as const,
    filePath,
    targetLine: line,
    targetColumn: column,
    total: matches.length,
    limit: effectiveLimit,
    matches: limitedMatches,
  }
}
