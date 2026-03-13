/**
 * Real E2E: Terminal exec happy path.
 *
 * Proves the terminal_exec surface works end-to-end through a real
 * MCP stdio transport:
 *
 *   1. Open workspace (dry-run desktop, real terminal)
 *   2. Run real shell commands (pwd, echo)
 *   3. Verify terminal state is written back after each step
 *   4. Agent can continue based on results
 *
 * Unlike the mocked integration tests, this exercises the real
 * `createLocalShellRunner` backed by `child_process.spawn`.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp e2e:terminal-exec
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): asserts condition {
  if (!condition)
    throw new Error(`Assertion failed: ${message}`)
}

function requireStructuredContent(result: unknown, label: string): Record<string, unknown> {
  if (!result || typeof result !== 'object')
    throw new Error(`${label}: result is not an object`)

  const sc = (result as { structuredContent?: unknown }).structuredContent
  if (!sc || typeof sc !== 'object')
    throw new Error(`${label}: missing structuredContent`)

  return sc as Record<string, unknown>
}

function createProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-terminal-exec-'))
  writeFileSync(join(dir, 'README.md'), '# e2e terminal exec test\n', 'utf8')
  writeFileSync(join(dir, 'index.ts'), 'export const ok = true\n', 'utf8')
  return dir
}

async function createClient(): Promise<Client> {
  const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
  const args = (env.COMPUTER_USE_SMOKE_SERVER_ARGS || 'start').split(/\s+/).filter(Boolean)
  const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...env,
      // Desktop is dry-run, but terminal runner is REAL
      COMPUTER_USE_EXECUTOR: 'dry-run',
      COMPUTER_USE_APPROVAL_MODE: 'never',
      COMPUTER_USE_SESSION_TAG: 'e2e-terminal-exec',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-terminal-exec',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text)
      console.error(`[stderr] ${text}`)
  })

  await client.connect(transport)
  return client
}

// ---------------------------------------------------------------------------
// Test phases
// ---------------------------------------------------------------------------

async function phase1_runChecks(client: Client, projectPath: string) {
  console.info('\n── Phase 1: workflow_run_tests with real command chain ──')

  const result = await client.callTool({
    name: 'workflow_run_tests',
    arguments: {
      projectPath,
      testCommand: 'pwd && echo "M index.ts" && echo "all checks passed"',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_run_tests')
  console.info(`  Status: ${data.status}`)
  assert(
    data.status === 'completed',
    `expected completed, got ${String(data.status)}`,
  )

  const steps = data.stepResults as Array<{ label: string, succeeded: boolean, status: string }>
  for (const s of steps) {
    console.info(`  ${s.succeeded ? '✓' : '✗'} ${s.label} (${s.status})`)
  }

  // Verify the terminal exec steps ran real commands
  const pwdStep = steps.find(s => s.label === 'Change directory to project root')
  assert(pwdStep?.succeeded === true, 'pwd step must succeed')

  const changesStep = steps.find(s => s.label === 'Run test suite')
  assert(changesStep?.succeeded === true, 'changes step must succeed')

  return data
}

async function phase2_verifyTerminalState(client: Client, projectPath: string) {
  console.info('\n── Phase 2: Verify terminal state reflects exec chain ──')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  assert(data.status === 'ok', `get_state: expected ok, got ${data.status}`)

  const runState = data.runState as Record<string, unknown>
  const terminalState = runState.terminalState as Record<string, unknown> | undefined

  console.info(`  Terminal state: ${JSON.stringify(terminalState)}`)

  assert(terminalState != null, 'terminalState must be present')
  assert(
    terminalState.effectiveCwd === projectPath,
    `expected effectiveCwd=${projectPath}, got ${String(terminalState.effectiveCwd)}`,
  )
  assert(
    terminalState.lastExitCode === 0,
    `expected lastExitCode=0, got ${String(terminalState.lastExitCode)}`,
  )
  assert(
    typeof terminalState.lastCommandSummary === 'string'
    && terminalState.lastCommandSummary.includes('all checks passed'),
    `expected lastCommandSummary to include "all checks passed", got ${String(terminalState.lastCommandSummary)}`,
  )
  console.info('  ✓ Terminal state is correct after exec chain')
  return data
}

async function phase3_runTests(client: Client, projectPath: string) {
  console.info('\n── Phase 3: workflow_run_tests to prove continuation ──')

  const result = await client.callTool({
    name: 'workflow_run_tests',
    arguments: {
      projectPath,
      testCommand: 'echo "test suite passed"',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_run_tests')
  console.info(`  Status: ${data.status}`)
  assert(data.status === 'completed', `expected completed, got ${String(data.status)}`)

  const steps = data.stepResults as Array<{ label: string, succeeded: boolean }>
  for (const s of steps) {
    console.info(`  ${s.succeeded ? '✓' : '✗'} ${s.label}`)
  }

  return data
}

async function phase4_finalState(client: Client, _projectPath: string) {
  console.info('\n── Phase 4: Final terminal state after full chain ──')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  const runState = data.runState as Record<string, unknown>
  const terminalState = runState.terminalState as Record<string, unknown> | undefined

  assert(terminalState != null, 'terminalState must be present after full chain')
  assert(
    terminalState.lastExitCode === 0,
    `expected lastExitCode=0 after tests, got ${String(terminalState.lastExitCode)}`,
  )
  assert(
    typeof terminalState.lastCommandSummary === 'string'
    && terminalState.lastCommandSummary.includes('test suite passed'),
    `expected lastCommandSummary to include "test suite passed", got ${String(terminalState.lastCommandSummary)}`,
  )
  console.info('  ✓ Terminal state is correct after full chain')
  return data
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('╔═══════════════════════════════════════════════════════╗')
  console.info('║   E2E Release Gate: Terminal Exec Happy Path         ║')
  console.info('╚═══════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  console.info(`  Project directory: ${projectPath}`)

  const client = await createClient()

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const t of ['workflow_run_tests', 'desktop_get_state']) {
      assert(names.has(t), `missing required tool: ${t}`)
    }
    console.info(`  ${tools.length} tools available`)

    await phase1_runChecks(client, projectPath)
    await phase2_verifyTerminalState(client, projectPath)
    await phase3_runTests(client, projectPath)
    await phase4_finalState(client, projectPath)

    console.info('\n╔═══════════════════════════════════════════════════════╗')
    console.info('║    TERMINAL EXEC E2E — ALL PHASES PASSED             ║')
    console.info('╚═══════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ TERMINAL EXEC E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
