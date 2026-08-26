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
      displayInfo: createDisplayInfo(),
      executionTarget: createRemoteExecutionTarget({
        mode: 'dry-run',
        transport: 'local',
      }),
      lastScreenshot: createLastScreenshot(),
    })

    expect(preflight.blockingIssues).toContain('desktop tools require a remote linux-x11 execution target')
  })

  it('denies mismatched session tags', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      displayInfo: createDisplayInfo(),
      executionTarget: createRemoteExecutionTarget({
        sessionTag: 'different-session',
      }),
      lastScreenshot: createLastScreenshot(),
    })

    expect(preflight.blockingIssues[0]).toContain('does not match expected')
  })

  it('denies display mismatches against allowed bounds', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      displayInfo: createDisplayInfo({
        logicalHeight: 900,
        logicalWidth: 1440,
      }),
      executionTarget: createRemoteExecutionTarget(),
      lastScreenshot: createLastScreenshot(),
    })

    expect(preflight.blockingIssues[0]).toContain('does not match allowed bounds 1280x720')
  })

  it('requires a fresh screenshot after the runner is tainted', () => {
    const preflight = getRuntimePreflight({
      config: createTestConfig(),
      displayInfo: createDisplayInfo(),
      executionTarget: createRemoteExecutionTarget({
        note: 'ssh transport closed unexpectedly',
        tainted: true,
      }),
      lastScreenshot: createLastScreenshot(),
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
})
