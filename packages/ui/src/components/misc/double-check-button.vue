<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Button from './button.vue'

type ButtonVariant = 'primary' | 'secondary' | 'secondary-muted' | 'danger' | 'caution'
type ButtonSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  variant?: ButtonVariant
  cancelVariant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  disabled?: boolean
  loading?: boolean
}>(), {
  variant: 'danger',
  cancelVariant: 'secondary',
  size: 'md',
  block: false,
  disabled: false,
  loading: false,
})

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()

const slots = defineSlots<{
  'default': (props: Record<string, unknown>) => unknown
  'confirm': (props: Record<string, unknown>) => unknown
  'cancel': (props: Record<string, unknown>) => unknown
  'cancel-botton-icon': (props: Record<string, unknown>) => unknown
}>()

const confirming = ref(false)

const wrapperClasses = computed(() => [
  'inline-flex flex-col gap-2',
  props.block ? 'w-full' : '',
])

watch(() => props.disabled, (disabled) => {
  if (disabled)
    confirming.value = false
})

function handlePrimaryClick() {
  if (!confirming.value) {
    confirming.value = true
    return
  }

  emit('confirm')
  confirming.value = false
}

function handleCancel() {
  confirming.value = false
  emit('cancel')
}
</script>

<template>
  <div :class="wrapperClasses">
    <div class="flex flex-wrap items-center gap-2">
      <Transition name="double-check-slide">
        <Button
          v-if="confirming"
          key="cancel"
          :variant="cancelVariant"
          :size="size"
          :block="block"
          class="whitespace-nowrap"
          @click="handleCancel"
        >
          <div class="flex items-center gap-2">
            <slot
              v-if="slots['cancel-botton-icon']"
              name="cancel-botton-icon"
            />
            <span><slot name="cancel">Cancel</slot></span>
          </div>
        </Button>
      </Transition>

      <Button
        :variant="variant"
        :size="size"
        :block="block"
        :disabled="disabled"
        :loading="loading"
        :class="[
          'double-check-primary whitespace-nowrap',
          'transition-width duration-150 ease-in-out',
          confirming ? 'double-check-primary--confirming' : 'double-check-primary--default',
        ]"
        @click="handlePrimaryClick"
      >
        <span v-if="!confirming">
          <slot />
        </span>
        <span v-else>
          <slot name="confirm">
            <slot />
          </slot>
        </span>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.double-check-slide-enter-active,
.double-check-slide-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.double-check-slide-enter-from,
.double-check-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.double-check-primary {
  transition: min-width 180ms ease, padding 180ms ease;
}

.double-check-primary--default {
  min-width: 7rem;
}

.double-check-primary--confirming {
  min-width: 9rem;
}
</style>
