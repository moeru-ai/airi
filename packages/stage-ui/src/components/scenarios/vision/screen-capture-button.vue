<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<Props>(), {
  isCapturing: false,
  cooldownRemaining: 0,
  disabled: false,
})

const emit = defineEmits<{
  capture: []
}>()

const { t } = useI18n()

interface Props {
  isCapturing?: boolean
  cooldownRemaining?: number
  disabled?: boolean
}

const isDisabled = computed(() => props.disabled || props.isCapturing || props.cooldownRemaining > 0)

const buttonLabel = computed(() => {
  if (props.isCapturing)
    return t('pages.modules.vision.capture.capturing')
  if (props.cooldownRemaining > 0)
    return t('pages.modules.vision.capture.wait', { seconds: Math.ceil(props.cooldownRemaining / 1000) })
  return t('pages.modules.vision.capture.let-see')
})
</script>

<template>
  <Button
    :label="buttonLabel"
    :loading="isCapturing"
    :disabled="isDisabled"
    variant="ghost"
    size="sm"
    @click="emit('capture')"
  />
</template>
