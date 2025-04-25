<script setup lang="ts">
import { useMotion } from '@vueuse/motion'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
  title: string
  subtitle?: string
}>()

const router = useRouter()
const route = useRoute()

const pageHeaderRef = ref<HTMLElement>()
const title = ref(props.title)
const subtitle = ref(props.subtitle)

const { apply } = useMotion(pageHeaderRef, {
  initial: { opacity: 0, x: 10, transition: { duration: 250 } },
  enter: { opacity: 1, x: 0, transition: { duration: 250 } },
  leave: { opacity: 0, x: -5, transition: { duration: 100 } },
})

onMounted(async () => {
  await apply('initial')
  await apply('enter')
})

onUnmounted(async () => {
  await apply('leave')
})

watch([() => props.title, () => props.subtitle, route], async () => {
  await apply('leave')

  title.value = props.title
  subtitle.value = props.subtitle

  await apply('initial')
  await apply('enter')
})
</script>

<template>
  <div
    ref="pageHeaderRef"
    :style="{
      top: 'env(safe-area-inset-top, 0px)',
      right: 'env(safe-area-inset-right, 0px)',
      left: 'env(safe-area-inset-left, 0px)',
    }"
    sticky inset-x-0 top-0 z-99 w-full pb-6 pt-10
    flex="~ row items-center gap-2"
    bg="$bg-color"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div v-if="subtitle" absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ subtitle }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ title }}
      </div>
    </h1>
  </div>
</template>
