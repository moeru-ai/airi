<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { AnimatePresence, Motion } from 'motion-v'
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
  <!-- eslint-disable vue/prefer-separate-static-class -->
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground mx-0 h-full inline-flex items-center justify-between px-2 py-2 text-nowrap text-sm font-semibold md:mx-3 md:px-0">
      <slot name="trigger">
        <span>{{ label }}</span>
        <Icon
          icon="lucide:chevron-down"
          class="ml-1 text-lg"
        />
      </slot>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <AnimatePresence>
        <DropdownMenuContent
          position="popper"
          align="end"
          :side-offset="2"
          as-child
        >
          <Motion
            :initial="{ opacity: 0, y: -10 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: -10 }"
            class="z-20 border rounded-xl p-2 shadow-md backdrop-blur-md"
            :class="[
              'bg-white/80 dark:border-white/5 dark:bg-black/80',
              'transition-colors duration-200 ease-in-out',
            ]"
          >
            <DropdownMenuItem
              v-for="item in items"
              :key="item.text"
              :value="item.text"
              as-child
              class="text-muted-foreground h-full flex items-center rounded px-2 py-2 text-sm font-semibold transition-colors duration-200 ease-in-out hover:text-primary"
            >
              <a
                v-if="item.link"
                :href="item.link"
                :target="item.link.startsWith('http') || item.link.startsWith('https') ? '_blank' : undefined"
              >
                <span>{{ item.text }}</span>
                <Icon
                  v-if="item.link.startsWith('http') || item.link.startsWith('https')"
                  icon="lucide:arrow-up-right"
                  class="ml-2 text-base"
                />

              </a>
              <div v-else>
                {{ item.text }}
              </div>
            </DropdownMenuItem>
          </Motion>
        </DropdownMenuContent>
      </AnimatePresence>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
