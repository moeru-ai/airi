import { platform } from 'node:process'

import { describe, expect, it } from 'vitest'

import { getRuntimePreflight } from './preflight'
import {
  createDisplayInfo,
  createLastScreenshot,
  createLocalExecutionTarget,
  createRemoteExecutionTarget,
  createTestConfig,
} from './test-fixtures'

describe('getRuntimePreflight', () => {
  it('denies non-remote execution for linux-x11 tools', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      lastScreenshot: createLastScreenshot(),
      displayInfo: createDisplayInfo(),
      executionTarget: createRemoteExecutionTarget({
        mode: 'dry-run',
        transport: 'local',
      }),
    })

    expect(preflight.blockingIssues).toContain('desktop tools require a remote linux-x11 execution target')
  })

  it('denies mismatched session tags', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      lastScreenshot: createLastScreenshot(),
      displayInfo: createDisplayInfo(),
      executionTarget: createRemoteExecutionTarget({
        sessionTag: 'different-session',
      }),
    })

    expect(preflight.blockingIssues[0]).toContain('does not match expected')
  })

  it('denies display mismatches against allowed bounds', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      lastScreenshot: createLastScreenshot(),
      displayInfo: createDisplayInfo({
        logicalWidth: 1440,
        logicalHeight: 900,
      }),
      executionTarget: createRemoteExecutionTarget(),
    })

    expect(preflight.blockingIssues[0]).toContain('does not match allowed bounds 1280x720')
  })

  it('requires a fresh screenshot after the runner is tainted', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      lastScreenshot: createLastScreenshot(),
      displayInfo: createDisplayInfo(),
      executionTarget: createRemoteExecutionTarget({
        tainted: true,
        note: 'ssh transport closed unexpectedly',
      }),
    })

    expect(preflight.mutationReadinessIssues).toContain('remote runner session is tainted; capture a fresh screenshot before resuming mutations')
  })

  it('allows macos-local execution without remote binding checks', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig({
        executor: 'macos-local',
        requireAllowedBoundsForMutatingActions: false,
        requireCoordinateAlignmentForMutatingActions: false,
        requireSessionTagForMutatingActions: false,
      }),
      displayInfo: createDisplayInfo({
        platform: 'darwin',
      }),
      executionTarget: createLocalExecutionTarget(),
    })

    expect(preflight.blockingIssues).toEqual([])
    expect(preflight.mutationReadinessIssues).toEqual([])
  })

  it('requires a fresh real AUV capture tied to the same visible window', () => {
    const config = createTestConfig({
      executor: 'auv',
      requireSessionTagForMutatingActions: false,
      requireAllowedBoundsForMutatingActions: false,
      requireCoordinateAlignmentForMutatingActions: false,
    })
    const executionTarget = createLocalExecutionTarget({ hostName: 'fixture-host' })
    const foregroundContext = { available: true, appName: 'Game.exe', windowId: 'window-1', ownerPid: 42, platform } as const
    const baseScreenshot = {
      ...createLastScreenshot({
        capturedAt: new Date().toISOString(),
        executionTargetMode: 'local-windowed',
        sourceHostName: 'fixture-host',
        sourceDisplayId: undefined,
        sourceWindowId: 'window-1',
        sourceSessionTag: config.sessionTag,
      }),
    }

    const ready = getRuntimePreflight({
      config,
      lastScreenshot: baseScreenshot,
      displayInfo: createDisplayInfo({
        platform,
        displays: [{
          displayId: 1,
          isMain: true,
          isBuiltIn: false,
          bounds: { x: 0, y: 0, width: 1280, height: 720 },
          visibleBounds: { x: 0, y: 0, width: 1280, height: 720 },
          scaleFactor: 1,
          pixelWidth: 1280,
          pixelHeight: 720,
        }],
        combinedBounds: { x: 0, y: 0, width: 1280, height: 720 },
      }),
      executionTarget,
      foregroundContext,
    })
    expect(ready.mutationReadinessIssues).toEqual([])
    expect(ready.coordinateSpace).toMatchObject({
      readyForMutations: true,
      aligned: true,
      reason: 'AUV screenshot pixels match logical display coordinates',
      allowedBounds: { x: 0, y: 0, width: 1280, height: 720 },
    })

    const switchedWindow = getRuntimePreflight({
      config,
      lastScreenshot: { ...baseScreenshot, sourceWindowId: 'window-2' },
      displayInfo: createDisplayInfo({ platform }),
      executionTarget,
      foregroundContext,
    })
    expect(switchedWindow.mutationReadinessIssues).toContain('the foreground window changed after the latest AUV screenshot; capture the new window before acting')

    const placeholder = getRuntimePreflight({
      config,
      lastScreenshot: { ...baseScreenshot, placeholder: true },
      displayInfo: createDisplayInfo({ platform }),
      executionTarget,
      foregroundContext,
    })
    expect(placeholder.mutationReadinessIssues).toContain('the latest AUV screenshot is a placeholder; capture real pixels before acting')

    const staleScreenshot = getRuntimePreflight({
      config,
      lastScreenshot: { ...baseScreenshot, capturedAt: new Date(Date.now() - 60_001).toISOString() },
      displayInfo: createDisplayInfo({ platform }),
      executionTarget,
      foregroundContext,
    })
    expect(staleScreenshot.mutationReadinessIssues).toContain('the latest AUV screenshot is older than 60 seconds; capture a fresh screenshot before acting')

    const mismatchedGeometry = getRuntimePreflight({
      config,
      lastScreenshot: baseScreenshot,
      displayInfo: createDisplayInfo({
        platform,
        displays: [{
          displayId: 1,
          isMain: true,
          isBuiltIn: false,
          bounds: { x: 0, y: 0, width: 2560, height: 1440 },
          visibleBounds: { x: 0, y: 0, width: 2560, height: 1440 },
          scaleFactor: 1,
          pixelWidth: 2560,
          pixelHeight: 1440,
        }],
        combinedBounds: { x: 0, y: 0, width: 2560, height: 1440 },
      }),
      executionTarget,
      foregroundContext,
    })
    expect(mismatchedGeometry.mutationReadinessIssues).toContain('AUV screenshot 1280x720 does not match logical display 2560x1440')
  })
})
