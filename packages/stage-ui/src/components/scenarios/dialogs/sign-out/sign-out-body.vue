<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  loading: boolean
  error: string | null
  cancelBlock: boolean
}>()

const emit = defineEmits<{
  signOut: []
  resetDevice: []
  cancel: []
}>()

const { t } = useI18n()
</script>

<template>
  <div :class="['flex flex-col gap-5', cancelBlock ? 'pb-4' : undefined]">
    <div :class="['flex flex-col gap-2.5']">
      <button
        type="button"
        :disabled="loading"
        :class="[
          'flex items-start gap-3 rounded-xl border p-3 text-left',
          'border-neutral-200 bg-white/70',
          'dark:border-neutral-700 dark:bg-neutral-800/60',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ]"
        @click="emit('signOut')"
      >
        <div
          :class="[
            'size-9 flex shrink-0 items-center justify-center rounded-lg',
            'bg-neutral-100 text-neutral-600',
            'dark:bg-neutral-800 dark:text-neutral-300',
          ]"
        >
          <div :class="['i-solar:logout-3-bold-duotone text-lg']" />
        </div>
        <div :class="['min-w-0']">
          <div :class="['text-sm text-neutral-900 font-semibold dark:text-neutral-100']">
            {{ t('settings.dialogs.signOut.keep.title') }}
          </div>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.dialogs.signOut.keep.description') }}
          </p>
        </div>
      </button>

      <button
        type="button"
        :disabled="loading"
        :class="[
          'flex items-start gap-3 rounded-xl border p-3 text-left',
          'border-red-200/80 bg-red-50/80',
          'dark:border-red-900/40 dark:bg-red-900/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ]"
        @click="emit('resetDevice')"
      >
        <div
          :class="[
            'size-9 flex shrink-0 items-center justify-center rounded-lg',
            'bg-red-100 text-red-600',
            'dark:bg-red-900/40 dark:text-red-300',
          ]"
        >
          <div :class="['i-solar:trash-bin-minimalistic-bold-duotone text-lg']" />
        </div>
        <div :class="['min-w-0']">
          <div :class="['text-sm text-red-600 font-semibold dark:text-red-300']">
            {{ t('settings.dialogs.signOut.reset.title') }}
          </div>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.all.description') }}
          </p>
        </div>
      </button>
    </div>

    <p
      v-if="error"
      :class="['text-sm text-red-500']"
      role="alert"
      aria-live="polite"
    >
      {{ error }}
    </p>

    <Button
      type="button"
      :block="cancelBlock"
      :class="cancelBlock ? undefined : ['self-end']"
      :disabled="loading"
      :label="t('settings.dialogs.signOut.cancel')"
      @click="emit('cancel')"
    />
  </div>
</template>
