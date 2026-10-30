import type { TracePresetDefinition } from '@proj-airi/trace-kit'
import type { TimelineState, TraceIndexes } from '@proj-airi/trace-kit/projections'
import type { Ref } from 'vue'

import { presetMatches } from '@proj-airi/trace-kit/views'
import { computed, ref, watch } from 'vue'

import { buildEntityLanes, sessionSummary } from '../models/entity-lanes'
import { buildRows } from '../models/timeline-model'

export interface TracerViewSource {
  /** The timeline state. The reader mutates it in place, so `version` tells when it changed. */
  state: Ref<TimelineState>
  indexes: () => TraceIndexes
  /** Changes when the projections change. */
  version: Ref<number>
  locale: Ref<string>
}

/**
 * What the timeline shows of a trace: the view preset, the hidden tracks, the entity lanes, the collapsed lanes, and the
 * detail rows of each lane.
 *
 * The IO tracer and its stories share it, so a story shows the lanes and rows that the tracer shows.
 *
 * State: the preset, the visibility that the user set on single tracks, the collapsed lanes, and `hideEmpty`. A new
 * preset drops the single-track choices.
 */
export function useTracerView(source: TracerViewSource) {
  const { state, version, locale } = source
  /** The key of the active view preset, or empty for every track. */
  const presetKey = ref('')
  /** Visibility that the user set on single tracks. It overrides the preset until the preset changes. */
  const overrides = ref(new Map<string, boolean>())
  /** Lanes whose detail rows hide. A lane shows its rows until the user collapses it. */
  const collapsed = ref(new Set<string>())
  /** Tracks without records fold into one short row. */
  const hideEmpty = ref(true)

  const presets = computed(() => {
    void version.value
    const result: TracePresetDefinition[] = []
    for (const [key, data] of state.value.definitions) {
      if (key.startsWith('preset/'))
        result.push(data as TracePresetDefinition)
    }
    return result
  })

  const preset = computed(() => presets.value.find(candidate => candidate.key === presetKey.value))

  watch(presetKey, () => {
    overrides.value = new Map()
  })

  /** Track paths that the view hides: the tracks that the preset does not match, then the user's own choices. */
  const hiddenTracks = computed(() => {
    void version.value
    const hidden = new Set<string>()
    for (const path of state.value.tracks.keys()) {
      const visible = overrides.value.get(path) ?? presetMatches(preset.value, path)
      if (!visible)
        hidden.add(path)
    }
    return hidden
  })

  function setVisibility(paths: string[], visible: boolean) {
    const next = new Map(overrides.value)
    for (const path of paths)
      next.set(path, visible)
    overrides.value = next
  }

  /**
   * Every lane with every track, so a hidden track keeps its label. The segments, connectors, and running state come
   * from the visible tracks only. A lane keeps the color that it has with every track, so hiding one moves no color.
   */
  const entities = computed(() => {
    void version.value
    const all = buildEntityLanes(state.value, source.indexes())
    if (hiddenTracks.value.size === 0)
      return all
    const visible = buildEntityLanes(state.value, source.indexes(), hiddenTracks.value)
    const visibleLanes = new Map(visible.lanes.map(lane => [lane.key, lane]))
    return {
      connectors: visible.connectors,
      lanes: all.lanes.map((lane) => {
        const shown = visibleLanes.get(lane.key)
        return { ...lane, segments: shown?.segments ?? [], running: shown?.running ?? false, failed: shown?.failed ?? false }
      }),
    }
  })

  function toggleLane(key: string) {
    const next = new Set(collapsed.value)
    if (next.has(key))
      next.delete(key)
    else
      next.add(key)
    collapsed.value = next
  }

  const details = computed(() => {
    void version.value
    const result = new Map<string, ReturnType<typeof buildRows>>()
    for (const lane of entities.value.lanes) {
      if (!collapsed.value.has(lane.key))
        result.set(lane.key, buildRows(state.value, { tracks: lane.tracks, groupLabels: false, locale: locale.value, hideEmpty: hideEmpty.value, hidden: hiddenTracks.value }))
    }
    return result
  })

  const summary = computed(() => sessionSummary(state.value, entities.value.lanes.filter(lane => lane.segments.length > 0)))

  return { presetKey, presets, hiddenTracks, setVisibility, entities, collapsed, toggleLane, hideEmpty, details, summary }
}
