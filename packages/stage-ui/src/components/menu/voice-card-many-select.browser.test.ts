import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'

import VoiceCardManySelect from './voice-card-many-select.vue'

function createHarness() {
  return defineComponent({
    name: 'VoiceCardManySelectRemoteSearchHarness',
    components: {
      VoiceCardManySelect,
    },
    setup() {
      const searchQuery = ref('missing')
      const voiceId = ref('')
      const voices = [
        {
          id: 'voice-1',
          name: 'Columbina',
          description: 'Remote search result',
        },
      ]

      return {
        searchQuery,
        voiceId,
        voices,
      }
    },
    template: `
      <VoiceCardManySelect
        v-model:search-query="searchQuery"
        v-model:voice-id="voiceId"
        :voices="voices"
        :remote-search="true"
        :loading="true"
        loading-text="Searching voices..."
        search-no-results-title="No voices found"
        search-no-results-description="No voices found for {query}"
      />
    `,
  })
}

/**
 * @example
 * describe('VoiceCardManySelect remote search mode', () => {
 *   it('keeps remote results visible while a server-backed search is loading', async () => {})
 * })
 */
describe('voiceCardManySelect remote search mode', () => {
  /**
   * @example
   * it('keeps remote results visible while a server-backed search is loading', async () => {
   *   const screen = await render(createHarness())
   *   await expect.element(screen.getByText('Searching voices...')).toBeInTheDocument()
   *   await expect.element(screen.getByText('Columbina')).toBeInTheDocument()
   * })
   */
  it('keeps remote results visible while a server-backed search is loading', async () => {
    const screen = await render(createHarness())

    await expect.element(screen.getByText('Searching voices...')).toBeInTheDocument()
    await expect.element(screen.getByText('Columbina')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('No voices found')
  })
})
