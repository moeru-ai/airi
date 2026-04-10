/**
 * E2E test against a REAL dirty repo.
 *
 * This test clones a real GitHub repo with messy code and asks the QueryEngine
 * to perform a non-trivial refactoring task. It validates:
 *
 * 1. Large file handling (2351-line scheduleService.js)
 * 2. Codebase exploration (222 files)
 * 3. Precision editing (edit_file / multi_edit_file)
 * 4. Self-verification (read-back, test running)
 * 5. Honest reporting
 *
 * Usage:
 *   AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> AIRI_AGENT_MODEL=gpt-5.4-mini \
 *     tsx src/query-engine/e2e-dirty-repo.ts
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as childProcess from 'node:child_process'

import { CodingPrimitives } from '../coding/primitives'
import { resolveConfig, runQueryEngine } from './engine'

async function main() {
  const workspacePath = process.argv[2] || '/tmp/dirty-repo-e2e'

  if (!existsSync(workspacePath)) {
    console.error(`Workspace not found: ${workspacePath}`)
    console.error('Clone a repo first: git clone --depth 1 <repo-url> /tmp/dirty-repo-e2e')
    process.exit(1)
  }

  const fileCount = countFiles(workspacePath)
  console.log('=== Dirty Repo E2E ===')
  console.log(`Workspace: ${workspacePath}`)
  console.log(`Files: ${fileCount}`)
  console.log(`Model: ${process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini'}`)
  console.log('')

  const runtime = { config: { workspacePath }, cwd: workspacePath } as any
  const primitives = new CodingPrimitives(runtime)

  const terminal = {
    execute: async (input: { command: string; cwd?: string; timeoutMs?: number }) => {
      const { execSync } = await import('node:child_process')
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
    maxTurns: 20,
    maxToolCalls: 50,
    maxTokenBudget: 300_000,
  })

  // Task: Find and fix a real issue in the codebase
  const goal = `You are working on a JavaScript/TypeScript project at ${workspacePath}.

Your task: Analyze the project structure and find the service that handles schedule management.
Then do the following:

1. Read the schedule service file and understand its structure.
2. The file likely has issues (missing error handling, hardcoded values, no input validation, etc.)
   Find at least 2 concrete bugs or code quality issues.
3. Fix the issues using edit_file or multi_edit_file (do NOT rewrite the entire file).
4. After editing, read the file back to verify your changes were applied correctly.
5. If there are tests, try to run them.

Be precise. Do not make unnecessary changes. Report honestly what you found, fixed, and verified.
Use absolute paths when calling tools. The workspace root is ${workspacePath}.`

  console.log('Task: Analyze & fix schedule service in dirty repo')
  console.log('Starting autonomous coding loop...')
  console.log('')

  const startedAt = Date.now()

  const result = await runQueryEngine({
    goal,
    workspacePath,
    primitives,
    terminal,
    config,
    onProgress: (event) => {
      const icon = event.phase === 'calling_llm' ? '🤖' : event.phase === 'executing_tools' ? '🔧' : '✅'
      const msg = event.message ? ` | ${event.message}` : ''
      console.log(`  ${icon} Turn ${event.turn} | ${event.phase}${event.toolName ? ` (${event.toolName})` : ''} | Budget: ${Math.round(event.budget.percentUsed * 100)}%${msg}`)
    },
  })

  const durationMs = Date.now() - startedAt

  console.log('')
  console.log('═══════════════════════════════════')
  console.log('         E2E RESULTS')
  console.log('═══════════════════════════════════')
  console.log(`Status:       ${result.status}`)
  console.log(`Turns:        ${result.turnsUsed}`)
  console.log(`Tool calls:   ${result.toolCallsUsed}`)
  console.log(`Tokens:       ${result.tokensUsed}`)
  console.log(`Duration:     ${(durationMs / 1000).toFixed(1)}s`)
  console.log(`Files edited: ${result.filesModified.length}`)
  for (const f of result.filesModified) {
    console.log(`  → ${f}`)
  }
  if (result.error) console.log(`Error:        ${result.error}`)
  console.log('')

  // Verification results
  if (result.verification.length > 0) {
    console.log('── Post-loop Verification ──')
    let passed = 0
    let failed = 0
    for (const v of result.verification) {
      const icon = v.passed ? '✅' : '❌'
      console.log(`  ${icon} ${v.check}: ${v.target}`)
      console.log(`     ${v.detail}`)
      if (v.passed) passed++
      else failed++
    }
    console.log(`  Score: ${passed}/${passed + failed} passed`)
    console.log('')
  }

  // Agent summary
  console.log('── Agent Summary ──')
  console.log(result.summary)
  console.log('')

  // Quality checks
  const checks = {
    completed: result.status === 'completed',
    editsMade: result.filesModified.length > 0,
    verificationRan: result.verification.length > 0,
    allVerificationPassed: result.verification.every(v => v.passed),
    summaryHasChanges: result.summary.toLowerCase().includes('change'),
    summaryHasVerification: result.summary.toLowerCase().includes('verif') || result.summary.toLowerCase().includes('✅'),
    unterBudget: result.turnsUsed <= 15,
    usedEditFile: result.summary.toLowerCase().includes('edit') || result.toolCallsUsed >= 3,
  }

  console.log('── Quality Checks ──')
  for (const [name, passed] of Object.entries(checks)) {
    console.log(`  ${passed ? '✅' : '❌'} ${name}`)
  }

  const score = Object.values(checks).filter(Boolean).length
  const total = Object.values(checks).length
  console.log('')
  console.log(`Quality Score: ${score}/${total} (${Math.round(score / total * 100)}%)`)
  console.log(score >= 6 ? '=== DIRTY REPO E2E: PASS ===' : '=== DIRTY REPO E2E: NEEDS IMPROVEMENT ===')
}

function countFiles(dir: string): number {
  const { execSync } = childProcess
  try {
    const out = execSync(`find ${dir} -not -path '*/.git/*' -type f | wc -l`, { encoding: 'utf-8' })
    return parseInt(out.trim(), 10)
  }
  catch { return -1 }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
