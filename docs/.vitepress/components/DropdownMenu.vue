<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'

defineProps<{
  label: string
  items: {
    text: string
    link?: string
  }[]
}>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground mx-0 h-full inline-flex items-center justify-between px-2 py-2 text-nowrap text-sm font-semibold md:mx-3 md:px-0">
      <span>{{ label }}</span>
      <Icon
        icon="lucide:chevron-down"
        class="ml-1 text-lg"
      />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        position="popper"
        align="end"
        :side-offset="2"
        class="bg-card border-muted z-10 border rounded-lg p-2 shadow-sm"
      >
        <DropdownMenuItem
          v-for="item in items"
          :key="item.text"
          :value="item.text"
          as-child
          class="text-muted-foreground h-full flex items-center rounded px-2 py-2 text-sm font-semibold focus:bg-primary/10 focus:text-primary"
        >
          <a
            v-if="item.link"
            :href="item.link"
            target="_blank"
          >
            <span>{{ item.text }}</span>
            <Icon
              icon="lucide:arrow-up-right"
              class="ml-2 text-base"
            />

          </a>
          <div v-else>
            {{ item.text }}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
