import { afterEach, expect, it, vi } from 'vitest'

import { onIOSpan, onRemoteIOSpan, startSpan } from './use-io-tracer'

afterEach(() => {
  onIOSpan(undefined)
  vi.unstubAllEnvs()
})

it('keeps local and remote recording usable when the debug endpoint is invalid', async () => {
  vi.stubEnv('VITE_AIRI_DEBUG_OTLP_ENDPOINT', 'not a URL')
  vi.stubEnv('VITE_AIRI_DEBUG_TOKEN', 'test-only')
  const localNames: string[] = []
  const remoteNames: string[] = []
  onIOSpan(span => localNames.push(span.name))
  const unsubscribe = onRemoteIOSpan(span => remoteNames.push(span.name))
  try {
    const span = startSpan('recording-with-invalid-debug-config')
    span.end()
    expect(localNames).toEqual(['recording-with-invalid-debug-config'])
    await expect.poll(() => remoteNames).toEqual(['recording-with-invalid-debug-config'])
  }
  finally {
    unsubscribe()
  }
})
