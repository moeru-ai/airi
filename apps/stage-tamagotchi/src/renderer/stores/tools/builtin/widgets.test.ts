import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import type { WidgetInvokers } from './widgets'

import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { canRenderExtensionUi, sanitizeExtensionUiRenderProps } from '../../../widgets/extension-ui/host'
import { executeWidgetAction, normalizeComponentProps, widgetsTools } from './widgets'

const execFile = promisify(execFileCallback)
const aihubmixApiKey = process.env.AIHUBMIX_API_KEY?.trim() || ''
const hasAihubmixApiKey = Boolean(aihubmixApiKey)
const aihubmixBaseUrl = normalizeBaseUrl(process.env.AIHUBMIX_BASE_URL)
const configuredAihubmixModel = process.env.AIHUBMIX_MODEL?.trim()

interface AihubmixModelListResponse {
  data?: Array<{
    id?: string
  }>
}

interface AihubmixErrorResponse {
  error?: {
    message?: string
    type?: string
    param?: string
    code?: string
  }
}

interface CurlJsonResponse<T> {
  body: T
  status: number
}

function getObjectSchema(schema?: JsonSchema) {
  if (!schema)
    return undefined

  if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object')))
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate): candidate is JsonSchema => Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.type === 'object'))
}

/**
 * Normalizes the configured AIHubMix base URL to a trailing-slash form.
 *
 * Before:
 * - `https://aihubmix.com/v1`
 *
 * After:
 * - `https://aihubmix.com/v1/`
 */
function normalizeBaseUrl(value: string | undefined): string {
  let normalized = value?.trim() || 'https://aihubmix.com/v1/'
  if (!normalized.endsWith('/'))
    normalized += '/'
  return normalized
}

/**
 * Executes one `curl` JSON request and returns both the body and HTTP status.
 *
 * Use when:
 * - The local Node TLS stack fails against the provider but HTTPS requests succeed via `curl`
 * - An env-backed integration test still needs a reproducible provider response
 *
 * Expects:
 * - `curl` is installed in the local environment
 * - The endpoint returns JSON on both success and error paths
 *
 * Returns:
 * - Parsed JSON body plus the HTTP status code
 */
async function runCurlJson<T>(options: {
  body?: string
  headers?: string[]
  method?: 'GET' | 'POST'
  url: string
}): Promise<CurlJsonResponse<T>> {
  // NOTICE:
  // Node `fetch` reaches AIHubMix from this repo environment with `ECONNRESET` before TLS
  // negotiation completes, while `curl` succeeds against the same host and credentials.
  // This test uses `curl` through `execFile` so we can still reproduce the provider-side
  // schema validation error inside Vitest without introducing shell interpolation or
  // hand-managed temporary files.
  const args = [
    '--silent',
    '--show-error',
    '--write-out',
    '\n%{http_code}',
    '--url',
    options.url,
  ]

  for (const header of options.headers ?? []) {
    args.push('--header', header)
  }

  if (options.method) {
    args.push('--request', options.method)
  }

  if (options.body) {
    args.push('--data-raw', options.body)
  }

  const result = await execFile('curl', args, {
    maxBuffer: 1024 * 1024 * 4,
  })
  const output = result.stdout.trimEnd()
  const lastNewlineIndex = output.lastIndexOf('\n')

  if (lastNewlineIndex < 0)
    throw new Error('curl did not emit an HTTP status line.')

  const rawBody = output.slice(0, lastNewlineIndex)
  const rawStatus = output.slice(lastNewlineIndex + 1)
  const status = Number.parseInt(rawStatus, 10)

  if (!Number.isFinite(status))
    throw new Error(`curl emitted an invalid HTTP status: ${rawStatus}`)

  return {
    body: JSON.parse(rawBody) as T,
    status,
  }
}

/**
 * Picks one likely chat-capable model for the local provider repro.
 *
 * Use when:
 * - The env file does not pin `AIHUBMIX_MODEL`
 * - A live schema repro still needs a concrete chat model id
 *
 * Expects:
 * - `/models` returns provider model ids
 *
 * Returns:
 * - A concrete chat model id to use with `/chat/completions`
 */
async function resolveAihubmixModel(): Promise<string> {
  if (configuredAihubmixModel)
    return configuredAihubmixModel

  const response = await runCurlJson<AihubmixModelListResponse>({
    url: new URL('models', aihubmixBaseUrl).toString(),
    headers: [
      `Authorization: Bearer ${aihubmixApiKey}`,
    ],
  })
  expect(response.status).toBe(200)

  const modelIds = (response.body.data ?? [])
    .map(entry => entry.id?.trim())
    .filter((value): value is string => Boolean(value))

  const preferredModel = [
    'gpt-4o-mini',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
  ].find(candidate => modelIds.includes(candidate))

  if (preferredModel)
    return preferredModel

  const fallbackModel = modelIds.find(model =>
    ['embed', 'embedding', 'tts', 'whisper', 'rerank'].every(fragment => !model.toLowerCase().includes(fragment)),
  )

  if (!fallbackModel)
    throw new Error('Unable to resolve an AIHubMix chat model. Set AIHUBMIX_MODEL in .env.local.')

  return fallbackModel
}

/**
 * Builds the exact `stage_widgets` tool schema AIRI sends to the provider.
 *
 * Use when:
 * - The integration test needs to prove the live provider sees the same tool schema as AIRI
 *
 * Expects:
 * - `widgetsTools()` resolves in the Vitest Node runtime
 *
 * Returns:
 * - The `stage_widgets` tool definition
 */
async function getStageWidgetsTool(): Promise<Tool> {
  const tools = await widgetsTools()
  const stageWidgets = tools.find(tool => tool.function.name === 'stage_widgets')

  if (!stageWidgets)
    throw new Error('Unable to resolve the stage_widgets tool definition.')

  return stageWidgets
}

describe('widgets tool helpers', () => {
  describe('provider-facing schema reproduction', () => {
    it('uses a provider-safe windowSize schema for strict tool validation', async () => {
      const stageWidgetsTool = await getStageWidgetsTool()
      const schema = stageWidgetsTool.function.parameters as JsonSchema
      const windowSize = getObjectSchema(schema.properties?.windowSize as JsonSchema | undefined)

      // ROOT CAUSE:
      //
      // OpenAI-compatible providers that enforce strict tool schemas require object
      // schemas to list every property key in `required`, even when the caller thinks
      // some nested fields are optional.
      //
      // The fixed provider-facing schema keeps the root `windowSize` field required and
      // nullable, then requires every nested key while allowing optional constraints to
      // be expressed as `number | null`. That preserves the runtime behavior while
      // satisfying strict tool validators that compare `required` against `properties`.
      expect(windowSize).toBeDefined()
      expect(windowSize?.additionalProperties).toBe(false)
      expect(Object.keys(windowSize?.properties ?? {})).toEqual([
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxWidth',
        'maxHeight',
      ])
      expect(schema.required).toContain('windowSize')
      expect(windowSize?.required).toEqual([
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxWidth',
        'maxHeight',
      ])
      expect(windowSize?.required).toEqual(Object.keys(windowSize?.properties ?? {}))
    })

    describe('live AIHubMix repro', () => {
      if (!hasAihubmixApiKey) {
        it.skip('aIHUBMIX_API_KEY must be set in apps/stage-tamagotchi/.env.local to run this test', () => {})
        return
      }

      let model: string
      let stageWidgetsTool: Tool

      beforeAll(async () => {
        stageWidgetsTool = await getStageWidgetsTool()
        model = await resolveAihubmixModel()
      })

      it('accepts the provider-facing schema after windowSize constraints are made provider-safe', async () => {
        // ROOT CAUSE:
        //
        // `stage_widgets.windowSize` is emitted as a strict object with optional nested keys.
        // Some OpenAI-compatible validators reject that shape and require every nested property
        // to appear in `required`, even though the schema is valid Draft-07 JSON Schema.
        //
        // This test proves whether AIHubMix currently rejects the tool with the same provider-
        // side validation error reported in the bug report.
        const response = await runCurlJson<AihubmixErrorResponse>({
          method: 'POST',
          url: new URL('chat/completions', aihubmixBaseUrl).toString(),
          headers: [
            `Authorization: Bearer ${aihubmixApiKey}`,
            'Content-Type: application/json',
          ],
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: 'Open the widgets window.',
              },
            ],
            tools: [stageWidgetsTool],
            tool_choice: 'auto',
            temperature: 0,
          }),
        })

        const payload = response.body

        expect(response.status).toBe(200)
        expect(payload.error).toBeUndefined()
      }, 15000)
    })
  })

  describe('normalizeComponentProps', () => {
    it('parses JSON strings into objects', () => {
      const result = normalizeComponentProps('{"city":"Tokyo","temp":15}')
      expect(result).toEqual({ city: 'Tokyo', temp: 15 })
    })

    it('returns empty object for empty or undefined', () => {
      expect(normalizeComponentProps('   ')).toEqual({})
      expect(normalizeComponentProps(undefined)).toEqual({})
      expect(normalizeComponentProps(null as any)).toEqual({})
    })

    it('passes through object inputs', () => {
      const payload = { foo: 'bar', nested: { a: 1 } }
      expect(normalizeComponentProps(payload)).toBe(payload)
    })

    it('throws on invalid JSON', () => {
      expect(() => normalizeComponentProps('{ bad json ')).toThrow()
    })
  })
  describe('executeWidgetAction with mocked invokers', () => {
    const makeInvokers = (): WidgetInvokers => ({
      prepareWindow: vi.fn(),
      openWindow: vi.fn(),
      addWidget: vi.fn(),
      updateWidget: vi.fn(),
      removeWidget: vi.fn(),
      clearWidgets: vi.fn(),
    })

    it('spawns with ttl conversion and parsed props', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('abc123')

      const result = await executeWidgetAction({
        action: 'spawn',
        id: ' abc123 ',
        componentName: 'weather',
        componentProps: '{"city":"Tokyo"}',
        size: 'm',
        ttlSeconds: 2,
      }, { invokers })

      expect(result).toContain('abc123')
      expect(invokers.addWidget).toHaveBeenCalledTimes(1)
      expect(invokers.addWidget).toHaveBeenCalledWith({
        id: 'abc123',
        componentName: 'weather',
        componentProps: { city: 'Tokyo' },
        size: 'm',
        ttlMs: 2000,
      })
    })

    it('forwards custom window sizing when spawning a widget', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('sized-widget')

      await executeWidgetAction({
        action: 'spawn',
        id: ' sized-widget ',
        componentName: 'weather',
        componentProps: '{"city":"Taipei"}',
        size: 'l',
        ttlSeconds: 0,
        windowSize: {
          width: 620,
          height: 760,
          minWidth: 480,
          minHeight: 320,
        },
      } as any, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith({
        id: 'sized-widget',
        componentName: 'weather',
        componentProps: { city: 'Taipei' },
        size: 'l',
        ttlMs: 0,
        windowSize: {
          width: 620,
          height: 760,
          minWidth: 480,
          minHeight: 320,
        },
      })
    })

    it('preserves extension-ui payloads when spawning dynamic modules', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('chess-main')

      await executeWidgetAction({
        action: 'spawn',
        id: ' chess-main ',
        componentName: 'extension-ui',
        componentProps: JSON.stringify({
          moduleId: 'chess-main',
          title: 'Extension UI',
          windowSize: {
            width: 720,
            height: 540,
            minWidth: 480,
          },
          payload: {
            side: 'white',
          },
        }),
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith(expect.objectContaining({
        id: 'chess-main',
        componentName: 'extension-ui',
        componentProps: expect.objectContaining({
          moduleId: 'chess-main',
          title: 'Extension UI',
          windowSize: {
            width: 720,
            height: 540,
            minWidth: 480,
          },
          payload: {
            side: 'white',
          },
        }),
        windowSize: {
          width: 720,
          height: 540,
          minWidth: 480,
        },
      }))
    })

    it('sanitizes reserved extension-ui host props before dispatch', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('guarded-main')

      await executeWidgetAction({
        action: 'spawn',
        id: ' guarded-main ',
        componentName: 'extension-ui',
        componentProps: JSON.stringify({
          'moduleId': 'guarded-main',
          'title': 'Guarded Module',
          'modelValue': { injected: true },
          'module': { injected: true },
          'moduleConfig': { injected: true },
          'model-value': { injected: true },
          'module-config': { injected: true },
          'payload': {
            safe: true,
          },
        }),
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      const dispatched = vi.mocked(invokers.addWidget).mock.calls[0]?.[0]
      expect(dispatched).toBeDefined()
      expect(dispatched?.componentProps).toMatchObject({
        moduleId: 'guarded-main',
        title: 'Guarded Module',
        payload: {
          safe: true,
        },
      })
      expect(dispatched?.componentProps).not.toHaveProperty('modelValue')
      expect(dispatched?.componentProps).not.toHaveProperty('module')
      expect(dispatched?.componentProps).not.toHaveProperty('moduleConfig')
      expect(dispatched?.componentProps).not.toHaveProperty('model-value')
      expect(dispatched?.componentProps).not.toHaveProperty('module-config')
    })

    it('updates props and trims id', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'update',
        id: ' xyz ',
        componentName: '',
        componentProps: '{"foo":1}',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.updateWidget).toHaveBeenCalledWith({ id: 'xyz', componentProps: { foo: 1 } })
    })

    it('removes when id provided', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'remove',
        id: 'rem-id',
        componentName: '',
        componentProps: '{}',
        size: 's',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.removeWidget).toHaveBeenCalledWith({ id: 'rem-id' })
    })

    it('opens window with prepared id', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.prepareWindow).mockResolvedValue('prepared-id')
      await executeWidgetAction({
        action: 'open',
        id: '  prepared-id ',
        componentName: '',
        componentProps: '{}',
        size: 'l',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.prepareWindow).toHaveBeenCalledWith({ id: 'prepared-id' })
      expect(invokers.openWindow).toHaveBeenCalledWith({ id: 'prepared-id' })
    })

    it('clears widgets', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'clear',
        id: '',
        componentName: '',
        componentProps: '{}',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.clearWidgets).toHaveBeenCalledTimes(1)
    })
  })

  describe('extension-ui host helpers', () => {
    it('removes host-controlled render props from payload props', () => {
      expect(sanitizeExtensionUiRenderProps({
        'title': 'Override',
        'modelValue': { injected: true },
        'module': { injected: true },
        'moduleConfig': { injected: true },
        'model-value': { injected: true },
        'module-config': { injected: true },
        'safe': true,
      })).toEqual({
        safe: true,
      })
    })

    it('requires a registered module before rendering a resolved widget', () => {
      expect(canRenderExtensionUi({
        loading: false,
        moduleSnapshot: undefined,
        iframeSrc: 'https://example.com',
      })).toBe(false)

      expect(canRenderExtensionUi({
        loading: false,
        error: 'module missing',
        moduleSnapshot: {
          moduleId: 'module-1',
          ownerSessionId: 'session-1',
          ownerPluginId: 'plugin-1',
          kitId: 'kit.widget',
          kitModuleType: 'window',
          state: 'active',
          runtime: 'electron',
          revision: 1,
          updatedAt: Date.now(),
          config: {},
        },
        iframeSrc: 'https://example.com',
      })).toBe(false)
    })
  })
})
