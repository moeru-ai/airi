import type { ElementNode, OpenUIError, ParseResult } from '@openuidev/lang-core'
import type { VNodeChild } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { createParser, createStore, evaluate, evaluateElementProps } from '@openuidev/lang-core'

import { SEARCH_ICONS_TOOL_NAME } from '../../tools/search-icons'
import { hasTablerIcon } from '../tabler-icons'
import { cardLibrary, drawCard, isPartNode, partProblem } from './catalog'

const programParser = createParser(cardLibrary.toJSONSchema(), 'Card')
/** A tool name in a Query is a string literal, so it evaluates without state or references. */
const LITERAL_CONTEXT = { getState: () => null, resolveRef: () => null }

/** A program evaluated with its data and drawn, when it has no problems. */
export interface EvaluatedCard {
  parsed: ParseResult
  /** The root part with every value evaluated. */
  root?: ElementNode
  /** The drawn card. A card with problems has none. */
  drawn?: VNodeChild
  /** What keeps the card from drawing. A model reads them, so each names the statement or the part. */
  problems: string[]
}

/** Every part of an evaluated card. */
function partsOf(value: unknown, parts: ElementNode[] = []) {
  if (Array.isArray(value)) {
    for (const item of value)
      partsOf(item, parts)
  }
  else if (isPartNode(value)) {
    parts.push(value)
    for (const prop of Object.values(value.props))
      partsOf(prop, parts)
  }
  return parts
}

/**
 * Evaluates a program, checks the values of each part, and draws it. Generation checks a program this way, and the chat
 * shows the drawing of the same call, so a card that passes its check draws as checked.
 * A part that fails while it draws counts as a problem too.
 *
 * A Query reads `data`, the result of one tool call. A reply card has no Query, so it evaluates without data.
 */
export function evaluateCard(program: string, data?: unknown): EvaluatedCard {
  const parsed = programParser.parse(program)
  const problems = parsed.meta.errors.map(error => `${error.statementId ?? error.component}${error.path ? ` ${error.path}` : ''}: ${error.message}`)
  if (!parsed.root) {
    problems.push('No statement renders a Card. Start the program with `root = Card(...)`.')
    return { parsed, problems }
  }

  const store = createStore()
  store.initialize(parsed.stateDeclarations ?? {}, {})
  const queries = new Set(parsed.queryStatements.map(query => query.statementId))
  const errors: OpenUIError[] = []
  try {
    const root = evaluateElementProps(parsed.root, {
      ctx: { getState: name => store.get(name) ?? null, resolveRef: name => queries.has(name) ? data : null },
      library: cardLibrary,
      store,
      errors,
    })
    problems.push(...errors.map(error => `${error.statementId ?? error.component ?? 'program'}: ${error.message}`))
    for (const part of partsOf(root)) {
      const problem = partProblem(part.typeName, part.props)
      if (problem)
        problems.push(problem)
    }
    if (problems.length > 0)
      return { parsed, root, problems }
    return { parsed, root, drawn: drawCard(root), problems }
  }
  catch (error) {
    problems.push(`Drawing the card failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
    return { parsed, problems }
  }
}

/**
 * The problems that keep a new program from use. The model reads them and fixes the program.
 *
 * A tool card passes its tool and the result of one call: its program must read every value through `Query(key)`. A
 * reply card passes nothing: its program holds every value, so it must not query.
 */
export async function problemsOfProgram(program: string, query?: { key: string, data: unknown }): Promise<string[]> {
  const { parsed, root, problems } = evaluateCard(program, query?.data)
  // Every Query reads the result of the one call, so a tool card has exactly one, and it names the tool.
  if (query && (parsed.queryStatements.length !== 1 || !parsed.queryStatements.some(statement => statement.toolAST && evaluate(statement.toolAST, LITERAL_CONTEXT) === query.key)))
    problems.push(`The program must read the result with exactly one \`Query("${query.key}", {}, defaults)\` instead of fixed values.`)
  if (!query && parsed.queryStatements.length > 0)
    problems.push('Remove every Query. Write every value into the program.')
  if (parsed.mutationStatements.length > 0)
    problems.push('Remove every Mutation. A card only shows a result.')

  // A part draws nothing for an icon that Tabler does not have. The model can still fix the name now.
  for (const part of partsOf(root)) {
    const icon = part.props.icon
    if (typeof icon === 'string' && icon && !await hasTablerIcon(icon))
      problems.push(`"${icon}" is not a Tabler icon name. Find one with \`${SEARCH_ICONS_TOOL_NAME}\`, or leave the icon out.`)
  }
  return problems
}
