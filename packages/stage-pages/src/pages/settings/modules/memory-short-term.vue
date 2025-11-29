<script setup lang="ts">
import { useMemoryService } from '@proj-airi/stage-ui/composables/useMemoryService'
import { useAiriMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { computed, ref } from 'vue'

const memoryStore = useAiriMemoryStore()
const { memoryServiceEnabled, fetchStructuredContext } = useMemoryService()

const query = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const hasMemories = computed(() => memoryStore.shortTermMemories.length > 0)

async function refreshMemories() {
  if (!query.value.trim()) {
    errorMessage.value = 'Enter a prompt to refresh memories.'
    return
  }

  if (!memoryServiceEnabled.value) {
    errorMessage.value = 'Memory service is disabled.'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    const context = await fetchStructuredContext(query.value)
    if (context) {
      memoryStore.updateFromContext(context)
    }
    else {
      errorMessage.value = 'No structured memories returned for this prompt.'
    }
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unexpected error while fetching memories.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="memory-module">
    <header class="memory-module__header">
      <h1>Short-term Memories</h1>
      <p class="memory-module__subtitle">
        Active model:
        <strong>{{ memoryStore.activeModelName }}</strong>
      </p>
    </header>

    <div class="memory-module__controls">
      <input
        v-model="query"
        type="text"
        class="memory-module__input"
        placeholder="Describe the moment you want AIRI to recall"
      >
      <button
        type="button"
        class="memory-module__button"
        :disabled="loading"
        @click="refreshMemories"
      >
        {{ loading ? 'Refreshing…' : 'Refresh memories' }}
      </button>
    </div>

    <p v-if="errorMessage" class="memory-module__error">
      {{ errorMessage }}
    </p>

    <ul v-if="hasMemories" class="memory-module__list">
      <li v-for="memory in memoryStore.shortTermMemories" :key="memory.id" class="memory-module__item">
        <article>
          <header class="memory-module__item-header">
            <h3>{{ memory.category }}</h3>
            <span class="memory-module__meta">
              Importance {{ memory.importance }} · Emotional impact {{ memory.emotionalImpact }}
            </span>
          </header>
          <p class="memory-module__content">
            {{ memory.content }}
          </p>
          <footer class="memory-module__footer">
            {{ new Date(memory.createdAt).toLocaleString() }}
          </footer>
        </article>
      </li>
    </ul>

    <p v-else class="memory-module__empty" :class="{ 'memory-module__empty--loading': loading }">
      {{ loading ? 'Loading memories…' : 'No short-term memories available for this model yet.' }}
    </p>
  </section>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>

<style scoped>
.memory-module {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 800px;
}

.memory-module__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.memory-module__input {
  flex: 1 1 240px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider, #ccc);
  border-radius: 0.5rem;
}

.memory-module__button {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--vp-c-brand, #6366f1);
  color: white;
  cursor: pointer;
}

.memory-module__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.memory-module__error {
  color: var(--vp-c-danger, #e11d48);
}

.memory-module__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.memory-module__item {
  padding: 1rem;
  border: 1px solid var(--vp-c-divider, #e5e7eb);
  border-radius: 0.75rem;
  background: var(--vp-c-bg-alt, #fff);
}

.memory-module__meta {
  font-size: 0.875rem;
  color: var(--vp-c-text-2, #6b7280);
}

.memory-module__content {
  margin: 0.5rem 0;
}

.memory-module__footer {
  font-size: 0.75rem;
  color: var(--vp-c-text-2, #6b7280);
}

.memory-module__empty {
  color: var(--vp-c-text-2, #6b7280);
}
</style>
