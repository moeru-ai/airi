import type { ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ToolCallGroupItem } from './tool-call-group'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatToolCallGroup from './tool-call-group.vue'

const items: ToolCallGroupItem[] = [
  { sliceIndex: 1, toolCall: { toolCallId: 'call-light', toolCallType: 'function', toolName: 'home_assistant_call_service', args: '{"entity_id":"light.bedroom"}' } },
  { sliceIndex: 3, toolCall: { toolCallId: 'call-search', toolCallType: 'function', toolName: 'web_search', args: '{"query":"village"}' } },
]

function mount(results: Record<number, ChatSlicesToolCallResult>) {
  return render(ChatToolCallGroup, {
    props: { items, resultOf: (sliceIndex: number) => results[sliceIndex] },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('tool call group', () => {
  // While calls stream in, the folded line names the newest running call. Settled, it reports the total.
  it('names the running call, then the total', async () => {
    const running = mount({ 1: { type: 'tool-call-result', id: 'call-light', result: 'ok' } })
    await expect.element(running.getByText('Using tool 2 · Web search')).toBeVisible()

    const settled = mount({
      1: { type: 'tool-call-result', id: 'call-light', result: 'ok' },
      3: { type: 'tool-call-result', id: 'call-search', isError: true, result: 'timeout' },
    })
    await expect.element(settled.getByText('Used 2 tools, 1 didn\'t finish')).toBeVisible()
  })

  // The rerun action moved from the old per-call card onto each call row. It must still send the original call.
  it('reruns a call with its slice index and original arguments', async () => {
    const screen = mount({
      1: { type: 'tool-call-result', id: 'call-light', result: 'ok' },
      3: { type: 'tool-call-result', id: 'call-search', result: 'found' },
    })

    await screen.getByText('Used 2 tools', { exact: true }).click()
    await screen.getByRole('button', { name: 'Run again' }).nth(1).click()

    expect(screen.emitted('toolCallRerun')).toEqual([[3, { toolCallId: 'call-search', toolName: 'web_search', args: '{"query":"village"}' }]])
  })
})
