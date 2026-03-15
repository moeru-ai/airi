/**
 * Real E2E: Agentic coding workflow happy path.
 *
 * Proves workflow_coding_agentic_loop works end-to-end through real MCP stdio:
 *
 *   1. Review a real temporary git workspace
 *   2. Capture validation baseline + temporary worktree
 *   3. Execute agentic impact/hypothesis/plan/patch/review/diagnose/report loop
 *   4. Verify source workspace remains unchanged while worktree is patched
 *   5. Verify coding run state includes baseline/review/diagnosis/report artifacts
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/e2e-coding-agentic-workflow.ts
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

function setupGitRepo(dir: string) {
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'e2e-agentic@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIRI E2E Agentic'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init e2e fixture'], { cwd: dir })
}

function createProjectDir() {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-coding-agentic-workflow-'))
  writeFileSync(join(dir, 'index.ts'), 'export const flag = false\nexport const untouched = true\n', 'utf8')
  writeFileSync(join(dir, 'README.md'), '# e2e coding agentic workflow test\n', 'utf8')
  setupGitRepo(dir)
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
      COMPUTER_USE_SESSION_TAG: 'e2e-coding-agentic-workflow',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-coding-agentic-workflow',
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
  console.info('╔══════════════════════════════════════════════════════════╗')
  console.info('║   E2E Release Gate: Agentic Coding Workflow Happy Path  ║')
  console.info('╚══════════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  const client = await createClient()

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const name of ['workflow_coding_agentic_loop', 'desktop_get_state', 'coding_read_file']) {
      assert(names.has(name), `missing required tool: ${name}`)
    }
    console.info(`  ${tools.length} tools available`)

    console.info('\n── Phase 1: run workflow_coding_agentic_loop ──')
    const workflowResult = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: projectPath,
        taskGoal: 'Flip the feature flag to true via agentic coding workflow.',
        searchQuery: 'export const flag = false',
        changeIntent: 'behavior_fix',
        allowMultiFile: false,
        maxPlannedFiles: 1,
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'grep -q "export const flag = true" index.ts && echo "agentic validation passed"',
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(workflowResult, 'workflow_coding_agentic_loop')
    console.info(`  Workflow status: ${workflowData.status}`)
    assert(workflowData.workflow === 'coding_agentic_loop', `expected coding_agentic_loop, got ${String(workflowData.workflow)}`)

    const stepResults = workflowData.stepResults as Array<{ label: string, succeeded: boolean, status: string }>

    for (const step of stepResults) {
      console.info(`  ${step.succeeded ? '✓' : '✗'} ${step.label} (${step.status})`)
    }

    if (workflowData.status !== 'completed') {
      const failedSteps = stepResults.filter(step => !step.succeeded).map(step => `${step.label}(${step.status})`)
      throw new Error(`workflow failed with step failures: ${failedSteps.join(', ') || 'unknown'}`)
    }

    assert(stepResults.length === 15, `expected 15 steps, got ${stepResults.length}`)

    assert(stepResults.some(step => step.label === 'Capture Validation Baseline'), 'expected capture baseline step')
    assert(stepResults.some(step => step.label === 'Analyze Local Impact Graph'), 'expected impact analysis step')
    assert(stepResults.some(step => step.label === 'Validate Target Hypothesis'), 'expected hypothesis validation step')
    assert(stepResults.some(step => step.label === 'Diagnose change failure'), 'expected diagnosis step')

    console.info('\n── Phase 2: verify source/worktree file states ──')
    const sourceContent = readFileSync(join(projectPath, 'index.ts'), 'utf8')
    assert(sourceContent.includes('export const flag = false'), 'source workspace file should remain unchanged when worktree isolation is active')

    const worktreePath = join(projectPath, '.airi-agentic-worktree')
    assert(existsSync(worktreePath), 'expected temporary worktree path to exist')

    const worktreeContent = readFileSync(join(worktreePath, 'index.ts'), 'utf8')
    assert(worktreeContent.includes('export const flag = true'), 'worktree index.ts must contain the patched flag value')
    console.info('  ✓ source unchanged, worktree patched')

    console.info('\n── Phase 3: verify coding state/report/diagnosis ──')
    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })

    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined
    assert(codingState != null, 'coding state must be present after agentic coding workflow')
    assert(codingState.workspacePath === worktreePath, `expected workspacePath=${worktreePath}, got ${String(codingState.workspacePath)}`)
    assert(codingState.validationBaseline?.workspaceMetadata?.worktreePath === worktreePath, 'expected validation baseline to record worktreePath')
    assert(Array.isArray(codingState.recentEdits) && codingState.recentEdits.some((entry: any) => entry.path === 'index.ts'), 'expected recentEdits to include index.ts')
    assert(Array.isArray(codingState.recentCommandResults) && codingState.recentCommandResults.some((entry: string) => entry.includes('agentic validation passed')), 'expected recentCommandResults to include validation output')
    assert(codingState.lastChangeReview?.status === 'ready_for_next_file', `expected ready_for_next_file, got ${String(codingState.lastChangeReview?.status)}`)
    assert(typeof codingState.lastChangeDiagnosis?.rootCauseType === 'string', 'expected structured change diagnosis to be present')
    assert(codingState.lastCodingReport?.status === 'completed', `expected lastCodingReport.status=completed, got ${String(codingState.lastCodingReport?.status)}`)
    console.info('  ✓ validation baseline + review + diagnosis + report persisted')

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
    assert(String(backendResult.content).includes('export const flag = true'), 'expected backendResult content to reflect patched worktree file')
    console.info('  ✓ direct coding tool returns structured content for current agentic target')

    console.info('\n╔══════════════════════════════════════════════════════════╗')
    console.info('║  AGENTIC CODING WORKFLOW E2E — ALL PHASES PASSED       ║')
    console.info('╚══════════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ AGENTIC CODING WORKFLOW E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
