<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  tone?: 'neutral' | 'error'
  label: string
  details?: string
  placement?: 'above' | 'below'
  reveal?: boolean
  align?: 'start' | 'center'
}>(), {
  tone: 'neutral',
  placement: 'above',
  reveal: false,
  align: 'start',
})

const expanded = ref(false)
const showDetails = computed(() => expanded.value || props.reveal)
</script>

<template>
  <div :class="['relative w-fit max-w-full flex font-sans', placement === 'above' ? 'flex-col-reverse' : 'flex-col', align === 'center' ? 'items-center' : 'items-start']">
    <BasicButton
      size="unset"
      :aria-label="label"
      :aria-expanded="showDetails"
      :title="label"
      :class="[
        'status-capsule min-h-11 min-w-16 flex items-center justify-center rounded-full outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary-400',
        tone === 'error' ? 'text-orange-600 dark:text-orange-300' : 'text-primary-600 dark:text-primary-300',
      ]"
      @click="expanded = !expanded"
      @keydown.esc="expanded = false"
    >
      <span :class="['min-h-7 min-w-16 flex items-center justify-center rounded-full bg-neutral-50/75 px-3 backdrop-blur-md dark:bg-neutral-900/65']">
        <slot name="indicator" />
        <span aria-hidden="true" :class="['status-label overflow-hidden whitespace-nowrap text-xs', reveal ? 'ml-1.5 max-w-48 opacity-100' : 'max-w-0 opacity-0']">{{ label }}</span>
      </span>
    </BasicButton>
    <span :class="['sr-only']" role="status" aria-live="polite">{{ label }}</span>
    <Transition name="status-details">
      <div
        v-if="showDetails && !reveal"
        :class="[
          'z-50 max-h-48 w-64 max-w-[calc(100vw-2rem)] overflow-auto break-words rounded-2xl bg-neutral-50/95 p-3 text-sm text-neutral-700 backdrop-blur-md dark:bg-neutral-900/95 dark:text-neutral-200',
          placement === 'above' ? 'mb-1 origin-bottom' : 'mt-1 origin-top',
        ]"
      >
        <div :class="['mb-1 text-xs text-neutral-500 dark:text-neutral-400']">
          {{ label }}
        </div>
        <div v-if="details" :class="['whitespace-pre-wrap']">
          {{ details }}
        </div>
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.status-capsule {
  animation: status-arrive 280ms cubic-bezier(0.2, 1.4, 0.4, 1);
}
.status-label {
  transition: max-width 350ms cubic-bezier(0.2, 1.3, 0.4, 1), margin-left 250ms ease, opacity 180ms ease;
}
.status-details-enter-active,
.status-details-leave-active {
  transition: opacity 180ms ease, transform 240ms cubic-bezier(0.2, 1.3, 0.4, 1);
}
.status-details-enter-from,
.status-details-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.95);
}
@keyframes status-arrive {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .status-capsule { animation: none; }
  .status-label,
  .status-details-enter-active,
  .status-details-leave-active { transition: none; }
}
</style>
