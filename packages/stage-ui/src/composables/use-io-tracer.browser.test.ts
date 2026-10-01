import { afterEach, expect, it, vi } from 'vitest'

import { configureDebugTracing, onIOSpan, onRemoteIOSpan, startSpan } from './use-io-tracer'

afterEach(() => {
  onIOSpan(undefined)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('enables and disables the debug exporter without replacing local outputs', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array(), {
    headers: { 'content-type': 'application/x-protobuf' },
    status: 200,
  }))
  const localNames: string[] = []
  const remoteNames: string[] = []
  onIOSpan(span => localNames.push(span.name))
  const unsubscribe = onRemoteIOSpan(span => remoteNames.push(span.name))
  try {
    await configureDebugTracing({ endpoint: 'http://127.0.0.1:6122', token: 'test-only' })
    const span = startSpan('recording-with-debug-export')
    span.end()
    expect(localNames).toEqual(['recording-with-debug-export'])
    await expect.poll(() => remoteNames).toEqual(['recording-with-debug-export'])
    await expect.poll(() => fetch).toHaveBeenCalled()

    await configureDebugTracing(undefined)
    const exportedCalls = fetch.mock.calls.length
    const localOnlySpan = startSpan('recording-without-debug-export')
    localOnlySpan.end()
    expect(localNames).toEqual(['recording-with-debug-export', 'recording-without-debug-export'])
    await expect.poll(() => remoteNames).toEqual(['recording-with-debug-export', 'recording-without-debug-export'])
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(fetch).toHaveBeenCalledTimes(exportedCalls)
  }
  finally {
    await configureDebugTracing(undefined)
    unsubscribe()
  }
})
