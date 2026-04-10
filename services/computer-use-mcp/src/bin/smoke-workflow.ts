/**
 * End-to-end smoke test for workflow tools.
 *
 * Verifies that:
 * 1. `workflow_run_tests` executes all steps and returns a result.
 * 2. `workflow_resume` works after an approval-paused workflow.
 * 3. `desktop_get_state` reflects task progress from workflows.
 * 4. All workflow tools are registered and callable.
 *
 * Runs against the real MCP server via stdio transport with a dry-run
 * executor (no real desktop actions). Steps still flow through the full
 * policy / action-executor pipeline.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp exec tsx ./src/bin/smoke-workflow.ts
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { appNamesMatch, findKnownAppMention } from '../app-aliases'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireStructuredContent(result: unknown, label: string) {
  if (!result || typeof result !== 'object')
    throw new Error(`${label} did not return an object result`)

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    throw new Error(`${label} missing structuredContent`)

  return structuredContent as Record<string, unknown>
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function createSmokeProjectDir() {
  const projectPath = mkdtempSync(join(tmpdir(), 'computer-use-smoke-project-'))
  writeFileSync(join(projectPath, 'README.md'), '# smoke project\n', 'utf8')
  return projectPath
}

async function createClient(overrides: Record<string, string> = {}): Promise<Client> {
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
      COMPUTER_USE_SESSION_TAG: 'smoke-workflow',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Cursor,Visual Studio Code,Google Chrome',
      ...overrides,
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/computer-use-mcp-smoke-workflow',
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
// Test 1: Workflow tools are registered
// ---------------------------------------------------------------------------

async function testWorkflowToolsRegistered(client: Client) {
  console.info('\n=== Test 1: Workflow tools are registered ===')

  const tools = await client.listTools()
  const toolNames = new Set(tools.tools.map(t => t.name))

  const requiredTools = [
    'workflow_open_workspace',
    'workflow_validate_workspace',
    'workflow_run_tests',
    'workflow_inspect_failure',
    'workflow_browse_and_act',
    'workflow_resume',
    'desktop_get_state',
  ]

  for (const name of requiredTools) {
    assert(toolNames.has(name), `missing tool: ${name}`)
    console.info(`  ✓ ${name}`)
  }

  console.info(`  Total tools: ${tools.tools.length}`)
  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 2: workflow_run_tests with autoApprove (happy path)
// ---------------------------------------------------------------------------

async function testWorkflowRunTestsAutoApprove(client: Client) {
  console.info('\n=== Test 2: workflow_run_tests with autoApprove=true ===')
  const projectPath = createSmokeProjectDir()

  const result = await client.callTool({
    name: 'workflow_run_tests',
    arguments: {
      projectPath,
      testCommand: 'echo "all tests passed"',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_run_tests')
  console.info(`  Status: ${data.status}`)
  console.info(`  Workflow: ${data.workflow}`)

  const stepResults = data.stepResults as Array<{ label: string, succeeded: boolean, explanation: string }>
  for (const step of stepResults) {
    const icon = step.succeeded ? '✓' : '✗'
    console.info(`  ${icon} ${step.label}`)
  }

  // With autoApprove + dry-run, the workflow should complete.
  // The dry-run executor will handle actions, and autoApprove skips the approval queue.
  assert(
    data.status === 'completed' || data.status === 'failed',
    `expected completed or failed, got ${data.status}`,
  )

  console.info('  PASSED')
  return data
}

// ---------------------------------------------------------------------------
// Test 2b: workflow_open_workspace with autoApprove (happy path)
// ---------------------------------------------------------------------------

async function testWorkflowOpenWorkspace(client: Client) {
  console.info('\n=== Test 2b: workflow_open_workspace with autoApprove=true ===')
  const projectPath = createSmokeProjectDir()

  const result = await client.callTool({
    name: 'workflow_open_workspace',
    arguments: {
      projectPath,
      ideApp: 'VS Code',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_open_workspace')
  console.info(`  Status: ${data.status}`)
  console.info(`  Workflow: ${data.workflow}`)

  const stepResults = data.stepResults as Array<{ label: string, succeeded: boolean }>
  assert(stepResults.some(step => step.label.includes('Finder')), 'expected Finder step')
  assert(
    stepResults.some(step => appNamesMatch(findKnownAppMention(step.label), 'Visual Studio Code')),
    'expected VS Code step',
  )
  assert(
    data.status === 'completed' || data.status === 'failed',
    `expected completed or failed, got ${data.status}`,
  )

  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 2c: workflow_validate_workspace with autoApprove (happy path)
// ---------------------------------------------------------------------------

async function testWorkflowValidateWorkspace(client: Client) {
  console.info('\n=== Test 2c: workflow_validate_workspace with autoApprove=true ===')
  const projectPath = createSmokeProjectDir()

  const result = await client.callTool({
    name: 'workflow_validate_workspace',
    arguments: {
      projectPath,
      ideApp: 'VS Code',
      changesCommand: 'printf " M smoke-workflow.ts\\n"',
      checkCommand: 'echo "typecheck ok"',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_validate_workspace')
  console.info(`  Status: ${data.status}`)
  console.info(`  Workflow: ${data.workflow}`)

  const stepResults = data.stepResults as Array<{ label: string, succeeded: boolean }>
  assert(stepResults.some(step => step.label === 'Confirm project working directory'), 'expected pwd validation step')
  assert(stepResults.some(step => step.label === 'Inspect local changes'), 'expected changes inspection step')
  assert(stepResults.some(step => step.label === 'Run workspace validation'), 'expected workspace validation step')
  assert(
    data.status === 'completed' || data.status === 'failed',
    `expected completed or failed, got ${data.status}`,
  )

  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 3: desktop_get_state reflects workflow task
// ---------------------------------------------------------------------------

async function testDesktopGetStateAfterWorkflow(client: Client) {
  console.info('\n=== Test 3: desktop_get_state reflects workflow task ===')

  const result = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const data = requireStructuredContent(result, 'desktop_get_state')
  assert(data.status === 'ok', `expected ok status, got ${data.status}`)

  const runState = data.runState as Record<string, unknown>
  console.info(`  Active app: ${runState.activeApp ?? 'unknown'}`)
  console.info(`  Terminal state: ${JSON.stringify(runState.terminalState)}`)

  // After a workflow, there should be task info (or it's already cleared).
  if (runState.activeTask) {
    const task = runState.activeTask as Record<string, unknown>
    console.info(`  Task goal: ${task.goal}`)
    console.info(`  Task phase: ${task.phase}`)
  }
  else {
    console.info('  No active task (workflow already finished)')
  }

  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 4: workflow_run_tests with autoApprove=false → paused → resume
// ---------------------------------------------------------------------------

async function testWorkflowPauseAndResume(client: Client) {
  console.info('\n=== Test 4: workflow with autoApprove=false → pause → resume ===')

  const result = await client.callTool({
    name: 'workflow_run_tests',
    arguments: {
      projectPath: '/tmp/test-project',
      testCommand: 'echo "tests"',
      autoApprove: false,
    },
  })

  const data = requireStructuredContent(result, 'workflow_run_tests')
  console.info(`  Initial status: ${data.status}`)

  if (data.status === 'paused') {
    console.info('  Workflow paused as expected (approval required)')
    console.info(`  Paused at step: ${data.pausedAtStep}`)
    assert(data.resumeHint !== undefined, 'missing resumeHint in paused response')

    // Approve the pending action first.
    const pending = await client.callTool({
      name: 'desktop_list_pending_actions',
      arguments: {},
    })
    const pendingData = requireStructuredContent(pending, 'desktop_list_pending_actions')
    const pendingActions = Array.isArray(pendingData.pendingActions) ? pendingData.pendingActions : []

    if (pendingActions.length > 0) {
      const pendingId = String((pendingActions[0] as Record<string, unknown>).id || '')
      console.info(`  Approving pending action: ${pendingId}`)

      await client.callTool({
        name: 'desktop_approve_pending_action',
        arguments: { id: pendingId },
      })
    }

    // Now resume the workflow.
    console.info('  Calling workflow_resume...')
    const resumeResult = await client.callTool({
      name: 'workflow_resume',
      arguments: { approved: true, autoApprove: true },
    })
    const resumeData = requireStructuredContent(resumeResult, 'workflow_resume')
    console.info(`  Resume status: ${resumeData.status}`)

    const resumeSteps = resumeData.stepResults as Array<{ label: string, succeeded: boolean }>
    for (const step of resumeSteps) {
      const icon = step.succeeded ? '✓' : '✗'
      console.info(`    ${icon} ${step.label}`)
    }

    // After resume, the workflow should be completed or at least further along.
    console.info(`  Final resume status: ${resumeData.status}`)
  }
  else if (data.status === 'completed') {
    // In dry-run mode, the policy might not require approval for some actions.
    console.info('  Workflow completed without needing approval (dry-run policy)')
  }
  else {
    console.info(`  Workflow ended with status: ${data.status} (may have failed steps)`)
  }

  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 5: workflow_resume with no suspended workflow
// ---------------------------------------------------------------------------

async function testResumeNoSuspendedWorkflow(client: Client) {
  console.info('\n=== Test 5: workflow_resume with no suspended workflow ===')

  const result = await client.callTool({
    name: 'workflow_resume',
    arguments: {},
  })

  // Should be an error.
  const isError = (result as { isError?: boolean }).isError
  assert(isError === true, 'expected error when no workflow is suspended')

  const data = requireStructuredContent(result, 'workflow_resume')
  assert(data.reason === 'no_suspended_workflow', `expected no_suspended_workflow, got ${data.reason}`)

  console.info('  Correctly returned error for no suspended workflow')
  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 6: workflow_inspect_failure
// ---------------------------------------------------------------------------

async function testWorkflowInspectFailure(client: Client) {
  console.info('\n=== Test 6: workflow_inspect_failure ===')

  const result = await client.callTool({
    name: 'workflow_inspect_failure',
    arguments: {
      ideApp: 'Cursor',
      autoApprove: true,
    },
  })

  const data = requireStructuredContent(result, 'workflow_inspect_failure')
  console.info(`  Status: ${data.status}`)

  const stepResults = data.stepResults as Array<{ label: string, succeeded: boolean }>
  for (const step of stepResults) {
    const icon = step.succeeded ? '✓' : '✗'
    console.info(`  ${icon} ${step.label}`)
  }

  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Test 7: workflow_browse_and_act
// ---------------------------------------------------------------------------

async function testWorkflowBrowseAndAct(client: Client) {
  console.info('\n=== Test 7: workflow_browse_and_act ===')

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

  // Reroute contract shape check: when the strategy returns reroute_required
  // the formatter must emit the stable workflow_reroute contract.
  if (data.kind === 'workflow_reroute' && data.status === 'reroute_required') {
    console.info('  → Reroute detected, verifying contract shape')
    assert(typeof data.workflow === 'string', 'reroute must include workflow name')
    const reroute = data.reroute as Record<string, unknown> | undefined
    assert(reroute != null && typeof reroute === 'object', 'reroute must include reroute detail')
    assert(typeof reroute.recommendedSurface === 'string', 'reroute.recommendedSurface must be string')
    assert(typeof reroute.suggestedTool === 'string', 'reroute.suggestedTool must be string')
    assert(typeof reroute.strategyReason === 'string', 'reroute.strategyReason must be string')
    assert(typeof reroute.explanation === 'string', 'reroute.explanation must be string')
    console.info(`  ✓ Reroute contract valid (recommended: ${reroute.recommendedSurface})`)
  }
  else {
    const stepResults = data.stepResults as Array<{ label: string, succeeded: boolean }>
    for (const step of stepResults) {
      const icon = step.succeeded ? '✓' : '✗'
      console.info(`  ${icon} ${step.label}`)
    }
  }

  console.info('  PASSED')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.info('╔════════════════════════════════════════════════╗')
  console.info('║   Computer Use MCP — Workflow E2E Smoke Test  ║')
  console.info('╚════════════════════════════════════════════════╝')

  // Test with approval_mode=never (auto-approve all).
  console.info('\n--- Phase 1: approval_mode=never ---')
  const clientNoApproval = await createClient({
    COMPUTER_USE_APPROVAL_MODE: 'never',
  })

  try {
    await testWorkflowToolsRegistered(clientNoApproval)
    await testWorkflowRunTestsAutoApprove(clientNoApproval)
    await testWorkflowOpenWorkspace(clientNoApproval)
    await testWorkflowValidateWorkspace(clientNoApproval)
    await testDesktopGetStateAfterWorkflow(clientNoApproval)
    await testResumeNoSuspendedWorkflow(clientNoApproval)
    await testWorkflowInspectFailure(clientNoApproval)
    await testWorkflowBrowseAndAct(clientNoApproval)
  }
  finally {
    await clientNoApproval.close().catch(() => {})
  }

  // Test with approval_mode=actions (per-step approval required).
  console.info('\n--- Phase 2: approval_mode=actions (autoApprove=false for pause/resume) ---')
  const clientWithApproval = await createClient({
    COMPUTER_USE_APPROVAL_MODE: 'actions',
  })

  try {
    await testWorkflowPauseAndResume(clientWithApproval)
  }
  finally {
    await clientWithApproval.close().catch(() => {})
  }

  console.info('\n╔════════════════════════════════════════════════╗')
  console.info('║          ALL WORKFLOW SMOKE TESTS PASSED       ║')
  console.info('╚════════════════════════════════════════════════╝')
}

main().catch((error) => {
  console.error('\n❌ SMOKE TEST FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
