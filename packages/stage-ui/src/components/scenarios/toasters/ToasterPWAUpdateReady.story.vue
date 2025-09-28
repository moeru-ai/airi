<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { h, markRaw } from 'vue'
import { toast, Toaster } from 'vue-sonner'

import ToasterPWAUpdateReady from './ToasterPWAUpdateReady.vue'
import ToasterRoot from './ToasterRoot.vue'

import 'vue-sonner/style.css'

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

function handlePopToast() {
  const id = nanoid()

  // eslint-disable-next-line no-console
  toast(markRaw(h(ToasterPWAUpdateReady, { id, onUpdate: () => console.debug('Update initiated', id) })), {
    id,
    duration: 30000,
    position: isMobile.value ? 'top-center' : 'bottom-right',
  })
}
</script>

<template>
  <Story
    title="Toaster PWA Update Ready"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <div class="flex flex-col gap-4">
        <div class="border-1 border-red">
          <ToasterRoot @close="id => toast.dismiss(id)">
            <ToasterPWAUpdateReady />
            <Toaster />
          </ToasterRoot>
        </div>

        <div>
          <button class="border-2 border-neutral-200 rounded-lg border-solid px-2 py-1 text-nowrap dark:border-neutral-700" @click="handlePopToast">
            Pop one
          </button>
        </div>
      </div>
    </Variant>
  </Story>
</template>
