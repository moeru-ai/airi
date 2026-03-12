<script setup lang="ts">
import type { AnalysisResult } from '@proj-airi/stage-ui/stores/vision'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  result?: AnalysisResult | null
  isAnalyzing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  result: null,
  isAnalyzing: false,
})

const emit = defineEmits<{
  close: []
  applySuggestion: [suggestion: string]
}>()

const hasContent = computed(() => {
  return props.result && (
    props.result.description
    || props.result.elements?.length > 0
    || props.result.suggestions?.length > 0
  )
})
</script>

<template>
  <div class="vision-analysis-result">
    <div class="result-header">
      <span class="title">{{ t('pages.modules.vision.analysis.title') }}</span>
      <button
        class="close-btn"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <div v-if="isAnalyzing" class="analyzing">
      {{ t('pages.modules.vision.analysis.analyzing') }}
    </div>

    <div
      v-else-if="hasContent"
      class="result-content"
    >
      <div
        v-if="result?.description"
        class="description"
      >
        {{ result.description }}
      </div>

      <div
        v-if="result?.elements?.length"
        class="elements"
      >
        <div class="section-title">
          {{ t('pages.modules.vision.analysis.ui-elements') }}:
        </div>
        <div
          v-for="(el, idx) in result.elements"
          :key="idx"
          class="element-item"
        >
          <span class="element-type">[{{ el.type }}]</span>
          <span class="element-desc">{{ el.description }}</span>
        </div>
      </div>

      <div
        v-if="result?.suggestions?.length"
        class="suggestions"
      >
        <div class="section-title">
          {{ t('pages.modules.vision.analysis.suggestions') }}:
        </div>
        <button
          v-for="(suggestion, idx) in result.suggestions"
          :key="idx"
          class="suggestion-btn"
          @click="emit('applySuggestion', suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </div>

    <div v-else class="no-result">
      {{ t('pages.modules.vision.analysis.no-result') }}
    </div>
  </div>
</template>

<style scoped>
.vision-analysis-result {
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  padding: 12px;
  color: white;
  max-width: 300px;
  font-size: 12px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.title {
  font-weight: bold;
  color: #4ade80;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}

.analyzing {
  color: #fbbf24;
  text-align: center;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.description {
  line-height: 1.4;
}

.section-title {
  color: #9ca3af;
  margin-bottom: 4px;
}

.element-item {
  display: flex;
  gap: 6px;
  padding: 2px 0;
}

.element-type {
  color: #60a5fa;
  min-width: 50px;
}

.element-desc {
  color: #d1d5db;
}

.suggestions {
  margin-top: 8px;
}

.suggestion-btn {
  display: block;
  width: 100%;
  text-align: left;
  background: rgba(74, 222, 128, 0.2);
  border: 1px solid rgba(74, 222, 128, 0.4);
  border-radius: 4px;
  padding: 6px 8px;
  margin: 4px 0;
  color: #4ade80;
  cursor: pointer;
  font-size: 11px;
}

.suggestion-btn:hover {
  background: rgba(74, 222, 128, 0.3);
}

.no-result {
  color: #6b7280;
  text-align: center;
}
</style>
