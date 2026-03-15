/**
 * Smoke: heavy monorepo scoped-validation routing.
 *
 * Verifies on a real repo-copy workspace:
 * 1) workflow auto validation resolves to file-scoped command
 * 2) scoped file path remains pinned to selected target
 * 3) source copy stays unchanged while isolated worktree is patched
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

function createRepoCopyFixture() {
  const sourceRepoPath = env.AIRI_REAL_REPO_SOURCE?.trim() || resolve(packageDir, '../..')
  const tempRoot = mkdtempSync(join(tmpdir(), 'smoke-coding-scoped-validation-monorepo-'))
  const repoCopyPath = join(tempRoot, 'repo-copy')

  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', sourceRepoPath, repoCopyPath])

  assert(existsSync(join(repoCopyPath, 'services')), 'expected cloned repo to contain services/')
  assert(existsSync(join(repoCopyPath, 'packages')), 'expected cloned repo to contain packages/')

  const fixtureDir = join(repoCopyPath, 'services/computer-use-mcp/__airi_scoped_validation_smoke__')
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(
    join(fixtureDir, 'index.ts'),
    'import { companionValue } from "./companion"\nexport const flag = false\nexport const keep = companionValue\n',
    'utf8',
  )
  writeFileSync(join(fixtureDir, 'companion.ts'), 'export const companionValue = 1\n', 'utf8')
  writeFileSync(join(repoCopyPath, 'README.md'), `${readFileSync(join(repoCopyPath, 'README.md'), 'utf8').trimEnd()}\n<!-- scoped-validation-smoke dirty marker -->\n`, 'utf8')

  execFileSync('git', ['config', 'user.email', 'smoke-scoped-validation-monorepo@example.com'], { cwd: repoCopyPath })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Scoped Validation Monorepo'], { cwd: repoCopyPath })
  execFileSync('git', ['add', 'services/computer-use-mcp/__airi_scoped_validation_smoke__/index.ts', 'services/computer-use-mcp/__airi_scoped_validation_smoke__/companion.ts'], { cwd: repoCopyPath })
  execFileSync('git', ['commit', '--quiet', '-m', 'seed scoped validation monorepo smoke fixture'], { cwd: repoCopyPath })

  return {
    sourceRepoPath,
    tempRoot,
    repoCopyPath,
    fixtureIndex: 'services/computer-use-mcp/__airi_scoped_validation_smoke__/index.ts',
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-scoped-validation-monorepo',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-scoped-validation-monorepo',
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
  console.info('╔════════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: Monorepo Scoped Validation (auto command routing)       ║')
  console.info('╚════════════════════════════════════════════════════════════════════════╝')

  const fixture = createRepoCopyFixture()
  const client = await createClient()

  try {
    console.info(`  source repo: ${fixture.sourceRepoPath}`)
    console.info(`  repo copy:   ${fixture.repoCopyPath}`)

    const workflow = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: fixture.repoCopyPath,
        taskGoal: 'scoped validation monorepo heavy gate',
        targetFile: fixture.fixtureIndex,
        changeIntent: 'behavior_fix',
        allowMultiFile: false,
        maxPlannedFiles: 1,
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'auto',
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(workflow, 'workflow_coding_agentic_loop')
    assert(String(workflowData.status) === 'completed', `expected execution-layer completed, got ${String(workflowData.status)}`)

    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined

    assert(codingState != null, 'coding state should exist')

    const scopedValidation = codingState.lastScopedValidationCommand as Record<string, any> | undefined
    assert(scopedValidation != null, 'lastScopedValidationCommand should exist')
    assert(scopedValidation.scope === 'file', `expected scope=file, got ${String(scopedValidation.scope)}`)
    assert(scopedValidation.filePath === fixture.fixtureIndex, `expected filePath=${fixture.fixtureIndex}, got ${String(scopedValidation.filePath)}`)

    const scopedCommand = String(scopedValidation.command || '')
    assert(scopedCommand.length > 0, 'scoped validation command should be non-empty')
    assert(
      scopedCommand.includes(fixture.fixtureIndex)
      || scopedCommand.includes('services/computer-use-mcp/__airi_scoped_validation_smoke__'),
      `scoped command should contain fixture path, got ${scopedCommand}`,
    )

    const reviewValidationCommand = String(codingState.lastChangeReview?.validationCommand || '')
    assert(reviewValidationCommand.length > 0, 'lastChangeReview.validationCommand should be non-empty')
    assert(reviewValidationCommand === scopedCommand, 'review validation command should align with resolved scoped command')

    const sourceContent = readFileSync(join(fixture.repoCopyPath, fixture.fixtureIndex), 'utf8')
    assert(sourceContent.includes('export const flag = false'), 'source repo-copy fixture should remain unchanged')

    const worktreePath = String(codingState.workspacePath || '')
    assert(worktreePath.endsWith('.airi-agentic-worktree'), `expected isolated worktree path, got ${worktreePath}`)
    const worktreeContent = readFileSync(join(worktreePath, fixture.fixtureIndex), 'utf8')
    assert(worktreeContent.includes('export const flag = true'), 'worktree fixture should contain patched value')

    const baselineDirtyFiles = Array.isArray(codingState.validationBaseline?.baselineDirtyFiles)
      ? codingState.validationBaseline.baselineDirtyFiles
      : []
    assert(baselineDirtyFiles.includes('README.md'), 'baseline should retain unrelated dirty-tree marker (README.md)')

    console.info(`✅ Smoke passed: scoped validation command is file-pinned (${scopedCommand}).`)
  }
  finally {
    await client.close().catch(() => {})
    rmSync(fixture.tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('\n❌ MONOREPO SCOPED VALIDATION SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
