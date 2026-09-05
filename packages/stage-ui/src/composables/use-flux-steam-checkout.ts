import { isFluxPurchaseDisabled, isStageTamagotchi } from '@proj-airi/stage-shared'
import { useEventListener } from '@vueuse/core'
import { onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { authClient } from '../libs/auth-client'
import { client } from './api'

const PENDING_KEY = 'airi.steamPendingOrderId'

/**
 * Steam Wallet InitTxn / FinalizeTxn for Flux. Stripe stays on the page.
 */
export function useFluxSteamCheckout(options: {
  onBanner: (type: 'success' | 'error', text: string) => void
  onPaid: () => Promise<unknown>
}) {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const steamLinked = shallowRef(false)
  const returningFromSteam = queryString(route.query.steam_order) != null
  const enabled = !isFluxPurchaseDisabled()
  let finalizeInFlight: Promise<void> | undefined

  if (enabled && isStageTamagotchi()) {
    useEventListener(window, 'focus', async () => {
      const orderId = sessionStorage.getItem(PENDING_KEY)
      if (orderId)
        await finalize(orderId, true)
    })
  }

  onMounted(() => {
    if (!enabled)
      return
    void discoverLink()
    const orderId = queryString(route.query.steam_order)
    if (!orderId)
      return
    sessionStorage.setItem(PENDING_KEY, orderId)
    void finalize(orderId, false)
    void router.replace({ query: {} })
  })

  async function startCheckout(packKey: string): Promise<string> {
    const res = await client.api.v1.steam.checkout.$post({ json: { packKey } })
    const data = await res.json() as { orderId?: string, url?: string, error?: string, message?: string }
    if (!res.ok)
      throw new Error(steamErrorText(data, t('settings.pages.flux.checkout.error')))
    if (data.orderId)
      sessionStorage.setItem(PENDING_KEY, data.orderId)
    if (!data.url)
      throw new Error(t('settings.pages.flux.checkout.error'))
    return data.url
  }

  async function discoverLink() {
    try {
      const { data } = await authClient.listAccounts()
      steamLinked.value = data?.some(account => account.providerId === 'steam') ?? false
    }
    catch {
      steamLinked.value = false
    }
  }

  async function finalize(orderId: string, quietIfPending: boolean) {
    if (finalizeInFlight) {
      await finalizeInFlight
      return
    }

    finalizeInFlight = (async () => {
      try {
        const res = await client.api.v1.steam.finalize.$post({ json: { orderId } })
        const data = await res.json() as { error?: string, message?: string, status?: string }

        if (res.status === 409 && data.error === 'STEAM_TXN_NOT_APPROVED') {
          if (!quietIfPending)
            options.onBanner('error', t('settings.pages.flux.checkout.steamPending'))
          return
        }

        // Steam has no webhook. Keep the order id unless FinalizeTxn returns paid or canceled.
        if (!res.ok) {
          options.onBanner('error', steamErrorText(data, t('settings.pages.flux.checkout.error')))
          return
        }

        sessionStorage.removeItem(PENDING_KEY)
        if (data.status === 'canceled') {
          options.onBanner('error', t('settings.pages.flux.checkout.canceled'))
          return
        }

        options.onBanner('success', t('settings.pages.flux.checkout.success'))
        await options.onPaid()
      }
      catch {
        options.onBanner('error', t('settings.pages.flux.checkout.error'))
      }
    })()

    try {
      await finalizeInFlight
    }
    finally {
      finalizeInFlight = undefined
    }
  }

  function steamErrorText(data: { error?: string, message?: string } | undefined, fallback: string): string {
    if (data?.error === 'STEAM_ACCOUNT_NOT_LINKED')
      return t('settings.pages.flux.checkout.steamAccountNotLinked')
    return data?.message || fallback
  }

  return {
    steamLinked,
    returningFromSteam,
    startCheckout,
  }
}

function queryString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}
