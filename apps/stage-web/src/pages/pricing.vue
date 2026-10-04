<script setup lang="ts">
import { FluxPricing } from '@proj-airi/stage-ui/components'
import { AIRI_PRIVACY_URL, AIRI_TERMS_URL } from '@proj-airi/stage-ui/constants/public-links'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main :class="['mx-auto w-full max-w-6xl px-3 pb-12 pt-8 sm:px-6 sm:pt-14']">
    <header :class="['mx-auto max-w-3xl text-center']">
      <p :class="['text-sm text-primary-600 font-semibold dark:text-primary-300']">
        {{ t('settings.pages.pricing.eyebrow') }}
      </p>
      <h1 :class="['mt-3 text-4xl text-neutral-950 font-bold tracking-tight sm:text-5xl dark:text-neutral-50']">
        {{ t('settings.pages.pricing.title') }}
      </h1>
      <p :class="['mt-5 text-base text-neutral-600 leading-7 sm:text-lg dark:text-neutral-300']">
        {{ t('settings.pages.pricing.description') }}
      </p>
    </header>

    <div :class="['mt-10 sm:mt-14']">
      <FluxPricing entry-surface="public_pricing" />
    </div>

    <section :class="['mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2']">
      <div :class="['rounded-2xl bg-neutral-100 p-5 dark:bg-neutral-900']">
        <div :class="['i-solar:card-2-bold-duotone size-7 text-primary-500']" aria-hidden="true" />
        <h2 :class="['mt-3 text-lg font-semibold']">
          {{ t('settings.pages.pricing.oneTimeTitle') }}
        </h2>
        <p :class="['mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300']">
          {{ t('settings.pages.pricing.oneTimeDescription') }}
        </p>
      </div>
      <div :class="['rounded-2xl bg-neutral-100 p-5 dark:bg-neutral-900']">
        <div :class="['i-solar:user-check-bold-duotone size-7 text-primary-500']" aria-hidden="true" />
        <h2 :class="['mt-3 text-lg font-semibold']">
          {{ t('settings.pages.pricing.accountTitle') }}
        </h2>
        <p :class="['mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300']">
          {{ t('settings.pages.pricing.accountDescription') }}
        </p>
      </div>
    </section>

    <footer :class="['mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-neutral-500 dark:text-neutral-400']">
      <a :href="AIRI_TERMS_URL" target="_blank" rel="noopener noreferrer" :class="['underline-offset-4 hover:underline']">
        {{ t('settings.pages.pricing.terms') }}
      </a>
      <a :href="AIRI_PRIVACY_URL" target="_blank" rel="noopener noreferrer" :class="['underline-offset-4 hover:underline']">
        {{ t('settings.pages.pricing.privacy') }}
      </a>
      <a href="mailto:airi@moeru.ai" :class="['underline-offset-4 hover:underline']">
        airi@moeru.ai
      </a>
    </footer>
  </main>
</template>

<route lang="yaml">
meta:
  layout: default
  onboarding: false
</route>
