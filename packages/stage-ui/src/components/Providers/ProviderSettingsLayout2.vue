<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /**
   * Provider name to display in the header
   */
  providerName?: string

  /**
   * Provider icon CSS class
   */
  providerIcon?: string

  /**
   * Provider icon color CSS class
   */
  providerIconColor?: string

  /**
   * Optional handler for back button
   */
  onBack?: () => void

  /**
   * Optional title to display (overrides providerName)
   */
  title?: string

  /**
   * Optional subtitle to display
   */
  subtitle?: string

  /**
   * Optional category label to display above the title
   */
  categoryLabel?: string
}>()

// Expose event handlers
const emit = defineEmits<{
  back: []
}>()

// Define slots
defineSlots<{
  default: () => any
  title: () => any
  subtitle: () => any
  backButton: () => any
  headerExtra: () => any
  header: () => any
}>()

const { t } = useI18n()

// Compute effective title
const effectiveTitle = computed(() => props.title || props.providerName || '')

// Compute effective category label
const effectiveCategoryLabel = computed(() => props.categoryLabel || t('common.provider'))

// Handle back button click
function handleBackClick() {
  if (props.onBack) {
    props.onBack()
  }
  emit('back')
}
</script>

<template>
  <div>
    <!-- Header section -->
    <slot name="header">
      <div
        v-motion
        flex="~ row"
        :initial="{ opacity: 0, x: 10 }"
        :enter="{ opacity: 1, x: 0 }"
        :leave="{ opacity: 0, x: -10 }"
        :duration="250"
        mb-6 items-center gap-3
      >
        <!-- Back button -->
        <slot name="backButton">
          <button @click="handleBackClick">
            <div i-solar:alt-arrow-left-line-duotone text-2xl />
          </button>
        </slot>

        <!-- Title area -->
        <div>
          <slot name="title">
            <h1 relative>
              <div v-if="effectiveCategoryLabel" absolute left-0 top-0 translate-y="[-80%]">
                <span text="neutral-300 dark:neutral-500" text-nowrap>{{ effectiveCategoryLabel }}</span>
              </div>
              <div text-nowrap text-3xl font-semibold>
                {{ effectiveTitle }}
              </div>
            </h1>
          </slot>

          <slot name="subtitle">
            <div v-if="subtitle" text-sm text="neutral-500 dark:neutral-400">
              {{ subtitle }}
            </div>
          </slot>
        </div>

        <!-- Extra header content (right side) -->
        <slot name="headerExtra" />
      </div>
    </slot>

    <!-- Main content -->
    <slot />

    <!-- Background icon -->
    <div text="neutral-200/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
      <div text="40" :class="providerIcon || providerIconColor" />
    </div>
  </div>
</template>
