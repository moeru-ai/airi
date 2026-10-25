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

// Cards stay whole, in one grid, in the order of the results. A card that changes column keeps its element,
// so a focused link keeps the focus. Until the cards are measured, they stand in one column.
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

/**
 * The number of columns and the column of each card, by category. `undefined` until the cards are measured.
 * Each count that fits gets the cards tallest first, each into the shortest column. The lowest tallest column wins,
 * then the smaller height difference, then the fewer columns.
 */
const layout = computed(() => {
  if (columnWidth.value <= 0 || !groups.value.every(group => heights.value.has(group.category.title)))
    return undefined
  const fits = Math.floor((width.value + gap.value) / (columnWidth.value + gap.value))
  const heightOf = (group: Group) => heights.value.get(group.category.title) ?? 0
  const tallestFirst = groups.value.toSorted((left, right) => heightOf(right) - heightOf(left) || left.rank - right.rank)
  const arrange = (count: number) => {
    const columns = Array.from({ length: count }, () => ({ height: 0, groups: [] as Group[] }))
    for (const group of tallestFirst) {
      const shortest = columns.reduce((lowest, column) => column.height < lowest.height ? column : lowest)
      shortest.groups.push(group)
      shortest.height += heightOf(group) + gap.value
    }
    const heightsOf = columns.map(column => column.height)
    return { count, columns, tallest: Math.max(...heightsOf), spread: Math.max(...heightsOf) - Math.min(...heightsOf) }
  }
  const counts = Array.from({ length: Math.max(1, Math.min(fits, groups.value.length)) }, (_, index) => index + 1)
  const { count, columns } = counts.map(arrange).reduce((best, next) =>
    next.tallest < best.tallest || (next.tallest === best.tallest && next.spread < best.spread) ? next : best)
  // The column with the best card comes first. The DOM order keeps the order of the results in each column.
  const bestRank = (column: { groups: Group[] }) => Math.min(...column.groups.map(group => group.rank))
  const columnOf = new Map<string, number>()
  columns.toSorted((left, right) => bestRank(left) - bestRank(right))
    .forEach((column, index) => column.groups.forEach(group => columnOf.set(group.category.title, index)))
  return { count, columnOf }
})

// The grid has rows of 1px, and each card spans as many rows as its height and the gap below it.
// A card with a set column takes the first free rows in that column, so the cards of a column stack in the order of the results.
const gridStyle = computed(() => layout.value
  ? { gridTemplateColumns: `repeat(${layout.value.count}, minmax(0, 1fr))`, gridAutoRows: '1px', gridAutoFlow: 'row dense', rowGap: '0px' }
  : { gridTemplateColumns: 'minmax(0, 1fr)' })
function cardStyle(group: Group) {
  const column = layout.value?.columnOf.get(group.category.title)
  return column === undefined
    ? undefined
    : { gridColumn: `${column + 1}`, gridRowEnd: `span ${(heights.value.get(group.category.title) ?? 0) + gap.value}` }
}

const needle = computed(() => props.query.trim().toLocaleLowerCase())

/** The parts of a name, with each part that matches the query marked. Bold marks a match, so color stays for hover. */
function partsOf(title: string) {
  const query = needle.value
  const lower = title.toLocaleLowerCase()
  const parts: Array<{ text: string, match: boolean }> = []
  let from = 0
  for (let at = query ? lower.indexOf(query) : -1; at !== -1; at = lower.indexOf(query, from)) {
    if (at > from)
      parts.push({ text: title.slice(from, at), match: false })
    parts.push({ text: title.slice(at, at + query.length), match: true })
    from = at + query.length
  }
  if (from < title.length)
    parts.push({ text: title.slice(from), match: false })
  return parts
}
</script>

<template>
  <div ref="container" :class="['grid items-start gap-3']" :style="gridStyle">
    <LinkGroup
      v-for="group in groups"
      ref="cards"
      :key="group.category.title"
      :data-category="group.category.title"
      :title="group.category.title"
      :icon="group.category.icon"
      :style="cardStyle(group)"
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
</template>
