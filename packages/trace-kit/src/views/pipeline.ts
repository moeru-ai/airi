import type { TracePipelineDefinition } from '../core/definitions'
import type { TimelineSpan, TimelineState, TimelineTrack } from '../projections/types'
import type { PipelineNode, StageStatus } from './types'

import { localize, matchTrackPath } from '../core/define'

/**
 * The nodes of a pipeline at time `at`: one node for each stage instance.
 *
 * A stage with a state track takes its latest state at or before `at`. Otherwise it is `busy` while a span is open,
 * `error` when its latest span before `at` ended with an error, and `idle` otherwise.
 */
export function pipelineNodes(state: TimelineState, pipeline: TracePipelineDefinition, at: number, locale: string): PipelineNode[] {
  const nodes: PipelineNode[] = []
  for (const stage of pipeline.stages) {
    const instances = new Map<string, TimelineTrack[]>()
    for (const track of state.tracks.values()) {
      for (const pattern of stage.tracks) {
        const params = matchTrackPath(pattern, track.path)
        if (!params)
          continue
        const instance = Object.values(params)[0] ?? ''
        const list = instances.get(instance) ?? []
        list.push(track)
        instances.set(instance, list)
      }
    }
    if (instances.size === 0)
      instances.set('', [])

    for (const [instance, tracks] of instances) {
      let status: StageStatus = 'idle'
      const open: TimelineSpan[] = []
      let latestEnded: TimelineSpan | undefined
      let latestState: { time: number, value: string } | undefined
      for (const track of tracks) {
        for (const change of track.states) {
          if (change.time <= at && (!latestState || change.time >= latestState.time))
            latestState = change
        }
        for (const span of track.spans) {
          if (span.start > at)
            continue
          if (span.end === undefined || span.end > at) {
            if (!span.abandoned)
              open.push(span)
          }
          else if (!latestEnded || span.end > (latestEnded.end ?? 0)) {
            latestEnded = span
          }
        }
      }
      if (latestState)
        status = latestState.value
      else if (open.length > 0)
        status = 'busy'
      else if (latestEnded?.status === 'error')
        status = 'error'

      nodes.push({ key: `${stage.key}:${instance}`, stage: stage.key, label: localize(stage.label, locale) ?? stage.key, instance: instance || undefined, status, open, observed: tracks.length > 0 })
    }
  }
  return nodes
}
