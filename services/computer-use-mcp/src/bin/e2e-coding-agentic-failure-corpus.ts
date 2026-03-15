/**
 * Real E2E: Agentic coding failure-corpus boundary checks over stdio transport.
 *
 * Focuses on Phase 1A hardening:
 * 1) baseline_noise is preserved when baseline signature/test-set truly match
 * 2) new_red is emitted when signature drifts and diff escapes baseline dirty set
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/e2e-coding-agentic-failure-corpus.ts
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function assert(condition: boolean, message: string): asserts condition {
  if (!condition)
    throw new Error(`Assertion failed: ${message}`)
}

function requireStructuredContent(result: unknown, label: string): Record<string, unknown> {
  if (!result || typeof result !== 'object')
    throw new Error(`${label}: result is not an object`)

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    throw new Error(`${label}: missing structuredContent`)

  return structuredContent as Record<string, unknown>
}

function setupGitRepo(dir: string) {
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'e2e-failure-corpus@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIRI E2E Failure Corpus'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init e2e failure corpus fixture'], { cwd: dir })
}

function createProjectDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), `e2e-coding-agentic-failure-corpus-${prefix}-`))
  writeFileSync(join(dir, 'index.ts'), 'import { companionValue } from \'./companion\'\nexport const flag = false\nexport const keep = companionValue\n', 'utf8')
  writeFileSync(join(dir, 'companion.ts'), 'export const companionValue = 1\n', 'utf8')
  writeFileSync(join(dir, 'README.md'), '# e2e coding agentic failure corpus\n', 'utf8')
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
      COMPUTER_USE_SESSION_TAG: 'e2e-coding-agentic-failure-corpus',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/e2e-coding-agentic-failure-corpus',
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

interface FailureBoundaryScenario {
  key: 'baseline-noise' | 'signature-drift-diff-escape'
  baselineCommand: string
  workflowTestCommand: string
  expectedComparison: 'baseline_noise' | 'new_red'
}

async function runTerminalExec(client: Client, command: string, cwd: string) {
  const result = await client.callTool({
    name: 'terminal_exec',
    arguments: {
      command,
      cwd,
      timeoutMs: 20_000,
    },
  })

  const data = requireStructuredContent(result, 'terminal_exec')
  const backend = data.backendResult as Record<string, unknown> | undefined
  assert(backend != null, 'terminal_exec backendResult is required')
  return {
    status: String(data.status || ''),
    exitCode: Number(backend.exitCode),
    stderr: String(backend.stderr || ''),
  }
}

async function runScenario(client: Client, scenario: FailureBoundaryScenario) {
  const projectPath = createProjectDir(scenario.key)

  try {
    const seeded = await runTerminalExec(client, scenario.baselineCommand, projectPath)
    assert(seeded.status === 'executed', `${scenario.key}: expected seeded terminal status=executed, got ${seeded.status}`)
    assert(seeded.exitCode !== 0, `${scenario.key}: baseline command must fail to seed failing checks`)

    const workflowResult = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: projectPath,
        taskGoal: `failure corpus boundary: ${scenario.key}`,
        targetFile: 'index.ts',
        changeIntent: 'behavior_fix',
        allowMultiFile: false,
        maxPlannedFiles: 1,
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: scenario.workflowTestCommand,
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(workflowResult, 'workflow_coding_agentic_loop')
    const workflowStatus = String(workflowData.status)
    assert(workflowStatus === 'completed', `${scenario.key}: expected workflow status completed (execution layer), got ${workflowStatus}`)

    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined
    assert(codingState != null, `${scenario.key}: coding state should exist`)

    const review = codingState.lastChangeReview as Record<string, any> | undefined
    assert(review != null, `${scenario.key}: lastChangeReview should exist`)
    assert(review.baselineComparison === scenario.expectedComparison, `${scenario.key}: expected baselineComparison=${scenario.expectedComparison}, got ${String(review.baselineComparison)}`)

    const codingReport = codingState.lastCodingReport as Record<string, any> | undefined
    assert(codingReport != null, `${scenario.key}: lastCodingReport should exist`)
    assert(codingReport.status === 'in_progress' || codingReport.status === 'failed', `${scenario.key}: expected coding report to reflect recovery semantics, got ${String(codingReport.status)}`)

    const diagnosis = codingState.lastChangeDiagnosis as Record<string, any> | undefined
    assert(diagnosis != null, `${scenario.key}: lastChangeDiagnosis should exist`)
    assert(Array.isArray(diagnosis.evidence), `${scenario.key}: diagnosis.evidence must be an array`)
    assert(diagnosis.evidence.length > 0, `${scenario.key}: diagnosis.evidence should not be empty`)
    assert(Array.isArray(diagnosis.causalHints), `${scenario.key}: diagnosis.causalHints must be an array`)
    assert(diagnosis.evidenceMatrix && typeof diagnosis.evidenceMatrix === 'object', `${scenario.key}: diagnosis.evidenceMatrix should exist`)
    assert(Array.isArray(diagnosis.evidenceMatrix.strongestSignals), `${scenario.key}: evidenceMatrix.strongestSignals must be an array`)
    assert(Array.isArray(diagnosis.causalLinks), `${scenario.key}: diagnosis.causalLinks must be an array`)

    if (scenario.expectedComparison === 'baseline_noise') {
      assert(diagnosis.rootCauseType === 'baseline_noise', `${scenario.key}: expected rootCauseType=baseline_noise, got ${String(diagnosis.rootCauseType)}`)
    }
    else {
      assert(diagnosis.rootCauseType !== 'baseline_noise', `${scenario.key}: expected non-baseline_noise diagnosis for new_red boundary`)
    }

    console.info(`  ✓ ${scenario.key}: baselineComparison=${String(review.baselineComparison)}, rootCause=${String(diagnosis?.rootCauseType || 'n/a')}`)
  }
  finally {
    rmSync(projectPath, { recursive: true, force: true })
  }
}

async function main() {
  console.info('╔══════════════════════════════════════════════════════════════╗')
  console.info('║  E2E Gate: Coding Agentic Failure Corpus (Real Stdio)      ║')
  console.info('╚══════════════════════════════════════════════════════════════╝')

  const baselineStableCommand = 'sh -lc \'printf "FAIL src/index.test.ts > should stay red\\nError: baseline stack at src/index.ts:1:1\\n" 1>&2; exit 1\''
  const driftAndDiffEscapeCommand = 'sh -lc \'printf "\\nexport const driftMutation = true\\n" >> companion.ts; printf "FAIL src/index.test.ts > should stay red\\nError: drift stack at src/companion.ts:9:9\\n" 1>&2; exit 1\''

  const scenarios: FailureBoundaryScenario[] = [
    {
      key: 'baseline-noise',
      baselineCommand: baselineStableCommand,
      workflowTestCommand: baselineStableCommand,
      expectedComparison: 'baseline_noise',
    },
    {
      key: 'signature-drift-diff-escape',
      baselineCommand: baselineStableCommand,
      workflowTestCommand: driftAndDiffEscapeCommand,
      expectedComparison: 'new_red',
    },
  ]

  const client = await createClient()

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    for (const name of ['terminal_exec', 'workflow_coding_agentic_loop', 'desktop_get_state']) {
      assert(names.has(name), `missing required tool: ${name}`)
    }
    console.info(`  ${tools.length} tools available`)

    for (const scenario of scenarios) {
      console.info(`\n── Scenario: ${scenario.key} ──`)
      await runScenario(client, scenario)
    }

    console.info('\n╔══════════════════════════════════════════════════════════════╗')
    console.info('║  FAILURE CORPUS STDIO E2E — ALL SCENARIOS PASSED           ║')
    console.info('╚══════════════════════════════════════════════════════════════╝')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ FAILURE CORPUS STDIO E2E FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
