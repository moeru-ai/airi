import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

/**
 * Extract diagnostics (errors/warnings) for a specific file using TypeScript LanguageService.
 */
export async function getDiagnostics(workspacePath: string, filePath: string) {
  const absoluteFilePath = path.resolve(workspacePath, filePath)
  if (!absoluteFilePath.startsWith(`${workspacePath}${path.sep}`) && absoluteFilePath !== workspacePath) {
    throw new McpError(ErrorCode.InvalidParams, `Access denied: ${filePath} is outside workspace`)
  }

  let ts: typeof import('typescript')
  try {
    ts = (await import('typescript')).default || await import('typescript')
  } catch {
    return { status: 'error', message: 'TypeScript is not available' }
  }

  if (!ts.sys.fileExists(absoluteFilePath)) {
    throw new McpError(ErrorCode.InvalidParams, `File not found: ${filePath}`)
  }

  // Find tsconfig
  let configPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) {
    configPath = ts.findConfigFile(path.dirname(absoluteFilePath), ts.sys.fileExists, 'tsconfig.json')
  }

  let compilerOptions: import('typescript').CompilerOptions = { allowJs: true, checkJs: false }
  let fileNames = [absoluteFilePath]

  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (!config.error) {
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath))
      compilerOptions = { ...compilerOptions, ...parsed.options }
      fileNames = Array.from(new Set(parsed.fileNames.map(f => path.resolve(f))))
      if (!fileNames.includes(absoluteFilePath)) {
        fileNames.push(absoluteFilePath)
      }
    }
  }

  const versions = new Map<string, string>()
  const host: import('typescript').LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: f => versions.get(f) || '0',
    getScriptSnapshot: f => {
      if (!ts.sys.fileExists(f)) return undefined
      const content = ts.sys.readFile(f)
      if (content === undefined) return undefined
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
    return { status: 'error', message: 'Failed to create SourceFile for diagnostics' }
  }

  const diagnostics = [
    ...languageService.getSyntacticDiagnostics(absoluteFilePath),
    ...languageService.getSemanticDiagnostics(absoluteFilePath)
  ]

  const formatted = diagnostics.map(diag => {
    let line = 0, character = 0
    if (diag.file && diag.start !== undefined) {
      const pos = ts.getLineAndCharacterOfPosition(diag.file, diag.start)
      line = pos.line + 1
      character = pos.character + 1
    }
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
    const category = ts.DiagnosticCategory[diag.category]
    return `[${category}] Line ${line}:${character} - ${message}`
  })

  return {
    status: 'success',
    file: filePath,
    diagnosticsCount: formatted.length,
    diagnostics: formatted.slice(0, 50), // Cap at 50 to avoid massive prompt blowout
  }
}
