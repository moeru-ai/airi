/**
 * Real E2E: Terminal Lane v2 — PTY self-acquire happy path.
 *
 * The most valuable release gate — proves in a single pass:
 *
 *   1. Surface resolver detects an interactive command
 *   2. Workflow engine self-acquires a PTY through the unified approval path
 *   3. Engine executes the command on the acquired PTY
 *   4. Step succeeds without outward reroute
 *   5. State is consistent (bindings, audit, surface decisions)
 *
 * Scenario:
 *   - Call workflow_validate_workspace with `vim --version` as checkCommand
 *   - Early steps (pwd, git diff) succeed via terminal_exec (auto_default_exec)
 *   - "Run workspace validation" step surface-resolves to auto_interactive_command
 *   - Engine self-acquires a real PTY, sends the command, reads screen output
 *   - Step succeeds — no reroute
 *   - Verify state consistency (bindings, audit, surface decisions, PTY session)
 *
 * NOTE: No pre-created PTY. The workflow self-acquires.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp e2e:terminal-self-acquire
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
  const dir = mkdtempSync(join(tmpdir(), 'e2e-terminal-self-acquire-'))
  writeFileSync(join(dir, 'README.md'), '# e2e terminal self-acquire test\n', 'utf8')
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
      COMPUTER_USE_SESSION_TAG: 'e2e-terminal-self-acquire',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-terminal-self-acquire',
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

async function phase1_selfAcquirePty(client: Client, projectPath: string) {
  console.info('\n── Phase 1: workflow_validate_workspace with interactive checkCommand ──')
  console.info('  No pre-created PTY. The engine self-acquires.')

  const result = await client.callTool({
    name: 'workflow_validate_workspace',
    arguments: {
      projectPath,
      ideApp: 'Visual Studio Code',
      changesCommand: 'echo "M index.ts"',
      // `vim --version` matches `^vim\b` → auto_interactive_command → PTY self-acquire
      checkCommand: 'vim --version',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_validate_workspace')
  console.info(`  Kind: ${data.kind}`)
  console.info(`  Status: ${data.status}`)

  // v2: workflow should complete (not reroute) because it self-acquires PTY
  const steps = data.stepResults as Array<{
    label: string
    succeeded: boolean
    status: string
    explanation?: string
  }>
  for (const s of steps) {
    console.info(`  ${s.succeeded ? '✓' : '✗'} ${s.label} (${s.status})`)
  }

  // Early steps should succeed via exec
  const pwdStep = steps.find(s => s.label === 'Confirm project working directory')
  assert(pwdStep?.succeeded === true, 'pwd step must have succeeded via exec')

  const changesStep = steps.find(s => s.label === 'Inspect local changes')
  assert(changesStep?.succeeded === true, 'changes step must have succeeded via exec')

  // The validation step should succeed via PTY self-acquire
  const validationStep = steps.find(s => s.label === 'Run workspace validation')
  assert(
    validationStep?.succeeded === true,
    `validation step must have succeeded via PTY self-acquire, got status=${validationStep?.status}`,
  )
  assert(
    validationStep?.explanation?.includes('PTY') === true,
    `explanation must mention PTY, got: ${validationStep?.explanation}`,
  )
  console.info(`  ✓ Validation step succeeded via PTY: ${validationStep?.explanation}`)

  return data
}

async function phase2_verifyState(client: Client) {
  console.info('\n── Phase 2: Verify state consistency ──')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  const runState = data.runState as Record<string, unknown>

  // PTY sessions — one should have been self-acquired
  const ptySessions = runState.ptySessions as Array<Record<string, unknown>> | undefined
  if (ptySessions && ptySessions.length > 0) {
    console.info(`  PTY sessions: ${ptySessions.length}`)
    for (const s of ptySessions) {
      console.info(`    ${s.id} (alive=${s.alive})`)
    }
  }
  else {
    console.info('  PTY sessions: (may have been cleaned up after step)')
  }

  // Surface decisions — should include a 'pty' decision from the surface resolver
  const surfaceDecisions = runState.surfaceDecisions as Array<Record<string, unknown>> | undefined
  if (surfaceDecisions && surfaceDecisions.length > 0) {
    const ptyDecision = surfaceDecisions.find(d => d.surface === 'pty')
    console.info(`  PTY surface decision: ${JSON.stringify(ptyDecision)}`)
    assert(ptyDecision != null, 'must have a pty surface decision from self-acquire')
    assert(
      typeof ptyDecision.reason === 'string' && ptyDecision.reason.length > 0,
      'surface decision must have a reason',
    )
  }

  // Audit log
  const auditLog = runState.ptyAuditLog as Array<Record<string, unknown>> | undefined
  if (auditLog) {
    const events = auditLog.map(e => e.event)
    console.info(`  Audit events: ${events.join(', ')}`)
    assert(events.includes('create'), 'audit must include a create event from self-acquire')
  }

  // Step bindings
  const stepBindings = runState.stepTerminalBindings as Array<Record<string, unknown>> | undefined
  if (stepBindings && stepBindings.length > 0) {
    const ptyBinding = stepBindings.find(b => b.surface === 'pty')
    console.info(`  PTY step binding: ${JSON.stringify(ptyBinding)}`)
    assert(ptyBinding != null, 'must have a pty step binding from self-acquire')
    assert(
      typeof ptyBinding.ptySessionId === 'string',
      'binding must have ptySessionId',
    )
  }

  console.info('  ✓ State is consistent with PTY self-acquire')
}

async function phase3_cleanup(client: Client) {
  console.info('\n── Phase 3: Cleanup ──')

  // Get any active PTY sessions and destroy them
  const statusResult = await client.callTool({
    name: 'pty_get_status',
    arguments: {},
  })

  const statusData = requireStructuredContent(statusResult, 'pty_get_status')
  const sessions = statusData.sessions as Array<Record<string, unknown>> | undefined

  if (sessions && sessions.length > 0) {
    for (const s of sessions) {
      const sessionId = String(s.id)
      const destroyResult = await client.callTool({
        name: 'pty_destroy',
        arguments: { sessionId },
      })
      const destroyData = requireStructuredContent(destroyResult, 'pty_destroy')
      console.info(`  Destroyed ${sessionId}: ${destroyData.status}`)
    }
  }
  else {
    console.info('  No PTY sessions to clean up')
  }

  console.info('  ✓ Cleanup complete')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('╔══════════════════════════════════════════════════════════╗')
  console.info('║   E2E Release Gate: Terminal Lane v2 — PTY Self-Acquire  ║')
  console.info('╚══════════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  console.info(`  Project directory: ${projectPath}`)

  const client = await createClient()

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const t of [
      'workflow_validate_workspace',
      'pty_get_status',
      'pty_destroy',
      'desktop_get_state',
    ]) {
      assert(names.has(t), `missing required tool: ${t}`)
    }
    console.info(`  ${tools.length} tools available`)

    // The core flow — no pre-created PTY
    await phase1_selfAcquirePty(client, projectPath)
    await phase2_verifyState(client)
    await phase3_cleanup(client)

    console.info('\n╔══════════════════════════════════════════════════════════╗')
    console.info('║   PTY SELF-ACQUIRE E2E — ALL PHASES PASSED               ║')
    console.info('╚══════════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ PTY SELF-ACQUIRE E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
