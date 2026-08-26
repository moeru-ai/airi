import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import type { WidgetInvokers } from './widgets'

import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { canRenderExtensionUi, sanitizeExtensionUiRenderProps } from '../../../widgets/extension-ui/host'
import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { executeWidgetAction, normalizeComponentProps, widgetsTools } from './widgets'

installStrictToolSchemaMatchers()

const execFile = promisify(execFileCallback)
const aihubmixApiKey = process.env.AIHUBMIX_API_KEY?.trim() || ''
const hasAihubmixApiKey = Boolean(aihubmixApiKey)
const aihubmixBaseUrl = normalizeBaseUrl(process.env.AIHUBMIX_BASE_URL)
const configuredAihubmixModel = process.env.AIHUBMIX_MODEL?.trim()

interface AihubmixErrorResponse {
  error?: {
    code?: string
    message?: string
    param?: string
    type?: string
  }
}

interface AihubmixModelListResponse {
  data?: Array<{
    id?: string
  }>
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
    headers: [
      `Authorization: Bearer ${aihubmixApiKey}`,
    ],
    url: new URL('models', aihubmixBaseUrl).toString(),
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

describe('widgets tool helpers', () => {
  describe('provider-facing schema reproduction', () => {
    it('uses a provider-safe windowSize schema for strict tool validation', async () => {
      const stageWidgetsTool = await getStageWidgetsTool()
      const schema = stageWidgetsTool.function.parameters as JsonSchema
      const windowSize = getObjectSchema(schema.properties?.windowSize as JsonSchema | undefined)
      const windowSizeProperties = windowSize?.properties ?? {}

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
      expect(stageWidgetsTool).toSatisfyStrictToolSchema()
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
      expect(windowSize?.required).toEqual(Object.keys(windowSizeProperties))
      expect((windowSizeProperties.minWidth as JsonSchema).type).toEqual(['number', 'null'])
      expect((windowSizeProperties.minHeight as JsonSchema).type).toEqual(['number', 'null'])
      expect((windowSizeProperties.maxWidth as JsonSchema).type).toEqual(['number', 'null'])
      expect((windowSizeProperties.maxHeight as JsonSchema).type).toEqual(['number', 'null'])
      expect((windowSizeProperties.minWidth as JsonSchema).exclusiveMinimum).toBe(0)
      expect((windowSizeProperties.minHeight as JsonSchema).exclusiveMinimum).toBe(0)
      expect((windowSizeProperties.maxWidth as JsonSchema).exclusiveMinimum).toBe(0)
      expect((windowSizeProperties.maxHeight as JsonSchema).exclusiveMinimum).toBe(0)
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
          body: JSON.stringify({
            messages: [
              {
                content: 'Open the widgets window.',
                role: 'user',
              },
            ],
            model,
            temperature: 0,
            tool_choice: 'auto',
            tools: [stageWidgetsTool],
          }),
          headers: [
            `Authorization: Bearer ${aihubmixApiKey}`,
            'Content-Type: application/json',
          ],
          method: 'POST',
          url: new URL('chat/completions', aihubmixBaseUrl).toString(),
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
      addWidget: vi.fn(),
      clearWidgets: vi.fn(),
      openWindow: vi.fn(),
      prepareWindow: vi.fn(),
      removeWidget: vi.fn(),
      updateWidget: vi.fn(),
    })

    it('spawns with ttl conversion and parsed props', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('abc123')

      const result = await executeWidgetAction({
        action: 'spawn',
        componentName: 'weather',
        componentProps: '{"city":"Tokyo"}',
        id: ' abc123 ',
        size: 'm',
        ttlSeconds: 2,
      }, { invokers })

      expect(result).toContain('abc123')
      expect(invokers.addWidget).toHaveBeenCalledTimes(1)
      expect(invokers.addWidget).toHaveBeenCalledWith({
        componentName: 'weather',
        componentProps: { city: 'Tokyo' },
        id: 'abc123',
        size: 'm',
        ttlMs: 2000,
      })
    })

    it('forwards always-on-top preference when spawning a widget', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('pinned-widget')

      await executeWidgetAction({
        action: 'spawn',
        alwaysOnTop: true,
        componentName: 'weather',
        componentProps: '{"city":"Tokyo"}',
        id: ' pinned-widget ',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith({
        alwaysOnTop: true,
        componentName: 'weather',
        componentProps: { city: 'Tokyo' },
        id: 'pinned-widget',
        size: 'm',
        ttlMs: 0,
      })
    })

    it('forwards custom window sizing when spawning a widget', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('sized-widget')

      await executeWidgetAction({
        action: 'spawn',
        componentName: 'weather',
        componentProps: '{"city":"Taipei"}',
        id: ' sized-widget ',
        size: 'l',
        ttlSeconds: 0,
        windowSize: {
          height: 760,
          minHeight: 320,
          minWidth: 480,
          width: 620,
        },
      } as any, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith({
        componentName: 'weather',
        componentProps: { city: 'Taipei' },
        id: 'sized-widget',
        size: 'l',
        ttlMs: 0,
        windowSize: {
          height: 760,
          minHeight: 320,
          minWidth: 480,
          width: 620,
        },
      })
    })

    it('preserves extension-ui payloads when spawning dynamic modules', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('chess-main')

      await executeWidgetAction({
        action: 'spawn',
        componentName: 'extension-ui',
        componentProps: JSON.stringify({
          moduleId: 'chess-main',
          payload: {
            side: 'white',
          },
          title: 'Extension UI',
          windowSize: {
            height: 540,
            minWidth: 480,
            width: 720,
          },
        }),
        id: ' chess-main ',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith(expect.objectContaining({
        componentName: 'extension-ui',
        componentProps: expect.objectContaining({
          moduleId: 'chess-main',
          payload: {
            side: 'white',
          },
          title: 'Extension UI',
          windowSize: {
            height: 540,
            minWidth: 480,
            width: 720,
          },
        }),
        id: 'chess-main',
        windowSize: {
          height: 540,
          minWidth: 480,
          width: 720,
        },
      }))
    })

    it('sanitizes reserved extension-ui host props before dispatch', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('guarded-main')

      await executeWidgetAction({
        action: 'spawn',
        componentName: 'extension-ui',
        componentProps: JSON.stringify({
          'model-value': { injected: true },
          'modelValue': { injected: true },
          'module': { injected: true },
          'module-config': { injected: true },
          'moduleConfig': { injected: true },
          'moduleId': 'guarded-main',
          'payload': {
            safe: true,
          },
          'title': 'Guarded Module',
        }),
        id: ' guarded-main ',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      const dispatched = vi.mocked(invokers.addWidget).mock.calls[0]?.[0]
      expect(dispatched).toBeDefined()
      expect(dispatched?.componentProps).toMatchObject({
        moduleId: 'guarded-main',
        payload: {
          safe: true,
        },
        title: 'Guarded Module',
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
        alwaysOnTop: false,
        componentName: '',
        componentProps: '{"foo":1}',
        id: ' xyz ',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.updateWidget).toHaveBeenCalledWith({ alwaysOnTop: false, componentProps: { foo: 1 }, id: 'xyz' })
    })

    it('removes when id provided', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'remove',
        componentName: '',
        componentProps: '{}',
        id: 'rem-id',
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
        componentName: '',
        componentProps: '{}',
        id: '  prepared-id ',
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
        componentName: '',
        componentProps: '{}',
        id: '',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.clearWidgets).toHaveBeenCalledTimes(1)
    })
  })

  describe('extension-ui host helpers', () => {
    it('removes host-controlled render props from payload props', () => {
      expect(sanitizeExtensionUiRenderProps({
        'model-value': { injected: true },
        'modelValue': { injected: true },
        'module': { injected: true },
        'module-config': { injected: true },
        'moduleConfig': { injected: true },
        'safe': true,
        'title': 'Override',
      })).toEqual({
        safe: true,
      })
    })

    it('requires a registered module before rendering a resolved widget', () => {
      expect(canRenderExtensionUi({
        iframeSrc: 'https://example.com',
        loading: false,
        moduleSnapshot: undefined,
      })).toBe(false)

      expect(canRenderExtensionUi({
        error: 'module missing',
        iframeSrc: 'https://example.com',
        loading: false,
        moduleSnapshot: {
          config: {},
          kitId: 'kit.widget',
          kitModuleType: 'window',
          moduleId: 'module-1',
          ownerExtensionId: 'plugin-1',
          ownerSessionId: 'session-1',
          revision: 1,
          runtime: 'electron',
          state: 'active',
          updatedAt: Date.now(),
        },
      })).toBe(false)
    })
  })
})
