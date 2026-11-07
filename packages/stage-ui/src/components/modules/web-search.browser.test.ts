import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import ToolCallWebSearchWidget from '../scenarios/chat/components/tool-call-web-search-widget.vue'
import WebSearch from './web-search.vue'

import { resolveLlmTools } from '../../stores/ai/chat-llm/tool-resolver'
import { useLlmToolsetPromptsStore } from '../../stores/ai/chat-llm/toolset-prompts'
import { useWebSearchStore } from '../../stores/modules/web-search'
import { createWebSearchTools, parseWebSearchResults, WEB_SEARCH_TOOLSET_PROMPT } from '../../tools/web-search'

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  disposePinia(pinia)
  localStorage.clear()
  vi.unstubAllGlobals()
})

function plugins() {
  return [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })]
}

describe('web search settings', () => {
  it('switches providers by keyboard, preserves keys, and restores persisted settings', async () => {
    const screen = render(WebSearch, { global: { plugins: plugins() } })
    await screen.getByPlaceholder('Enter your Tavily API key').fill('tavily-key')
    await screen.getByRole('switch').click()
    await expect.element(screen.getByText('Web search is ready to use!')).toBeVisible()

    await screen.getByRole('combobox').click()
    await expect.element(page.getByRole('option', { name: 'Tavily', exact: true })).toHaveFocus()
    await userEvent.keyboard('{End}')
    await expect.element(page.getByRole('option', { name: 'DeepSeek', exact: true })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByPlaceholder('Enter your DeepSeek API key')).toHaveValue('')
    expect(useWebSearchStore().configured).toBe(false)
    await screen.getByPlaceholder('Enter your DeepSeek API key').fill('deepseek-key')
    await expect.element(screen.getByText('Web search is ready to use!')).toBeVisible()

    await screen.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Tavily', exact: true }).click()
    await expect.element(screen.getByPlaceholder('Enter your Tavily API key')).toHaveValue('tavily-key')
    await screen.getByRole('combobox').click()
    await page.getByRole('option', { name: 'DeepSeek', exact: true }).click()
    await expect.element(screen.getByPlaceholder('Enter your DeepSeek API key')).toHaveValue('deepseek-key')
    await nextTick()

    await screen.unmount()
    disposePinia(pinia)
    pinia = createPinia()
    setActivePinia(pinia)
    const restored = useWebSearchStore()
    expect(restored.provider).toBe('deepseek')
    expect(restored.activeApiKey).toBe('deepseek-key')
    expect(restored.apiKey).toBe('tavily-key')
    expect(restored.configured).toBe(true)
    restored.resetState()
    await nextTick()
    expect(localStorage.getItem('settings/web-search/deepseek-api-key')).toBe('')
    expect(localStorage.getItem('settings/web-search/api-key')).toBe('')
    expect(restored.enabled).toBe(false)
    expect(restored.provider).toBe('tavily')
  })

  it('renders settings and a resolved search result at mobile width', async () => {
    await page.viewport(390, 844)
    const screen = render(WebSearch, { global: { plugins: plugins() } })
    const store = useWebSearchStore()
    store.provider = 'deepseek'
    await screen.getByPlaceholder('Enter your DeepSeek API key').fill('deepseek-key')
    await screen.getByRole('switch').click()
    await nextTick()
    expect(useLlmToolsetPromptsStore().activeToolsetPrompt).toContain(WEB_SEARCH_TOOLSET_PROMPT)

    const request = vi.fn<typeof fetch>(async () => Response.json({ results: [{
      title: 'AIRI release',
      url: 'https://example.com/news',
      summary: 'The latest AIRI news.',
      date: null,
      site_icon: null,
    }] }))
    vi.stubGlobal('fetch', request)
    const [tool] = await resolveLlmTools({ builtInTools: [], debugTools: [], sparkCommandTools: [], activeTools: [] })
    const output = await tool!.execute({ query: 'AIRI news', max_results: null }, { messages: [], toolCallId: 'search' })
    const result = parseWebSearchResults(String(output))
    expect(result).toBeDefined()
    const card = render(ToolCallWebSearchWidget, { props: result!, global: { plugins: plugins() } })
    await expect.element(card.getByRole('link', { name: /AIRI release/ })).toHaveAttribute('href', 'https://example.com/news')
    await expect.element(card.getByText('The latest AIRI news.')).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    expect(request.mock.calls[0]![0]).toBe('https://api.deepseek.com/v1/tools/search')
    store.enabled = false
    await nextTick()
    expect(await resolveLlmTools({ builtInTools: [], debugTools: [], sparkCommandTools: [], activeTools: [] })).toEqual([])
    await page.viewport(1280, 720)
  })
})

describe('search cancellation', () => {
  it.each(['tavily', 'deepseek'] as const)('cancels %s requests on timeout and turn cancellation', async (provider) => {
    const request = vi.fn<typeof fetch>((_url, options) => new Promise((_resolve, reject) => {
      const signal = options!.signal!
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    vi.stubGlobal('fetch', request)
    const [timed] = await createWebSearchTools({ provider, apiKey: 'key', timeoutMs: 20 })
    await expect(timed.execute({ query: 'news', max_results: null }, { messages: [], toolCallId: 'timeout' })).rejects.toThrow()
    expect(request.mock.calls[0]![1]!.signal!.reason.name).toBe('TimeoutError')

    const controller = new AbortController()
    const [tool] = await createWebSearchTools({ provider, apiKey: 'key' })
    const pending = tool.execute({ query: 'news', max_results: null }, { messages: [], toolCallId: 'cancel', abortSignal: controller.signal })
    const rejected = expect(pending).rejects.toThrow('Turn cancelled')
    controller.abort(new Error('Turn cancelled'))
    await rejected
    expect(request.mock.calls[1]![1]!.signal!.aborted).toBe(true)
  })
})
