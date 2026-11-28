<script setup lang="ts">
import type { SessionRow } from './session-row-model'

import { formatISO } from 'date-fns'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The title and the details line of a conversation row. The row places it in its select button.
 * The marks show the state of the conversation: the current conversation and its pin. A row in
 * selection mode leaves them out, so only its selection check marks it.
 */
const props = defineProps<{
  row: SessionRow
  compact: boolean
  marks: boolean
}>()

const { t } = useI18n()
const snippet = computed(() => props.row.match?.snippet)
const markClasses = ['rounded-sm bg-primary-100 px-0.5 text-inherit dark:bg-primary-900/60']
const timeClasses = ['shrink-0 text-xs font-normal tabular-nums text-neutral-400 dark:text-neutral-500']

/**
 * Whether the second line ends with marks: the pin, the archive mark of a search match, or the current mark of a wide
 * row. With marks, the time stands at the end of the title line, above them. Without marks, the time stands at the end
 * of the row, centered on both lines, so it lines up with the buttons that a hover shows.
 */
const endMarks = computed(() => (!!props.row.match && props.row.meta.archivedAt !== undefined)
  || (props.marks && !!props.row.meta.pinnedAt)
  || (props.marks && props.row.isActive && !props.compact))
</script>

<template>
  <!--
    Two lines in every row: the title, then the last message, with the time of the last message at the end, as in a
    messenger, so the user can tell the conversations apart without opening them. See `endMarks` for the place of the
    time.
  -->
  <span :class="['min-w-0 w-full flex-1', endMarks ? '' : 'flex items-center gap-2']">
    <span :class="['block min-w-0', endMarks ? '' : 'flex-1']">
      <span :class="['w-full flex items-baseline gap-2']">
        <span :class="['min-w-0 flex-1 truncate text-sm font-medium']">{{ props.row.preview }}</span>
        <time v-if="endMarks" :datetime="formatISO(props.row.activityAt)" :title="props.row.activityAtTitle" :class="timeClasses">
          {{ props.row.activityAtLabel }}
        </time>
      </span>
      <span :class="['w-full flex items-center gap-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
        <!-- A search match shows the message that contains the query, with the query marked, in place of the last message. -->
        <i18n-t v-if="snippet?.fromUser" keypath="stage.chat.sessions.last-message-you" tag="span" scope="global" :class="['min-w-0 flex-1 truncate']">
          <template #text>
            {{ snippet.before }}<mark :class="markClasses">{{ snippet.match }}</mark>{{ snippet.after }}
          </template>
        </i18n-t>
        <span v-else-if="snippet" :class="['min-w-0 flex-1 truncate']">
          {{ snippet.before }}<mark :class="markClasses">{{ snippet.match }}</mark>{{ snippet.after }}
        </span>
        <span v-else :class="['min-w-0 flex-1 truncate']">{{ props.row.lastMessage ?? '' }}</span>
        <span
          v-if="props.row.match && props.row.meta.archivedAt !== undefined"
          role="img"
          :aria-label="t('stage.chat.sessions.archived')"
          :title="t('stage.chat.sessions.archived')"
          :class="['i-mingcute:archive-line size-3.5 shrink-0']"
        />
        <span
          v-if="props.marks && props.row.meta.pinnedAt"
          role="img"
          :aria-label="t('stage.chat.sessions.pinned')"
          :title="t('stage.chat.sessions.pinned')"
          :class="['i-mingcute:pin-line size-3.5 shrink-0']"
        />
        <span v-if="props.marks && props.row.isActive && !props.compact" :class="['shrink-0 text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
        <span :class="['sr-only']">{{ props.row.characterName }}</span>
      </span>
    </span>
    <time v-if="!endMarks" :datetime="formatISO(props.row.activityAt)" :title="props.row.activityAtTitle" :class="timeClasses">
      {{ props.row.activityAtLabel }}
    </time>
  </span>
</template>
