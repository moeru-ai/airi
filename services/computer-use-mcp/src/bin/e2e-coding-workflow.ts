/**
 * Real E2E: Search-driven coding workflow happy path.
 *
 * Proves the coding execution core works end-to-end through the real
 * MCP stdio transport:
 *
 *   1. Review a real temporary workspace
 *   2. Search and deterministically select a real target file
 *   3. Plan a limited change set and patch the current planned file
 *   4. Verify the file changed on disk
 *   5. Verify coding report/state is persisted in run state
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/e2e-coding-workflow.ts
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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

function requireStructuredContent(result: unknown, label: string): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    throw new Error(`${label}: result is not an object`)
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object') {
    throw new Error(`${label}: missing structuredContent`)
  }

  return structuredContent as Record<string, unknown>
}

function createProjectDir() {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-coding-workflow-'))
  writeFileSync(join(dir, 'index.ts'), 'export const flag = false\nexport const untouched = true\n', 'utf8')
  writeFileSync(join(dir, 'README.md'), '# e2e coding workflow test\n', 'utf8')
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
      COMPUTER_USE_SESSION_TAG: 'e2e-coding-workflow',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-coding-workflow',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text) {
      console.error(`[stderr] ${text}`)
    }
  })

  await client.connect(transport)
  return client
}

async function main() {
  console.info('╔═══════════════════════════════════════════════════════╗')
  console.info('║   E2E Release Gate: Coding Workflow Happy Path      ║')
  console.info('╚═══════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  const client = await createClient()

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const name of ['workflow_coding_loop', 'desktop_get_state', 'coding_read_file']) {
      assert(names.has(name), `missing required tool: ${name}`)
    }
    console.info(`  ${tools.length} tools available`)

    console.info('\n── Phase 1: run workflow_coding_loop (search-driven) ──')
    const workflowResult = await client.callTool({
      name: 'workflow_coding_loop',
      arguments: {
        workspacePath: projectPath,
        taskGoal: 'Flip the feature flag to true via deterministic search+selection.',
        searchQuery: 'export const flag = false',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'grep -q "export const flag = true" index.ts && echo "coding validation passed"',
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(workflowResult, 'workflow_coding_loop')
    console.info(`  Workflow status: ${workflowData.status}`)
    assert(workflowData.status === 'completed', `expected completed, got ${String(workflowData.status)}`)
    assert(workflowData.workflow === 'coding_execution_loop', `expected coding_execution_loop, got ${String(workflowData.workflow)}`)

    const stepResults = workflowData.stepResults as Array<{ label: string, succeeded: boolean, status: string }>
    assert(stepResults.length === 11, `expected 11 steps, got ${stepResults.length}`)
    for (const step of stepResults) {
      console.info(`  ${step.succeeded ? '✓' : '✗'} ${step.label} (${step.status})`)
    }

    assert(stepResults.some(step => step.label === 'Search codebase text'), 'expected text search step')
    assert(stepResults.some(step => step.label === 'Select deterministic target'), 'expected deterministic target selection step')
    assert(stepResults.some(step => step.label === 'Plan limited changes'), 'expected plan generation step')
    assert(stepResults.some(step => step.label === 'Review deterministic changes'), 'expected deterministic review step')

    console.info('\n── Phase 2: verify file changed on disk ──')
    const content = readFileSync(join(projectPath, 'index.ts'), 'utf8')
    assert(content.includes('export const flag = true'), 'index.ts must contain the patched flag value')
    console.info('  ✓ index.ts was patched')

    console.info('\n── Phase 3: verify coding state/report ──')
    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })

    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined
    assert(codingState != null, 'coding state must be present after coding workflow')
    assert(codingState.workspacePath === projectPath, `expected workspacePath=${projectPath}, got ${String(codingState.workspacePath)}`)
    assert(Array.isArray(codingState.recentReads) && codingState.recentReads.length >= 2, 'expected coding recentReads to be populated')
    assert(Array.isArray(codingState.recentEdits) && codingState.recentEdits.some((entry: any) => entry.path === 'index.ts'), 'expected coding recentEdits to include index.ts')
    assert(Array.isArray(codingState.recentCommandResults) && codingState.recentCommandResults.some((entry: string) => entry.includes('coding validation passed')), 'expected coding recentCommandResults to include validation output')
    assert(codingState.lastTargetSelection?.status === 'selected', 'expected deterministic selected target')
    assert(codingState.lastTargetSelection?.selectedFile === 'index.ts', 'expected selected target to be index.ts')
    assert(Array.isArray(codingState.currentPlan?.steps) && codingState.currentPlan.steps.length >= 1, 'expected deterministic plan steps')
    assert(codingState.lastChangeReview?.status === 'ready_for_next_file', `expected ready_for_next_file, got ${String(codingState.lastChangeReview?.status)}`)
    assert(codingState.lastCodingReport?.status === 'completed', `expected lastCodingReport.status=completed, got ${String(codingState.lastCodingReport?.status)}`)
    assert(typeof codingState.lastCodingReport?.summary === 'string' && codingState.lastCodingReport.summary.includes('ready_for_next_file'), 'expected lastCodingReport summary to mention deterministic review status')
    console.info('  ✓ coding state/report written back')

    console.info('\n── Phase 4: verify direct coding tool structured contract ──')
    const readResult = await client.callTool({
      name: 'coding_read_file',
      arguments: {
        filePath: 'index.ts',
      },
    })
    const readData = requireStructuredContent(readResult, 'coding_read_file')
    assert(readData.kind === 'coding_result', `expected kind=coding_result, got ${String(readData.kind)}`)
    assert(readData.toolName === 'coding_read_file', `expected toolName=coding_read_file, got ${String(readData.toolName)}`)
    const backendResult = readData.backendResult as Record<string, unknown>
    assert(backendResult.file === 'index.ts', `expected backendResult.file=index.ts, got ${String(backendResult.file)}`)
    assert(String(backendResult.content).includes('export const flag = true'), 'expected backendResult content to reflect patched file')
    console.info('  ✓ direct coding tool returns structured content')

    console.info('\n╔═══════════════════════════════════════════════════════╗')
    console.info('║    CODING WORKFLOW E2E — ALL PHASES PASSED          ║')
    console.info('╚═══════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ CODING WORKFLOW E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
