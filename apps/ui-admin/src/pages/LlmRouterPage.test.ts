// @vitest-environment jsdom

import type { App } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import LlmRouterPage from './LlmRouterPage.vue'

const mocks = vi.hoisted(() => ({
  applyRouterConfig: vi.fn(),
  routerConfig: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../modules/api', () => ({
  adminApi: {
    applyRouterConfig: mocks.applyRouterConfig,
    routerConfig: mocks.routerConfig,
  },
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

describe('llm router page', () => {
  let app: App<Element>
  let host: HTMLElement

  beforeEach(() => {
    mocks.routerConfig.mockResolvedValue({
      request: {
        mode: 'merge',
        slices: [],
        defaults: {},
      },
      preview: {},
      loadedAt: '2026-06-10T00:00:00.000Z',
      missingKeys: ['LLM_ROUTER_CONFIG'],
    })
    mocks.applyRouterConfig.mockResolvedValue({
      applied: [{ kind: 'openrouter', target: 'llm-router', surface: 'llm', modelName: 'chat-default', keyEntryId: 'k1' }],
      invalidatedKeys: [],
      preview: {
        LLM_ROUTER_CONFIG: {
          llm: {
            models: {
              'chat-default': {
                upstreams: [{ keys: [{ id: 'k1', ciphertext: '<ciphertext: 10 chars>' }] }],
              },
            },
          },
        },
      },
    })
    document.body.innerHTML = '<div id="app"></div>'
    host = document.querySelector('#app')!
    app = createApp(LlmRouterPage)
    app.mount(host)
  })

  afterEach(() => {
    app.unmount()
    vi.clearAllMocks()
  })

  it('starts as a form-first router config editor', () => {
    expect(host.textContent).toContain('Router Config Form')
    expect(host.textContent).toContain('Provider configuration')
    expect(host.textContent).toContain('LLM')
    expect(host.textContent).toContain('TTS')
    expect(host.textContent).toContain('OpenRouter')
    expect(host.textContent).not.toContain('Router Config Request')
  })

  it('loads current router config into the form and preserves existing keys', async () => {
    app.unmount()
    mocks.routerConfig.mockResolvedValueOnce({
      request: {
        mode: 'merge',
        slices: [{
          kind: 'openrouter',
          modelName: 'chat-live',
          overrideModel: 'openai/gpt-4.1-mini',
          baseURL: 'https://openrouter.ai/api/v1',
          keyEntryId: 'openrouter-live',
          existingKeyEntryId: 'openrouter-live',
        }],
        defaults: {
          chatModel: 'chat-live',
        },
      },
      preview: {
        LLM_ROUTER_CONFIG: { llm: { models: { 'chat-live': {} } } },
      },
      loadedAt: '2026-06-10T00:00:00.000Z',
      missingKeys: [],
    })
    document.body.innerHTML = '<div id="app"></div>'
    host = document.querySelector('#app')!
    app = createApp(LlmRouterPage)
    app.mount(host)
    await flushPromises()

    expect(host.textContent).toContain('Loaded current config')
    expect(host.textContent).toContain('Loaded key entry openrouter-live')
    expect(previewButton().disabled).toBe(false)
  })

  it('shows an actionable error when the current config response is not JSON data', async () => {
    app.unmount()
    mocks.routerConfig.mockResolvedValueOnce(null)
    document.body.innerHTML = '<div id="app"></div>'
    host = document.querySelector('#app')!
    app = createApp(LlmRouterPage)
    app.mount(host)
    await flushPromises()

    expect(host.textContent).toContain('Current router config response is not a valid JSON object.')
  })

  it('separates LLM and TTS provider slices by tab', async () => {
    buttonByText('TTS').click()
    await nextTick()

    expect(host.textContent).toContain('No TTS provider slices')
    expect(sectionHeadings(host)).not.toContain('1. OpenRouter')

    buttonByText('Add').click()
    await nextTick()

    expect(host.textContent).toContain('Azure Speech')
  })

  it('keeps preview disabled until required fields are complete', async () => {
    expect(previewButton().disabled).toBe(true)

    const keyInput = host.querySelector<HTMLInputElement>('input[type="password"]')
    expect(keyInput).not.toBeNull()
    keyInput!.value = 'sk-openrouter'
    keyInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(previewButton().disabled).toBe(false)
  })

  it('previews the built form payload without hand-written JSON', async () => {
    const keyInput = host.querySelector<HTMLInputElement>('input[type="password"]')
    keyInput!.value = 'sk-openrouter'
    keyInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    previewButton().click()
    await nextTick()
    await flushPromises()
    await nextTick()

    expect(mocks.applyRouterConfig).toHaveBeenCalledWith({
      mode: 'merge',
      slices: [{
        kind: 'openrouter',
        modelName: 'chat-default',
        overrideModel: 'openai/gpt-4o-mini',
        plaintextKey: 'sk-openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
      }],
      defaults: {
        chatModel: 'chat-default',
      },
    }, true)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Router config preview generated')
  })

  it('exports the current form to advanced JSON', async () => {
    const exportButton = buttonByText('Export Form')
    exportButton.click()
    await nextTick()

    const advancedTextarea = Array.from(host.querySelectorAll('textarea')).at(-1)
    expect(advancedTextarea?.value).toContain('"kind": "openrouter"')
    expect(advancedTextarea?.value).toContain('"chatModel": "chat-default"')
  })
})

function previewButton(): HTMLButtonElement {
  return buttonByText('Preview')
}

async function flushPromises() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button'))
    .find(item => item.textContent?.includes(text))
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`Button "${text}" not found`)
  return button
}

function sectionHeadings(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('h3'))
    .map(heading => heading.textContent?.trim() ?? '')
}
