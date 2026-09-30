import { afterEach, expect, it, vi } from 'vitest'

import { onIOSpan, onRemoteIOSpan, startSpan } from './use-io-tracer'

afterEach(() => {
  onIOSpan(undefined)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('fans spans out to local, broadcast, and debug exporters', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array(), {
    headers: { 'content-type': 'application/x-protobuf' },
    status: 200,
  }))
  vi.stubEnv('VITE_AIRI_DEBUG_OTLP_ENDPOINT', 'http://127.0.0.1:6122')
  vi.stubEnv('VITE_AIRI_DEBUG_TOKEN', 'test-only')
  const localNames: string[] = []
  const remoteNames: string[] = []
  onIOSpan(span => localNames.push(span.name))
  const unsubscribe = onRemoteIOSpan(span => remoteNames.push(span.name))
  try {
    const span = startSpan('recording-with-debug-export')
    span.end()
    expect(localNames).toEqual(['recording-with-debug-export'])
    await expect.poll(() => remoteNames).toEqual(['recording-with-debug-export'])
    await expect.poll(() => fetch).toHaveBeenCalled()
  }
  finally {
    unsubscribe()
  }
})
