<script setup lang="ts">
import type { Header } from '../composables/outline'

defineProps<{
  headers: Header[]
  root?: boolean
}>()

function onClick({ target: el }: Event) {
  const id = (el as HTMLAnchorElement).href!.split('#')[1]
  const heading = document.getElementById(decodeURIComponent(id))
  heading?.focus({ preventScroll: true })
}
</script>

<template>
  <ul :class="root ? 'root' : 'nested'">
    <li
      v-for="{ children, link, title } in headers"
      :key="title"
    >
      <a
        class="text-muted-foreground outline-link w-full"
        :class="{ 'font-medium': root }"
        :href="link"
        :title="title"
        @click="onClick"
      >
        {{ title }}
      </a>
      <template v-if="children?.length">
        <DocOutlineItem :headers="children" />
      </template>
    </li>
  </ul>
</template>

<style scoped>
.root {
  position: relative;
  z-index: 1;
  padding-right: 16px;
  padding-left: 16px;
}

.nested {
  padding-left: 16px;
}

.outline-link {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* transition: color 0.5s; */
  @apply text-sm leading-8;
}

.outline-link:hover,
.outline-link.active {
  /* transition: color 0.25s; */
  @apply text-foreground;
}

.outline-link.nested {
  padding-left: 13px;
}
</style>
