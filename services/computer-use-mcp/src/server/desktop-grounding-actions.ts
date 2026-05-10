import type { ExecutorActionResult } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { errorMessageFrom } from '@moeru/std'

import { appNamesMatch } from '../app-aliases'
import { decideBrowserAction } from '../browser-action-router'
import { getUnsupportedBrowserDomActions, isBrowserDomActionSupported } from '../browser-dom/capabilities'
import { resolveSnapByCandidate } from '../snap-resolver'
import { sleep } from '../utils/sleep'
import { decideDesktopExecutionMode } from './desktop-scheduler'

const DESKTOP_CLICK_SNAPSHOT_MAX_AGE_MS = 5000

export interface DesktopClickTargetExecution {
  summary: string
  backendResult: Record<string, unknown>
}

export async function executeDesktopClickTarget(
  runtime: ComputerUseServerRuntime,
  input: {
    candidateId: string
    clickCount?: number
    button?: 'left' | 'right' | 'middle'
  },
): Promise<DesktopClickTargetExecution> {
  const { candidateId, clickCount, button } = input
  const state = runtime.stateManager.getState()

  if (!state.lastGroundingSnapshot) {
    throw new Error('No desktop_observe snapshot available. Call desktop_observe first to get a list of target candidates.')
  }

  const snapshot = state.lastGroundingSnapshot

  if (state.lastClickedCandidateId === candidateId) {
    throw new Error(`You already clicked candidate "${candidateId}" without calling desktop_observe again. Call desktop_observe to refresh the state before clicking the same target.`)
  }

  const snapshotAge = Date.now() - new Date(snapshot.capturedAt).getTime()
  if (snapshotAge > DESKTOP_CLICK_SNAPSHOT_MAX_AGE_MS) {
    throw new Error(`Grounding snapshot "${snapshot.snapshotId}" is ${Math.round(snapshotAge / 1000)}s old. Call desktop_observe to get a fresh snapshot before clicking.`)
  }

  const snap = resolveSnapByCandidate(candidateId, snapshot)
  if (snap.source === 'none' && !snap.candidateId) {
    throw new Error(`Candidate "${candidateId}" not found in snapshot "${snapshot.snapshotId}". Available candidates: ${snapshot.targetCandidates.map(c => c.id).join(', ')}`)
  }

  const candidate = snapshot.targetCandidates.find(c => c.id === candidateId)
  const intent = {
    mode: 'execute' as const,
    candidateId,
    rawPoint: snap.rawPoint,
    snappedPoint: snap.snappedPoint,
    source: snap.source,
    confidence: candidate?.confidence ?? 0,
    path: [
      { x: snap.snappedPoint.x, y: snap.snappedPoint.y, delayMs: 0 },
    ],
    phase: 'executing' as const,
  }

  runtime.stateManager.updatePointerIntent(intent)

  let executionRoute = 'os_input'
  let routeNote = ''
  let routeReason = 'candidate not found'
  let osInputResult: ExecutorActionResult | undefined
  let executionMode: 'background' | 'browser_surface' | 'foreground' = 'foreground'
  let executionModeReason = 'desktop_click_target uses native input and needs foreground access'
  let fallbackForegroundApp: string | undefined

  const executeOsClick = async () => {
    const result = await runtime.executor.click({
      x: snap.snappedPoint.x,
      y: snap.snappedPoint.y,
      button: button || 'left',
      clickCount: clickCount ?? 1,
      pointerTrace: intent.path,
    })
    runtime.session.setPointerPosition({ x: snap.snappedPoint.x, y: snap.snappedPoint.y })
    return result
  }

  const ensureForegroundForOsInput = async () => {
    const sessionCtrl = runtime.desktopSessionController
    const activeSession = sessionCtrl.getSession()
    if (!activeSession?.controlledApp) {
      const candidateApp = candidate?.appName?.trim()
      if (!candidateApp || candidateApp === 'unknown') {
        throw new Error('desktop_click_target cannot fall back to OS input without a controlled app session or a concrete target app.')
      }

      const currentForeground = await runtime.executor.getForegroundContext()
      if (currentForeground.available && currentForeground.appName === candidateApp) {
        fallbackForegroundApp = candidateApp
        return
      }

      await runtime.executor.focusApp({ app: candidateApp })
      fallbackForegroundApp = candidateApp
      await sleep(200)
      return
    }

    if (!appNamesMatch(candidate?.appName, activeSession.controlledApp)) {
      throw new Error(`desktop_click_target rejected cross-app fallback: candidate "${candidate?.appName ?? 'unknown'}" does not match controlled app "${activeSession.controlledApp}".`)
    }

    const currentForeground = await runtime.executor.getForegroundContext()
    const wasAlreadyInFront = await sessionCtrl.ensureControlledAppInForeground({
      currentForeground,
      chromeSessionManager: runtime.chromeSessionManager,
      activateApp: async (appName) => {
        await runtime.executor.focusApp({ app: appName })
      },
    })
    fallbackForegroundApp = activeSession.controlledApp
    if (!wasAlreadyInFront) {
      await sleep(200)
    }
    sessionCtrl.touch()
  }

  try {
    const bridgeConnected = runtime.browserDomBridge?.getStatus().connected ?? false
    const routeDecision = candidate
      ? decideBrowserAction(candidate, bridgeConnected, button, clickCount)
      : { route: 'os_input' as const, reason: 'candidate not found' }

    const schedulingDecision = decideDesktopExecutionMode({
      action: { kind: 'desktop_click_target', input },
      browserSurface: runtime.stateManager.getState().browserSurfaceAvailability,
      browserDomRoute: routeDecision.route === 'browser_dom',
    })
    if (routeDecision.route === 'browser_dom') {
      executionMode = schedulingDecision.executionMode
      executionModeReason = schedulingDecision.executionReason
    }

    executionRoute = routeDecision.route
    routeReason = routeDecision.reason

    if (routeDecision.route === 'browser_dom' && routeDecision.selector) {
      const requiredActions = routeDecision.bridgeMethod === 'checkCheckbox'
        ? ['checkCheckbox']
        : ['getClickTarget', 'clickAt']

      if (!isBrowserDomActionSupported(runtime.browserDomBridge, ...requiredActions)) {
        executionRoute = 'os_input'
        routeReason = `browser-dom extension transport does not support ${requiredActions.join(' + ')}`
        routeNote = `browser-dom ${routeDecision.bridgeMethod ?? 'click'} is unavailable on the connected extension transport (${getUnsupportedBrowserDomActions(runtime.browserDomBridge, ...requiredActions).join(', ')} unsupported), fell back to OS input`
        executionMode = 'foreground'
        executionModeReason = 'browser_dom is unavailable, so native input fallback needs foreground access'
        await ensureForegroundForOsInput()
        routeNote = routeNote
          ? `${routeNote}; focused ${fallbackForegroundApp ?? 'target app'} before OS input fallback`
          : `focused ${fallbackForegroundApp ?? 'target app'} before OS input fallback`
        osInputResult = await executeOsClick()
      }
      else {
        try {
          const frameIds = routeDecision.frameId !== undefined ? [routeDecision.frameId] : undefined
          if (routeDecision.bridgeMethod === 'checkCheckbox') {
            await runtime.browserDomBridge.checkCheckbox({
              selector: routeDecision.selector,
              frameIds,
            })
          }
          else {
            await runtime.browserDomBridge.clickSelector({
              selector: routeDecision.selector,
              frameIds,
            })
          }
        }
        catch (browserError) {
          executionRoute = 'os_input'
          routeNote = `browser-dom ${routeDecision.bridgeMethod ?? 'click'} failed (${errorMessageFrom(browserError) ?? 'unknown error'}), fell back to OS input`
          executionMode = 'foreground'
          executionModeReason = 'browser_dom failed, so native input fallback needs foreground access'
          await ensureForegroundForOsInput()
          routeNote = `${routeNote}; focused ${fallbackForegroundApp ?? 'target app'} before OS input fallback`
          osInputResult = await executeOsClick()
        }
      }
    }
    else {
      executionMode = schedulingDecision.executionMode
      executionModeReason = schedulingDecision.executionReason
      await ensureForegroundForOsInput()
      osInputResult = await executeOsClick()
    }

    const completedIntent = {
      ...intent,
      phase: 'completed' as const,
      executionResult: routeNote ? 'fallback' as const : 'success' as const,
      executionRoute: `${executionRoute} (${routeReason})`,
    }
    runtime.stateManager.updatePointerIntent(completedIntent, candidateId)

    const candidateDesc = candidate ? `${candidate.source} ${candidate.role} "${candidate.label}"` : candidateId
    const lines = [
      `Clicked: ${candidateDesc}`,
      `  Snap: ${snap.reason}`,
      `  Point: (${snap.snappedPoint.x}, ${snap.snappedPoint.y})`,
      `  Route: ${executionRoute} (${routeReason})`,
      `  Execution mode: ${executionMode} (${executionModeReason})`,
      `  Button: ${button || 'left'}, clicks: ${clickCount ?? 1}`,
    ]

    if (routeNote) {
      lines.push(`  ⚠ ${routeNote}`)
    }

    if (snap.reason.includes('stale')) {
      lines.push('  ⚠ WARNING: Target source is stale. Consider calling desktop_observe again.')
    }

    return {
      summary: lines.join('\n'),
      backendResult: {
        candidateId,
        snapshotId: snapshot.snapshotId,
        snap,
        candidate,
        executionRoute,
        routeReason,
        executionMode,
        executionModeReason,
        routeNote: routeNote || undefined,
        osInputResult,
      },
    }
  }
  catch (error) {
    const failedIntent = {
      ...intent,
      phase: 'completed' as const,
      executionResult: 'error' as const,
      executionRoute: `${executionRoute} (${routeReason})`,
    }
    runtime.stateManager.updatePointerIntent(failedIntent)
    throw error
  }
}
