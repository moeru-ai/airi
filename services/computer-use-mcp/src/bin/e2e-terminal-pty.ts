/**
 * Real E2E: Terminal PTY happy path.
 *
 * Proves the PTY surface works end-to-end through a real MCP stdio
 * transport with real `node-pty`:
 *
 *   1. pty_create → allocates a real pseudo-terminal
 *   2. Run the deterministic interactive-echo fixture
 *   3. pty_read_screen → read real terminal buffer
 *   4. pty_send_input → write real keystrokes
 *   5. pty_read_screen → verify echo output
 *   6. pty_destroy → verify cleanup
 *
 * No mocks. The PTY session is a real pseudo-terminal running a real
 * Node.js process on the host machine.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp e2e:terminal-pty
 */

import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureScript = resolve(packageDir, 'fixtures/interactive-echo.mjs')

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
      // Approval disabled — proves the PTY lifecycle works without
      // the extra approval ceremony. A separate E2E can test approval.
      COMPUTER_USE_APPROVAL_MODE: 'never',
      COMPUTER_USE_SESSION_TAG: 'e2e-terminal-pty',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-terminal-pty',
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

async function phase1_checkPtyAvailable(client: Client) {
  console.info('\n── Phase 1: pty_get_status → verify PTY support ──')

  const result = await client.callTool({
    name: 'pty_get_status',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'pty_get_status')
  console.info(`  PTY available: ${data.ptyAvailable}`)
  assert(data.ptyAvailable === true, 'node-pty must be available for this E2E')
  assert(data.status === 'ok', `expected ok, got ${String(data.status)}`)

  const sessions = data.sessions as unknown[]
  console.info(`  Active sessions: ${sessions.length}`)
  assert(sessions.length === 0, 'should start with zero PTY sessions')
}

async function phase2_createPtyAndRunFixture(client: Client): Promise<string> {
  console.info('\n── Phase 2: pty_create → allocate real PTY ──')

  const result = await client.callTool({
    name: 'pty_create',
    arguments: {
      rows: 24,
      cols: 80,
      cwd: packageDir,
    },
  })

  const data = requireStructuredContent(result, 'pty_create')
  console.info(`  Status: ${data.status}`)
  assert(data.status === 'ok', `expected ok, got ${String(data.status)}`)

  const session = data.session as Record<string, unknown>
  const sessionId = String(session.id)
  console.info(`  Session: ${sessionId} (pid ${session.pid}, alive: ${session.alive})`)
  assert(session.alive === true, 'session must be alive')
  assert(typeof session.pid === 'number', 'session must have a real pid')

  // Send the command to run the interactive fixture
  console.info('  Launching interactive-echo fixture...')
  const sendResult = await client.callTool({
    name: 'pty_send_input',
    arguments: {
      sessionId,
      data: `node ${fixtureScript}\r`,
    },
  })
  const sendData = requireStructuredContent(sendResult, 'pty_send_input')
  assert(sendData.status === 'ok', `send_input: expected ok, got ${String(sendData.status)}`)

  // Wait for the fixture to start (zsh init + Node.js startup)
  await delay(3000)

  return sessionId
}

async function phase3_readScreen(client: Client, sessionId: string) {
  console.info('\n── Phase 3: pty_read_screen → verify fixture started ──')

  const result = await client.callTool({
    name: 'pty_read_screen',
    arguments: { sessionId },
  })

  const data = requireStructuredContent(result, 'pty_read_screen')
  assert(data.status === 'ok', `read_screen: expected ok, got ${String(data.status)}`)

  const screenContent = String(data.screenContent ?? '')
  console.info(`  Screen content:\n${screenContent.split('\n').map(l => `    | ${l}`).join('\n')}`)
  assert(
    screenContent.includes('READY>'),
    `expected to see "READY>" prompt, got: ${screenContent.slice(0, 200)}`,
  )
  console.info('  ✓ Fixture is running and waiting for input')
}

async function phase4_sendInputAndVerify(client: Client, sessionId: string) {
  console.info('\n── Phase 4: pty_send_input → send "hello e2e" ──')

  const result = await client.callTool({
    name: 'pty_send_input',
    arguments: {
      sessionId,
      data: 'hello e2e\r',
    },
  })

  const data = requireStructuredContent(result, 'pty_send_input')
  assert(data.status === 'ok', `send_input: expected ok, got ${String(data.status)}`)
  console.info(`  Wrote ${data.bytesWritten} bytes`)

  // Wait for the fixture to process
  await delay(500)

  console.info('  Reading screen after input...')
  const readResult = await client.callTool({
    name: 'pty_read_screen',
    arguments: { sessionId },
  })

  const readData = requireStructuredContent(readResult, 'pty_read_screen')
  const screenContent = String(readData.screenContent ?? '')
  console.info(`  Screen content:\n${screenContent.split('\n').map(l => `    | ${l}`).join('\n')}`)

  assert(
    screenContent.includes('ECHO: hello e2e'),
    `expected to see "ECHO: hello e2e", got: ${screenContent.slice(0, 300)}`,
  )
  assert(
    screenContent.includes('DONE'),
    `expected to see "DONE", got: ${screenContent.slice(0, 300)}`,
  )
  console.info('  ✓ Interactive fixture echoed input correctly')
}

async function phase5_verifyState(client: Client, sessionId: string) {
  console.info('\n── Phase 5: desktop_get_state → verify PTY state ──')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  const runState = data.runState as Record<string, unknown>
  const ptySessions = runState.ptySessions as Array<Record<string, unknown>> | undefined

  assert(ptySessions != null, 'ptySessions must be present')
  const ourSession = ptySessions.find(s => s.id === sessionId)
  assert(ourSession != null, `session ${sessionId} must be in state`)
  console.info(`  Session in state: ${JSON.stringify(ourSession)}`)

  // Verify audit log
  const ptyAuditLog = runState.ptyAuditLog as Array<Record<string, unknown>> | undefined
  assert(ptyAuditLog != null, 'ptyAuditLog must be present')
  console.info(`  Audit entries: ${ptyAuditLog.length}`)
  assert(ptyAuditLog.length >= 3, `expected ≥3 audit entries (create, read, send, read), got ${ptyAuditLog.length}`)

  const events = ptyAuditLog.map(e => e.event)
  console.info(`  Audit events: ${events.join(', ')}`)
  assert(events.includes('create'), 'audit must include create')
  assert(events.includes('read_screen'), 'audit must include read_screen')
  assert(events.includes('send_input'), 'audit must include send_input')
  console.info('  ✓ PTY state and audit log are correct')
}

async function phase6_destroyAndVerify(client: Client, sessionId: string) {
  console.info('\n── Phase 6: pty_destroy → cleanup ──')

  const result = await client.callTool({
    name: 'pty_destroy',
    arguments: { sessionId },
  })

  const data = requireStructuredContent(result, 'pty_destroy')
  assert(data.status === 'ok', `destroy: expected ok, got ${String(data.status)}`)
  console.info(`  Destroyed: ${sessionId}`)

  // Verify session is gone
  const statusResult = await client.callTool({
    name: 'pty_get_status',
    arguments: {},
  })

  const statusData = requireStructuredContent(statusResult, 'pty_get_status')
  const sessions = statusData.sessions as unknown[]
  assert(sessions.length === 0, `expected 0 sessions after destroy, got ${sessions.length}`)
  console.info('  ✓ Session cleaned up')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('╔═══════════════════════════════════════════════════════╗')
  console.info('║   E2E Release Gate: Terminal PTY Happy Path          ║')
  console.info('╚═══════════════════════════════════════════════════════╝')

  const client = await createClient()

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const t of ['pty_get_status', 'pty_create', 'pty_send_input', 'pty_read_screen', 'pty_destroy', 'desktop_get_state']) {
      assert(names.has(t), `missing required tool: ${t}`)
    }
    console.info(`  ${tools.length} tools available`)

    await phase1_checkPtyAvailable(client)
    const sessionId = await phase2_createPtyAndRunFixture(client)
    await phase3_readScreen(client, sessionId)
    await phase4_sendInputAndVerify(client, sessionId)
    await phase5_verifyState(client, sessionId)
    await phase6_destroyAndVerify(client, sessionId)

    console.info('\n╔═══════════════════════════════════════════════════════╗')
    console.info('║    TERMINAL PTY E2E — ALL PHASES PASSED              ║')
    console.info('╚═══════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ TERMINAL PTY E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
