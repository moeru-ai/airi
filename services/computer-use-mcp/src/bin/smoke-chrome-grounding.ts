/**
 * End-to-end smoke test for the desktop v3 Chrome grounding pipeline.
 *
 * Verifies that:
 * 1. `desktop_ensure_chrome` starts or joins an agent Chrome window.
 * 2. `desktop_observe` captures a valid grounding snapshot.
 * 3. `desktop_get_state` exposes overlay-consumable grounding state.
 * 4. `desktop_click_target` updates pointer intent and clicked-candidate state.
 *
 * Usage:
 *   pnpm -F @proj-airi/computer-use-mcp smoke:desktop-v3
 */

import { dirname, resolve } from 'node:path'
import { argv, env, exit } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WHITESPACE_SPLIT_RE = /\s+/u
const SMOKE_TARGET_LABEL = 'AIRI Desktop V3 Smoke Button'

const DEFAULT_SMOKE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <title>AIRI Desktop V3 Smoke</title>
    <style>
      body { font-family: sans-serif; padding: 48px; }
      button { font-size: 18px; padding: 12px 18px; }
    </style>
  </head>
  <body>
    <h1>AIRI Desktop V3 Smoke</h1>
    <button id="airi-desktop-v3-smoke-button">AIRI Desktop V3 Smoke Button</button>
  </body>
</html>`)}`

export interface DesktopV3SmokeCandidate {
  id: string
  source?: string
  role?: string
  label?: string
  interactable?: boolean
}

interface CandidateRecord extends Record<string, unknown> {
  id: string
}

export interface OverlaySmokeState {
  hasSnapshot: boolean
  snapshotId: string
  candidateCount: number
  staleFlags: unknown
  pointerIntent?: Record<string, unknown>
  lastClickedCandidateId?: string
}

export interface ApprovalEvent {
  toolName: string
  pendingActionId: string
}

export interface PendingActionRecord extends Record<string, unknown> {
  toolName?: string
  id?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseCommandArgs(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim())
    return fallback

  return raw
    .split(WHITESPACE_SPLIT_RE)
    .map(item => item.trim())
    .filter(Boolean)
}

export function requireStructuredContent(result: unknown, label: string): Record<string, unknown> {
  if (!isRecord(result))
    throw new Error(`${label} did not return an object result`)

  const structuredContent = result.structuredContent
  if (!isRecord(structuredContent))
    throw new Error(`${label} missing structuredContent`)

  return structuredContent
}

export function requireTextContent(result: unknown, label: string): string {
  if (!isRecord(result) || !Array.isArray(result.content))
    throw new Error(`${label} missing content`)

  const text = result.content
    .filter(isRecord)
    .map(item => typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')

  if (!text.trim())
    throw new Error(`${label} missing text content`)

  return text
}

export function requireRunState(result: unknown, label: string): Record<string, unknown> {
  const structuredContent = requireStructuredContent(result, label)
  if (structuredContent.status !== 'ok')
    throw new Error(`${label} expected status=ok, got ${String(structuredContent.status)}`)

  if (!isRecord(structuredContent.runState))
    throw new Error(`${label} missing runState`)

  return structuredContent.runState
}

export function selectDesktopV3SmokeCandidate(
  runState: Record<string, unknown>,
  requestedCandidateId?: string,
): DesktopV3SmokeCandidate {
  const selected = findDesktopV3SmokeCandidate(runState, requestedCandidateId)
  if (selected) {
    return selected
  }

  const requested = requestedCandidateId?.trim()
  if (!requested) {
    throw new Error('desktop_observe did not return the AIRI Desktop V3 Smoke Button chrome_dom candidate')
  }
  throw new Error(`desktop_observe did not return requested candidate "${requested}"`)
}

export function findDesktopV3SmokeCandidate(
  runState: Record<string, unknown>,
  requestedCandidateId?: string,
): DesktopV3SmokeCandidate | undefined {
  const snapshot = runState.lastGroundingSnapshot
  if (!isRecord(snapshot))
    throw new Error('desktop_get_state missing lastGroundingSnapshot after desktop_observe')

  const candidates = Array.isArray(snapshot.targetCandidates)
    ? snapshot.targetCandidates.filter(isRecord)
    : []

  if (candidates.length === 0)
    throw new Error('desktop_observe produced no target candidates')

  const requested = requestedCandidateId?.trim()
  const candidatesWithIds = candidates.filter((candidate): candidate is CandidateRecord => {
    return typeof candidate.id === 'string' && candidate.id.length > 0
  })
  const chromeDomCandidates = candidatesWithIds.filter(candidate => candidate.source === 'chrome_dom')
  const selected = requested
    ? candidatesWithIds.find(candidate => candidate.id === requested)
    : selectDefaultChromeDomCandidate(chromeDomCandidates)

  if (!selected) {
    return undefined
  }

  return {
    id: selected.id,
    source: typeof selected.source === 'string' ? selected.source : undefined,
    role: typeof selected.role === 'string' ? selected.role : undefined,
    label: typeof selected.label === 'string' ? selected.label : undefined,
    interactable: typeof selected.interactable === 'boolean' ? selected.interactable : undefined,
  }
}

function candidateText(candidate: Record<string, unknown>): string {
  return [
    candidate.id,
    candidate.label,
    candidate.role,
    candidate.source,
  ]
    .filter(item => typeof item === 'string')
    .join(' ')
    .toLowerCase()
}

function selectDefaultChromeDomCandidate(candidates: CandidateRecord[]): CandidateRecord | undefined {
  return candidates.find(candidate =>
    candidateText(candidate).includes(SMOKE_TARGET_LABEL.toLowerCase()),
  )
}

export function extractOverlaySmokeState(runState: Record<string, unknown>): OverlaySmokeState {
  const snapshot = runState.lastGroundingSnapshot
  if (!isRecord(snapshot))
    throw new Error('desktop_get_state missing lastGroundingSnapshot')

  const snapshotId = typeof snapshot.snapshotId === 'string' ? snapshot.snapshotId : ''
  if (!snapshotId)
    throw new Error('lastGroundingSnapshot missing snapshotId')

  const candidates = Array.isArray(snapshot.targetCandidates) ? snapshot.targetCandidates : []
  const pointerIntent = isRecord(runState.lastPointerIntent)
    ? runState.lastPointerIntent
    : undefined
  const lastClickedCandidateId = typeof runState.lastClickedCandidateId === 'string'
    ? runState.lastClickedCandidateId
    : undefined

  return {
    hasSnapshot: true,
    snapshotId,
    candidateCount: candidates.length,
    staleFlags: snapshot.staleFlags,
    pointerIntent,
    lastClickedCandidateId,
  }
}

export function requirePostClickOverlayState(
  runState: Record<string, unknown>,
  selectedCandidateId: string,
): OverlaySmokeState {
  const overlayState = extractOverlaySmokeState(runState)

  if (!overlayState.pointerIntent)
    throw new Error('desktop_get_state missing lastPointerIntent after desktop_click_target')

  if (overlayState.pointerIntent.candidateId !== selectedCandidateId) {
    throw new Error(`lastPointerIntent candidate mismatch: expected ${selectedCandidateId}, got ${String(overlayState.pointerIntent.candidateId)}`)
  }

  if (overlayState.lastClickedCandidateId !== selectedCandidateId) {
    throw new Error(`lastClickedCandidateId mismatch: expected ${selectedCandidateId}, got ${String(overlayState.lastClickedCandidateId)}`)
  }

  return overlayState
}

export function requireChromeDomSmokeCandidate(candidate: DesktopV3SmokeCandidate): void {
  if (candidate.source !== 'chrome_dom') {
    throw new Error(`smoke target button was not captured as a chrome_dom candidate (got: ${candidate.source ?? 'unknown'}). Verify extension is connected.`)
  }
}

export function shouldExpectBrowserDomRoute(runState: Record<string, unknown>): boolean {
  const browserSurfaceAvailability = isRecord(runState.browserSurfaceAvailability)
    ? runState.browserSurfaceAvailability
    : undefined

  const preferredSurface = typeof browserSurfaceAvailability?.preferredSurface === 'string'
    ? browserSurfaceAvailability.preferredSurface
    : undefined

  const selectedToolName = typeof browserSurfaceAvailability?.selectedToolName === 'string'
    ? browserSurfaceAvailability.selectedToolName
    : undefined

  const availableSurfaces = Array.isArray(browserSurfaceAvailability?.availableSurfaces)
    ? browserSurfaceAvailability.availableSurfaces.filter((surface): surface is string => typeof surface === 'string')
    : []

  return preferredSurface === 'browser_dom'
    || selectedToolName === 'browser_dom_read_page'
    || availableSurfaces.includes('browser_dom')
}

export function selectPendingActionForTool(
  pendingActions: PendingActionRecord[],
  expectedToolName: string,
): PendingActionRecord {
  const matchingPending = pendingActions.find(action => action.toolName === expectedToolName)

  if (!matchingPending) {
    const found = pendingActions
      .map(action => action.toolName)
      .filter((toolName): toolName is string => typeof toolName === 'string' && toolName.length > 0)
      .join(', ') || 'none'
    throw new Error(`no pending action for ${expectedToolName} (found: ${found})`)
  }

  return matchingPending
}

async function approveFirstPending(
  client: Client,
  expectedToolName: string,
): Promise<{ result: unknown, approvalEvent: ApprovalEvent }> {
  const pending = await client.callTool({
    name: 'desktop_list_pending_actions',
    arguments: {},
  })
  const pendingData = requireStructuredContent(pending, 'desktop_list_pending_actions')
  const pendingActions = Array.isArray(pendingData.pendingActions)
    ? pendingData.pendingActions.filter(isRecord) as PendingActionRecord[]
    : []
  const matchingPending = selectPendingActionForTool(pendingActions, expectedToolName)

  const pendingActionId = typeof matchingPending.id === 'string' ? matchingPending.id : ''
  if (!pendingActionId)
    throw new Error(`pending action missing id after ${expectedToolName}`)

  const result = await client.callTool({
    name: 'desktop_approve_pending_action',
    arguments: { id: pendingActionId },
  })

  return {
    result,
    approvalEvent: {
      toolName: expectedToolName,
      pendingActionId,
    },
  }
}

async function resolveApprovalIfNeeded(
  client: Client,
  toolName: string,
  result: unknown,
  approvalEvents: ApprovalEvent[],
): Promise<unknown> {
  const structuredContent = isRecord(result)
    ? result.structuredContent
    : undefined

  if (!isRecord(structuredContent) || structuredContent.status !== 'approval_required')
    return result

  const approved = await approveFirstPending(client, toolName)
  approvalEvents.push(approved.approvalEvent)
  return approved.result
}

function assertToolRegistered(toolNames: Set<string>, toolName: string) {
  if (!toolNames.has(toolName))
    throw new Error(`required desktop v3 tool is not registered: ${toolName}`)
}

export function parseNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim())
    return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

export function parseOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null')
    return undefined

  return trimmed
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForChromeDomSmokeCandidate(
  client: Client,
  requestedCandidateId: string | undefined,
  timeoutMs: number,
  retryIntervalMs: number,
): Promise<{
  observationText: string
  runState: Record<string, unknown>
  overlayState: OverlaySmokeState
  candidate: DesktopV3SmokeCandidate
}> {
  const deadline = Date.now() + timeoutMs
  let lastRunState: Record<string, unknown> | undefined
  let lastObservationText = ''
  let lastCandidateSummary = ''

  while (Date.now() <= deadline) {
    const observation = await client.callTool({
      name: 'desktop_observe',
      arguments: { includeChrome: true },
    })
    lastObservationText = requireTextContent(observation, 'desktop_observe')

    const runState = requireRunState(await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    }), 'desktop_get_state')
    lastRunState = runState
    const snapshot = isRecord(runState.lastGroundingSnapshot)
      ? runState.lastGroundingSnapshot
      : undefined
    const candidates = Array.isArray(snapshot?.targetCandidates)
      ? snapshot.targetCandidates.filter(isRecord)
      : []
    lastCandidateSummary = JSON.stringify(candidates.map(candidate => ({
      id: candidate.id,
      source: candidate.source,
      role: candidate.role,
      label: candidate.label,
    })).slice(0, 12))

    const candidate = findDesktopV3SmokeCandidate(runState, requestedCandidateId)
    if (candidate) {
      return {
        observationText: lastObservationText,
        runState,
        overlayState: extractOverlaySmokeState(runState),
        candidate,
      }
    }

    await delay(retryIntervalMs)
  }

  if (lastRunState) {
    const browserSurfaceAvailability = isRecord(lastRunState.browserSurfaceAvailability)
      ? JSON.stringify(lastRunState.browserSurfaceAvailability)
      : 'missing'
    const chromeSession = isRecord(lastRunState.chromeSession)
      ? JSON.stringify({
          ensureOutcome: lastRunState.chromeSession.ensureOutcome,
          pid: lastRunState.chromeSession.pid,
          cdpUrl: lastRunState.chromeSession.cdpUrl,
        })
      : 'missing'
    throw new Error(
      `desktop_observe did not return the AIRI Desktop V3 Smoke Button chrome_dom candidate; `
      + `browserSurfaceAvailability=${browserSurfaceAvailability}; `
      + `chromeSession=${chromeSession}; `
      + `observeSummary=${JSON.stringify(lastObservationText.split('\n').slice(0, 12))}; `
      + `candidates=${lastCandidateSummary}`,
    )
  }

  throw new Error(`desktop_v3 chrome_dom candidate did not become ready within ${timeoutMs}ms`)
}

export async function runDesktopV3Smoke(): Promise<Record<string, unknown>> {
  const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
  const args = parseCommandArgs(env.COMPUTER_USE_SMOKE_SERVER_ARGS, ['start'])
  const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir
  const smokeUrl = env.COMPUTER_USE_DESKTOP_V3_SMOKE_URL?.trim() || DEFAULT_SMOKE_URL
  const requestedCandidateId = parseOptionalString(env.COMPUTER_USE_DESKTOP_V3_SMOKE_CANDIDATE_ID)
  const settleMs = parseNumber(env.COMPUTER_USE_DESKTOP_V3_SMOKE_SETTLE_MS, 750)
  const chromeDomTimeoutMs = parseNumber(env.COMPUTER_USE_DESKTOP_V3_CHROME_DOM_TIMEOUT_MS, 15_000)
  const chromeDomRetryIntervalMs = parseNumber(env.COMPUTER_USE_DESKTOP_V3_CHROME_DOM_RETRY_INTERVAL_MS, 500)

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...env,
      COMPUTER_USE_EXECUTOR: env.COMPUTER_USE_SMOKE_EXECUTOR || env.COMPUTER_USE_EXECUTOR || 'macos-local',
      COMPUTER_USE_APPROVAL_MODE: env.COMPUTER_USE_SMOKE_APPROVAL_MODE || env.COMPUTER_USE_APPROVAL_MODE || 'actions',
      COMPUTER_USE_OPENABLE_APPS: env.COMPUTER_USE_OPENABLE_APPS || 'Terminal,Cursor,Google Chrome',
    },
    stderr: 'pipe',
  })
  const client = new Client({
    name: '@proj-airi/computer-use-mcp-smoke-desktop-v3',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text)
      console.error(`[computer-use-mcp stderr] ${text}`)
  })

  const approvalEvents: ApprovalEvent[] = []

  try {
    await client.connect(transport)

    const tools = await client.listTools()
    const toolNames = new Set(tools.tools.map(tool => tool.name))
    const requiredTools = [
      'desktop_ensure_chrome',
      'desktop_observe',
      'desktop_click_target',
      'desktop_get_state',
      'desktop_list_pending_actions',
      'desktop_approve_pending_action',
    ]

    for (const toolName of requiredTools) {
      assertToolRegistered(toolNames, toolName)
    }

    console.info('=== Phase 1: desktop_ensure_chrome ===')
    const ensureChrome = await resolveApprovalIfNeeded(
      client,
      'desktop_ensure_chrome',
      await client.callTool({
        name: 'desktop_ensure_chrome',
        arguments: { url: smokeUrl },
      }),
      approvalEvents,
    )
    const ensureChromeData = requireStructuredContent(ensureChrome, 'desktop_ensure_chrome')
    const initialEnsureOutcome = typeof ensureChromeData.ensureOutcome === 'string'
      ? ensureChromeData.ensureOutcome
      : undefined
    if (!initialEnsureOutcome) {
      throw new Error('desktop_ensure_chrome missing structuredContent.ensureOutcome')
    }

    console.info('=== Phase 1b: desktop_ensure_chrome reuse check ===')
    const ensureChromeReuse = await resolveApprovalIfNeeded(
      client,
      'desktop_ensure_chrome',
      await client.callTool({
        name: 'desktop_ensure_chrome',
        arguments: { url: smokeUrl },
      }),
      approvalEvents,
    )
    const ensureChromeReuseData = requireStructuredContent(ensureChromeReuse, 'desktop_ensure_chrome reuse')
    const reuseEnsureOutcome = typeof ensureChromeReuseData.ensureOutcome === 'string'
      ? ensureChromeReuseData.ensureOutcome
      : undefined
    if (reuseEnsureOutcome !== 'reused') {
      throw new Error(`desktop_ensure_chrome reuse check expected ensureOutcome=reused, got ${reuseEnsureOutcome ?? 'missing'}`)
    }

    if (settleMs > 0)
      await delay(settleMs)

    console.info('=== Phase 2: desktop_observe until chrome_dom is ready ===')
    const {
      observationText: observeText,
      runState: preClickState,
      overlayState: preClickOverlayState,
      candidate: selectedCandidate,
    } = await waitForChromeDomSmokeCandidate(
      client,
      requestedCandidateId,
      chromeDomTimeoutMs,
      chromeDomRetryIntervalMs,
    )
    requireChromeDomSmokeCandidate(selectedCandidate)
    const browserDomRouteExpected = shouldExpectBrowserDomRoute(preClickState)

    console.info('=== Phase 3: desktop_click_target ===')
    const clickTarget = await resolveApprovalIfNeeded(
      client,
      'desktop_click_target',
      await client.callTool({
        name: 'desktop_click_target',
        arguments: {
          candidateId: selectedCandidate.id,
          button: 'left',
          clickCount: 1,
        },
      }),
      approvalEvents,
    )
    requireTextContent(clickTarget, 'desktop_click_target')

    console.info('=== Phase 4: desktop_get_state after click ===')
    const postClickState = requireRunState(await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    }), 'desktop_get_state')
    const postClickOverlayState = requirePostClickOverlayState(postClickState, selectedCandidate.id)
    const clickStructured = requireStructuredContent(clickTarget, 'desktop_click_target')
    const clickBackendResult = isRecord(clickStructured.backendResult)
      ? clickStructured.backendResult as Record<string, unknown>
      : undefined
    const clickExecutionRoute = typeof clickBackendResult?.executionRoute === 'string'
      ? clickBackendResult.executionRoute
      : undefined
    const clickRouteReason = typeof clickBackendResult?.routeReason === 'string'
      ? clickBackendResult.routeReason
      : undefined

    if (!clickExecutionRoute) {
      throw new Error('desktop_click_target missing backendResult.executionRoute')
    }

    if (browserDomRouteExpected && selectedCandidate.source === 'chrome_dom' && !clickExecutionRoute.startsWith('browser_dom')) {
      throw new Error(`expected chrome_dom candidate to route through browser_dom, got ${clickExecutionRoute}`)
    }

    return {
      ok: true,
      toolChain: [
        'desktop_ensure_chrome',
        'desktop_observe',
        'desktop_get_state',
        'desktop_click_target',
        'desktop_get_state',
      ],
      ensureChrome: ensureChromeData,
      ensureChromeReuse: ensureChromeReuseData,
      initialEnsureOutcome,
      reuseEnsureOutcome,
      observeSummary: observeText.split('\n').slice(0, 8),
      selectedCandidate,
      preClickOverlayState,
      browserDomRouteExpected,
      postClickOverlayState,
      clickExecutionRoute,
      clickRouteReason,
      approvalEvents,
    }
  }
  finally {
    await client.close().catch(() => {})
  }
}

const invokedPath = argv[1] ? pathToFileURL(argv[1]).href : undefined

if (invokedPath === import.meta.url) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.info(`Usage:
  pnpm -F @proj-airi/computer-use-mcp smoke:desktop-v3

Environment:
  COMPUTER_USE_DESKTOP_V3_SMOKE_URL            Target URL. Defaults to an inline data: smoke page.
  COMPUTER_USE_DESKTOP_V3_SMOKE_CANDIDATE_ID   Optional candidate id override from desktop_observe.
  COMPUTER_USE_DESKTOP_V3_SMOKE_SETTLE_MS      Delay after desktop_ensure_chrome. Default: 750.
  COMPUTER_USE_DESKTOP_V3_CHROME_DOM_TIMEOUT_MS Wait for chrome_dom candidate readiness. Default: 15000.
  COMPUTER_USE_DESKTOP_V3_CHROME_DOM_RETRY_INTERVAL_MS Retry interval for observe/get_state while waiting for chrome_dom. Default: 500.
  COMPUTER_USE_SMOKE_EXECUTOR                  Executor override. Default: macos-local.
  COMPUTER_USE_SMOKE_APPROVAL_MODE             Approval mode override. Default: actions.
`)
    exit(0)
  }

  runDesktopV3Smoke()
    .then((result) => {
      console.info(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error))
      exit(1)
    })
}
