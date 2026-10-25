<script setup lang="ts">
import type { SettingsSearchCategory, SettingsSearchResult } from '../../../composables/use-settings-search'

import { LinkGroup, LinkGroupItem } from '@proj-airi/ui'
import { useResizeObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  results: SettingsSearchResult[]
  /** The text that the person searched for. The matching parts of each name are bold. */
  query: string
}>()

/** Joins the pages of a location, for example "Hearing › Wake words". */
const LOCATION_SEPARATOR = ' › '

interface Group {
  category: SettingsSearchCategory
  results: SettingsSearchResult[]
  /** The place of the best result of the group in the result list. */
  rank: number
}

/** The results by category. A category comes in the order of its best result. */
const groups = computed(() => {
  const byCategory = new Map<string, Group>()
  for (const result of props.results) {
    const group = byCategory.get(result.category.title) ?? { category: result.category, results: [], rank: byCategory.size }
    group.results.push(result)
    byCategory.set(result.category.title, group)
  }
  return [...byCategory.values()]
})

// The cards keep their whole content, and each column takes whole cards.
// - A column is as wide as the widest card needs, so every name and its location fit on one line. One column holds the rest.
// - The columns get the cards so that their heights differ the least: the tallest card first, each one into the shortest column.
// - In a column, the cards keep the order of the results, and the column with the best card comes first.
// Until the cards are measured, they stand in one column.
const container = useTemplateRef<HTMLElement>('container')
const cards = useTemplateRef<Array<InstanceType<typeof LinkGroup>>>('cards')
const width = ref(0)
const gap = ref(0)
/** The narrowest column in which every card fits its text. */
const columnWidth = ref(0)
/** The height of each card, by category. */
const heights = ref(new Map<string, number>())

function measure() {
  if (!container.value)
    return
  width.value = container.value.clientWidth
  gap.value = Number.parseFloat(getComputedStyle(container.value).columnGap) || 0
  const measured = new Map<string, number>()
  let widest = 0
  for (const card of cards.value ?? []) {
    const element = card.$el as HTMLElement
    measured.set(element.dataset.category ?? '', element.offsetHeight)
    widest = Math.max(widest, card.naturalWidth())
  }
  columnWidth.value = widest
  const changed = measured.size !== heights.value.size || [...measured].some(([title, height]) => heights.value.get(title) !== height)
  if (changed)
    heights.value = measured
}
useResizeObserver(container, measure)
watch(groups, measure, { flush: 'post' })

const columns = computed(() => {
  const measured = columnWidth.value > 0 && groups.value.every(group => heights.value.has(group.category.title))
  const fits = measured ? Math.floor((width.value + gap.value) / (columnWidth.value + gap.value)) : 1
  const count = Math.max(1, Math.min(fits, groups.value.length))
  const columns = Array.from({ length: count }, () => ({ height: 0, groups: [] as Group[] }))
  const heightOf = (group: Group) => heights.value.get(group.category.title) ?? 0
  const tallestFirst = groups.value.toSorted((left, right) => heightOf(right) - heightOf(left) || left.rank - right.rank)
  for (const group of tallestFirst) {
    const shortest = columns.reduce((lowest, column) => column.height < lowest.height ? column : lowest)
    shortest.groups.push(group)
    shortest.height += heightOf(group) + gap.value
  }
  for (const column of columns)
    column.groups.sort((left, right) => left.rank - right.rank)
  return columns.toSorted((left, right) => (left.groups[0]?.rank ?? 0) - (right.groups[0]?.rank ?? 0))
})

/** The parts of a name, with each part that matches the query marked. Bold marks a match, so color stays for hover. */
function partsOf(title: string) {
  const needle = props.query.trim().toLocaleLowerCase()
  const lower = title.toLocaleLowerCase()
  const parts: Array<{ text: string, match: boolean }> = []
  let from = 0
  for (let at = needle ? lower.indexOf(needle) : -1; at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from)
      parts.push({ text: title.slice(from, at), match: false })
    parts.push({ text: title.slice(at, at + needle.length), match: true })
    from = at + needle.length
  }
  if (from < title.length)
    parts.push({ text: title.slice(from), match: false })
  return parts
}
</script>

<template>
  <div ref="container" :class="['flex items-start gap-3']">
    <div
      v-for="(column, index) in columns"
      :key="index"
      :class="['min-w-0 flex flex-1 flex-col gap-3']"
    >
      <LinkGroup
        v-for="group in column.groups"
        ref="cards"
        :key="group.category.title"
        :data-category="group.category.title"
        :title="group.category.title"
        :icon="group.category.icon"
      >
        <LinkGroupItem
          v-for="result in group.results"
          :key="`${result.to}\n${result.title}`"
          :as="RouterLink"
          :to="result.to"
          :detail="result.location.join(LOCATION_SEPARATOR)"
        >
          <template v-for="(part, partIndex) in partsOf(result.title)" :key="partIndex">
            <b v-if="part.match" :class="['font-semibold']">{{ part.text }}</b>
            <template v-else>
              {{ part.text }}
            </template>
          </template>
        </LinkGroupItem>
      </LinkGroup>
    </div>
  </div>
</template>
