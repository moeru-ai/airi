/**
 * Smoke: real repo-copy failure corpus on isolated worktree.
 *
 * Verifies on repo-scale fixture copy:
 * 1) baseline_noise boundary remains stable when failure signature matches baseline
 * 2) new_red boundary is emitted when signature drifts and diff escapes baseline
 * 3) diagnosis carries contested/conflicting evidence and bounded repair window
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

function createRepoCopyFixture(prefix: string) {
  const sourceRepoPath = env.AIRI_REAL_REPO_SOURCE?.trim() || resolve(packageDir, '../..')
  const tempRoot = mkdtempSync(join(tmpdir(), `smoke-coding-failure-corpus-repo-copy-${prefix}-`))
  const repoCopyPath = join(tempRoot, 'repo-copy')

  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', sourceRepoPath, repoCopyPath])
  assert(existsSync(join(repoCopyPath, 'services')), 'expected cloned repo to contain services/')

  const fixtureDir = join(repoCopyPath, '__airi_failure_corpus_repo_copy_smoke__')
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(
    join(fixtureDir, 'index.ts'),
    'import { companionValue } from "./companion"\nexport const flag = false\nexport const keep = companionValue\n',
    'utf8',
  )
  writeFileSync(join(fixtureDir, 'companion.ts'), 'export const companionValue = 1\n', 'utf8')
  writeFileSync(join(fixtureDir, 'unrelated.ts'), 'export const unrelatedValue = 0\n', 'utf8')
  writeFileSync(join(fixtureDir, 'baseline-dirty.ts'), 'export const baselineDirtyValue = 0\n', 'utf8')

  execFileSync('git', ['config', 'user.email', 'smoke-failure-corpus-repo-copy@example.com'], { cwd: repoCopyPath })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Failure Corpus Repo Copy'], { cwd: repoCopyPath })
  execFileSync('git', ['add', '__airi_failure_corpus_repo_copy_smoke__/index.ts', '__airi_failure_corpus_repo_copy_smoke__/companion.ts', '__airi_failure_corpus_repo_copy_smoke__/unrelated.ts', '__airi_failure_corpus_repo_copy_smoke__/baseline-dirty.ts'], { cwd: repoCopyPath })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed failure corpus repo-copy smoke fixture'], { cwd: repoCopyPath })

  return {
    sourceRepoPath,
    tempRoot,
    repoCopyPath,
    fixtureIndex: '__airi_failure_corpus_repo_copy_smoke__/index.ts',
    fixtureCompanion: '__airi_failure_corpus_repo_copy_smoke__/companion.ts',
    fixtureUnrelated: '__airi_failure_corpus_repo_copy_smoke__/unrelated.ts',
    fixtureBaselineDirty: '__airi_failure_corpus_repo_copy_smoke__/baseline-dirty.ts',
  }
}

async function createClient() {
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-failure-corpus-repo-copy',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-failure-corpus-repo-copy',
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

async function runScenario(params: {
  client: Client
  workspacePath: string
  fixtureIndex: string
  key: 'baseline-noise' | 'signature-drift-diff-escape' | 'dirty-tree-unrelated-diff-escape'
  seedBaselineCommand: string
  command: string
  expectedComparison: 'baseline_noise' | 'new_red'
  expectedRisk?: string
  preDirtyRelativePath?: string
  expectBaselineDirtyIncludes?: string
}) {
  if (params.preDirtyRelativePath) {
    const dirtyAbsPath = join(params.workspacePath, params.preDirtyRelativePath)
    const existing = readFileSync(dirtyAbsPath, 'utf8')
    writeFileSync(dirtyAbsPath, `${existing.trimEnd()}\n// pre-dirty baseline marker\n`, 'utf8')
  }

  const seed = await params.client.callTool({
    name: 'terminal_exec',
    arguments: {
      command: params.seedBaselineCommand,
      cwd: params.workspacePath,
      timeoutMs: 20_000,
    },
  })
  const seedData = requireStructuredContent(seed, `terminal_exec baseline seed ${params.key}`)
  const seedBackend = seedData.backendResult as Record<string, unknown> | undefined
  assert(seedBackend != null, `${params.key}: missing baseline seed backendResult`)
  assert(Number(seedBackend.exitCode) !== 0, `${params.key}: baseline seed command must fail`)

  const workflow = await params.client.callTool({
    name: 'workflow_coding_agentic_loop',
    arguments: {
      workspacePath: params.workspacePath,
      taskGoal: `repo-copy failure corpus ${params.key}`,
      targetFile: params.fixtureIndex,
      changeIntent: 'behavior_fix',
      allowMultiFile: false,
      maxPlannedFiles: 1,
      patchOld: 'export const flag = false',
      patchNew: 'export const flag = true',
      testCommand: params.command,
      autoApprove: true,
    },
  })

  const workflowData = requireStructuredContent(workflow, `workflow_coding_agentic_loop ${params.key}`)
  assert(String(workflowData.status) === 'completed', `${params.key}: expected execution layer completed`)

  const stateResult = await params.client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })
  const stateData = requireStructuredContent(stateResult, `desktop_get_state ${params.key}`)
  const runState = stateData.runState as Record<string, any>
  const codingState = runState.coding as Record<string, any> | undefined

  assert(codingState != null, `${params.key}: coding state should exist`)
  assert(
    codingState.lastChangeReview?.baselineComparison === params.expectedComparison,
    `${params.key}: expected baselineComparison=${params.expectedComparison}, got ${String(codingState.lastChangeReview?.baselineComparison)}`,
  )
  assert(
    String(codingState.lastScopedValidationCommand?.scope || '') === 'file',
    `${params.key}: expected scoped validation to stay file-scoped, got ${String(codingState.lastScopedValidationCommand?.scope)}`,
  )

  if (params.expectedRisk) {
    const risks = Array.isArray(codingState.lastChangeReview?.detectedRisks) ? codingState.lastChangeReview.detectedRisks : []
    assert(risks.includes(params.expectedRisk), `${params.key}: expected detectedRisks to include ${params.expectedRisk}`)
  }

  if (params.expectBaselineDirtyIncludes) {
    const baselineDirtyFiles = Array.isArray(codingState.validationBaseline?.baselineDirtyFiles)
      ? codingState.validationBaseline.baselineDirtyFiles
      : []
    assert(
      baselineDirtyFiles.includes(params.expectBaselineDirtyIncludes),
      `${params.key}: expected baselineDirtyFiles to include ${params.expectBaselineDirtyIncludes}`,
    )
  }

  const diagnosis = codingState.lastChangeDiagnosis as Record<string, any> | undefined
  assert(diagnosis != null, `${params.key}: diagnosis should exist`)
  assert(Array.isArray(diagnosis.contestedSignals), `${params.key}: contestedSignals should be array`)
  assert(Array.isArray(diagnosis.conflictingEvidence), `${params.key}: conflictingEvidence should be array`)
  assert(typeof diagnosis.recommendedRepairWindow?.scope === 'string', `${params.key}: recommendedRepairWindow.scope should exist`)

  const sourceContent = readFileSync(join(params.workspacePath, params.fixtureIndex), 'utf8')
  assert(sourceContent.includes('export const flag = false'), `${params.key}: source repo-copy fixture should stay unchanged`)

  console.info(`  ✓ ${params.key}: baselineComparison=${String(codingState.lastChangeReview?.baselineComparison)}, rootCause=${String(diagnosis.rootCauseType)}`)
}

async function main() {
  console.info('╔════════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: Failure Corpus on Real Repo-Copy Worktree               ║')
  console.info('╚════════════════════════════════════════════════════════════════════════╝')

  const client = await createClient()
  const stableFailureCommand = 'sh -lc \'printf "FAIL src/index.test.ts > should stay red\\nError: baseline stack at src/index.ts:1:1\\n" 1>&2; exit 1\''
  const driftFailureCommand = 'sh -lc \'printf "\\nexport const driftMutation = true\\n" >> __airi_failure_corpus_repo_copy_smoke__/companion.ts; printf "FAIL src/index.test.ts > should stay red\\nError: drift stack at src/companion.ts:9:9\\n" 1>&2; exit 1\''
  const dirtyUnrelatedDriftCommand = 'sh -lc \'printf "\\nexport const unrelatedMutation = true\\n" >> __airi_failure_corpus_repo_copy_smoke__/unrelated.ts; printf "FAIL src/index.test.ts > should stay red\\nError: drift stack at src/unrelated.ts:5:5\\n" 1>&2; exit 1\''

  const fixtures: Array<{
    key: 'baseline-noise' | 'signature-drift-diff-escape' | 'dirty-tree-unrelated-diff-escape'
    command: string
    expectedComparison: 'baseline_noise' | 'new_red'
    expectedRisk?: string
    preDirtyRelativePath?: string
    expectBaselineDirtyIncludes?: string
  }> = [
    {
      key: 'baseline-noise',
      command: stableFailureCommand,
      expectedComparison: 'baseline_noise',
    },
    {
      key: 'signature-drift-diff-escape',
      command: driftFailureCommand,
      expectedComparison: 'new_red',
      expectedRisk: 'baseline_diff_escape',
    },
    {
      key: 'dirty-tree-unrelated-diff-escape',
      command: dirtyUnrelatedDriftCommand,
      expectedComparison: 'new_red',
      expectedRisk: 'baseline_diff_escape',
      preDirtyRelativePath: '__airi_failure_corpus_repo_copy_smoke__/baseline-dirty.ts',
      expectBaselineDirtyIncludes: '__airi_failure_corpus_repo_copy_smoke__/baseline-dirty.ts',
    },
  ]

  const cleanupPaths: string[] = []

  try {
    for (const scenario of fixtures) {
      console.info(`\n── Scenario: ${scenario.key} ──`)
      const fixture = createRepoCopyFixture(scenario.key)
      cleanupPaths.push(fixture.tempRoot)
      console.info(`  source repo: ${fixture.sourceRepoPath}`)
      console.info(`  repo copy:   ${fixture.repoCopyPath}`)

      await runScenario({
        client,
        workspacePath: fixture.repoCopyPath,
        fixtureIndex: fixture.fixtureIndex,
        key: scenario.key,
        seedBaselineCommand: stableFailureCommand,
        command: scenario.command,
        expectedComparison: scenario.expectedComparison,
        expectedRisk: scenario.expectedRisk,
        preDirtyRelativePath: scenario.preDirtyRelativePath,
        expectBaselineDirtyIncludes: scenario.expectBaselineDirtyIncludes,
      })
    }

    console.info('\n✅ Smoke passed: real repo-copy failure corpus boundaries are stable.')
  }
  finally {
    await client.close().catch(() => {})
    for (const path of cleanupPaths) {
      rmSync(path, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error('\n❌ FAILURE CORPUS REPO-COPY SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
