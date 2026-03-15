/**
 * Smoke: real repo-copy + isolated worktree edit proof.
 *
 * This smoke clones a real repository copy of the current workspace,
 * seeds a tracked fixture file, runs workflow_coding_agentic_loop, and verifies:
 *
 * 1) baseline capture recorded source/worktree metadata
 * 2) edits are applied only in `.airi-agentic-worktree`
 * 3) source workspace copy remains unchanged
 * 4) review + diagnosis + report are persisted in run state
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

function createRealRepoCopy() {
  const sourceRepoPath = env.AIRI_REAL_REPO_SOURCE?.trim() || resolve(packageDir, '../..')
  const tempRoot = mkdtempSync(join(tmpdir(), 'smoke-coding-worktree-repo-copy-'))
  const repoCopyPath = join(tempRoot, 'repo-copy')

  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', sourceRepoPath, repoCopyPath])

  assert(existsSync(join(repoCopyPath, 'apps')), 'expected cloned repo to contain apps/')
  assert(existsSync(join(repoCopyPath, 'packages')), 'expected cloned repo to contain packages/')
  assert(existsSync(join(repoCopyPath, 'services')), 'expected cloned repo to contain services/')

  const fixtureDir = join(repoCopyPath, '__airi_worktree_smoke__')
  const fixtureFile = join(fixtureDir, 'index.ts')
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(fixtureFile, 'export const flag = false\nexport const untouched = true\n', 'utf8')

  execFileSync('git', ['config', 'user.email', 'smoke-repo-copy@example.com'], { cwd: repoCopyPath })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Repo Copy'], { cwd: repoCopyPath })
  execFileSync('git', ['add', '__airi_worktree_smoke__/index.ts'], { cwd: repoCopyPath })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed worktree smoke fixture'], { cwd: repoCopyPath })

  return {
    sourceRepoPath,
    repoCopyPath,
    fixtureRelativePath: '__airi_worktree_smoke__/index.ts',
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-worktree-repo-copy',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-worktree-repo-copy',
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
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: Real Repo Copy + Worktree Isolated Edit (Agentic Loop) ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const { sourceRepoPath, repoCopyPath, fixtureRelativePath } = createRealRepoCopy()
  console.info(`  source repo: ${sourceRepoPath}`)
  console.info(`  repo copy:   ${repoCopyPath}`)

  const client = await createClient()

  try {
    const workflowResult = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: repoCopyPath,
        taskGoal: 'Verify isolated worktree mutation in a real repository copy.',
        targetFile: fixtureRelativePath,
        changeIntent: 'behavior_fix',
        allowMultiFile: false,
        maxPlannedFiles: 1,
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'grep -q "export const flag = true" __airi_worktree_smoke__/index.ts && echo "repo copy worktree validation passed"',
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(workflowResult, 'workflow_coding_agentic_loop')
    assert(workflowData.status === 'completed', `expected completed, got ${String(workflowData.status)}`)
    assert(workflowData.workflow === 'coding_agentic_loop', `expected coding_agentic_loop, got ${String(workflowData.workflow)}`)

    const stepResults = workflowData.stepResults as Array<{ label: string, succeeded: boolean, status: string }>
    for (const step of stepResults) {
      console.info(`  ${step.succeeded ? '✓' : '✗'} ${step.label} (${step.status})`)
    }

    assert(stepResults.some(step => step.label === 'Capture Validation Baseline'), 'expected capture baseline step')
    assert(stepResults.some(step => step.label === 'Review deterministic changes'), 'expected deterministic review step')
    assert(stepResults.some(step => step.label === 'Diagnose change failure'), 'expected diagnosis step')

    const sourceFile = join(repoCopyPath, fixtureRelativePath)
    const sourceContent = readFileSync(sourceFile, 'utf8')
    assert(sourceContent.includes('export const flag = false'), 'source workspace copy must remain unchanged')

    const worktreePath = join(repoCopyPath, '.airi-agentic-worktree')
    assert(existsSync(worktreePath), 'expected .airi-agentic-worktree to exist in repo copy')

    const worktreeFile = join(worktreePath, fixtureRelativePath)
    const worktreeContent = readFileSync(worktreeFile, 'utf8')
    assert(worktreeContent.includes('export const flag = true'), 'worktree file must contain patched value')

    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })

    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined
    assert(codingState != null, 'coding state must exist after agentic workflow')

    assert(codingState.workspacePath === worktreePath, `expected coding.workspacePath=${worktreePath}, got ${String(codingState.workspacePath)}`)
    assert(codingState.validationBaseline?.workspaceMetadata?.sourceWorkspacePath === repoCopyPath, 'expected baseline metadata sourceWorkspacePath to equal repo copy path')
    assert(codingState.validationBaseline?.workspaceMetadata?.worktreePath === worktreePath, 'expected baseline metadata worktreePath to equal isolated worktree path')
    assert(codingState.lastChangeReview?.status === 'ready_for_next_file', `expected ready_for_next_file, got ${String(codingState.lastChangeReview?.status)}`)
    assert(typeof codingState.lastChangeDiagnosis?.rootCauseType === 'string', 'expected diagnosis rootCauseType string')
    assert(
      codingState.lastCodingReport?.status === 'completed' || codingState.lastCodingReport?.status === 'in_progress',
      `expected completed/in_progress report, got ${String(codingState.lastCodingReport?.status)}`,
    )

    const readResult = await client.callTool({
      name: 'coding_read_file',
      arguments: {
        filePath: fixtureRelativePath,
      },
    })

    const readData = requireStructuredContent(readResult, 'coding_read_file')
    const backend = readData.backendResult as Record<string, unknown>
    assert(backend.file === fixtureRelativePath, `expected backend.file=${fixtureRelativePath}, got ${String(backend.file)}`)
    assert(String(backend.content).includes('export const flag = true'), 'expected direct coding_read_file to read patched content from current worktree')

    console.info('\n✅ Smoke passed: baseline capture + isolated worktree edit + diagnosis persistence are valid on real repo copy.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ REAL REPO COPY WORKTREE SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
