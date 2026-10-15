import type { PhoneticCandidate } from '@proj-airi/stage-ui/libs/voice/phonetic-match'
import type { GuidedCandidate, GuidedScope } from '@proj-airi/stage-ui/libs/voice/span-guided-terms'
import type { Ref } from 'vue'

import { MultilingualE5Embedder } from '@proj-airi/stage-ui/libs/voice/multilingual-e5-embedder'
import { createSemanticReranker } from '@proj-airi/stage-ui/libs/voice/phonetic-rerank'
import { watchDebounced } from '@vueuse/core'
import { onScopeDispose, shallowRef } from 'vue'

/** The first rerank downloads the model. The lab waits for it, unlike a live turn, which keeps the phonetic order after 400 ms. */
const LAB_BUDGET_MS = 120_000

/** Slider drags change the candidates many times. Only the last change reranks. */
const DEBOUNCE_MS = 300

export interface LabRerankInput {
  enabled: Ref<boolean>
  text: Ref<string>
  candidates: Ref<readonly GuidedCandidate[]>
  scope: Ref<GuidedScope>
  /** The recent conversation, oldest message first. */
  history: Ref<readonly string[]>
}

/**
 * Reorders the post-ASR candidates of the offline lab by meaning, with the multilingual E5 reranker of live turns.
 *
 * With the `first` scope, the candidates inside uncertain spans and the others rerank apart, so span candidates
 * stay first. The model loads on the first rerank. Turning the rerank off or disposing the scope terminates its Worker.
 *
 * Returns `ranked`, undefined while the rerank is off or runs, and `running`.
 */
export function useLabRerank(input: LabRerankInput) {
  const embedder = new MultilingualE5Embedder()
  const rerank = createSemanticReranker({ embedder, history: () => input.history.value, budgetMs: LAB_BUDGET_MS })
  const ranked = shallowRef<readonly GuidedCandidate[]>()
  const running = shallowRef(false)
  let current: AbortController | undefined

  /** Reranks one tier. The reranker returns the same objects, so each one maps back to its guided candidate. */
  async function rerankTier(tier: readonly GuidedCandidate[], signal: AbortSignal) {
    const order: readonly PhoneticCandidate[] = await rerank({ text: input.text.value, candidates: tier, sessionId: 'lab' }, signal)
    return order.flatMap(candidate => tier.filter(item => item === candidate))
  }

  watchDebounced([input.enabled, input.candidates, input.text, input.history, input.scope], async ([enabled, candidates, , , scope]) => {
    current?.abort('The lab input changed')
    current = undefined
    ranked.value = undefined
    if (!enabled) {
      running.value = false
      embedder.dispose()
      return
    }

    const run = new AbortController()
    current = run
    running.value = true
    const tiers = scope === 'first'
      ? [candidates.filter(candidate => candidate.backing), candidates.filter(candidate => !candidate.backing)]
      : [candidates]
    const results = await Promise.all(tiers.map(tier => rerankTier(tier, run.signal)))
    if (current !== run)
      return
    ranked.value = results.flat()
    running.value = false
  }, { debounce: DEBOUNCE_MS, immediate: true })

  onScopeDispose(() => {
    current?.abort('The lab closed')
    embedder.dispose()
  })

  return { ranked, running }
}
