import ts from 'typescript'

interface TextReplacement {
  start: number
  end: number
  value: string
}

function getNodeText(sourceFile: ts.SourceFile, node: ts.Node): string {
  const start = node.getStart(sourceFile, false)
  const end = node.getEnd()
  return sourceFile.text.slice(start, end)
}

function getVariableKeyword(flags: ts.NodeFlags): 'const' | 'let' | 'var' {
  if (flags & ts.NodeFlags.Const)
    return 'const'
  if (flags & ts.NodeFlags.Let)
    return 'let'
  return 'var'
}

function normalizeVariableStatement(sourceFile: ts.SourceFile, statement: ts.VariableStatement): string {
  const keyword = getVariableKeyword(statement.declarationList.flags)
  const fragments: string[] = []

  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) {
      const initializer = declaration.initializer ? getNodeText(sourceFile, declaration.initializer) : 'undefined'
      fragments.push(`globalThis.${declaration.name.text} = ${initializer};`)
      continue
    }

    const declarationText = getNodeText(sourceFile, declaration)
    fragments.push(`${keyword} ${declarationText};`)
  }

  return fragments.join('\n')
}

function applyReplacements(code: string, replacements: TextReplacement[]): string {
  if (replacements.length === 0)
    return code

  let output = code
  const sorted = [...replacements].sort((a, b) => b.start - a.start)
  for (const replacement of sorted) {
    output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`
  }
  return output
}

export function normalizeReplScript(code: string): string {
  const sourceFile = ts.createSourceFile('repl.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const diagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics?: readonly ts.DiagnosticWithLocation[]
  }).parseDiagnostics

  if (diagnostics && diagnostics.length > 0)
    return code

  const replacements: TextReplacement[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement))
      continue

    const start = statement.getStart(sourceFile, false)
    const end = statement.getEnd()
    replacements.push({
      start,
      end,
      value: normalizeVariableStatement(sourceFile, statement),
    })
  }

  const hasTopLevelReturn = sourceFile.statements.some(statement => ts.isReturnStatement(statement))
  if (!hasTopLevelReturn && sourceFile.statements.length > 0) {
    const lastStatement = sourceFile.statements[sourceFile.statements.length - 1]
    if (ts.isExpressionStatement(lastStatement)) {
      const expressionText = getNodeText(sourceFile, lastStatement.expression)
      replacements.push({
        start: lastStatement.getStart(sourceFile, false),
        end: lastStatement.getEnd(),
        value: `return (${expressionText})`,
      })
    }
  }

  return applyReplacements(code, replacements)
}
