import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/**
 * Long-term memory settings: the master enable flag plus the embed provider/model used to turn
 * memory text into vectors.
 *
 * Kept separate from the storage layer (the `memoryRepo`) so the settings UI and the embedder read a
 * single persisted source of truth. Like the chat history it persists across restarts and is shared
 * across Electron windows (localStorage), which is why recall and write can run in the chat window
 * without the cross-window bridging the vision feature needed.
 */
export const useMemoryStore = defineStore('memory', () => {
  /** Master switch for the whole LTM feature (recall + write). Off by default; opt-in like vision. */
  const enabled = useLocalStorageManualReset('settings/memory/enabled', false)

  /**
   * Provider id producing embeddings. Decoupled from the chat/vision providers so memory can point at
   * a dedicated embed endpoint (e.g. Ollama `bge-m3`) without affecting them.
   */
  const embedProvider = useLocalStorageManualReset('settings/memory/embed-provider', '')
  /** Embed model id within {@link embedProvider} (e.g. `bge-m3`). */
  const embedModel = useLocalStorageManualReset('settings/memory/embed-model', '')

  /**
   * Expected embedding width. Every stored vector must share one dimension for cosine search to be
   * meaningful, so the embedder asserts the model returns exactly this. Defaults to `bge-m3`'s 1024.
   */
  const embeddingDimension = useLocalStorageManualReset('settings/memory/embed-dimension', 1024)

  /** Max memories pulled per recall before re-ranking. */
  const topK = useLocalStorageManualReset('settings/memory/recall-top-k', 6)
  /**
   * Minimum cosine similarity for a memory to be recalled. Conservative by default (precision over
   * recall): a low value floods the prompt with loosely-related memories, which is worse than missing
   * one. Tuned per embed model.
   */
  const simThreshold = useLocalStorageManualReset('settings/memory/recall-sim-threshold', 0.6)
  /** Half-life (days) of the recency factor in recall re-ranking. */
  const recencyHalfLifeDays = useLocalStorageManualReset('settings/memory/recall-recency-half-life-days', 30)

  /** True once an embed provider and model are both selected — the embedder's precondition. */
  const configured = computed(() => Boolean(embedProvider.value) && Boolean(embedModel.value))

  return {
    enabled,
    embedProvider,
    embedModel,
    embeddingDimension,
    topK,
    simThreshold,
    recencyHalfLifeDays,
    configured,
  }
})
