/**
 * Multi-scenario E2E battle test against a real dirty repo.
 *
 * Runs N different coding tasks sequentially, each on a clean checkout,
 * and produces a reliability scorecard.
 *
 * Usage:
 *   AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> AIRI_AGENT_MODEL=gpt-5.4-mini \
 *     tsx src/query-engine/e2e-battle.ts /tmp/dirty-repo-e2e
 */

import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { CodingPrimitives } from '../coding/primitives'
import { resolveConfig, runQueryEngine } from './engine'
import type { QueryEngineResult } from './types'

interface ScenarioResult {
  name: string
  status: string
  turnsUsed: number
  toolCalls: number
  tokensUsed: number
  durationMs: number
  filesEdited: number
  verificationScore: string
  diffLines: number
  workflow: string[]
  agentSummary: string
}

const SCENARIOS = [
  {
    name: 'Fix hardcoded values',
    goal: (ws: string) => `You are working on a JavaScript project at ${ws}.

Task: Find hardcoded magic numbers in services/scheduleService.js and extract them into named constants.

Specific requirements:
1. Find at least 2 hardcoded numeric values (like timezone offsets, timeouts, etc.)
2. Extract them into descriptive named constants at the top of the file.
3. Replace the hardcoded values with the constants.
4. Read the file back after editing to verify.
5. Do NOT change any logic — only extract constants.

Use absolute paths. The workspace root is ${ws}.`,
  },
  {
    name: 'Add input validation',
    goal: (ws: string) => `You are working on a JavaScript project at ${ws}.

Task: Add input validation to the detectScheduleQueryType function in services/scheduleService.js.

Specific requirements:
1. Read the function to understand its current behavior.
2. The function takes a msg parameter but doesn't validate it properly.
3. Add validation: if msg is not a string or is empty, return null immediately.
4. Read the file back to verify the change was applied.

Use absolute paths. The workspace root is ${ws}.`,
  },
  {
    name: 'Add missing error handling',
    goal: (ws: string) => `You are working on a JavaScript project at ${ws}.

Task: Find a function in services/scheduleService.js that uses try/catch but has an empty catch block or swallows errors silently, and improve it.

Specific requirements:
1. Search for empty catch blocks or catch blocks that don't log the error.
2. Add proper error logging (console.error) to at least one such catch block.
3. If there are no empty catch blocks, find a function that could throw but has no try/catch, and add one.
4. Read the file back to verify.

Use absolute paths. The workspace root is ${ws}.`,
  },
  {
    name: 'Fix a real test',
    goal: (ws: string) => `You are working on a JavaScript project at ${ws}.

Task: Read one of the test files in the tests/ directory and find a test that might be brittle or incorrect.

Specific requirements:
1. Read the test directory listing first.
2. Pick a test file that does NOT require @azure/cosmos or @azure/functions (check the imports first).
3. Read the test file.
4. If you find a test that has an issue (wrong assertion, missing edge case, hardcoded value that could break), fix it.
5. If all tests look correct, pick the simplest test file and add one new test case that tests an edge case.
6. Run the test with: node --test tests/<filename>

Use absolute paths. The workspace root is ${ws}.`,
  },
]

async function runScenario(
  scenario: typeof SCENARIOS[0],
  workspacePath: string,
): Promise<ScenarioResult> {
  // Reset repo to clean state
  execSync('git checkout .', { cwd: workspacePath, encoding: 'utf-8' })

  const runtime = {
    config: { workspacePath },
    cwd: workspacePath,
    getWorkspacePath: () => workspacePath,
  } as any
  const primitives = new CodingPrimitives(runtime)

  const terminal = {
    execute: async (input: { command: string; cwd?: string; timeoutMs?: number }) => {
      try {
        const stdout = execSync(input.command, {
          cwd: input.cwd ?? workspacePath,
          timeout: input.timeoutMs ?? 30_000,
          encoding: 'utf-8',
          maxBuffer: 4 * 1024 * 1024,
        })
        return { command: input.command, stdout: stdout ?? '', stderr: '', exitCode: 0, effectiveCwd: input.cwd ?? workspacePath, durationMs: 0, timedOut: false }
      }
      catch (err: any) {
        return { command: input.command, stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.status ?? 1, effectiveCwd: input.cwd ?? workspacePath, durationMs: 0, timedOut: false }
      }
    },
  }

  const config = resolveConfig({
    maxTurns: 12,
    maxToolCalls: 30,
    maxTokenBudget: 150_000,
  })

  const workflow: string[] = []
  const startedAt = Date.now()

  const result = await runQueryEngine({
    goal: scenario.goal(workspacePath),
    workspacePath,
    primitives,
    terminal,
    config,
    onProgress: (event) => {
      if (event.toolName) {
        workflow.push(event.toolName)
      }
    },
  })

  const durationMs = Date.now() - startedAt

  // Check actual git diff
  let diffLines = 0
  try {
    const diff = execSync('git diff --numstat', { cwd: workspacePath, encoding: 'utf-8' })
    for (const line of diff.trim().split('\n')) {
      if (!line) continue
      const [added, removed] = line.split('\t')
      diffLines += parseInt(added || '0', 10) + parseInt(removed || '0', 10)
    }
  }
  catch { /* no changes */ }

  const verPassed = result.verification.filter(v => v.passed).length
  const verTotal = result.verification.length

  return {
    name: scenario.name,
    status: result.status,
    turnsUsed: result.turnsUsed,
    toolCalls: result.toolCallsUsed,
    tokensUsed: result.tokensUsed,
    durationMs,
    filesEdited: result.filesModified.length,
    verificationScore: `${verPassed}/${verTotal}`,
    diffLines,
    workflow,
    agentSummary: result.summary.slice(0, 500),
  }
}

async function main() {
  const workspacePath = process.argv[2] || '/tmp/dirty-repo-e2e'

  if (!existsSync(workspacePath)) {
    console.error(`Workspace not found: ${workspacePath}`)
    process.exit(1)
  }

  console.log('╔═══════════════════════════════════════════════╗')
  console.log('║       AIRI CODING PIPELINE BATTLE TEST       ║')
  console.log('╚═══════════════════════════════════════════════╝')
  console.log(`Workspace: ${workspacePath}`)
  console.log(`Model: ${process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini'}`)
  console.log(`Scenarios: ${SCENARIOS.length}`)
  console.log(`Budget per scenario: 12 turns, 30 tool calls, 150K tokens`)
  console.log('')

  const results: ScenarioResult[] = []

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i]!
    console.log(`┌─── Scenario ${i + 1}/${SCENARIOS.length}: ${scenario.name} ───`)

    try {
      const result = await runScenario(scenario, workspacePath)
      results.push(result)

      const icon = (result.status === 'completed' || result.status === 'budget_exhausted') && result.diffLines > 0 ? (result.status === 'completed' ? '✅' : '⚠️') : '❌'
      console.log(`│ ${icon} Status: ${result.status}`)
      console.log(`│   Turns: ${result.turnsUsed}/12 | Tools: ${result.toolCalls} | Tokens: ${result.tokensUsed}`)
      console.log(`│   Duration: ${(result.durationMs / 1000).toFixed(1)}s | Diff: ${result.diffLines} lines | Verification: ${result.verificationScore}`)
      console.log(`│   Workflow: ${summarizeWorkflow(result.workflow)}`)
      console.log(`└───`)
      console.log('')
    }
    catch (err: any) {
      console.log(`│ 💥 CRASHED: ${err.message}`)
      console.log(`└───`)
      console.log('')
      results.push({
        name: scenario.name,
        status: 'crashed',
        turnsUsed: 0,
        toolCalls: 0,
        tokensUsed: 0,
        durationMs: 0,
        filesEdited: 0,
        verificationScore: '0/0',
        diffLines: 0,
        workflow: [],
        agentSummary: err.message,
      })
    }
  }

  // Scorecard
  console.log('╔═══════════════════════════════════════════════╗')
  console.log('║              RELIABILITY SCORECARD            ║')
  console.log('╚═══════════════════════════════════════════════╝')

  const headers = ['Scenario', 'Status', 'Turns', 'Tokens', 'Diff', 'Verify']
  console.log(`  ${headers.join(' | ')}`)
  console.log(`  ${headers.map(h => '-'.repeat(h.length)).join(' | ')}`)

  let passed = 0
  let totalTokens = 0
  let totalDuration = 0

  for (const r of results) {
    const icon = (r.status === 'completed' || r.status === 'budget_exhausted') && r.diffLines > 0 ? (r.status === 'completed' ? '✅' : '⚠️') : '❌'
    const cols = [
      r.name.padEnd(24),
      `${icon} ${r.status}`.padEnd(16),
      `${r.turnsUsed}/12`.padEnd(5),
      `${Math.round(r.tokensUsed / 1000)}K`.padEnd(6),
      `${r.diffLines}`.padEnd(4),
      r.verificationScore,
    ]
    console.log(`  ${cols.join(' | ')}`)

    if ((r.status === 'completed' || r.status === 'budget_exhausted') && r.diffLines > 0) passed++
    totalTokens += r.tokensUsed
    totalDuration += r.durationMs
  }

  console.log('')
  console.log(`  Pass rate: ${passed}/${results.length} (${Math.round(passed / results.length * 100)}%)`)
  console.log(`  Total tokens: ${Math.round(totalTokens / 1000)}K`)
  console.log(`  Total time: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`  Avg tokens/scenario: ${Math.round(totalTokens / results.length / 1000)}K`)
  console.log(`  Avg time/scenario: ${(totalDuration / results.length / 1000).toFixed(1)}s`)
  console.log('')

  if (passed >= 3) {
    console.log('  🟢 BATTLE TEST: CONSUMER-GRADE VIABLE')
  }
  else if (passed >= 2) {
    console.log('  🟡 BATTLE TEST: PROTOTYPE-GRADE')
  }
  else {
    console.log('  🔴 BATTLE TEST: NOT PRODUCTION READY')
  }

  // Print agent summaries
  console.log('')
  console.log('═══ Agent Summaries ═══')
  for (const r of results) {
    console.log(`\n─── ${r.name} (${r.status}) ───`)
    console.log(r.agentSummary || '(no summary)')
  }
}

function summarizeWorkflow(tools: string[]): string {
  // Compress repeated tool names
  const compressed: string[] = []
  let prev = ''
  let count = 0
  for (const t of tools) {
    if (t === prev) {
      count++
    }
    else {
      if (prev) compressed.push(count > 1 ? `${prev}×${count}` : prev)
      prev = t
      count = 1
    }
  }
  if (prev) compressed.push(count > 1 ? `${prev}×${count}` : prev)
  return compressed.join(' → ')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
