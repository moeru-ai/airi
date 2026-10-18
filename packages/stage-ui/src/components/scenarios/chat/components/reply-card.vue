<script setup lang="ts">
import type { ChatToolCallRendererProps } from './tool-call-renderer'

import { Renderer } from '@openuidev/vue-lang'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettingsDeveloper } from '../../../../stores/settings/developer'
import { readCardDraw } from '../../../../tools/draw-card'
import { NoQueryLoader, toolCardLibrary } from './tool-card-library'

// The chat passes every renderer the call id and the rerun listener. This card uses neither, and it often renders nothing.
defineOptions({ inheritAttrs: false })
/**
 * A card that the model drew as part of its reply. It shows where the call stands in the reply, not in a combo.
 * A call that only fetched the rules, or whose program had problems, shows nothing: the model draws again, and the
 * owner sees only the card that draws. While the card is on its way, the reply says so below its parts.
 */
const props = defineProps<ChatToolCallRendererProps>()
const { t } = useI18n()
const KEY = 'stage.chat.reply-card'

const draw = computed(() => readCardDraw(props.args, props.result))
const shown = computed(() => draw.value.outcome?.status === 'shown')

// The program is for developers. Only the developer setting that shows tool data as JSON offers it.
const { showToolPayloadsAsJson } = storeToRefs(useSettingsDeveloper())
const showProgram = ref(false)
</script>

<template>
  <div v-if="shown" :class="['w-full flex flex-col gap-1']">
    <div :class="['rounded-xl p-1.5', 'text-neutral-800 dark:text-neutral-100', 'bg-neutral-100/90 dark:bg-neutral-900/80']">
      <pre
        v-if="showToolPayloadsAsJson && showProgram"
        :class="['m-0 rounded-lg px-2.5 py-2', 'whitespace-pre-wrap break-words text-[11px] font-mono', 'bg-white/75 dark:bg-neutral-800/60']"
      >{{ draw.program }}</pre>
      <Renderer v-else :response="draw.program" :library="toolCardLibrary" :query-loader="NoQueryLoader" />
    </div>
    <div v-if="showToolPayloadsAsJson" :class="['flex justify-end']">
      <button
        type="button"
        :class="[
          'shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px]',
          'outline-none transition-colors duration-200',
          'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
          'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="showProgram = !showProgram"
      >
        <span :class="['i-mingcute:code-line', 'text-xs']" aria-hidden="true" />
        <span>{{ showProgram ? t(`${KEY}.card`) : t(`${KEY}.raw`) }}</span>
      </button>
    </div>
  </div>
</template>
