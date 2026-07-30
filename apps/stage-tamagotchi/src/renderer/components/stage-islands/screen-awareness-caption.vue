<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  response: string
  responseKey: number | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const rootElement = ref<HTMLDivElement | null>(null)
const scrollContainerRef = ref<HTMLDivElement | null>(null)

defineExpose({ rootElement })

watch(() => props.responseKey, async () => {
  await nextTick()
  if (scrollContainerRef.value)
    scrollContainerRef.value.scrollTop = 0
})
</script>

<template>
  <div
    ref="rootElement"
    :class="[
      'pointer-events-auto',
      'absolute left-1/2 top-3 z-80 -translate-x-1/2',
      'w-[min(88vw,38rem)] min-w-[min(15rem,88vw)]',
      'rounded-xl border border-white/25 bg-neutral-950/78 p-3 text-neutral-50 shadow-xl backdrop-blur-md',
    ]"
  >
    <button
      type="button"
      :class="[
        'absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-full',
        'text-neutral-300 transition-colors hover:bg-white/12 hover:text-white',
      ]"
      :aria-label="t('tamagotchi.settings.pages.screen-awareness.caption.close')"
      :title="t('tamagotchi.settings.pages.screen-awareness.caption.close')"
      @click="emit('close')"
    >
      <div :class="['i-solar:close-circle-line-duotone text-lg']" />
    </button>

    <div
      ref="scrollContainerRef"
      :class="[
        'max-h-[min(28vh,10rem)] overflow-y-auto overscroll-contain pr-8',
        'whitespace-pre-wrap break-words text-sm leading-relaxed sm:text-base',
      ]"
    >
      {{ response }}
    </div>
  </div>
</template>
