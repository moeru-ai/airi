/**
 * E2E release gate: Developer workflow happy path.
 *
 * Simulates the multi-tool chain a real chat session would produce:
 *   workflow_open_workspace → workflow_validate_workspace → workflow_run_tests
 *
 * Each step must complete successfully with a valid structuredContent shape,
 * and the chain must propagate the same projectPath end-to-end.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/e2e-developer-workflow.ts
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
  const dir = mkdtempSync(join(tmpdir(), 'e2e-dev-workflow-'))
  writeFileSync(join(dir, 'README.md'), '# e2e test project\n', 'utf8')
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
      COMPUTER_USE_EXECUTOR: 'dry-run',
      COMPUTER_USE_APPROVAL_MODE: 'never',
      COMPUTER_USE_SESSION_TAG: 'e2e-developer-workflow',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-developer-workflow',
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

function assertCompletedWorkflow(data: Record<string, unknown>, label: string) {
  assert(
    data.status === 'completed',
    `${label}: expected completed, got ${String(data.status)}`,
  )
}

function requireSucceededStep(
  data: Record<string, unknown>,
  workflowLabel: string,
  stepLabel: string,
) {
  const steps = data.stepResults as Array<{ label: string, succeeded: boolean }>
  const step = steps.find(candidate => candidate.label === stepLabel)
  assert(step !== undefined, `${workflowLabel}: missing expected step "${stepLabel}"`)
  assert(step.succeeded === true, `${workflowLabel}: expected step "${stepLabel}" to succeed`)
}

// ---------------------------------------------------------------------------
// Chain steps
// ---------------------------------------------------------------------------

async function step1_openWorkspace(client: Client, projectPath: string) {
  console.info('\n── Step 1: workflow_open_workspace ──')

  const result = await client.callTool({
    name: 'workflow_open_workspace',
    arguments: {
      projectPath,
      ideApp: 'Visual Studio Code',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_open_workspace')
  console.info(`  Status: ${data.status}`)
  assertCompletedWorkflow(data, 'workflow_open_workspace')

  const steps = data.stepResults as Array<{ label: string, succeeded: boolean }>
  for (const s of steps) {
    console.info(`  ${s.succeeded ? '✓' : '✗'} ${s.label}`)
  }

  requireSucceededStep(data, 'workflow_open_workspace', 'Reveal project in Finder')
  requireSucceededStep(data, 'workflow_open_workspace', 'Open project in Visual Studio Code')

  return data
}

async function step2_validateWorkspace(client: Client, projectPath: string) {
  console.info('\n── Step 2: workflow_validate_workspace ──')

  const result = await client.callTool({
    name: 'workflow_validate_workspace',
    arguments: {
      projectPath,
      ideApp: 'Visual Studio Code',
      changesCommand: 'printf " M index.ts\\n"',
      checkCommand: 'echo "typecheck ok"',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_validate_workspace')
  console.info(`  Status: ${data.status}`)
  assertCompletedWorkflow(data, 'workflow_validate_workspace')

  const steps = data.stepResults as Array<{ label: string, succeeded: boolean }>
  for (const s of steps) {
    console.info(`  ${s.succeeded ? '✓' : '✗'} ${s.label}`)
  }

  requireSucceededStep(data, 'workflow_validate_workspace', 'Confirm project working directory')
  requireSucceededStep(data, 'workflow_validate_workspace', 'Inspect local changes')
  requireSucceededStep(data, 'workflow_validate_workspace', 'Run workspace validation')

  return data
}

async function step3_runTests(client: Client, projectPath: string) {
  console.info('\n── Step 3: workflow_run_tests ──')

  const result = await client.callTool({
    name: 'workflow_run_tests',
    arguments: {
      projectPath,
      testCommand: 'echo "all tests passed"',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_run_tests')
  console.info(`  Status: ${data.status}`)
  assertCompletedWorkflow(data, 'workflow_run_tests')

  const steps = data.stepResults as Array<{ label: string, succeeded: boolean }>
  for (const s of steps) {
    console.info(`  ${s.succeeded ? '✓' : '✗'} ${s.label}`)
  }

  requireSucceededStep(data, 'workflow_run_tests', 'Change directory to project root')
  requireSucceededStep(data, 'workflow_run_tests', 'Run test suite')

  return data
}

async function step4_verifyStateReflectsChain(client: Client, projectPath: string) {
  console.info('\n── Step 4: desktop_get_state (chain summary) ──')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  assert(data.status === 'ok', `get_state: expected ok, got ${data.status}`)

  const runState = data.runState as Record<string, unknown>
  const terminalState = runState.terminalState as Record<string, unknown> | undefined

  console.info(`  Active app: ${runState.activeApp ?? 'none'}`)
  console.info(`  Terminal state: ${JSON.stringify(terminalState)}`)

  assert(terminalState != null, 'desktop_get_state: terminalState must be present after developer chain')
  assert(terminalState.effectiveCwd === projectPath, `desktop_get_state: expected effectiveCwd=${projectPath}, got ${String(terminalState.effectiveCwd)}`)
  assert(terminalState.lastExitCode === 0, `desktop_get_state: expected lastExitCode=0, got ${String(terminalState.lastExitCode)}`)
  assert(
    typeof terminalState.lastCommandSummary === 'string' && terminalState.lastCommandSummary.includes('all tests passed'),
    `desktop_get_state: expected lastCommandSummary to include "all tests passed", got ${String(terminalState.lastCommandSummary)}`,
  )

  return data
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('╔═══════════════════════════════════════════════════════╗')
  console.info('║   E2E Release Gate: Developer Workflow Happy Path    ║')
  console.info('╚═══════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  console.info(`  Project directory: ${projectPath}`)

  const client = await createClient()

  try {
    // Verify tools are present
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const t of ['workflow_open_workspace', 'workflow_validate_workspace', 'workflow_run_tests', 'desktop_get_state']) {
      assert(names.has(t), `missing required tool: ${t}`)
    }
    console.info(`  ${tools.length} tools available`)

    // Run the chain
    await step1_openWorkspace(client, projectPath)
    await step2_validateWorkspace(client, projectPath)
    await step3_runTests(client, projectPath)
    await step4_verifyStateReflectsChain(client, projectPath)

    console.info('\n╔═══════════════════════════════════════════════════════╗')
    console.info('║        DEVELOPER WORKFLOW E2E — ALL STEPS PASSED     ║')
    console.info('╚═══════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ E2E DEVELOPER WORKFLOW FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
