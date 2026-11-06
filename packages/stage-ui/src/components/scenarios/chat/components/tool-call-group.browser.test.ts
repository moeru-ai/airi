import type { ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ToolCallGroupItem } from './tool-call-group'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatToolCallGroup from './tool-call-group.vue'

const items: ToolCallGroupItem[] = [
  { sliceIndex: 1, key: 'call-light#0', toolCall: { toolCallId: 'call-light', toolCallType: 'function', toolName: 'home_assistant_call_service', args: '{"entity_id":"light.bedroom"}' } },
  { sliceIndex: 3, key: 'call-search#0', toolCall: { toolCallId: 'call-search', toolCallType: 'function', toolName: 'web_search', args: '{"query":"village"}' } },
]

// The group reads registered tool icons from the tools store.
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => disposePinia(pinia))

function mount(results: Record<number, ChatSlicesToolCallResult>) {
  return render(ChatToolCallGroup, {
    // These tests cover the grouping, so no tool has a widget.
    props: { items, resultOf: (sliceIndex: number) => results[sliceIndex], widgets: {} },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('tool call group', () => {
  // While calls stream in, the pill counts the combo. Settled, it reports the hits and the misses.
  it('counts the combo while calls run, then reports hits and misses', async () => {
    const running = mount({ 1: { type: 'tool-call-result', id: 'call-light', result: 'ok' } })
    await expect.element(running.getByText('Combo ×2')).toBeVisible()

    const settled = mount({
      1: { type: 'tool-call-result', id: 'call-light', result: 'ok' },
      3: { type: 'tool-call-result', id: 'call-search', isError: true, result: 'timeout' },
    })
    await expect.element(settled.getByText('2-hit combo, 1 missed')).toBeVisible()
  })

  // The rerun action moved from the old per-call card onto each call row. It must still send the original call.
  it('reruns a call with its slice index and original arguments', async () => {
    const screen = mount({
      1: { type: 'tool-call-result', id: 'call-light', result: 'ok' },
      3: { type: 'tool-call-result', id: 'call-search', result: 'found' },
    })

    await screen.getByText('2-hit combo', { exact: true }).click()
    await screen.getByRole('button', { name: 'Run again' }).nth(1).click()

    expect(screen.emitted('toolCallRerun')).toEqual([[3, { toolCallId: 'call-search', toolName: 'web_search', args: '{"query":"village"}' }]])
  })
})
