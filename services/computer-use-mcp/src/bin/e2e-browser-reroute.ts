/**
 * Secondary regression script: workflow reroute path.
 *
 * This script intentionally exercises a deterministic reroute-producing
 * workflow path and then follows the suggested tool. It is stricter than
 * a smoke test, but it is not yet used to claim browser dual-stack
 * product support because the current dry-run fixture reroutes through a
 * stable accessibility path rather than a guaranteed browser surface.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/e2e-browser-reroute.ts
 */

import { dirname, resolve } from 'node:path'
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
      COMPUTER_USE_SESSION_TAG: 'e2e-browser-reroute',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Google Chrome,Firefox,Safari',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-browser-reroute',
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

async function phase1_triggerReroute(client: Client): Promise<Record<string, unknown>> {
  console.info('\n── Phase 1: Trigger reroute via workflow_browse_and_act ──')

  const result = await client.callTool({
    name: 'workflow_browse_and_act',
    arguments: {
      app: 'Google Chrome',
      goal: 'Check the homepage',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_browse_and_act')
  console.info(`  Status: ${data.status}`)
  assert(data.kind === 'workflow_reroute', `expected workflow_reroute kind, got ${String(data.kind)}`)
  assert(data.status === 'reroute_required', `expected reroute_required, got ${String(data.status)}`)
  console.info('  → Reroute detected')
  return data
}

function phase2_verifyRerouteContract(data: Record<string, unknown>) {
  console.info('\n── Phase 2: Verify reroute contract shape ──')

  if (data.kind !== 'workflow_reroute') {
    console.info('  (Skipped — no reroute to verify)')
    return null
  }

  assert(data.status === 'reroute_required', `expected reroute_required, got ${data.status}`)
  assert(typeof data.workflow === 'string', 'reroute.workflow must be a string')

  const reroute = data.reroute
  assert(reroute != null && typeof reroute === 'object', 'reroute detail must be an object')

  const r = reroute as Record<string, unknown>
  assert(typeof r.recommendedSurface === 'string', 'recommendedSurface must be a string')
  assert(typeof r.suggestedTool === 'string', 'suggestedTool must be a string')
  assert(typeof r.strategyReason === 'string', 'strategyReason must be a string')
  assert(typeof r.explanation === 'string', 'explanation must be a string')

  // Optional fields: only verify type if present
  if (r.executionReason !== undefined) {
    assert(typeof r.executionReason === 'string', 'executionReason must be a string when present')
  }
  if (r.availableSurfaces !== undefined) {
    assert(Array.isArray(r.availableSurfaces), 'availableSurfaces must be an array when present')
  }
  if (r.preferredSurface !== undefined) {
    assert(typeof r.preferredSurface === 'string', 'preferredSurface must be a string when present')
  }

  console.info(`  ✓ kind: ${data.kind}`)
  console.info(`  ✓ workflow: ${data.workflow}`)
  console.info(`  ✓ recommendedSurface: ${r.recommendedSurface}`)
  console.info(`  ✓ suggestedTool: ${r.suggestedTool}`)
  console.info(`  ✓ strategyReason: ${r.strategyReason}`)

  return r
}

async function phase3_followReroute(client: Client, reroute: Record<string, unknown> | null) {
  console.info('\n── Phase 3: Follow reroute to suggested surface ──')

  assert(reroute != null, 'reroute detail must be present before following suggested tool')

  const suggestedTool = String(reroute.suggestedTool)
  console.info(`  Following reroute → calling ${suggestedTool}`)

  // Verify the suggested tool actually exists
  const { tools } = await client.listTools()
  const toolNames = new Set(tools.map(t => t.name))
  assert(toolNames.has(suggestedTool), `suggested tool ${suggestedTool} not registered`)
  console.info(`  ✓ ${suggestedTool} is registered`)

  const result = await client.callTool({
    name: suggestedTool,
    arguments: {},
  })

  assert(result && typeof result === 'object', `${suggestedTool} returned an invalid result`)
  const sc = (result as { structuredContent?: unknown }).structuredContent
  const content = (result as { content?: unknown }).content

  if (sc && typeof sc === 'object') {
    const scData = sc as Record<string, unknown>
    assert(scData.status !== 'error', `${suggestedTool} returned structuredContent.status=error`)
    console.info(`  ✓ ${suggestedTool} returned structuredContent (status: ${scData.status ?? 'n/a'})`)
    return
  }

  assert(Array.isArray(content), `${suggestedTool} must return structuredContent or a content array`)
  assert(content.length > 0, `${suggestedTool} content array must not be empty`)
  console.info(`  ✓ ${suggestedTool} returned content array (${content.length} parts)`)
}

async function phase4_desktopState(client: Client) {
  console.info('\n── Phase 4: Verify desktop state after reroute flow ──')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  assert(data.status === 'ok', `get_state: expected ok, got ${data.status}`)

  const runState = data.runState as Record<string, unknown>
  console.info(`  Active app: ${runState.activeApp ?? 'none'}`)
  console.info(`  ✓ State is consistent after reroute flow`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('╔═══════════════════════════════════════════════════════╗')
  console.info('║   Secondary Regression: Workflow Reroute Path        ║')
  console.info('╚═══════════════════════════════════════════════════════╝')

  const client = await createClient()

  try {
    // Verify required tools
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const t of ['workflow_browse_and_act', 'desktop_get_state']) {
      assert(names.has(t), `missing required tool: ${t}`)
    }
    console.info(`  ${tools.length} tools available`)

    const browseResult = await phase1_triggerReroute(client)
    const rerouteDetail = phase2_verifyRerouteContract(browseResult)
    await phase3_followReroute(client, rerouteDetail)
    await phase4_desktopState(client)

    console.info('\n╔═══════════════════════════════════════════════════════╗')
    console.info('║      WORKFLOW REROUTE REGRESSION — PASSED            ║')
    console.info('╚═══════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ WORKFLOW REROUTE REGRESSION FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
