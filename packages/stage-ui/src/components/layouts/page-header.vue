<script setup lang="ts">
import { IconButton } from '@proj-airi/ui'
import { useMotion } from '@vueuse/motion'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  showBackButton?: boolean
  disableBackButton?: boolean
  fallbackRoute?: string
}>(), {
  showBackButton: true,
  disableBackButton: false,
  fallbackRoute: '/settings',
})

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const pageHeaderRef = ref<HTMLElement>()
const title = ref(props.title)
const subtitle = ref(props.subtitle)
const finalizedDisableBackButton = ref(props.disableBackButton)

const { apply } = useMotion(pageHeaderRef, {
  initial: { opacity: 0, x: 10, transition: { duration: 50 } },
  enter: { opacity: 1, x: 0, transition: { duration: 250 } },
  leave: { opacity: 0, x: -5, transition: { duration: 25 } },
})

function handleBack() {
  // If there's history to go back to, use router.back().
  // The check for `window` handles non-browser environments (e.g., SSR).
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
  }
  else {
    // Otherwise, navigate to the fallback route. This covers cases where:
    // - The page was opened directly (no history).
    // - The code is running in a non-browser environment.
    router.push(props.fallbackRoute)
  }
}

onMounted(async () => {
  await apply('initial')
  await apply('enter')
})

onUnmounted(async () => {
  await apply('leave')
  finalizedDisableBackButton.value = true
})

watch([() => props.title, () => props.subtitle, () => props.disableBackButton, route], async () => {
  await apply('leave')
  await nextTick()

  finalizedDisableBackButton.value = props.disableBackButton
  title.value = props.title
  subtitle.value = props.subtitle

  await nextTick()
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
    :class="[
      'sticky inset-x-0 top-0 z-99 w-full',
      'pb-6 pt-10 flex flex-row items-center',
      'gap-2 bg-$bg-color',
    ]"
  >
    <IconButton
      type="button"
      :aria-label="t('settings.pages.card.back')"
      :disabled="props.disableBackButton || finalizedDisableBackButton || !showBackButton"
      @click="handleBack"
    >
      <div
        v-if="!finalizedDisableBackButton"
        :class="[
          'i-solar:alt-arrow-left-line-duotone text-2xl',
          ({ 'pointer-events-none op-0': !showBackButton }),
        ]"
      />
    </IconButton>
    <h1
      :class="[
        'relative',
      ]"
    >
      <div
        v-if="subtitle"
        :class="[
          'absolute left-0 top-0 translate-y-[-80%]',
        ]"
      >
        <span
          :class="[
            'text-neutral-300 dark:text-neutral-500 text-nowrap',
          ]"
        >{{ subtitle }}</span>
      </div>
      <div
        :class="[
          'text-nowrap text-3xl font-normal',
        ]"
      >
        {{ title }}
      </div>
    </h1>
  </div>
</template>
