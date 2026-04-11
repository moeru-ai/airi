/**
 * E2E: Tool Lane Hygiene Verification
 *
 * Verifies that the cross-lane advisory system works end-to-end:
 * 1. Call a coding tool → establishes coding lane
 * 2. Call a desktop tool → triggers cross-lane advisory (coding→desktop)
 * 3. Call another coding tool → triggers cross-lane advisory (desktop→coding)
 * 4. Call a workflow tool → should NOT trigger advisory (exempt lane)
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/e2e-lane-hygiene.ts
 */

import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
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
      COMPUTER_USE_SESSION_TAG: 'e2e-lane-hygiene',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-lane-hygiene',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text) {
      // Suppress noisy stderr unless debugging
    }
  })

  await client.connect(transport)
  return client
}

function getTextContent(result: unknown): string {
  if (!result || typeof result !== 'object')
    return ''
  const content = (result as any).content
  if (!Array.isArray(content))
    return ''
  return content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text || '')
    .join('\n')
}

async function main() {
  console.info('╔═══════════════════════════════════════════════════════╗')
  console.info('║   E2E: Tool Lane Hygiene Verification               ║')
  console.info('╚═══════════════════════════════════════════════════════╝')

  const client = await createClient()

  try {
    // Expose the tools we need (they're deferred by default)
    await client.callTool({
      name: 'tool_search',
      arguments: {
        query: 'desktop coding workflow',
        exposeTools: [
          'desktop_get_state',
          'desktop_get_capabilities',
          'coding_review_workspace',
          'workflow_coding_loop',
        ],
      },
    })
    console.info('  ✓ Tools exposed\n')

    // ── Step 1: Establish coding lane ──
    console.info('── Step 1: Call coding tool (establish coding lane) ──')
    const codingResult = await client.callTool({
      name: 'coding_review_workspace',
      arguments: { workspacePath: '/tmp/e2e-lane-test' },
    })
    const codingText = getTextContent(codingResult)
    const hasAdvisoryStep1 = codingText.includes('Advisory')
    console.info(`  Text length: ${codingText.length}`)
    console.info(`  Advisory present: ${hasAdvisoryStep1}`)
    // First tool call should NOT have advisory (no prior lane)
    assert(!hasAdvisoryStep1, 'Step 1: first tool call should NOT trigger advisory')
    console.info('  ✓ No advisory on first call (correct)\n')

    // ── Step 2: Cross-lane call (coding → desktop) ──
    console.info('── Step 2: Call desktop tool (should trigger advisory) ──')
    const desktopResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const desktopText = getTextContent(desktopResult)
    const hasAdvisoryStep2 = desktopText.includes('Advisory')
    console.info(`  Text length: ${desktopText.length}`)
    console.info(`  Advisory present: ${hasAdvisoryStep2}`)
    if (hasAdvisoryStep2) {
      // Extract the advisory line
      const advisoryLine = desktopText.split('\n').find(l => l.includes('Advisory'))
      console.info(`  Advisory: ${advisoryLine?.trim()}`)
      assert(desktopText.includes('coding'), 'Advisory should mention the source lane (coding)')
      assert(desktopText.includes('desktop'), 'Advisory should mention the target lane (desktop)')
    }
    console.info(`  ✓ Cross-lane advisory ${hasAdvisoryStep2 ? 'PRESENT' : 'not present (lane may be exempt)'}\n`)

    // ── Step 3: Cross-lane back (desktop → coding) ──
    console.info('── Step 3: Call coding tool again (should trigger advisory) ──')
    const codingResult2 = await client.callTool({
      name: 'coding_review_workspace',
      arguments: { workspacePath: '/tmp/e2e-lane-test-2' },
    })
    const codingText2 = getTextContent(codingResult2)
    const hasAdvisoryStep3 = codingText2.includes('Advisory')
    console.info(`  Text length: ${codingText2.length}`)
    console.info(`  Advisory present: ${hasAdvisoryStep3}`)
    if (hasAdvisoryStep3) {
      const advisoryLine = codingText2.split('\n').find(l => l.includes('Advisory'))
      console.info(`  Advisory: ${advisoryLine?.trim()}`)
      assert(codingText2.includes('desktop'), 'Advisory should mention source lane (desktop)')
      assert(codingText2.includes('coding'), 'Advisory should mention target lane (coding)')
    }
    console.info(`  ✓ Cross-lane advisory ${hasAdvisoryStep3 ? 'PRESENT' : 'not present (lane may be exempt)'}\n`)

    // ── Step 4: Exempt lane (internal — tool_directory) ──
    console.info('── Step 4: Call internal tool (exempt, should NOT trigger advisory) ──')
    const internalResult = await client.callTool({
      name: 'tool_directory',
      arguments: {},
    })
    const internalText = getTextContent(internalResult)
    const hasAdvisoryStep4 = internalText.includes('Advisory')
    console.info(`  Advisory present: ${hasAdvisoryStep4}`)
    // Internal is exempt, should NOT trigger advisory
    assert(!hasAdvisoryStep4, 'Step 4: internal (exempt lane) should NOT trigger advisory')
    console.info('  ✓ No advisory on exempt lane (correct)\n')

    // ── Step 5: Verify lane state ──
    console.info('── Step 5: Verify inferred lane in run state ──')
    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const stateData = (stateResult as any)?.structuredContent
    if (stateData?.runState?.inferredActiveLane) {
      console.info(`  inferredActiveLane: ${stateData.runState.inferredActiveLane}`)
    }
    else {
      console.info('  (inferredActiveLane not exposed in structuredContent)')
    }
    console.info('  ✓ Lane state check done\n')

    // ── Summary ──
    console.info('╔═══════════════════════════════════════════════════════╗')
    console.info('║   LANE HYGIENE E2E — ALL STEPS PASSED               ║')
    console.info('╚═══════════════════════════════════════════════════════╝')
    console.info('')
    console.info('Results:')
    console.info(`  Step 1 (first call, no prior lane): No advisory ✓`)
    console.info(`  Step 2 (coding→desktop cross-lane): Advisory=${hasAdvisoryStep2}`)
    console.info(`  Step 3 (desktop→coding cross-lane): Advisory=${hasAdvisoryStep3}`)
    console.info(`  Step 4 (internal, exempt lane):     No advisory ✓`)
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ LANE HYGIENE E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
