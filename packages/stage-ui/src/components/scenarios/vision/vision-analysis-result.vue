<script setup lang="ts">
import type { AnalysisResult } from '@proj-airi/stage-ui/types'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<Props>(), {
  result: null,
  isAnalyzing: false,
})

const emit = defineEmits<{
  close: []
  applySuggestion: [suggestion: string]
}>()

const { t } = useI18n()

interface Props {
  result?: AnalysisResult | null
  isAnalyzing?: boolean
}

const hasContent = computed(() => {
  return props.result && (
    props.result.description
    || (props.result.elements?.length ?? 0) > 0
    || (props.result.suggestions?.length ?? 0) > 0
  )
})
</script>

<template>
  <div :class="['bg-black/80', 'rounded-lg', 'p-3', 'text-white', 'max-w-75', 'text-xs']">
    <div :class="['flex', 'justify-between', 'items-center', 'mb-2']">
      <span :class="['font-bold', 'text-green-400']">{{ t('pages.modules.vision.analysis.title') }}</span>
      <button
        :class="['bg-transparent', 'border-none', 'text-white', 'text-lg', 'cursor-pointer', 'px-1']"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <div v-if="isAnalyzing" :class="['text-amber-400', 'text-center']">
      {{ t('pages.modules.vision.analysis.analyzing') }}
    </div>

    <div
      v-else-if="hasContent"
      :class="['flex', 'flex-col', 'gap-2']"
    >
      <div
        v-if="result?.description"
        :class="['leading-relaxed']"
      >
        {{ result.description }}
      </div>

      <div
        v-if="result?.elements?.length"
      >
        <div :class="['text-gray-400', 'mb-1']">
          {{ t('pages.modules.vision.analysis.ui-elements') }}:
        </div>
        <div
          v-for="(el, idx) in result.elements"
          :key="idx"
          :class="['flex', 'gap-1.5', 'py-0.5']"
        >
          <span :class="['text-blue-400', 'min-w-12.5']">[{{ el.type }}]</span>
          <span :class="['text-gray-300']">{{ el.description }}</span>
        </div>
      </div>

      <div
        v-if="result?.suggestions?.length"
        :class="['mt-2']"
      >
        <div :class="['text-gray-400', 'mb-1']">
          {{ t('pages.modules.vision.analysis.suggestions') }}:
        </div>
        <button
          v-for="(suggestion, idx) in result.suggestions"
          :key="idx"
          :class="['block', 'w-full', 'text-left', 'bg-green-400/20', 'border', 'border-green-400/40', 'rounded', 'px-2', 'py-1.5', 'my-1', 'text-green-400', 'cursor-pointer', 'text-11px', 'hover:bg-green-400/30']"
          @click="emit('applySuggestion', suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </div>

    <div v-else :class="['text-gray-500', 'text-center']">
      {{ t('pages.modules.vision.analysis.no-result') }}
    </div>
  </div>
</template>
