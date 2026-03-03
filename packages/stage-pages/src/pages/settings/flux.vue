<script setup lang="ts">
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { credits } = storeToRefs(authStore)

const loadingAmount = ref<number | null>(null)
const message = ref<{ type: 'success' | 'error', text: string } | null>(null)

// Packages with i18n labels
const packages = computed(() => [
  { amount: 500, label: t('settings.pages.flux.packages.amount_500.label'), price: t('settings.pages.flux.packages.amount_500.price') },
  { amount: 1000, label: t('settings.pages.flux.packages.amount_1000.label'), price: t('settings.pages.flux.packages.amount_1000.price') },
  { amount: 5000, label: t('settings.pages.flux.packages.amount_5000.label'), price: t('settings.pages.flux.packages.amount_5000.price') },
])

onMounted(async () => {
  if (route.query.success === 'true') {
    message.value = { type: 'success', text: t('settings.pages.flux.checkout.success') }
    await authStore.updateCredits()
    router.replace({ query: {} })
  }
  else if (route.query.canceled === 'true') {
    message.value = { type: 'error', text: t('settings.pages.flux.checkout.canceled') }
    router.replace({ query: {} })
  }
})

async function handleBuy(amount: number) {
  loadingAmount.value = amount
  message.value = null
  try {
    const res = await client.api.stripe.checkout.$post({ json: { amount } })
    if (!res.ok) {
      const data = await res.json() as { error?: string, message?: string }
      message.value = { type: 'error', text: data.message || t('settings.pages.flux.checkout.error') }
      return
    }
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    }
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.flux.checkout.error') }
  }
  finally {
    loadingAmount.value = null
  }
}
</script>

<template>
  <div flex="~ col gap-6" p-4>
    <!-- Message banner -->
    <div
      v-if="message"
      rounded-lg p-3 text-sm
      :class="message.type === 'success'
        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
        : 'bg-red-500/10 text-red-600 dark:text-red-400'"
    >
      {{ message.text }}
    </div>

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
        <Button
          :label="t('settings.pages.flux.buy')"
          :loading="loadingAmount === pkg.amount"
          :disabled="loadingAmount !== null && loadingAmount !== pkg.amount"
          @click="handleBuy(pkg.amount)"
        />
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
