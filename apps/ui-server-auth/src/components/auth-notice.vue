<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'

type AuthNoticeStatus = 'loading' | 'success' | 'fallback' | 'error'

const props = withDefaults(defineProps<{
  status: AuthNoticeStatus
  title: string
  description: string
  detail?: string
  primaryActionLabel?: string
  secondaryActionLabel?: string
  primaryActionDisabled?: boolean
}>(), {
  detail: '',
  primaryActionDisabled: false,
  primaryActionLabel: undefined,
  secondaryActionLabel: undefined,
})

const emit = defineEmits<{
  primaryAction: []
  secondaryAction: []
}>()

const iconClass = computed(() => {
  switch (props.status) {
    case 'loading':
      return 'i-svg-spinners:3-dots-fade'
    case 'success':
      return 'i-solar:check-circle-bold-duotone'
    case 'fallback':
      return 'i-solar:danger-triangle-bold-duotone'
    case 'error':
      return 'i-solar:close-circle-bold-duotone'
  }

  return 'i-solar:info-circle-bold-duotone'
})

const accentClasses = computed(() => {
  switch (props.status) {
    case 'loading':
      return {
        halo: 'from-primary-300/35 via-sky-300/18 to-transparent dark:from-primary-500/25 dark:via-sky-400/12',
        icon: 'text-primary-500 dark:text-primary-300',
      }
    case 'success':
      return {
        halo: 'from-emerald-300/35 via-lime-300/18 to-transparent dark:from-emerald-500/25 dark:via-lime-400/12',
        icon: 'text-emerald-500 dark:text-emerald-300',
      }
    case 'fallback':
      return {
        halo: 'from-amber-300/35 via-orange-300/18 to-transparent dark:from-amber-500/25 dark:via-orange-400/12',
        icon: 'text-amber-500 dark:text-amber-300',
      }
    case 'error':
      return {
        halo: 'from-rose-300/35 via-red-300/18 to-transparent dark:from-rose-500/25 dark:via-red-400/12',
        icon: 'text-rose-500 dark:text-rose-300',
      }
  }

  return {
    halo: 'from-primary-300/35 via-sky-300/18 to-transparent dark:from-primary-500/25 dark:via-sky-400/12',
    icon: 'text-primary-500 dark:text-primary-300',
  }
})
</script>

<template>
  <section
    :class="[
      'relative w-full max-w-[30rem] overflow-hidden rounded-[2rem] px-6 py-7 sm:px-8 sm:py-9',
      'border border-white/35 bg-white/55 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl',
      'dark:border-white/8 dark:bg-black/25 dark:shadow-[0_24px_90px_-42px_rgba(0,0,0,0.78)]',
    ]"
  >
    <div
      aria-hidden="true"
      :class="[
        'pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b blur-2xl',
        accentClasses.halo,
      ]"
    />

    <div class="relative flex flex-col gap-6">
      <div class="flex flex-col items-center gap-4 text-center">
        <div
          :class="[
            'flex size-18 items-center justify-center rounded-[1.5rem] border border-white/45 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-md',
            'dark:border-white/10 dark:bg-white/6 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
          ]"
        >
          <div :class="[iconClass, accentClasses.icon, 'size-9']" />
        </div>

        <div class="flex flex-col gap-2">
          <p class="text-[0.7rem] text-neutral-500 font-500 tracking-[0.26em] uppercase dark:text-neutral-400">
            AIRI account
          </p>
          <h1 class="text-balance text-2xl text-neutral-950 tracking-[-0.03em] font-[Nunito_Variable] sm:text-[2rem] dark:text-white">
            {{ title }}
          </h1>
          <p class="mx-auto max-w-[24rem] text-balance text-sm text-neutral-700 leading-6 dark:text-neutral-300">
            {{ description }}
          </p>
        </div>
      </div>

      <p
        v-if="detail"
        :class="[
          'rounded-[1.25rem] px-4 py-3 text-sm leading-6 text-balance',
          'bg-white/55 text-neutral-600 dark:bg-white/6 dark:text-neutral-300',
        ]"
      >
        {{ detail }}
      </p>

      <div
        v-if="primaryActionLabel || secondaryActionLabel || $slots.default"
        class="flex flex-col gap-3"
      >
        <slot />

        <Button
          v-if="primaryActionLabel"
          block
          :disabled="primaryActionDisabled"
          @click="emit('primaryAction')"
        >
          {{ primaryActionLabel }}
        </Button>

        <Button
          v-if="secondaryActionLabel"
          block
          variant="secondary"
          @click="emit('secondaryAction')"
        >
          {{ secondaryActionLabel }}
        </Button>
      </div>
    </div>
  </section>
</template>
