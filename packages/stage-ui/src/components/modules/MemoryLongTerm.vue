<script setup lang="ts">
import { useMemoryLongTermStore } from '@proj-airi/stage-ui/stores/modules/memory-long-term'
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memoryLongTermStore = useMemoryLongTermStore()
const { enabled, vectorDbProvider, embeddingProvider, embeddingModel, configured } = storeToRefs(memoryLongTermStore)
</script>

<template>
  <div :class="['flex','flex-col','gap-6']">
    <div :class="['text-2xl','font-bold']">
      {{ t('settings.pages.modules.memory-long-term.title') }}
    </div>

    <div :class="['text-sm','opacity-70']">
      {{ t('settings.pages.modules.memory-long-term.description') }}
    </div>

    <FieldCheckbox
      v-model="enabled"
      label="Enable Long-Term Memory"
      description="Store and retrieve memories using vector embeddings for long-term context"
    />

    <FieldInput
      v-model="vectorDbProvider"
      type="text"
      label="Vector Database Provider"
      description="Provider for vector storage (e.g., pgvector, chromadb, pinecone)"
      placeholder="pgvector"
    />

    <FieldInput
      v-model="embeddingProvider"
      type="text"
      label="Embedding Provider"
      description="AI provider for generating embeddings"
      placeholder="openai"
    />

    <FieldInput
      v-model="embeddingModel"
      type="text"
      label="Embedding Model"
      description="Model to use for embedding generation"
      placeholder="text-embedding-3-small"
    />

    <div v-if="configured" :class="['mt-4','rounded-lg','bg-green-100','dark:bg-green-900/30','p-4','text-green-800','dark:text-green-200']">
      Long-term memory is enabled and configured
    </div>
  </div>
</template>
