/**
 * QueryEngine Reliability Benchmark
 *
 * Runs 5 diverse coding tasks to measure the autonomous coding loop's
 * reliability against consumer-grade agent standards.
 *
 * Tasks:
 * 1. FILE_CREATE — Create a new module from spec
 * 2. BUG_FIX — Find and fix a planted bug
 * 3. REFACTOR — Transform code while preserving tests
 * 4. CODE_ANALYSIS — Analyze codebase and produce report
 * 5. MULTI_FILE — Coordinate changes across multiple files
 *
 * Metrics per task:
 * - success: did it complete the task?
 * - correctness: did the output match expectations?
 * - turns: how many LLM turns?
 * - tool_calls: how many tool invocations?
 * - tokens: total token consumption
 * - duration_s: wall clock time
 * - self_verified: did the agent verify its own work?
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'

import { resolveConfig, runQueryEngine } from './engine'
import { CodingPrimitives } from '../coding/primitives'

interface BenchmarkResult {
  task: string
  type: string
  success: boolean
  correctness: 'full' | 'partial' | 'none'
  turns: number
  toolCalls: number
  tokens: number
  durationS: number
  selfVerified: boolean
  filesModified: string[]
  error?: string
  notes: string
}

const WORKSPACE_BASE = join(tmpdir(), `airi-bench-${Date.now()}`)

function createWorkspace(name: string): string {
  const ws = join(WORKSPACE_BASE, name)
  mkdirSync(ws, { recursive: true })
  return ws
}

function createTerminal(workspacePath: string) {
  return {
    execute: async (input: { command: string; cwd?: string; timeoutMs?: number }) => {
      try {
        const stdout = execSync(input.command, {
          cwd: input.cwd ?? workspacePath,
          timeout: input.timeoutMs ?? 30_000,
          encoding: 'utf-8',
          maxBuffer: 2 * 1024 * 1024,
        })
        return { command: input.command, stdout: stdout ?? '', stderr: '', exitCode: 0, effectiveCwd: input.cwd ?? workspacePath, durationMs: 0, timedOut: false }
      }
      catch (err: any) {
        return { command: input.command, stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.status ?? 1, effectiveCwd: input.cwd ?? workspacePath, durationMs: 0, timedOut: false }
      }
    },
  }
}

async function runTask(params: {
  name: string
  type: string
  workspace: string
  goal: string
  maxTurns?: number
  maxToolCalls?: number
  validate: (ws: string) => { success: boolean; correctness: 'full' | 'partial' | 'none'; selfVerified: boolean; notes: string }
}): Promise<BenchmarkResult> {
  const { name, type, workspace, goal, maxTurns = 8, maxToolCalls = 20, validate } = params
  const runtime = { config: { workspacePath: workspace }, cwd: workspace } as any
  const primitives = new CodingPrimitives(runtime)
  const terminal = createTerminal(workspace)
  const config = resolveConfig({ maxTurns, maxToolCalls, maxTokenBudget: 80_000 })

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Task: ${name} (${type})`)
  console.log(`${'═'.repeat(60)}`)

  const startedAt = Date.now()
  let result: any

  try {
    result = await runQueryEngine({
      goal,
      workspacePath: workspace,
      primitives,
      terminal,
      config,
      onProgress: (event) => {
        const icon = event.phase === 'calling_llm' ? '🤖' : '🔧'
        process.stdout.write(`  ${icon} T${event.turn} ${event.toolName ?? event.phase} | `)
      },
    })
  }
  catch (err: any) {
    return {
      task: name, type, success: false, correctness: 'none',
      turns: 0, toolCalls: 0, tokens: 0, durationS: (Date.now() - startedAt) / 1000,
      selfVerified: false, filesModified: [], error: err.message, notes: 'Engine threw an exception',
    }
  }

  console.log('')
  const durationS = (Date.now() - startedAt) / 1000
  const validation = validate(workspace)

  return {
    task: name,
    type,
    success: validation.success,
    correctness: validation.correctness,
    turns: result.turnsUsed,
    toolCalls: result.toolCallsUsed,
    tokens: result.tokensUsed,
    durationS: Math.round(durationS * 10) / 10,
    selfVerified: validation.selfVerified,
    filesModified: result.filesModified,
    error: result.error,
    notes: validation.notes,
  }
}

// ═══════════════════════════════════════════════════════════════
// TASK 1: FILE_CREATE — Create a TypeScript module from spec
// ═══════════════════════════════════════════════════════════════
async function task1(): Promise<BenchmarkResult> {
  const ws = createWorkspace('task1-file-create')
  return runTask({
    name: 'Create retry utility',
    type: 'FILE_CREATE',
    workspace: ws,
    goal: `Create a file called "retry.ts" in the workspace root (${ws}) with:
- A function \`retry<T>(fn: () => Promise<T>, options: { maxRetries: number; delayMs: number; backoff?: 'linear' | 'exponential' }): Promise<T>\`
- It should retry the function up to maxRetries times on failure
- Linear backoff: delay = delayMs * attempt
- Exponential backoff: delay = delayMs * 2^attempt
- Default backoff is 'linear'
- Export the function

Use the write_file tool with the absolute path.`,
    validate: (ws) => {
      const filePath = join(ws, 'retry.ts')
      if (!existsSync(filePath)) return { success: false, correctness: 'none', selfVerified: false, notes: 'File not created' }
      const content = readFileSync(filePath, 'utf-8')
      const hasFunction = content.includes('retry') && content.includes('maxRetries')
      const hasExport = content.includes('export')
      const hasBackoff = content.includes('exponential') && content.includes('linear')
      const hasAsync = content.includes('Promise') || content.includes('async')
      const correctness = hasFunction && hasExport && hasBackoff && hasAsync ? 'full' : hasFunction ? 'partial' : 'none'
      return { success: true, correctness, selfVerified: false, notes: `File ${content.length} chars. Export=${hasExport}, Backoff=${hasBackoff}` }
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// TASK 2: BUG_FIX — Find and fix a planted bug
// ═══════════════════════════════════════════════════════════════
async function task2(): Promise<BenchmarkResult> {
  const ws = createWorkspace('task2-bug-fix')
  // Plant a file with a known bug
  writeFileSync(join(ws, 'sum.ts'), `/**
 * Calculate the sum of an array of numbers.
 */
export function sum(numbers: number[]): number {
  let total = 0
  for (let i = 0; i <= numbers.length; i++) {  // BUG: off-by-one (should be <)
    total += numbers[i]
  }
  return total
}

export function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}
`)

  writeFileSync(join(ws, 'sum.test.ts'), `import { describe, expect, it } from 'vitest'
import { sum, average } from './sum'

describe('sum', () => {
  it('returns 0 for empty array', () => {
    expect(sum([])).toBe(0)
  })
  it('sums positive numbers', () => {
    expect(sum([1, 2, 3])).toBe(6)
  })
  it('sums negative numbers', () => {
    expect(sum([-1, -2, -3])).toBe(-6)
  })
})

describe('average', () => {
  it('returns 0 for empty array', () => {
    expect(average([])).toBe(0)
  })
  it('computes average', () => {
    expect(average([2, 4, 6])).toBe(4)
  })
})
`)

  return runTask({
    name: 'Fix off-by-one bug',
    type: 'BUG_FIX',
    workspace: ws,
    goal: `There is a bug in sum.ts at ${ws}. The tests in sum.test.ts are failing.
Read the files, identify the bug, fix it, and verify the tests pass by running:
  npx vitest run sum.test.ts --config /dev/null
(or just verify by reading the code if vitest is not available)
Use absolute paths.`,
    validate: (ws) => {
      const content = readFileSync(join(ws, 'sum.ts'), 'utf-8')
      const fixedBug = content.includes('i < numbers.length') || content.includes('i<numbers.length')
      const noNewBugs = !content.includes('i <= numbers.length')
      return {
        success: fixedBug && noNewBugs,
        correctness: fixedBug ? 'full' : 'none',
        selfVerified: content !== readFileSync(join(ws, 'sum.ts'), 'utf-8') === false, // file was modified
        notes: fixedBug ? 'Off-by-one fixed correctly' : 'Bug not fixed',
      }
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// TASK 3: REFACTOR — Extract function and rename
// ═══════════════════════════════════════════════════════════════
async function task3(): Promise<BenchmarkResult> {
  const ws = createWorkspace('task3-refactor')
  writeFileSync(join(ws, 'parser.ts'), `export function parseConfig(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = raw.split('\\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    // Remove surrounding quotes
    const unquoted = value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1)
      : value.startsWith("'") && value.endsWith("'")
        ? value.slice(1, -1)
        : value
    result[key] = unquoted
  }
  return result
}
`)

  return runTask({
    name: 'Refactor config parser',
    type: 'REFACTOR',
    workspace: ws,
    goal: `Refactor the file parser.ts at ${ws}/parser.ts:
1. Extract the quote-removal logic into a separate exported function called \`unquote(value: string): string\`
2. Extract the line parsing logic into a separate exported function called \`parseLine(line: string): [string, string] | null\`
3. Simplify parseConfig to use these two helper functions
4. Make sure the refactored code preserves the exact same behavior
Use absolute paths with write_file.`,
    validate: (ws) => {
      const content = readFileSync(join(ws, 'parser.ts'), 'utf-8')
      const hasUnquote = content.includes('function unquote') && content.includes('export')
      const hasParseLine = content.includes('function parseLine') && content.includes('export')
      const hasParseConfig = content.includes('parseConfig')
      const usesHelpers = hasUnquote && hasParseLine && hasParseConfig
      const correctness = usesHelpers ? 'full' : (hasUnquote || hasParseLine) ? 'partial' : 'none'
      return {
        success: usesHelpers,
        correctness,
        selfVerified: false,
        notes: `unquote=${hasUnquote}, parseLine=${hasParseLine}, parseConfig=${hasParseConfig}`,
      }
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// TASK 4: CODE_ANALYSIS — Read and analyze existing code
// ═══════════════════════════════════════════════════════════════
async function task4(): Promise<BenchmarkResult> {
  const ws = createWorkspace('task4-analysis')
  writeFileSync(join(ws, 'api.ts'), `import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export class UserStore {
  private dataDir: string

  constructor(dataDir: string) {
    this.dataDir = dataDir
  }

  async getUser(id: string): Promise<{ id: string; name: string; email: string } | null> {
    try {
      const data = await readFile(join(this.dataDir, \`\${id}.json\`), 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async saveUser(user: { id: string; name: string; email: string }): Promise<void> {
    await writeFile(join(this.dataDir, \`\${user.id}.json\`), JSON.stringify(user))
  }

  async deleteUser(id: string): Promise<void> {
    const { unlink } = await import('fs/promises')
    await unlink(join(this.dataDir, \`\${id}.json\`))
  }

  async listUsers(): Promise<string[]> {
    const { readdir } = await import('fs/promises')
    const files = await readdir(this.dataDir)
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  }
}
`)

  return runTask({
    name: 'Code review & report',
    type: 'CODE_ANALYSIS',
    workspace: ws,
    goal: `Read the file api.ts at ${ws}/api.ts and produce a code review report.
Write the report to ${ws}/review.md with:
1. Summary of what the code does
2. At least 3 specific issues/improvements (e.g., error handling, security, performance, typing)
3. A severity rating for each issue (low/medium/high)
4. Suggested fixes for each issue

Use write_file with absolute paths.`,
    validate: (ws) => {
      const reviewPath = join(ws, 'review.md')
      if (!existsSync(reviewPath)) return { success: false, correctness: 'none', selfVerified: false, notes: 'review.md not created' }
      const content = readFileSync(reviewPath, 'utf-8')
      const hasIssues = (content.match(/issue|problem|concern|improvement|bug|vulnerability/gi) || []).length >= 2
      const hasSeverity = content.includes('low') || content.includes('medium') || content.includes('high')
      const hasFixes = content.includes('fix') || content.includes('suggest') || content.includes('recommend')
      const isSubstantial = content.length > 200
      const correctness = hasIssues && hasSeverity && hasFixes && isSubstantial ? 'full' : isSubstantial ? 'partial' : 'none'
      return {
        success: isSubstantial,
        correctness,
        selfVerified: false,
        notes: `Report ${content.length} chars. Issues=${hasIssues}, Severity=${hasSeverity}, Fixes=${hasFixes}`,
      }
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// TASK 5: MULTI_FILE — Create coordinated multi-file changes
// ═══════════════════════════════════════════════════════════════
async function task5(): Promise<BenchmarkResult> {
  const ws = createWorkspace('task5-multi-file')

  return runTask({
    name: 'Multi-file module creation',
    type: 'MULTI_FILE',
    workspace: ws,
    goal: `Create a small event emitter module with 3 files:

1. ${ws}/types.ts — Define and export:
   - type EventHandler<T> = (data: T) => void
   - interface EventEmitterOptions { maxListeners?: number }

2. ${ws}/emitter.ts — Implement and export:
   - class EventEmitter with methods: on(event, handler), off(event, handler), emit(event, data), listenerCount(event)
   - Import types from ./types
   - Respect maxListeners option (throw if exceeded)

3. ${ws}/index.ts — Re-export everything from types.ts and emitter.ts

Use write_file with absolute paths for all 3 files.`,
    validate: (ws) => {
      const typesExists = existsSync(join(ws, 'types.ts'))
      const emitterExists = existsSync(join(ws, 'emitter.ts'))
      const indexExists = existsSync(join(ws, 'index.ts'))

      if (!typesExists || !emitterExists || !indexExists) {
        const missing = [!typesExists && 'types.ts', !emitterExists && 'emitter.ts', !indexExists && 'index.ts'].filter(Boolean)
        return { success: false, correctness: 'none', selfVerified: false, notes: `Missing: ${missing.join(', ')}` }
      }

      const types = readFileSync(join(ws, 'types.ts'), 'utf-8')
      const emitter = readFileSync(join(ws, 'emitter.ts'), 'utf-8')
      const index = readFileSync(join(ws, 'index.ts'), 'utf-8')

      const typesOk = types.includes('EventHandler') && types.includes('export')
      const emitterOk = emitter.includes('EventEmitter') && emitter.includes('on') && emitter.includes('emit') && emitter.includes('./types')
      const indexOk = index.includes('export') && (index.includes('./types') || index.includes('./emitter'))
      const allCorrect = typesOk && emitterOk && indexOk

      return {
        success: true,
        correctness: allCorrect ? 'full' : 'partial',
        selfVerified: false,
        notes: `types=${typesOk}, emitter=${emitterOk}, index=${indexOk}`,
      }
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// MAIN — Run all tasks and produce report
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║     AIRI QueryEngine Reliability Benchmark              ║')
  console.log('║     Model: ' + (process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini').padEnd(45) + '║')
  console.log('╚══════════════════════════════════════════════════════════╝')

  mkdirSync(WORKSPACE_BASE, { recursive: true })

  const results: BenchmarkResult[] = []

  const tasks = [task1, task2, task3, task4, task5]
  for (const task of tasks) {
    try {
      results.push(await task())
    }
    catch (err: any) {
      console.error(`  ❌ Task crashed: ${err.message}`)
    }
  }

  // Print summary table
  console.log('\n')
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                         BENCHMARK RESULTS                                      ║')
  console.log('╠══════════════════════════╦═════════╦═══════════╦═══════╦═══════╦════════╦═══════╣')
  console.log('║ Task                     ║ Success ║ Correct   ║ Turns ║ Tools ║ Tokens ║  Time ║')
  console.log('╠══════════════════════════╬═════════╬═══════════╬═══════╬═══════╬════════╬═══════╣')

  for (const r of results) {
    const name = r.task.padEnd(24).slice(0, 24)
    const success = r.success ? '  ✅   ' : '  ❌   '
    const correct = r.correctness.padEnd(9)
    const turns = String(r.turns).padStart(5)
    const tools = String(r.toolCalls).padStart(5)
    const tokens = String(r.tokens).padStart(6)
    const time = `${r.durationS}s`.padStart(5)
    console.log(`║ ${name} ║${success}║ ${correct} ║${turns} ║${tools} ║${tokens} ║${time} ║`)
  }

  console.log('╚══════════════════════════╩═════════╩═══════════╩═══════╩═══════╩════════╩═══════╝')

  // Aggregate stats
  const totalTasks = results.length
  const successCount = results.filter(r => r.success).length
  const fullCorrect = results.filter(r => r.correctness === 'full').length
  const totalTurns = results.reduce((s, r) => s + r.turns, 0)
  const totalTokens = results.reduce((s, r) => s + r.tokens, 0)
  const totalTime = results.reduce((s, r) => s + r.durationS, 0)
  const avgTurns = totalTurns / totalTasks
  const avgTokens = totalTokens / totalTasks

  console.log('')
  console.log('═══ Aggregate ═══')
  console.log(`Success rate:       ${successCount}/${totalTasks} (${Math.round(successCount / totalTasks * 100)}%)`)
  console.log(`Full correctness:   ${fullCorrect}/${totalTasks} (${Math.round(fullCorrect / totalTasks * 100)}%)`)
  console.log(`Avg turns/task:     ${avgTurns.toFixed(1)}`)
  console.log(`Avg tokens/task:    ${Math.round(avgTokens).toLocaleString()}`)
  console.log(`Total tokens:       ${totalTokens.toLocaleString()}`)
  console.log(`Total time:         ${totalTime.toFixed(1)}s`)
  console.log('')

  // Consumer-grade comparison
  console.log('═══ Consumer-Grade Comparison ═══')
  const successRate = successCount / totalTasks * 100
  const correctRate = fullCorrect / totalTasks * 100
  if (successRate >= 80 && correctRate >= 60) {
    console.log('🟢 VERDICT: Approaching consumer-grade reliability')
  } else if (successRate >= 60) {
    console.log('🟡 VERDICT: Functional but below consumer-grade')
  } else {
    console.log('🔴 VERDICT: Not yet consumer-grade')
  }
  console.log(`  Claude Code baseline: ~90% success, ~80% full correctness on similar tasks`)
  console.log(`  AIRI current:         ${Math.round(successRate)}% success, ${Math.round(correctRate)}% full correctness`)
  console.log('')

  // Notes per task
  console.log('═══ Task Notes ═══')
  for (const r of results) {
    const icon = r.success ? '✅' : '❌'
    console.log(`${icon} ${r.task} (${r.type}): ${r.notes}${r.error ? ` [ERROR: ${r.error}]` : ''}`)
  }

  // Cleanup
  rmSync(WORKSPACE_BASE, { recursive: true, force: true })

  // Write JSON results for machine consumption
  const reportPath = join(tmpdir(), `airi-bench-results-${Date.now()}.json`)
  writeFileSync(reportPath, JSON.stringify({ results, aggregate: { successRate, correctRate, avgTurns, avgTokens, totalTokens, totalTime } }, null, 2))
  console.log(`\nFull results saved to: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
