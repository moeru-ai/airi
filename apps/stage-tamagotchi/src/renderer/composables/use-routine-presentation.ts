import type { ActivityLabelSource } from '@proj-airi/stage-ui/libs/routines/labels'
import type { Activity } from '@proj-airi/stage-ui/libs/routines/model'
import type { MaybeRefOrGetter } from 'vue'

import { describeActivityLabel, localizeActivityLabel } from '@proj-airi/stage-ui/libs/routines/labels'
import { computed, toValue } from 'vue'
import { useI18n } from 'vue-i18n'

/** UI locale changes affect presentation only. Date keys already belong to the routine's time zone. */
export function useRoutinePresentation(zone: MaybeRefOrGetter<string>) {
  const { t, locale } = useI18n()
  const time = computed(() => new Intl.DateTimeFormat(locale.value, { timeZone: toValue(zone), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
  const clock = computed(() => new Intl.DateTimeFormat(locale.value, { timeZone: toValue(zone), hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }))
  const datetime = computed(() => new Intl.DateTimeFormat(locale.value, { timeZone: toValue(zone), dateStyle: 'short', timeStyle: 'short' }))
  const date = computed(() => new Intl.DateTimeFormat(locale.value, { timeZone: 'UTC', dateStyle: 'full' }))
  const number = computed(() => new Intl.NumberFormat(locale.value))
  const hour = computed(() => new Intl.NumberFormat(locale.value, { minimumIntegerDigits: 2, useGrouping: false }))
  return {
    label: (source: ActivityLabelSource) => localizeActivityLabel(source, locale.value, t),
    activityLabel: (activity: Activity) => describeActivityLabel(activity, locale.value, t),
    date: (key: string) => key ? date.value.format(Date.parse(`${key}T12:00:00Z`)) : '',
    time: (epoch: number) => time.value.format(epoch),
    datetime: (epoch: number) => datetime.value.format(epoch),
    clock: (epoch: number) => clock.value.format(epoch),
    number: (value: number) => number.value.format(value),
    hour: (value: number) => hour.value.format(value),
  }
}
