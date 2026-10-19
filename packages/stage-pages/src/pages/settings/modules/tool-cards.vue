<script setup lang="ts">
import type { SavedToolCard } from '@proj-airi/stage-ui/stores/tool-cards'

import { CardView } from '@proj-airi/stage-ui/libs/cards'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useToolCardsStore } from '@proj-airi/stage-ui/stores/tool-cards'
import { TOOL_ICONS, toolIconOf } from '@proj-airi/stage-ui/tools/icons'
import { Button, FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const toolCards = useToolCardsStore()
const { enabled, replyCardsEnabled, cards } = storeToRefs(toolCards)
const llmTools = useLlmToolsStore()

const KEY = 'settings.pages.modules.tool-cards'

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))

// A deleted card keeps its place until the page closes, with a line that says what happens next.
const deleted = ref<SavedToolCard[]>([])

const rows = computed(() => [
  ...cards.value.map(card => ({ card, deleted: false })),
  ...deleted.value.map(card => ({ card, deleted: true })),
].sort((left, right) => right.card.createdAt - left.card.createdAt))

async function remove(card: SavedToolCard) {
  deleted.value = [...deleted.value, card]
  await toolCards.remove(card.key)
}

/** An MCP card is keyed `server::tool`, so its key names the server. Any other key is a tool of the app. */
function sourceOf(key: string) {
  const [server, tool] = key.split('::')
  return tool ? t(`${KEY}.source-mcp`, { server }) : t(`${KEY}.source-tool`)
}

/** The icon that the chat shows on calls of the tool. */
function iconOf(key: string) {
  if (key.includes('::'))
    return TOOL_ICONS.mcp
  return toolIconOf(key, llmTools.tools.findLast(tool => tool.function.name === key)?.icon)
}

// The preview draws each card with the latest call of its tool, which the card store keeps apart from the cards. A new
// call changes `usedAt`, so the previews read again.
const latestCalls = shallowRef<ReadonlyMap<string, unknown>>(new Map())
watch(() => cards.value.map(card => `${card.key}@${card.createdAt}@${card.usedAt}`).join('\n'), async (_, __, onCleanup) => {
  // A newer read replaces an older one that is still on its way.
  let replaced = false
  onCleanup(() => replaced = true)
  const calls = await Promise.all(cards.value.map(async card => [card.key, await toolCards.latestCallOf(card)] as const))
  if (!replaced)
    latestCalls.value = new Map(calls.filter(([, data]) => data !== undefined))
}, { immediate: true })

const shownTemplates = ref<ReadonlySet<string>>(new Set())

function toggleTemplate(key: string) {
  const next = new Set(shownTemplates.value)
  if (!next.delete(key))
    next.add(key)
  shownTemplates.value = next
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <div :class="['flex flex-col gap-4', 'rounded-xl', 'bg-neutral-100 dark:bg-neutral-900', 'p-4']">
      <FieldCheckbox v-model="enabled" :label="t(`${KEY}.enable`)" :description="t(`${KEY}.enable-description`)" />
      <FieldCheckbox v-model="replyCardsEnabled" :label="t(`${KEY}.reply-cards`)" :description="t(`${KEY}.reply-cards-description`)" />
    </div>

    <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t(`${KEY}.page-description`) }}
    </p>

    <ul v-if="rows.length" :class="['flex flex-col', 'gap-2']">
      <li v-for="row in rows" :key="row.card.key">
        <p
          v-if="row.deleted"
          :class="['rounded-xl', 'px-4 py-3', 'text-xs', 'text-neutral-500 dark:text-neutral-400']"
        >
          {{ t(`${KEY}.deleted`, { name: row.card.key }) }}
        </p>
        <div
          v-else
          :class="[
            'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]',
            'gap-4',
            'rounded-xl',
            'bg-neutral-50 dark:bg-neutral-800/60',
            'p-3',
          ]"
        >
          <div :class="['min-w-0', 'flex flex-col', 'gap-1.5']">
            <span :class="['flex items-center', 'gap-1.5', 'text-sm font-medium']">
              <span :class="[iconOf(row.card.key), 'shrink-0 text-base', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
              <span :class="['min-w-0 truncate']">{{ row.card.key }}</span>
            </span>
            <span v-if="row.card.description" :class="['text-xs', 'text-neutral-700 dark:text-neutral-300']">{{ row.card.description }}</span>
            <span :class="['flex flex-wrap', 'gap-x-3 gap-y-1', 'text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
              <span>{{ sourceOf(row.card.key) }}</span>
              <span>{{ t(`${KEY}.used`, { date: dateFormat.format(row.card.usedAt) }) }}</span>
            </span>
            <div :class="['mt-auto pt-1', 'flex flex-wrap', 'gap-1.5']">
              <Button
                size="sm"
                icon="i-solar:code-linear"
                :label="shownTemplates.has(row.card.key) ? t(`${KEY}.hide-template`) : t(`${KEY}.show-template`)"
                @click="toggleTemplate(row.card.key)"
              />
              <Button size="sm" icon="i-solar:trash-bin-minimalistic-linear" :label="t(`${KEY}.delete`)" @click="remove(row.card)" />
            </div>
            <pre
              v-if="shownTemplates.has(row.card.key)"
              :class="['m-0', 'overflow-x-auto', 'rounded-lg', 'bg-white dark:bg-neutral-900/60', 'p-3', 'text-xs font-mono', 'whitespace-pre-wrap break-words']"
            >{{ row.card.program }}</pre>
          </div>
          <!-- The preview sits on the panel color of the chat, and draws the card with the latest call of the tool. -->
          <div v-if="latestCalls.has(row.card.key)" :class="['self-start', 'rounded-xl', 'bg-neutral-100/90 dark:bg-neutral-900/80', 'p-2']">
            <CardView :program="row.card.program" :data="latestCalls.get(row.card.key)" />
          </div>
        </div>
      </li>
    </ul>
    <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
      {{ t(`${KEY}.empty`) }}
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.tool-cards.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
