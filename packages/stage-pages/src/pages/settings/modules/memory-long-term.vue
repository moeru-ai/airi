<script setup lang="ts">
import { WIP } from '@proj-airi/stage-ui/components'
</script>

<template>
  <WIP />
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
