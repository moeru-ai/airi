/**
 * Smoke: second-file checkpoint failure -> amend -> third-run recovery.
 *
 * Verifies schedulerized session behavior:
 * 1) pass1 validates file A and advances to file B
 * 2) pass2 fails checkpoint on file B and triggers amend state
 * 3) pass3 re-runs file B recovery edit and continues session progression
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
  const tempRoot = mkdtempSync(join(tmpdir(), 'smoke-coding-worktree-checkpoint-recovery-'))
  const repoCopyPath = join(tempRoot, 'repo-copy')

  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', sourceRepoPath, repoCopyPath])

  assert(existsSync(join(repoCopyPath, 'apps')), 'expected cloned repo to contain apps/')
  assert(existsSync(join(repoCopyPath, 'packages')), 'expected cloned repo to contain packages/')
  assert(existsSync(join(repoCopyPath, 'services')), 'expected cloned repo to contain services/')

  const fixtureDir = join(repoCopyPath, '__airi_worktree_checkpoint_recovery_smoke__')
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(join(fixtureDir, 'a.ts'), 'export const flag = false\n', 'utf8')
  writeFileSync(join(fixtureDir, 'b.ts'), 'export const flag = false\n', 'utf8')
  writeFileSync(join(fixtureDir, 'c.ts'), 'export const flag = false\n', 'utf8')

  execFileSync('git', ['config', 'user.email', 'smoke-worktree-checkpoint-recovery@example.com'], { cwd: repoCopyPath })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Checkpoint Recovery'], { cwd: repoCopyPath })
  execFileSync('git', ['add', '__airi_worktree_checkpoint_recovery_smoke__/a.ts', '__airi_worktree_checkpoint_recovery_smoke__/b.ts', '__airi_worktree_checkpoint_recovery_smoke__/c.ts'], { cwd: repoCopyPath })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed checkpoint recovery smoke fixture'], { cwd: repoCopyPath })

  return {
    sourceRepoPath,
    repoCopyPath,
    fixtureA: '__airi_worktree_checkpoint_recovery_smoke__/a.ts',
    fixtureB: '__airi_worktree_checkpoint_recovery_smoke__/b.ts',
    fixtureC: '__airi_worktree_checkpoint_recovery_smoke__/c.ts',
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-worktree-checkpoint-recovery',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-worktree-checkpoint-recovery',
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

async function getCodingState(client: Client, label: string) {
  const stateResult = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })
  const stateData = requireStructuredContent(stateResult, label)
  const runState = stateData.runState as Record<string, any>
  return runState.coding as Record<string, any> | undefined
}

async function main() {
  console.info('╔══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: second-file checkpoint failure -> amend -> recovery    ║')
  console.info('╚══════════════════════════════════════════════════════════════════════╝')

  const { sourceRepoPath, repoCopyPath, fixtureA, fixtureB, fixtureC } = createRealRepoCopy()
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

    let activeWorkspacePath = worktreePath

    console.info('\n── Pass 1: file A success ──')
    const pass1 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: activeWorkspacePath,
        taskGoal: 'Checkpoint recovery pass 1',
        targetFile: fixtureA,
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 3,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: `grep -q "export const flag = true" ${fixtureA} && echo "pass1 ok"`,
        autoApprove: true,
      },
    })

    const pass1Data = requireStructuredContent(pass1, 'workflow_coding_agentic_loop pass1')
    assert(pass1Data.status === 'completed', `pass1 should complete, got ${String(pass1Data.status)}`)
    const pass1CodingState = await getCodingState(client, 'desktop_get_state pass1')
    activeWorkspacePath = String(pass1CodingState?.workspacePath || activeWorkspacePath)

    const preDirtyPath = join(activeWorkspacePath, fixtureB)
    writeFileSync(preDirtyPath, `${readFileSync(preDirtyPath, 'utf8').trimEnd()}\n// pre-dirty baseline marker\n`, 'utf8')

    console.info('\n── Pass 2: file B checkpoint fails and triggers amend ──')
    const pass2 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: activeWorkspacePath,
        taskGoal: 'Checkpoint recovery pass 2 (fail checkpoint)',
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 3,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: `grep -q "__definitely_missing_token__" ${fixtureB}`,
        autoApprove: true,
      },
    })

    const pass2Data = requireStructuredContent(pass2, 'workflow_coding_agentic_loop pass2')
    assert(pass2Data.status === 'completed', `pass2 execution should complete, got ${String(pass2Data.status)}`)

    const pass2CodingState = await getCodingState(client, 'desktop_get_state pass2')
    activeWorkspacePath = String(pass2CodingState?.workspacePath || activeWorkspacePath)
    const pass2Diagnosis = pass2CodingState?.lastChangeDiagnosis as Record<string, any> | undefined
    assert(pass2Diagnosis != null, 'pass2 diagnosis should exist')
    assert(pass2Diagnosis.nextAction === 'amend', `pass2 should request amend, got ${String(pass2Diagnosis.nextAction)}`)
    assert(pass2CodingState?.currentPlanSession?.status === 'amended', `pass2 session should be amended, got ${String(pass2CodingState?.currentPlanSession?.status)}`)

    console.info('\n── Pass 3: recover file B and continue progression ──')
    const pass3 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: activeWorkspacePath,
        taskGoal: 'Checkpoint recovery pass 3 (recover)',
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 3,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true // recovered',
        testCommand: 'echo "pass3 recovered"',
        autoApprove: true,
      },
    })

    const pass3Data = requireStructuredContent(pass3, 'workflow_coding_agentic_loop pass3')
    assert(pass3Data.status === 'completed', `pass3 should complete, got ${String(pass3Data.status)}`)

    const pass3CodingState = await getCodingState(client, 'desktop_get_state pass3')
    activeWorkspacePath = String(pass3CodingState?.workspacePath || activeWorkspacePath)

    const sourceB = readFileSync(join(repoCopyPath, fixtureB), 'utf8')
    assert(sourceB.includes('export const flag = false'), 'source fixtureB should remain unchanged')

    const worktreeB = readFileSync(join(activeWorkspacePath, fixtureB), 'utf8')
    assert(worktreeB.includes('export const flag = true // recovered'), 'worktree fixtureB should contain recovery patch')

    const session = pass3CodingState?.currentPlanSession as Record<string, any> | undefined
    assert(session != null, 'pass3 session should exist')
    const sessionSteps = Array.isArray(session.steps) ? session.steps as Array<Record<string, any>> : []
    assert(sessionSteps.length >= 3, `expected at least 3 session steps, got ${sessionSteps.length}`)

    const stepA = sessionSteps.find(step => step.filePath === fixtureA)
    const stepB = sessionSteps.find(step => step.filePath === fixtureB)
    const stepC = sessionSteps.find(step => step.filePath === fixtureC)

    assert(stepA?.status === 'validated', `step A should be validated, got ${String(stepA?.status)}`)
    assert(stepB?.status === 'validated' || stepB?.status === 'in_progress', `step B should recover to validated or resume in_progress, got ${String(stepB?.status)}`)
    assert(stepC?.status === 'in_progress' || stepC?.status === 'ready' || stepC?.status === 'awaiting_checkpoint', `step C should be executable or checkpoint-waiting after recovery, got ${String(stepC?.status)}`)
    assert(pass3CodingState?.lastCodingReport?.status === 'in_progress' || pass3CodingState?.lastCodingReport?.status === 'completed', `pass3 coding report should be in_progress/completed, got ${String(pass3CodingState?.lastCodingReport?.status)}`)

    console.info('\n✅ Smoke passed: second-file checkpoint failure is amended and third run recovers progression.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ CHECKPOINT RECOVERY SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
