import type { getElectronEventaContext } from '@proj-airi/electron-vueuse'

import type { DebugTracingState } from '../../shared/eventa'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { configureDebugTracing } from '@proj-airi/stage-ui/composables/use-io-tracer'

import { debugTracingChanged, debugTracingGet } from '../../shared/eventa'

const log = useLogg('debug-tracing:renderer').useGlobalConfig()
type EventContext = ReturnType<typeof getElectronEventaContext>

async function applyState(state: DebugTracingState): Promise<void> {
  const connection = state.enabled
    ? { endpoint: state.endpoint, token: state.token }
    : undefined
  await configureDebugTracing(connection)
}

function requireState(state: DebugTracingState | undefined): DebugTracingState {
  if (!state)
    throw new Error('The main process returned no debug tracing state.')
  return state
}

export function initializeDebugTracingBridge(context: EventContext): () => void {
  let disposed = false
  const apply = async (state: DebugTracingState) => {
    if (!disposed)
      await applyState(state)
  }
  const stopStateListener = context.on(debugTracingChanged, event => void apply(requireState(event.body)).catch(error => log.withError(error).error('Failed to apply debug tracing state')))
  void defineInvoke(context, debugTracingGet)()
    .then(state => apply(requireState(state)))
    .catch(error => log.withError(error).error('Failed to load debug tracing state'))

  return () => {
    disposed = true
    stopStateListener()
  }
}
