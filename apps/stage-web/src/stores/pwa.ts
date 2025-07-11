import { ToasterPWAUpdateReady } from '@proj-airi/stage-ui/components'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { h, markRaw, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

export const usePWAStore = defineStore('pwa', () => {
  const updateReadyHooks = ref<(() => void)[]>([])
  const breakpoints = useBreakpoints(breakpointsTailwind)
  const isMobile = breakpoints.smaller('md')

  onMounted(async () => {
    if (import.meta.env.SSR) {
      return
    }
    if (import.meta.env.VITE_APP_TARGET_HUGGINGFACE_SPACE) {
      return
    }

    const { registerSW } = await import('../modules/pwa')

    const updateSW = registerSW({
      onNeedRefresh: () => {
        const id = nanoid()
        toast(markRaw(h(ToasterPWAUpdateReady, { id, onUpdate: () => updateSW() })), {
          id,
          duration: 30000,
          position: isMobile.value ? 'top-center' : 'bottom-right',
        })
      },
    })

    updateReadyHooks.value.push(updateSW)
  })
})
