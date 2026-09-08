import type { MaybeRefOrGetter } from 'vue'

import { announcementServiceListAnnouncements } from '@proj-airi/cloud-client'
import { useIntervalFn, useNow } from '@vueuse/core'
import { array, isoTimestamp, nonEmpty, object, parse, pipe, string } from 'valibot'
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'

const contentSchema = object({
  id: pipe(string(), nonEmpty()),
  locale: pipe(string(), nonEmpty()),
  title: pipe(string(), nonEmpty()),
  body: pipe(string(), nonEmpty()),
  actionLabel: string(),
  actionUrl: string(),
  startsAt: pipe(string(), isoTimestamp()),
  endsAt: string(),
})

/**
 * Reads public announcements for one mounted stage. Locale changes abort the
 * previous request and clear old-language content. Failed refreshes clear data.
 * The scope owns polling and cancellation. Expiry is checked locally each second.
 */
export function useAnnouncements(client: MaybeRefOrGetter<'web' | 'desktop'>, locale: MaybeRefOrGetter<string>) {
  const entries = ref<ReturnType<typeof readContent>>([])
  const now = useNow({ interval: 1000 })
  const error = ref<unknown>(null)
  let controller: AbortController | undefined
  let disposed = false

  async function refresh() {
    controller?.abort()
    const request = new AbortController()
    controller = request
    try {
      const { data } = await announcementServiceListAnnouncements({
        baseUrl: import.meta.env.VITE_CLOUD_API_URL || 'https://cloud.airi.build',
        query: { client: toValue(client), locale: toValue(locale), limit: 100 },
        credentials: 'omit',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        throwOnError: true,
      })
      if (disposed || request.signal.aborted)
        return
      entries.value = readContent(data)
      error.value = null
    }
    catch (caught) {
      if (disposed || request.signal.aborted)
        return
      // Announcements are optional. Hide old content when its current publication
      // state cannot be checked; keep the error available for diagnostics.
      entries.value = []
      error.value = caught
    }
  }

  watch([() => toValue(client), () => toValue(locale)], () => {
    entries.value = []
    void refresh()
  }, { immediate: true })
  useIntervalFn(refresh, 60000)
  onScopeDispose(() => {
    disposed = true
    controller?.abort()
  })

  const announcements = computed(() => entries.value.filter(item =>
    Date.parse(item.startsAt) <= now.value.getTime()
    && (item.endsAt === '' || Date.parse(item.endsAt) > now.value.getTime()),
  ))
  return { announcements, error, refresh }
}

function readContent(data: unknown) {
  const result = parse(object({ announcements: array(contentSchema) }), data)
  for (const item of result.announcements) {
    if (item.endsAt !== '' && !Number.isFinite(Date.parse(item.endsAt)))
      throw new Error('Invalid announcement expiry')
    if (item.actionUrl !== '') {
      const url = new URL(item.actionUrl)
      if (url.protocol !== 'https:' || url.username || url.password || !item.actionLabel)
        throw new Error('Invalid announcement action')
    }
  }
  return result.announcements
}
