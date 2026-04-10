/**
 * E2E coding test — lets QueryEngine make real changes in the workspace.
 *
 * Goal: Have the agent create a new TypeScript utility file, write a unit test,
 * and verify it passes. This tests the full coding loop in a real workspace.
 *
 * Usage:
 *   AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> AIRI_AGENT_MODEL=gpt-5.4-mini tsx src/query-engine/e2e-coding.ts
 */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { CodingPrimitives } from '../coding/primitives'
import { resolveConfig, runQueryEngine } from './engine'

async function main() {
  const workspacePath = process.cwd()

  console.log('=== QueryEngine Coding E2E ===')
  console.log(`Workspace: ${workspacePath}`)
  console.log(`Model: ${process.env.AIRI_AGENT_MODEL ?? 'gpt-5.4-mini'}`)
  console.log('')

  const runtime = { config: { workspacePath }, cwd: workspacePath } as any
  const primitives = new CodingPrimitives(runtime)

  const terminal = {
    describe: () => ({ kind: 'local-shell-runner' as const, notes: ['e2e-coding stub'] }),
    execute: async (input: { command: string; cwd?: string; timeoutMs?: number }) => {
      const { execSync } = await import('node:child_process')
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
    getState: () => ({ effectiveCwd: workspacePath }),
    resetState: (reason?: string) => ({ effectiveCwd: workspacePath }),
  }

  const config = resolveConfig({
    maxTurns: 10,
    maxToolCalls: 25,
    maxTokenBudget: 100_000,
  })

  if (!config.apiKey) {
    console.error('ERROR: AIRI_AGENT_API_KEY not set.')
    process.exit(1)
  }

  const targetFile = join(workspacePath, 'src/query-engine/e2e-generated-util.ts')
  const testFile = join(workspacePath, 'src/query-engine/e2e-generated-util.test.ts')

  // Clean up any previous run
  if (existsSync(targetFile)) rmSync(targetFile)
  if (existsSync(testFile)) rmSync(testFile)

  const goal = `You are working in the AIRI monorepo. Your workspace is at: ${workspacePath}

TASK: Create a small utility module and its unit test:

1. Create \`src/query-engine/e2e-generated-util.ts\` with:
   - A function \`formatDuration(ms: number): string\` that formats a millisecond value into a human-readable string (e.g., 1500 → "1.5s", 65000 → "1m 5s", 3661000 → "1h 1m 1s").
   - A function \`truncateMiddle(str: string, maxLen: number): string\` that truncates a string by cutting the middle and replacing it with "..." if it exceeds maxLen.
   - Export both functions.

2. Create \`src/query-engine/e2e-generated-util.test.ts\` with vitest tests that cover:
   - formatDuration for milliseconds, seconds, minutes, and hours
   - truncateMiddle for strings shorter than, equal to, and longer than maxLen

3. Run the tests with: npx vitest run src/query-engine/e2e-generated-util.test.ts
   Make sure they pass.

Use absolute paths when calling write_file. The workspace root is ${workspacePath}.`

  console.log('Goal: Create utility module + unit test + verify green')
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
      console.log(`  ${icon} Turn ${event.turn} | ${event.phase}${event.toolName ? ` (${event.toolName})` : ''} | Budget: ${Math.round(event.budget.percentUsed * 100)}%${event.message ? ` | ${event.message}` : ''}`)
    },
  })

  const durationMs = Date.now() - startedAt

  console.log('')
  console.log('=== Result ===')
  console.log(`Status: ${result.status}`)
  console.log(`Turns: ${result.turnsUsed}`)
  console.log(`Tool calls: ${result.toolCallsUsed}`)
  console.log(`Tokens: ${result.tokensUsed}`)
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`)
  console.log(`Files modified: ${result.filesModified.join(', ') || 'none'}`)
  if (result.error) console.log(`Error: ${result.error}`)
  console.log('')
  console.log('Summary:')
  console.log(result.summary)

  // Show post-loop verification results
  if (result.verification.length > 0) {
    console.log('')
    console.log('--- Post-loop Verification ---')
    for (const v of result.verification) {
      const icon = v.passed ? '✅' : '❌'
      console.log(`  ${icon} ${v.check}: ${v.target} — ${v.detail}`)
    }
    const passed = result.verification.filter(v => v.passed).length
    console.log(`  Total: ${passed}/${result.verification.length} passed`)
  }
  console.log('')

  // Verify files exist
  const utilExists = existsSync(targetFile)
  const testExists = existsSync(testFile)
  console.log(`Utility file: ${utilExists ? '✅' : '❌'} ${targetFile}`)
  console.log(`Test file: ${testExists ? '✅' : '❌'} ${testFile}`)

  if (utilExists) {
    console.log('')
    console.log('--- Generated utility ---')
    console.log(readFileSync(targetFile, 'utf-8'))
  }
  if (testExists) {
    console.log('')
    console.log('--- Generated test ---')
    console.log(readFileSync(testFile, 'utf-8'))
  }

  console.log('')
  console.log(utilExists && testExists ? '=== CODING E2E PASSED ===' : '=== CODING E2E FAILED ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
