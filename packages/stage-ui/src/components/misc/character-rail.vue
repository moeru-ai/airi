<script setup lang="ts">
import { Avatar, BasicButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useCharacterSwitcher } from '../../composables/use-character-switcher'

const props = withDefaults(defineProps<{
  /** Shows the name next to each avatar. Without names, the rail is one avatar wide. @default false */
  labels?: boolean
}>(), { labels: false })

const emit = defineEmits<{
  /** The selected character is active now. Also fires for the character that was active already. */
  switched: [id: string]
  /** The user asked for the character management page. The host opens it, because each app opens settings its own way. */
  manage: []
}>()

const { t } = useI18n()
const { entries, activeCardId, switching, select } = useCharacterSwitcher()

async function selectCharacter(id: string) {
  const result = await select(id)
  if (result === 'switched')
    emit('switched', id)
  else if (result === 'failed')
    toast.error(t('stage.character-switcher.failed'))
}

const rowClasses = [
  'h-10 w-full shrink-0 rounded-full p-0 outline-none justify-start!',
  '[&_.basic-button-content]:w-full [&_.basic-button-content]:min-w-0 [&_.basic-button-content]:justify-start',
  'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-1',
]
</script>

<template>
  <nav
    data-testid="character-rail"
    :aria-label="t('stage.character-switcher.title')"
    :class="[
      'h-full flex flex-col gap-2 overflow-x-hidden overflow-y-auto p-2 [scrollbar-width:none]',
      props.labels ? 'w-48' : 'w-14',
    ]"
  >
    <BasicButton
      v-for="entry in entries"
      :key="entry.id"
      size="unset"
      data-testid="character-rail-item"
      :aria-label="entry.name"
      :aria-pressed="entry.id === activeCardId"
      :title="props.labels ? undefined : entry.name"
      :disabled="switching"
      :class="[
        rowClasses,
        props.labels ? 'hover:bg-primary-100/60 dark:hover:bg-primary-900/40' : '',
        props.labels && entry.id === activeCardId ? 'bg-primary-100/60 dark:bg-primary-900/40' : '',
      ]"
      @click="selectCharacter(entry.id)"
    >
      <span :class="['relative size-10 shrink-0']">
        <!-- The active character has a bar at the edge of the rail and a squarer avatar. -->
        <span
          v-if="entry.id === activeCardId"
          aria-hidden="true"
          :class="['absolute top-2 h-6 w-1 rounded-r-full bg-primary-500 -left-2']"
        />
        <!-- Display model previews are portrait. Align them to the top so the crop keeps the head. -->
        <Avatar
          :src="entry.preview"
          :class="[
            // The avatar root is an inline element. It takes a size only as a block.
            'block size-10 bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
            'transition-[border-radius,opacity] duration-300 ease-in-out motion-reduce:transition-none',
            '[&_[data-avatar-image]]:object-top',
            entry.id === activeCardId ? 'rounded-2xl' : 'rounded-full opacity-80',
          ]"
        >
          <template #fallback>
            <span :class="['text-base font-semibold']">{{ entry.name.slice(0, 1) }}</span>
          </template>
        </Avatar>
      </span>
      <span
        v-if="props.labels"
        aria-hidden="true"
        :class="[
          'min-w-0 flex-1 truncate pr-3 text-left text-sm',
          entry.id === activeCardId ? 'font-semibold text-neutral-900 dark:text-neutral-50' : 'font-medium text-neutral-600 dark:text-neutral-300',
        ]"
      >
        {{ entry.name }}
      </span>
    </BasicButton>
    <span aria-hidden="true" :class="['mx-2 h-px w-6 shrink-0 bg-neutral-400/40']" />
    <BasicButton
      size="unset"
      data-testid="character-rail-manage"
      :aria-label="t('stage.character-switcher.manage')"
      :title="props.labels ? undefined : t('stage.character-switcher.manage')"
      :class="[
        rowClasses,
        'text-neutral-600 dark:text-neutral-300',
        'hover:bg-primary-100/60 dark:hover:bg-primary-900/40',
      ]"
      @click="emit('manage')"
    >
      <span :class="['size-10 flex shrink-0 items-center justify-center']">
        <span aria-hidden="true" :class="['i-solar:users-group-rounded-outline size-5']" />
      </span>
      <span v-if="props.labels" aria-hidden="true" :class="['min-w-0 flex-1 truncate pr-3 text-left text-sm font-medium']">
        {{ t('stage.character-switcher.manage') }}
      </span>
    </BasicButton>
  </nav>
</template>
