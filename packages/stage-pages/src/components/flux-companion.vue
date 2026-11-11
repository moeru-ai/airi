<script setup lang="ts">
import { isSubscriptionAvailable } from '@proj-airi/stage-shared'
import { chatStickers } from '@proj-airi/stage-ui/assets/stickers'
import { useFluxStatus } from '@proj-airi/stage-ui/composables/use-flux-status'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const { subscribed, percent, percentLabel, balanceLabel, icon } = useFluxStatus()

const subscriptionAvailable = isSubscriptionAvailable()
const empty = computed(() => percent.value === 0)

// AIRI looks the way her energy is: full of it, out of it, or hoping for a subscription.
const sticker = computed(() => {
  const id = !subscribed.value
    ? subscriptionAvailable ? 'airi-affectionate' : 'airi-happy'
    : empty.value ? 'airi-tired' : 'airi-happy'
  return chatStickers.find(item => item.id === id)?.src
})

/** A refill within a day reads as a time of day, the way a person says it. A later one keeps its date. */
const refillLabel = computed(() => {
  const iso = authStore.capacitorRechargesAt
  if (!iso)
    return t('settings.pages.flux.companion.soon')
  const at = new Date(iso)
  const soon = at.getTime() - Date.now() < 24 * 60 * 60 * 1000
  return new Intl.DateTimeFormat(locale.value, soon ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }).format(at)
})

const line = computed(() => {
  const time = refillLabel.value
  // An empty Capacitor stops chat unless the user lets the Flux balance pay.
  if (subscribed.value && empty.value)
    return t(authStore.fallbackToFlux ? 'settings.pages.flux.companion.emptyFallback' : 'settings.pages.flux.companion.empty', { time })
  if (subscribed.value)
    return t('settings.pages.flux.companion.charged', { percent: percentLabel.value, time })
  if (subscriptionAvailable)
    return t('settings.pages.flux.companion.offer')
  return t('settings.pages.flux.companion.balance', { balance: balanceLabel.value })
})

/** The ring is a circle with a stroke, so its length is the circumference. */
const RING = 2 * Math.PI * 46
</script>

<template>
  <section
    data-testid="flux-companion"
    :class="[
      'flex flex-col items-center gap-6 rounded-[2rem] p-6 sm:flex-row sm:p-8',
      'bg-gradient-to-br from-primary-50 via-white to-pink-50',
      'dark:from-primary-950/50 dark:via-neutral-900 dark:to-pink-950/30',
    ]"
  >
    <!-- The ring is the Capacitor. Without a subscription it stays empty. -->
    <div :class="['relative size-40 shrink-0']">
      <svg viewBox="0 0 100 100" aria-hidden="true" :class="['absolute inset-0 size-full -rotate-90']">
        <circle cx="50" cy="50" r="46" fill="none" stroke-width="5" :class="['stroke-neutral-200 dark:stroke-neutral-700']" />
        <circle
          v-if="subscribed"
          cx="50" cy="50" r="46" fill="none" stroke-width="5" stroke-linecap="round"
          :stroke-dasharray="RING"
          :stroke-dashoffset="RING * (1 - (percent ?? 0) / 100)"
          :class="['stroke-primary-500 transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none']"
        />
      </svg>
      <div :class="['absolute inset-3 overflow-hidden rounded-full bg-white/70 dark:bg-neutral-900/70']">
        <img :src="sticker" alt="" :class="['size-full object-contain p-2']">
      </div>
    </div>

    <div :class="['flex min-w-0 flex-1 flex-col gap-4']">
      <p data-testid="flux-companion-line" :class="['rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-base shadow-sm dark:bg-neutral-800']">
        {{ line }}
      </p>
      <div :class="['flex flex-wrap gap-2']">
        <span
          v-if="subscribed"
          :class="['inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-sm shadow-sm dark:bg-neutral-800/80']"
        >
          <span aria-hidden="true" :class="[icon, 'size-4 text-primary-500']" />
          {{ t('settings.pages.capacitor.title') }}
          <b :class="['tabular-nums', empty ? 'text-orange-600 dark:text-orange-300' : '']">{{ percentLabel }}</b>
        </span>
        <span :class="['inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-sm shadow-sm dark:bg-neutral-800/80']">
          <span aria-hidden="true" :class="['i-solar:battery-charge-bold-duotone size-4 text-primary-500']" />
          {{ t('settings.pages.account.fluxBalance') }}
          <b :class="['tabular-nums']">{{ balanceLabel }}</b>
        </span>
      </div>
    </div>
  </section>
</template>
