<script setup lang="ts">
import { useObjectUrl } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ file: File }>()
const emit = defineEmits<{ remove: [] }>()
const previewUrl = useObjectUrl(() => props.file)
const { t } = useI18n()
</script>

<template>
  <div :class="['relative shrink-0']">
    <img v-if="previewUrl" :src="previewUrl" :alt="file.name" :class="['h-20 w-20 rounded-xl object-cover', 'bg-neutral-100 dark:bg-neutral-800']">
    <button
      type="button"
      :aria-label="t('stage.chat.images.remove', { name: file.name })"
      :class="['absolute right-1 top-1 h-6 w-6 flex items-center justify-center rounded-full bg-neutral-900/70 text-white shadow-sm', 'transition-colors duration-200 hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-primary-500 motion-reduce:transition-none']"
      @click.stop="emit('remove')"
    >
      <span :class="['i-mingcute:close-line size-3.5']" />
    </button>
  </div>
</template>
