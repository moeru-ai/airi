import { createTransportFetch } from '@proj-airi/ai-transport'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { setAITransportFetch } from '@proj-airi/stage-ui/libs/ai-transport'
import { shallowRef } from 'vue'

import { aiTransportCancel, aiTransportEnabledChanged, aiTransportGetEnabled, aiTransportRead, aiTransportSetEnabled, aiTransportStart } from '../../shared/eventa/ai-transport'

export const aiProxyEnabled = shallowRef(false)
export const aiProxyAvailable = shallowRef(false)

/** Loads the device setting before AI consumers mount. Failed initialization blocks HTTP until the host recovers. */
export async function initializeAITransport() {
  const start = useElectronEventaInvoke(aiTransportStart)
  const read = useElectronEventaInvoke(aiTransportRead)
  const cancel = useElectronEventaInvoke(aiTransportCancel)
  const proxyFetch = createTransportFetch({
    start: request => start(request, { signal: AbortSignal.timeout(125_000) }),
    read: id => read(id, { signal: AbortSignal.timeout(125_000) }),
    cancel: id => cancel(id, { signal: AbortSignal.timeout(5000) }),
  })
  const apply = (enabled: boolean) => {
    aiProxyEnabled.value = enabled
    aiProxyAvailable.value = true
    setAITransportFetch(enabled ? proxyFetch : (...args) => globalThis.fetch(...args))
  }
  const context = getElectronEventaContext()
  let updated = false
  context.on(aiTransportEnabledChanged, ({ body }) => {
    if (body === undefined)
      return
    updated = true
    apply(body)
  })
  setAITransportFetch(async () => {
    throw new Error('AI request proxy state is unavailable.')
  })
  try {
    const enabled = await useElectronEventaInvoke(aiTransportGetEnabled)(undefined, { signal: AbortSignal.timeout(5000) })
    if (!updated)
      apply(enabled)
  }
  catch {
    aiProxyAvailable.value = false
  }
}

/** Persists through the main process, which broadcasts the committed value to every desktop window. */
export async function setAIProxyEnabled(enabled: boolean) {
  await useElectronEventaInvoke(aiTransportSetEnabled)(enabled, { signal: AbortSignal.timeout(5000) })
}
