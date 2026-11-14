import type { artistryConfigSchema } from '../../../configs/artistry'
import type { Config } from '../../../libs/electron/persistence'
import type { WidgetsWindowManager } from '../../../windows/widgets'

import { randomUUID } from 'node:crypto'

import { injeca } from 'injeca'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { artistryProviders, setupArtistryBridge } from './artistry-bridge'

const globals = {
  openaiImageApiKey: 'image-key',
  openaiImageBaseUrl: 'https://example.com/v1/',
  openaiImageWidth: '1024',
  openaiImageHeight: '1024',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] })))
})

afterEach(() => {
  artistryProviders.get('openai-image')?.dispose?.()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function setupWidget() {
  const id = randomUUID()
  const artistryConfig = {
    setup: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    getDiagnostics: vi.fn(),
  } satisfies Config<typeof artistryConfigSchema>
  vi.spyOn(injeca, 'resolve').mockResolvedValue({ config: artistryConfig })
  const updateWidget = vi.fn<WidgetsWindowManager['updateWidget']>()
  const widgetsManager: WidgetsWindowManager = {
    clearWidgets: vi.fn(),
    getWindow: vi.fn(),
    getWidgetSnapshot: vi.fn<WidgetsWindowManager['getWidgetSnapshot']>(() => ({ id, componentName: 'artistry', componentProps: {}, alwaysOnTop: true, size: 's', ttlMs: 0 })),
    hideWindow: vi.fn(),
    onWidgetEvent: vi.fn(),
    openWindow: vi.fn(),
    prepareWidgetWindow: vi.fn(),
    publishWidgetEvent: vi.fn(),
    publishWidgetIframeRequestResult: vi.fn(),
    pushWidget: vi.fn(async () => id),
    removeWidget: vi.fn(),
    requestWidgetIframe: vi.fn(),
    updateWidget,
  }
  await setupArtistryBridge({ widgetsManager, artistryConfig })
  return { id, widgetsManager, updateWidget }
}

describe('artistry widget bridge', () => {
  // ROOT CAUSE:
  // Initialization outside the error handler left widgets generating and blocked identical retries. The handler now covers initialization.
  it.each([
    { openaiImageApiKey: '' },
    { openaiImageBaseUrl: 'invalid-url' },
  ])('reports initialization failure and permits the same prompt after correction: %o', async (invalid) => {
    const { id, widgetsManager, updateWidget } = await setupWidget()
    const componentProps = {
      status: 'generating',
      prompt: 'A small cat.',
      _artistryConfig: { provider: 'openai-image', globals: { ...globals, ...invalid } },
    }
    await expect(widgetsManager.pushWidget({ id, componentName: 'artistry', componentProps })).resolves.toBe(id)
    expect(updateWidget).toHaveBeenCalledWith({
      id,
      componentProps: { status: 'error', actionLabel: expect.any(String) },
    })
    expect(fetch).not.toHaveBeenCalled()

    await widgetsManager.updateWidget({
      id,
      componentProps: { ...componentProps, _artistryConfig: { provider: 'openai-image', globals } },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(updateWidget).toHaveBeenLastCalledWith(expect.objectContaining({
      componentProps: expect.objectContaining({ status: 'done' }),
    }))
  })

  // ROOT CAUSE:
  // Widget dimensions reached only extra. The bridge now copies the merged dimensions to the provider's top-level request fields.
  it.each([
    { props: {}, size: '1536x1024' },
    { props: { width: 1024, height: 1536 }, size: '1024x1536' },
    { props: { width: 1024, height: 1536, payload: { width: 2048, height: 1024 } }, size: '2048x1024' },
  ])('forwards dimensions with payload, props, and options precedence: $size', async ({ props, size }) => {
    const { id, widgetsManager } = await setupWidget()
    await widgetsManager.pushWidget({
      id,
      componentName: 'artistry',
      componentProps: {
        status: 'generating',
        prompt: 'A small cat.',
        _artistryConfig: { provider: 'openai-image', globals, options: { width: 1536, height: 1024 } },
        ...props,
      },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body))).toMatchObject({ size })
  })
})
