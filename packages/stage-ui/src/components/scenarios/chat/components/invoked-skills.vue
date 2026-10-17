<script setup lang="ts">
import type { ChatInvokedSkill } from '@proj-airi/core-agent'

import { useI18n } from 'vue-i18n'

import HitPill from './hit-pill.vue'
import ToolCallScrollArea from './tool-call-scroll-area.vue'

import { SKILL_ICONS } from '../../../../tools/icons'

/**
 * The skills that the owner invoked with a message, for example by a keyword. They show under the owner's message,
 * because the owner called them. The calls that the model makes show in the combo of the reply instead.
 */
const props = withDefaults(defineProps<{
  skills: ChatInvokedSkill[]
  align?: 'start' | 'end'
  /** How the pills paint their background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  align: 'end',
  surface: 'translucent',
})

const { t } = useI18n()
const KEY = 'stage.chat.invoked-skill'

/** The answers of a decision with what each one means, in the words of the owner. */
function answersOf(question: Extract<ChatInvokedSkill, { kind: 'decision' }>['question']) {
  if (question.type === 'noul')
    return [{ label: t(`${KEY}.yes`), meaning: question.criteria.true }, { label: t(`${KEY}.no`), meaning: question.criteria.false }]
  return Object.entries(question.criteria).map(([label, meaning]) => ({ label, meaning }))
}
</script>

<template>
  <div :class="['flex flex-col gap-1.5', props.align === 'end' ? 'items-end' : 'items-start']">
    <template v-for="(skill, index) in props.skills" :key="index">
      <HitPill v-if="skill.kind === 'decision'" :align="props.align" :icons="[SKILL_ICONS.decision]" :surface="props.surface">
        <template #label>
          {{ t(`${KEY}.decision`, { name: skill.name }) }}
        </template>
        <dl :class="['m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg px-2.5 py-2 text-xs', 'bg-white/75 dark:bg-neutral-800/60']">
          <dt :class="['text-neutral-500 dark:text-neutral-400']">
            {{ t(`${KEY}.question`) }}
          </dt>
          <dd :class="['m-0 whitespace-pre-wrap break-words']">
            {{ skill.question.instructions }}
          </dd>
          <template v-for="answer in answersOf(skill.question)" :key="answer.label">
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              {{ answer.label }}
            </dt>
            <dd :class="['m-0 break-words']">
              {{ answer.meaning }}
            </dd>
          </template>
        </dl>
      </HitPill>
      <!-- A background skill runs on its own, and the task list follows it, so its pill does not unfold. -->
      <HitPill v-else-if="skill.kind === 'background'" :align="props.align" :icons="[SKILL_ICONS.instructions]" :surface="props.surface">
        <template #label>
          {{ t(`${KEY}.background`, { name: skill.name }) }}
        </template>
      </HitPill>
      <HitPill v-else :align="props.align" :icons="[SKILL_ICONS.instructions]" :surface="props.surface">
        <template #label>
          {{ t(`${KEY}.steps`, { name: skill.name }) }}
        </template>
        <div :class="['rounded-lg px-2.5 py-2 text-xs', 'bg-white/75 dark:bg-neutral-800/60']">
          <ToolCallScrollArea>
            <p :class="['m-0 whitespace-pre-wrap break-words']">
              {{ skill.instructions }}
            </p>
          </ToolCallScrollArea>
        </div>
      </HitPill>
    </template>
  </div>
</template>
