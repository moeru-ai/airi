import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAuthStore } from '../stores/auth'

/**
 * The Flux state that the entry points show: the header, menus, the account page, and the settings home.
 * A signed-out user sees no entry, because AIRI also works without the cloud service.
 * A subscriber sees the Capacitor, and other users see their Flux balance.
 */
export function useFluxStatus() {
  const { locale } = useI18n()
  const authStore = useAuthStore()
  const { isAuthenticated, credits, capacitorPercent, capacitorRechargesAt } = storeToRefs(authStore)

  const visible = computed(() => isAuthenticated.value)
  /** The wallet reports a percent only while a Capacitor is active. */
  const subscribed = computed(() => capacitorPercent.value != null)
  const low = computed(() => capacitorPercent.value != null && capacitorPercent.value < 15)

  const percentLabel = computed(() => capacitorPercent.value == null
    ? null
    : new Intl.NumberFormat(locale.value, { style: 'percent' }).format(capacitorPercent.value / 100))
  const balanceLabel = computed(() => new Intl.NumberFormat(locale.value).format(credits.value))
  const rechargesAtLabel = computed(() => capacitorRechargesAt.value == null
    ? null
    : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(capacitorRechargesAt.value)))

  /** The short value of an entry: the Capacitor percent for a subscriber, otherwise the Flux balance. */
  const valueLabel = computed(() => subscribed.value ? percentLabel.value ?? '' : balanceLabel.value)
  const icon = computed(() => subscribed.value ? 'i-solar:star-bold-duotone' : 'i-solar:battery-charge-bold-duotone')

  return {
    visible,
    subscribed,
    low,
    percent: capacitorPercent,
    percentLabel,
    balanceLabel,
    rechargesAtLabel,
    valueLabel,
    icon,
  }
}
