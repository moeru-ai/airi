<script setup lang="ts">
import type { ChatSlicesCard } from '../../../../types/chat'

import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CardView from '../../../../libs/cards/card-view.vue'

import { useSettingsDeveloper } from '../../../../stores/settings/developer'

/**
 * A card that the model drew as part of its reply. A card that no longer draws, for example after the parts of a card
 * change, shows its text instead.
 */
const props = defineProps<{
  card: ChatSlicesCard
}>()

const { t } = useI18n()
const KEY = 'stage.chat.reply-card'

const broken = ref(false)

// The program is for developers. Only the developer setting that shows tool data as JSON offers it.
const { showToolPayloadsAsJson } = storeToRefs(useSettingsDeveloper())
const showProgram = ref(false)
</script>

<template>
  <div :class="['w-full flex flex-col gap-1']">
    <div :class="['rounded-xl p-1.5', 'text-neutral-800 dark:text-neutral-100', 'bg-neutral-100/90 dark:bg-neutral-900/80']">
      <pre
        v-if="showToolPayloadsAsJson && showProgram"
        :class="['m-0 rounded-lg px-2.5 py-2', 'whitespace-pre-wrap break-words text-[11px] font-mono', 'bg-white/75 dark:bg-neutral-800/60']"
      >{{ props.card.program }}</pre>
      <p v-else-if="broken" :class="['m-0 px-1 text-xs whitespace-pre-wrap break-words', 'text-neutral-700 dark:text-neutral-200']">
        {{ props.card.text }}
      </p>
      <CardView v-else :program="props.card.program" @broken="broken = true" />
    </div>
    <div v-if="showToolPayloadsAsJson" :class="['flex justify-end']">
      <!-- The same icon switch as on a tool call. It shows the view that it opens: the program, or the card again. -->
      <button
        type="button"
        :aria-label="showProgram ? t(`${KEY}.card`) : t(`${KEY}.raw`)"
        :title="showProgram ? t(`${KEY}.card`) : t(`${KEY}.raw`)"
        :class="[
          'size-6 shrink-0 inline-flex items-center justify-center rounded-lg',
          'outline-none transition-colors duration-200',
          'text-neutral-500 hover:bg-neutral-200/70 hover:text-primary-600',
          'dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-primary-300',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="showProgram = !showProgram"
      >
        <span :class="[showProgram ? 'i-mingcute:layout-4-line' : 'i-mingcute:code-line', 'text-xs']" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
