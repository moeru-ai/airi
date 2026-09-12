import type { InferOutput } from 'valibot'
import type { MaybeRefOrGetter } from 'vue'

import { announcementServiceListAnnouncements } from '@proj-airi/cloud-client'
import { useIntervalFn, useNow } from '@vueuse/core'
import { array, isoTimestamp, nonEmpty, object, optional, parse, picklist, pipe, string } from 'valibot'
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'

const contentSchema = object({
  id: pipe(string(), nonEmpty()),
  locale: pipe(string(), nonEmpty()),
  layout: picklist(['portrait', 'landscape']),
  title: pipe(string(), nonEmpty()),
  body: pipe(string(), nonEmpty()),
  coverUrl: optional(string(), ''),
  actionLabel: optional(string(), ''),
  actionUrl: optional(string(), ''),
  startsAt: pipe(string(), isoTimestamp()),
  endsAt: optional(string(), ''),
})

/** Public announcement content after validation at the Cloud response boundary. */
export type AnnouncementContent = InferOutput<typeof contentSchema>

/**
 * Reads public announcements for one mounted stage. Locale changes abort the
 * previous request and clear old-language content. Failed refreshes clear data.
 * The scope owns polling and cancellation. Expiry is checked locally each second.
 */
export function useAnnouncements(client: MaybeRefOrGetter<'web' | 'desktop'>, locale: MaybeRefOrGetter<string>) {
  const baseUrl = import.meta.env.VITE_CLOUD_API_URL || 'https://cloud.airi.build'
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
        baseUrl,
        query: { client: toValue(client), locale: toValue(locale), limit: 100 },
        credentials: 'omit',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        throwOnError: true,
      })
      if (disposed || request.signal.aborted)
        return
      entries.value = readContent(data, baseUrl)
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

function readContent(data: unknown, baseUrl: string) {
  const result = parse(object({ announcements: array(contentSchema) }), data)
  for (const item of result.announcements) {
    if (item.coverUrl !== '') {
      const url = new URL(item.coverUrl, baseUrl)
      if (url.origin !== new URL(baseUrl).origin || url.pathname !== `/v1/announcements/${encodeURIComponent(item.id)}/cover` || url.username || url.password)
        throw new Error('Invalid announcement cover')
      item.coverUrl = url.href
    }
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
