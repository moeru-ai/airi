<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMagicKeys, whenever } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const SearchCommandBox = defineAsyncComponent(() => import('./SearchCommandBox.vue'))

const open = ref(false)
const { meta_k } = useMagicKeys()
const { t } = useI18n()

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
    <DialogTrigger class="text-muted-foreground border-muted hover:bg-muted text-md md:bg-card flex items-center rounded-lg px-3 py-[7px] transition-colors duration-200 ease-in-out space-x-2 md:border md:text-sm">
      <Icon icon="lucide:search" />
      <span class="w-24 text-left hidden lg:w-40 md:inline-flex">{{ t('docs.theme.search.title') }}</span>
      <span class="text-xs hidden prose md:inline-flex">
        <kbd>⌘ K</kbd>
      </span>
    </DialogTrigger>

    <DialogPortal>
      <AnimatePresence multiple>
        <DialogOverlay as-child>
          <Motion
            class="bg-background/50 fixed inset-0 z-30 backdrop-blur-md"
            :initial="{ opacity: 0, scale: 0 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0 }"
          />
        </DialogOverlay>
        <DialogContent as-child>
          <Motion
            class="border-muted bg-card fixed left-[50%] top-[10%] z-[100] max-h-[85vh] max-w-[750px] w-[90vw] translate-x-[-50%] overflow-hidden border rounded-xl shadow-xl will-change-transform focus:outline-none"
            :initial="{ opacity: 0, top: '0%', transition: { duration: 0.2, ease: 'easeInOut' } }"
            :animate="{ opacity: 1, top: '10%', transition: { duration: 0.2, ease: 'easeInOut' } }"
            :exit="{ opacity: 0, top: '0%', transition: { duration: 0.2, ease: 'easeInOut' } }"
          >
            <DialogTitle class="sr-only">
              Search documentation
            </DialogTitle>
            <DialogDescription class="sr-only">
              Show related results based on search term
            </DialogDescription>
            <SearchCommandBox @close="handleClose" />
          </Motion>
        </DialogContent>
      </AnimatePresence>
    </DialogPortal>
  </DialogRoot>
</template>
