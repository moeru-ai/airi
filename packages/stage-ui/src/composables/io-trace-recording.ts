import type { IOTraceRecordingState, SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { readonly, shallowRef } from 'vue'

export interface IOTraceRecordingController {
  getState: () => Promise<IOTraceRecordingState>
  getSpans: () => Promise<SerializedIOSpan[]>
  onStateChange: (listener: (state: IOTraceRecordingState) => void) => () => void
  setEnabled: (enabled: boolean) => Promise<IOTraceRecordingState>
}

export type ManagedIOTraceRecordingState = IOTraceRecordingState & { managed: boolean }

const state = shallowRef<ManagedIOTraceRecordingState>({
  capturesDirectory: '',
  enabled: false,
  managed: false,
})

let controller: IOTraceRecordingController | undefined
let controllerGeneration = 0
let stopStateListener: (() => void) | undefined

function applyState(next: IOTraceRecordingState) {
  state.value = { ...next, managed: true }
}

export function getIOTraceRecordingState() {
  return readonly(state)
}

export function hasIOTraceRecordingController() {
  return controller !== undefined
}

export async function configureIOTraceRecordingController(next: IOTraceRecordingController | undefined): Promise<void> {
  const generation = ++controllerGeneration
  stopStateListener?.()
  stopStateListener = undefined
  controller = next

  if (!next) {
    state.value = { capturesDirectory: '', enabled: false, managed: false }
    return
  }

  stopStateListener = next.onStateChange(applyState)
  const initial = await next.getState()
  if (generation === controllerGeneration)
    applyState(initial)
}

export async function setIOTraceRecordingEnabled(enabled: boolean): Promise<IOTraceRecordingState> {
  if (!controller)
    throw new Error('No external IO trace recording controller is configured')

  const next = await controller.setEnabled(enabled)
  applyState(next)
  return next
}

export function getRecordedIOSpans(): Promise<SerializedIOSpan[]> {
  if (!controller)
    return Promise.resolve([])
  return controller.getSpans()
}
