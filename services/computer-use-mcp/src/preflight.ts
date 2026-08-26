import type {
  ComputerUseConfig,
  CoordinateSpaceInfo,
  DisplayInfo,
  ExecutionTarget,
  LastScreenshotInfo,
  LaunchContext,
} from './types'

import { buildCoordinateSpaceInfo, resolveLaunchContext } from './runtime-probes'

function getScreenshotBindingIssue(params: {
  config: ComputerUseConfig
  lastScreenshot?: LastScreenshotInfo
  executionTarget: ExecutionTarget
}) {
  if (!params.lastScreenshot) {
    return 'capture a fresh screenshot before mutating the remote desktop'
  }

  if (params.executionTarget.mode !== params.lastScreenshot.executionTargetMode) {
    return 'the latest screenshot was captured from a different execution target mode'
  }

  if (params.executionTarget.hostName !== params.lastScreenshot.sourceHostName) {
    return 'the latest screenshot was captured on a different remote host'
  }

  if (params.executionTarget.displayId !== params.lastScreenshot.sourceDisplayId) {
    return 'the latest screenshot was captured from a different remote display'
  }

  if (params.config.sessionTag && params.config.sessionTag !== params.lastScreenshot.sourceSessionTag) {
    return 'the latest screenshot was captured from a different remote session tag'
  }

  return undefined
}

export interface RuntimePreflight {
  launchContext: LaunchContext
  coordinateSpace: CoordinateSpaceInfo
  blockingIssues: string[]
  mutationReadinessIssues: string[]
}

export function getRuntimePreflight(params: {
  config: ComputerUseConfig
  lastScreenshot?: LastScreenshotInfo
  displayInfo: DisplayInfo
  executionTarget: ExecutionTarget
}): RuntimePreflight {
  const launchContext = resolveLaunchContext(params.config)
  const coordinateSpace = buildCoordinateSpaceInfo({
    config: params.config,
    lastScreenshot: params.lastScreenshot,
    displayInfo: params.displayInfo,
  })

  const blockingIssues: string[] = []
  if (params.config.executor === 'linux-x11') {
    if (params.executionTarget.mode !== 'remote') {
      blockingIssues.push('desktop tools require a remote linux-x11 execution target')
    }

    if (params.config.requireSessionTagForMutatingActions && !params.config.sessionTag) {
      blockingIssues.push('COMPUTER_USE_SESSION_TAG is required before remote execution is allowed')
    }
    else if (params.config.sessionTag && params.executionTarget.sessionTag !== params.config.sessionTag) {
      blockingIssues.push(`remote sessionTag ${params.executionTarget.sessionTag || 'missing'} does not match expected ${params.config.sessionTag}`)
    }

    if (params.config.requireAllowedBoundsForMutatingActions && !params.config.allowedBounds) {
      blockingIssues.push('COMPUTER_USE_ALLOWED_BOUNDS must be configured before remote execution is allowed')
    }
    else if (params.config.allowedBounds && params.displayInfo.available) {
      if (params.displayInfo.logicalWidth !== params.config.allowedBounds.width || params.displayInfo.logicalHeight !== params.config.allowedBounds.height) {
        blockingIssues.push(`remote display ${params.displayInfo.logicalWidth || '?'}x${params.displayInfo.logicalHeight || '?'} does not match allowed bounds ${params.config.allowedBounds.width}x${params.config.allowedBounds.height}`)
      }
    }
  }

  const mutationReadinessIssues = [...blockingIssues]
  if (params.config.executor === 'linux-x11') {
    if (params.executionTarget.tainted) {
      mutationReadinessIssues.push('remote runner session is tainted; capture a fresh screenshot before resuming mutations')
    }

    const screenshotBindingIssue = getScreenshotBindingIssue({
      config: params.config,
      lastScreenshot: params.lastScreenshot,
      executionTarget: params.executionTarget,
    })
    if (screenshotBindingIssue) {
      mutationReadinessIssues.push(screenshotBindingIssue)
    }

    if (params.config.requireCoordinateAlignmentForMutatingActions && !coordinateSpace.readyForMutations) {
      mutationReadinessIssues.push(coordinateSpace.reason)
    }
  }

  return {
    launchContext,
    coordinateSpace,
    blockingIssues,
    mutationReadinessIssues,
  }
}
