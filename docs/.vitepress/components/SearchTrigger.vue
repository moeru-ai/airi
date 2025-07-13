<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMagicKeys, whenever } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { defineAsyncComponent, ref } from 'vue'

const SearchCommandBox = defineAsyncComponent(() => import('./SearchCommandBox.vue'))

const open = ref(false)
const { meta_k } = useMagicKeys()

whenever(meta_k, (n) => {
  if (n)
    open.value = true
})

function handleClose() {
  requestAnimationFrame(() => {
    open.value = false
  })
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger class="border-muted hover:bg-muted text-muted-foreground text-md md:bg-card flex items-center rounded-lg px-3 py-[7px] space-x-2 md:border md:text-sm">
      <Icon icon="lucide:search" />
      <span class="w-24 text-left hidden lg:w-40 md:inline-flex">Search</span>
      <span class="text-xs hidden md:inline-flex">
        <kbd>⌘ K</kbd>
      </span>
    </DialogTrigger>

    <DialogPortal>
      <DialogOverlay
        class="bg-background/50 fixed inset-0 z-30 backdrop-blur"
      />
      <DialogContent
        class="bg-card border-muted fixed left-[50%] top-[10%] z-[100] max-h-[85vh] max-w-[750px] w-[90vw] translate-x-[-50%] overflow-hidden border rounded-xl shadow-xl focus:outline-none"
      >
        <DialogTitle class="sr-only">
          Search documentation
        </DialogTitle>
        <DialogDescription class="sr-only">
          Show related results based on search term
        </DialogDescription>

        <SearchCommandBox
          @close="handleClose"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
