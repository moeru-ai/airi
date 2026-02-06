<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()
const { credits } = storeToRefs(authStore)

const loading = ref(false)

// Packages with i18n labels
const packages = computed(() => [
  { amount: 500, label: t('settings.pages.flux.packages.amount_500.label'), price: t('settings.pages.flux.packages.amount_500.price') },
  { amount: 1000, label: t('settings.pages.flux.packages.amount_1000.label'), price: t('settings.pages.flux.packages.amount_1000.price') },
  { amount: 5000, label: t('settings.pages.flux.packages.amount_5000.label'), price: t('settings.pages.flux.packages.amount_5000.price') },
])

async function handleBuy(amount: number) {
  loading.value = true
  try {
    const response = await fetch(`${SERVER_URL}/api/stripe/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
      credentials: 'include',
    })
    const data = await response.json()
    if (data.url) {
      window.location.href = data.url
    }
  }
  catch (e) {
    console.error(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div flex="~ col gap-6" p-4>
    <div bg="primary-500/10 dark:primary-400/10" rounded-xl p-6 text-center>
      <div i-solar:battery-charge-bold-duotone mx-auto size-16 text-primary-500 />
      <h2 mt-4 text-3xl font-bold>
        {{ credits }}
      </h2>
      <p text="sm neutral-500">
        {{ t('settings.pages.flux.description') }}
      </p>
    </div>

    <div grid="~ cols-1 sm:cols-3 gap-4">
      <div
        v-for="pkg in packages" :key="pkg.amount"
        border="1 neutral-200 dark:neutral-800" flex="~ col gap-2" items-center rounded-xl p-4
      >
        <div font-bold>
          {{ pkg.label }}
        </div>
        <div text="2xl" font-bold>
          {{ pkg.price }}
        </div>
        <Button :label="t('settings.pages.flux.buy')" :loading="loading" @click="handleBuy(pkg.amount)" />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.flux.title
  icon: i-solar:battery-charge-bold-duotone
</route>
