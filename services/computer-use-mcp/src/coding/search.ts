import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

const execAsync = promisify(exec)

export async function searchText(workspacePath: string, query: string, glob?: string, limit?: number) {
  try {
    let cmd = `rg -n "${query.replace(/"/g, '\\"')}"`
    if (glob) {
      cmd += ` -g "${glob.replace(/"/g, '\\"')}"`
    }
    if (limit) {
      cmd += ` -m ${limit}`
    }
    const { stdout } = await execAsync(cmd, { cwd: workspacePath })
    return stdout
  }
  catch (err: any) {
    if (err.code === 1) {
      // no matches
      return ''
    }
    throw new McpError(ErrorCode.InternalError, `Search failed: ${err.message}`)
  }
}

export async function searchSymbol(workspacePath: string, symbolName: string, glob?: string, limit?: number) {
  let ts: typeof import('typescript')
  try {
    ts = (await import('typescript')).default || await import('typescript')
  }
  catch {
    return {
      status: 'unsupported',
      message: 'TypeScript compiler not available. Cannot perform semantic symbol search.',
    }
  }

  // Find all candidate files
  let findCmd = `rg -l "${symbolName.replace(/"/g, '\\"')}"`
  if (glob) {
    findCmd += ` -g "${glob.replace(/"/g, '\\"')}"`
  }
  else {
    findCmd += ` -g "*.ts" -g "*.tsx" -g "*.js" -g "*.jsx"`
  }

  let filePaths: string[] = []
  try {
    const { stdout } = await execAsync(findCmd, { cwd: workspacePath })
    filePaths = stdout.split('\n').filter(Boolean)
  }
  catch (err: any) {
    if (err.code === 1) {
      return { matches: [] }
    }
    throw new McpError(ErrorCode.InternalError, `Symbol search failed: ${err.message}`)
  }

  const results: any[] = []
  for (const relativePath of filePaths) {
    if (limit && results.length >= limit)
      break

    const absPath = path.resolve(workspacePath, relativePath)
    if (!absPath.startsWith(workspacePath))
      continue

    const sourceCode = await fs.readFile(absPath, 'utf8')
    const sourceFile = ts.createSourceFile(absPath, sourceCode, ts.ScriptTarget.Latest, true)

    ts.forEachChild(sourceFile, function visit(node) {
      if (node.kind === ts.SyntaxKind.ClassDeclaration
        || node.kind === ts.SyntaxKind.FunctionDeclaration
        || node.kind === ts.SyntaxKind.InterfaceDeclaration
        || node.kind === ts.SyntaxKind.TypeAliasDeclaration
        || node.kind === ts.SyntaxKind.MethodDeclaration
        || node.kind === ts.SyntaxKind.PropertyDeclaration
        || node.kind === ts.SyntaxKind.VariableDeclaration) {
        const namedNode = node as any
        if (namedNode.name && namedNode.name.text === symbolName) {
          const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart())
          results.push({
            file: relativePath,
            line: line + 1,
            column: character + 1,
            // Snippet of actual text
            snippet: sourceCode.slice(node.getStart(), Math.min(node.getStart() + 100, sourceCode.length)).replace(/\n/g, '\\n'),
          })
        }
      }
      ts.forEachChild(node, visit)
    })
  }

  return { matches: results }
}

export async function findReferences(workspacePath: string, filePath: string, line: number, column: number, limit?: number) {
  let ts: typeof import('typescript')
  try {
    ts = (await import('typescript')).default || await import('typescript')
  }
  catch {
    return {
      status: 'unsupported',
      message: 'TypeScript compiler not available. Cannot perform reference finding.',
    }
  }

  // To properly find references across exactly workspace using compiler APIs, one usually
  // needs to instantiate a whole ts.Program.
  // Given constraints, this may be too heavy for instant results if tsconfig is large.
  // The goal says "第一阶段对 TS/JS 提供真正 references lookup".
  // We will setup a minimal one-off program around the specific file, but
  // realistically scanning references needs a full project. We will try a lazy project.

  const absPath = path.resolve(workspacePath, filePath)
  if (!absPath.startsWith(workspacePath)) {
    throw new McpError(ErrorCode.InvalidParams, `Access denied.`)
  }

  // Read tsconfig.json?
  let configPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath)
    configPath = ts.findConfigFile(path.dirname(absPath), ts.sys.fileExists, 'tsconfig.json')

  let compilerOptions: any = { allowJs: true, checkJs: true }
  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
    const parsedCommandLine = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))
    compilerOptions = parsedCommandLine.options
  }

  // We should create a language service for this project which is heavily cached, but since we
  // run iteratively, doing so every time might be slow. Wait, the process stays alive.
  // For safety and correctness, we will just use a naive program approach, but wait LSP is better.
  // We'll create a fast Program matching the target file.

  // Since building a full program every request might take 2-5 seconds for big, we can just do it.
  const program = ts.createProgram([absPath], compilerOptions)

  // Find the node at the position.
  const sourceFile = program.getSourceFile(absPath)
  if (!sourceFile) {
    return { matches: [] }
  }

  const pos = ts.getPositionOfLineAndCharacter(sourceFile, line - 1, column - 1)

  // Finding references using `ts.LanguageService` is the standard way.
  // So we must use a LanguageService instead of just Program.
  const host: any = {
    getScriptFileNames: () => [absPath],
    getScriptVersion: () => '0',
    getScriptSnapshot: (fileName) => {
      if (!ts.sys.fileExists(fileName)) {
        return undefined
      }
      return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName)!)
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
  const refs = languageService.getReferencesAtPosition(absPath, pos)

  if (!refs) {
    return { matches: [] }
  }

  let matches = refs.map((ref) => {
    // Map ref to result
    const refSource = languageService.getProgram()!.getSourceFile(ref.fileName)
    if (!refSource)
      return null
    const { line: startLine, character: startCol } = ts.getLineAndCharacterOfPosition(refSource, ref.textSpan.start)
    return {
      file: path.relative(workspacePath, ref.fileName),
      line: startLine + 1,
      column: startCol + 1,
      isWriteAccess: ref.isWriteAccess,
    }
  }).filter(Boolean)

  if (limit)
    matches = matches.slice(0, limit)
  return { matches }
}
