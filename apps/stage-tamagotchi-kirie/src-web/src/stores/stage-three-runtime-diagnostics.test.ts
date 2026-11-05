import { describe, expect, it } from 'vitest'

import {
  applyHitTestTracePayload,
  applySnapshotRecord,
  applyThreeRenderTracePayload,
  applyVrmUpdateTracePayload,
  createDefaultStageHitTestDiagnostics,
  createDefaultStageResourceSnapshotDiagnostics,
  createDefaultStageThreeRenderDiagnostics,
  createDefaultStageVrmUpdateDiagnostics,
  pushTraceHistory,
  TRACE_HISTORY_LIMIT,
} from './stage-three-runtime-diagnostics'

describe('stage three runtime diagnostics helpers', () => {
  it('aggregates three render payloads', () => {
    const next = applyThreeRenderTracePayload(createDefaultStageThreeRenderDiagnostics(), {
      drawCalls: 12,
      geometries: 8,
      lines: 3,
      points: 2,
      textures: 5,
      triangles: 144,
      ts: 10,
    })

    expect(next.renderCount).toBe(1)
    expect(next.drawCalls).toBe(12)
    expect(next.points).toBe(2)
    expect(next.lines).toBe(3)
    expect(next.triangles).toBe(144)
  })

  it('aggregates vrm update and hit-test payloads', () => {
    const vrmUpdate = applyVrmUpdateTracePayload(createDefaultStageVrmUpdateDiagnostics(), {
      animationMixerMs: 1,
      blinkAndSaccadeMs: 2,
      deltaMs: 16.7,
      durationMs: 9.5,
      emoteMs: 3,
      expressionMs: 4,
      humanoidMs: 5,
      lipSyncMs: 6,
      lookAtMs: 7,
      springBoneMs: 8,
      nodeConstraintMs: 16.7,
      ts: 20,
      vrmFrameHookMs: 9,
      vrmRuntimeHookMs: 10,
    })

    const hitTest = applyHitTestTracePayload(createDefaultStageHitTestDiagnostics(), {
      durationMs: 4.5,
      radius: 25,
      readHeight: 20,
      readWidth: 30,
      ts: 30,
    })

    expect(vrmUpdate.frameCount).toBe(1)
    expect(vrmUpdate.totalMs).toBe(9.5)
    expect(vrmUpdate.springBoneMs).toBe(8)
    expect(vrmUpdate.vrmRuntimeHookMs).toBe(10)
    expect(hitTest.readCount).toBe(1)
    expect(hitTest.totalDurationMs).toBe(4.5)
    expect(hitTest.lastReadWidth).toBe(30)
  })

  it('keeps resource snapshot history bounded', () => {
    let history: ReturnType<typeof createDefaultStageResourceSnapshotDiagnostics>['history'] = []
    for (let index = 0; index < TRACE_HISTORY_LIMIT + 4; index += 1) {
      history = pushTraceHistory(history, {
        phase: 'after-load',
        ts: index,
      })
    }

    expect(history).toHaveLength(TRACE_HISTORY_LIMIT)
    expect(history[0]?.ts).toBe(4)

    const snapshots = applySnapshotRecord(createDefaultStageResourceSnapshotDiagnostics(), {
      phase: 'before-dispose',
      ts: 99,
    })

    expect(snapshots.lastBeforeDispose?.ts).toBe(99)
    expect(snapshots.history).toHaveLength(1)
  })
})
