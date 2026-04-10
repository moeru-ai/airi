/**
 * E2E smoke test for QueryEngine — runs a real autonomous loop.
 *
 * Usage:
 *   AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> tsx src/query-engine/e2e-smoke.ts
 *
 * This script:
 * 1. Creates a temp workspace
 * 2. Asks the QueryEngine to create a simple file
 * 3. Verifies the file was created
 * 4. Cleans up
 *
 * NOT committed to git — local testing only.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { CodingPrimitives } from '../coding/primitives'
import { resolveConfig, runQueryEngine } from './engine'

async function main() {
  const workspacePath = join(tmpdir(), `airi-qe-smoke-${Date.now()}`)
  mkdirSync(workspacePath, { recursive: true })

  console.log('=== QueryEngine E2E Smoke Test ===')
  console.log(`Workspace: ${workspacePath}`)
  console.log(`Model: ${process.env.AIRI_AGENT_MODEL ?? 'gpt-4o'}`)
  console.log(`Base URL: ${process.env.AIRI_AGENT_BASE_URL ?? 'https://api.openai.com/v1'}`)
  console.log('')

  // Create a minimal runtime mock for CodingPrimitives
  const runtime = {
    config: { workspacePath },
    cwd: workspacePath,
  } as any

  const primitives = new CodingPrimitives(runtime)

  // Create a minimal terminal runner
  const terminal = {
    describe: () => ({ kind: 'local-shell-runner' as const, notes: ['e2e-smoke stub'] }),
    execute: async (input: { command: string; cwd?: string; timeoutMs?: number }) => {
      const { execSync } = await import('node:child_process')
      try {
        const stdout = execSync(input.command, {
          cwd: input.cwd ?? workspacePath,
          timeout: input.timeoutMs ?? 10_000,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        })
        return {
          command: input.command,
          stdout: stdout ?? '',
          stderr: '',
          exitCode: 0,
          effectiveCwd: input.cwd ?? workspacePath,
          durationMs: 0,
          timedOut: false,
        }
      }
      catch (err: any) {
        return {
          command: input.command,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
          exitCode: err.status ?? 1,
          effectiveCwd: input.cwd ?? workspacePath,
          durationMs: 0,
          timedOut: false,
        }
      }
    },
    getState: () => ({ effectiveCwd: workspacePath }),
    resetState: (reason?: string) => ({ effectiveCwd: workspacePath }),
  }

  const config = resolveConfig({
    maxTurns: 5,
    maxToolCalls: 10,
    maxTokenBudget: 50_000,
  })

  if (!config.apiKey) {
    console.error('ERROR: AIRI_AGENT_API_KEY not set. Set it in your .env or environment.')
    process.exit(1)
  }

  console.log('Goal: Create a hello.txt file containing "Hello from AIRI QueryEngine!"')
  console.log('Starting autonomous loop...')
  console.log('')

  const startedAt = Date.now()

  const result = await runQueryEngine({
    goal: `Create a file called "hello.txt" in the workspace root (${workspacePath}) containing exactly: "Hello from AIRI QueryEngine!". Use the write_file tool. Then verify it exists using bash with "cat hello.txt". Provide a summary when done.`,
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
  console.log(`Duration: ${durationMs}ms`)
  console.log(`Files modified: ${result.filesModified.join(', ') || 'none'}`)
  if (result.error) {
    console.log(`Error: ${result.error}`)
  }
  console.log('')
  console.log('Summary:')
  console.log(result.summary)

  // Verify the file was created
  const helloPath = join(workspacePath, 'hello.txt')
  if (existsSync(helloPath)) {
    const content = readFileSync(helloPath, 'utf-8')
    console.log('')
    console.log(`✅ File created: ${helloPath}`)
    console.log(`   Content: "${content.trim()}"`)
    console.log('')
    console.log('=== E2E PASSED ===')
  }
  else {
    console.log('')
    console.log(`❌ File NOT found: ${helloPath}`)
    console.log('=== E2E FAILED ===')
  }

  // Cleanup
  rmSync(workspacePath, { recursive: true, force: true })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
