<script setup lang="ts">
import type { JudgeResult } from '../../../../tools/judge-recipe'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import HitPill from './hit-pill.vue'

import { SKILL_ICONS } from '../../../../tools/icons'

/** The answer of a judgment and what follows it, for example another recipe. A call that went wrong shows why. */
const props = defineProps<{
  outcome: JudgeResult
}>()

const { t } = useI18n()
const KEY = 'stage.chat.judgment-tool-call'

/** What follows the answer. Another recipe shows as a hit, the way the chat shows a recipe call. */
const follow = computed(() => {
  if (props.outcome.status !== 'judged')
    return undefined
  const value = props.outcome.follow
  switch (value.kind) {
    case 'recipe':
      return { icon: value.mode === 'decision' ? SKILL_ICONS.decision : SKILL_ICONS.instructions, text: t(`${KEY}.recipe-${value.mode}`, { name: value.name }) }
    case 'hint':
      return { text: t(`${KEY}.hint`, { text: value.text }) }
    default:
      return { text: t(`${KEY}.${value.kind}`) }
  }
})
</script>

<template>
  <div :class="['flex flex-col gap-1.5 rounded-lg px-2.5 py-2 text-xs', 'bg-white/75 dark:bg-neutral-800/60']">
    <dl v-if="props.outcome.status === 'judged' && follow" :class="['m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5']">
      <dt :class="['text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.answer`) }}
      </dt>
      <dd :class="['m-0 break-words']">
        {{ props.outcome.answer }}
      </dd>
      <dt :class="['text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.next`) }}
      </dt>
      <dd :class="['m-0 min-w-0']">
        <HitPill v-if="follow.icon" :icons="[follow.icon]">
          <template #label>
            {{ follow.text }}
          </template>
        </HitPill>
        <span v-else :class="['break-words']">{{ follow.text }}</span>
      </dd>
    </dl>
    <p v-else-if="props.outcome.status === 'invalid'" :class="['m-0 flex items-start gap-1.5']">
      <span :class="['i-mingcute:close-circle-line', 'mt-0.5 shrink-0 text-red-500 dark:text-red-400']" aria-hidden="true" />
      <span :class="['min-w-0 break-words']">{{ props.outcome.reason }}</span>
    </p>
  </div>
</template>
