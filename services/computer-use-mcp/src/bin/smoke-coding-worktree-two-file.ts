/**
 * Smoke: real repo-copy + worktree + constrained 2-file dependency plan.
 *
 * Verifies Phase 2B on real stdio transport:
 * 1) capture baseline and switch to isolated worktree
 * 2) run workflow_coding_loop first pass (expected follow-up because pending step remains)
 * 3) run workflow_coding_loop second pass to complete pending dependent file
 * 4) confirm source repo copy remains unchanged while worktree has both edits
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
  const tempRoot = mkdtempSync(join(tmpdir(), 'smoke-coding-worktree-two-file-'))
  const repoCopyPath = join(tempRoot, 'repo-copy')

  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', sourceRepoPath, repoCopyPath])

  assert(existsSync(join(repoCopyPath, 'apps')), 'expected cloned repo to contain apps/')
  assert(existsSync(join(repoCopyPath, 'packages')), 'expected cloned repo to contain packages/')
  assert(existsSync(join(repoCopyPath, 'services')), 'expected cloned repo to contain services/')

  const fixtureDir = join(repoCopyPath, '__airi_worktree_two_file_smoke__')
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(join(fixtureDir, 'a.ts'), 'export const flag = false\n', 'utf8')
  writeFileSync(join(fixtureDir, 'b.ts'), 'export const flag = false\n', 'utf8')

  execFileSync('git', ['config', 'user.email', 'smoke-worktree-two-file@example.com'], { cwd: repoCopyPath })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Two File'], { cwd: repoCopyPath })
  execFileSync('git', ['add', '__airi_worktree_two_file_smoke__/a.ts', '__airi_worktree_two_file_smoke__/b.ts'], { cwd: repoCopyPath })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed two-file worktree smoke fixture'], { cwd: repoCopyPath })

  return {
    sourceRepoPath,
    repoCopyPath,
    fixtureA: '__airi_worktree_two_file_smoke__/a.ts',
    fixtureB: '__airi_worktree_two_file_smoke__/b.ts',
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-worktree-two-file',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-worktree-two-file',
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
  console.info('║  Smoke Gate: Repo Copy + Worktree + Constrained 2-file progression  ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const { sourceRepoPath, repoCopyPath, fixtureA, fixtureB } = createRealRepoCopy()
  console.info(`  source repo: ${sourceRepoPath}`)
  console.info(`  repo copy:   ${repoCopyPath}`)

  const client = await createClient()

  try {
    const review = await client.callTool({
      name: 'coding_review_workspace',
      arguments: {
        workspacePath: repoCopyPath,
      },
    })
    const reviewData = requireStructuredContent(review, 'coding_review_workspace')
    assert(reviewData.status === 'ok', 'coding_review_workspace should succeed')

    const baseline = await client.callTool({
      name: 'coding_capture_validation_baseline',
      arguments: {
        workspacePath: repoCopyPath,
        createTemporaryWorktree: true,
      },
    })
    const baselineData = requireStructuredContent(baseline, 'coding_capture_validation_baseline')
    const baselineBackend = baselineData.backendResult as Record<string, any>
    const worktreePath = String(baselineBackend.workspacePath || '')
    assert(worktreePath.endsWith('.airi-agentic-worktree'), `expected worktree path, got ${worktreePath}`)
    assert(existsSync(worktreePath), `worktree path should exist: ${worktreePath}`)

    console.info('\n── Pass 1: expected follow-up due pending dependent step ──')
    const firstWorkflow = await client.callTool({
      name: 'workflow_coding_loop',
      arguments: {
        workspacePath: worktreePath,
        taskGoal: 'Constrained two-file progression pass 1',
        targetFile: fixtureA,
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 2,
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: `grep -q "export const flag = true" ${fixtureA} && echo "pass1 ok"`,
        autoApprove: true,
      },
    })

    const firstData = requireStructuredContent(firstWorkflow, 'workflow_coding_loop pass1')
    assert(firstData.status === 'completed', `pass1 should complete at execution layer, got ${String(firstData.status)}`)

    const firstStateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const firstStateData = requireStructuredContent(firstStateResult, 'desktop_get_state pass1')
    const firstRunState = firstStateData.runState as Record<string, any>
    const firstCodingState = firstRunState.coding as Record<string, any> | undefined
    assert(firstCodingState?.lastCodingReport?.status === 'in_progress', `pass1 should remain in_progress by coding report, got ${String(firstCodingState?.lastCodingReport?.status)}`)

    console.info('\n── Pass 2: continue pending dependent file to completion ──')
    const secondWorkflow = await client.callTool({
      name: 'workflow_coding_loop',
      arguments: {
        workspacePath: worktreePath,
        taskGoal: 'Constrained two-file progression pass 2',
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 2,
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: `grep -q "export const flag = true" ${fixtureB} && echo "pass2 ok"`,
        autoApprove: true,
      },
    })

    const secondData = requireStructuredContent(secondWorkflow, 'workflow_coding_loop pass2')
    assert(secondData.status === 'completed', `pass2 should complete, got ${String(secondData.status)}`)

    const sourceA = readFileSync(join(repoCopyPath, fixtureA), 'utf8')
    const sourceB = readFileSync(join(repoCopyPath, fixtureB), 'utf8')
    assert(sourceA.includes('export const flag = false'), 'source fixtureA should remain unchanged')
    assert(sourceB.includes('export const flag = false'), 'source fixtureB should remain unchanged')

    const worktreeA = readFileSync(join(worktreePath, fixtureA), 'utf8')
    const worktreeB = readFileSync(join(worktreePath, fixtureB), 'utf8')
    assert(worktreeA.includes('export const flag = true'), 'worktree fixtureA should be updated')
    assert(worktreeB.includes('export const flag = true'), 'worktree fixtureB should be updated')

    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined
    assert(codingState != null, 'coding state should exist')

    const currentPlan = codingState.currentPlan as Record<string, any> | undefined
    assert(Array.isArray(currentPlan?.steps), 'currentPlan.steps should exist')
    assert(currentPlan?.steps.every((step: any) => step.status === 'completed'), 'expected all constrained plan steps completed')
    assert(currentPlan?.steps[1]?.dependsOn?.[0] === fixtureA, `expected dependent step to depend on ${fixtureA}`)

    console.info('\n✅ Smoke passed: constrained two-file progression works on isolated worktree, source repo copy remains untouched.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ REPO COPY WORKTREE TWO-FILE SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
