<script setup lang="ts">
import { FluxPricing } from '@proj-airi/stage-ui/components'
import { AIRI_PRIVACY_URL, AIRI_TERMS_URL } from '@proj-airi/stage-ui/constants/public-links'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main :class="['mx-auto w-full max-w-4xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16']">
    <header :class="['max-w-2xl']">
      <h1 :class="['text-4xl text-neutral-950 font-bold tracking-tight sm:text-5xl dark:text-neutral-50']">
        {{ t('settings.pages.pricing.title') }}
      </h1>
      <p :class="['mt-4 text-base text-neutral-600 leading-7 sm:text-lg dark:text-neutral-300']">
        {{ t('settings.pages.pricing.description') }}
      </p>
    </header>

    <div :class="['mt-9']">
      <FluxPricing entry-surface="public_pricing" />
    </div>

    <section
      :class="[
        'mt-10 grid grid-cols-1 gap-6 border-y border-neutral-200 py-6',
        'sm:grid-cols-2 sm:gap-10 dark:border-neutral-800',
      ]"
    >
      <div>
        <h2 :class="['text-sm text-neutral-900 font-semibold dark:text-neutral-100']">
          {{ t('settings.pages.pricing.oneTimeTitle') }}
        </h2>
        <p :class="['mt-1.5 text-sm text-neutral-600 leading-6 dark:text-neutral-300']">
          {{ t('settings.pages.pricing.oneTimeDescription') }}
        </p>
      </div>
      <div>
        <h2 :class="['text-sm text-neutral-900 font-semibold dark:text-neutral-100']">
          {{ t('settings.pages.pricing.accountTitle') }}
        </h2>
        <p :class="['mt-1.5 text-sm text-neutral-600 leading-6 dark:text-neutral-300']">
          {{ t('settings.pages.pricing.accountDescription') }}
        </p>
      </div>
    </section>

    <footer :class="['mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500 dark:text-neutral-400']">
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
